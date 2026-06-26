package durabilityprovider

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/aymanbagabas/go-pty"

	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/terminalipc"
	"github.com/yyopc/yyork/internal/zellijconfig"
)

const (
	defaultZellijTerm      = "xterm-256color"
	defaultZellijColorterm = "truecolor"
)

// CreateSession brings up a new zellij session named opts.Name running
// opts.LaunchCmd inside opts.Cwd, then returns once `zellij list-sessions`
// reports the session is live.
//
// Implementation notes:
//   - Zellij is a client/server program. We spawn a client with a PTY
//     attached so zellij has a real TTY to talk to, and with Setsid so the
//     client lives in its own process group (insulated from signals to
//     yyork). The zellij server (a separate daemon) owns the session
//     and keeps it alive after the client exits.
//   - We render the launch command into a temporary KDL layout file. The
//     keep-alive shell wrap means killing the agent does not also kill the
//     zellij pane: the pane survives, holding the agent's exit output for
//     post-mortem inspection.
//   - After we observe the session via list-sessions, we send an explicit
//     `zellij action detach` so the client process exits cleanly. The
//     server keeps the session.
//
// If polling times out before the session appears, the client process is
// killed and the temporary layout file removed. Callers are responsible
// for any other cleanup (worktree removal, etc.).
func (z *ZellijProvider) CreateSession(ctx context.Context, opts session.CreateOpts) error {
	if strings.TrimSpace(opts.Name) == "" {
		return errors.New("zellij: CreateSession requires a name")
	}
	if len(opts.LaunchCmd) == 0 {
		return errors.New("zellij: CreateSession requires a non-empty LaunchCmd")
	}
	if strings.TrimSpace(opts.Cwd) == "" {
		return errors.New("zellij: CreateSession requires a Cwd")
	}

	binary, err := z.resolvePath()
	if err != nil {
		return err
	}

	// yyork's managed config selects the "yyork" color theme. Best-effort: a
	// failure here just means zellij falls back to the user's own config, so
	// we launch without it rather than abort session creation.
	configPath, _ := zellijconfig.Ensure()

	hostCmd, err := terminalHostLaunchCommand(opts)
	if err != nil {
		return err
	}

	layoutPath, err := writeLaunchLayout(hostCmd, opts.Cwd)
	if err != nil {
		return err
	}
	// Layout file is small but pointless to leave around once zellij has
	// loaded it. Remove after we know the session is up (or after rollback).
	cleanupLayout := func() { _ = os.Remove(layoutPath) }

	clientCmd, ptmx, err := startZellijClient(ctx, binary, configPath, opts.Name, layoutPath, opts.Cwd, opts.Env)
	if err != nil {
		cleanupLayout()
		return err
	}
	// Capture PTY output so a failed spawn can surface what bash / the
	// agent / zellij actually said. We cap the capture at 16 KiB so a
	// chatty agent doesn't balloon memory. After the session is confirmed
	// alive, the goroutine switches to draining into io.Discard.
	captured := newRingCapture(16 * 1024)
	go func() {
		_, _ = io.Copy(captured, ptmx)
		_ = clientCmd.Wait()
		_ = ptmx.Close()
	}()

	if err := waitForSessionUp(ctx, z.run, binary, opts.Name, 50*time.Millisecond, 2500*time.Millisecond); err != nil {
		_ = clientCmd.Process.Kill()
		ptyOutput := captured.String()
		// Keep the layout file on failure so the user can re-run the
		// underlying zellij invocation manually if our error isn't
		// enough.
		return fmt.Errorf(
			"zellij: session %q did not come up: %w\n"+
				"layout file (kept for inspection): %s\n"+
				"pty output (last %d bytes):\n%s",
			opts.Name, err, layoutPath, len(ptyOutput), ptyOutput,
		)
	}

	// Politely detach the client. If detach fails, force-kill: the session
	// is already up server-side and that's what matters.
	if err := runWith(z.run, ctx, binary, "--session", opts.Name, "action", "detach"); err != nil {
		_ = clientCmd.Process.Kill()
	}

	cleanupLayout()
	return nil
}

// KillSession terminates the zellij session named name. Killing a session
// that no longer exists is treated as success.
func (z *ZellijProvider) KillSession(ctx context.Context, name string) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("zellij: KillSession requires a name")
	}

	binary, err := z.resolvePath()
	if err != nil {
		return err
	}

	exists, err := z.SessionExists(ctx, name)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}

	if err := runWith(z.run, ctx, binary, "kill-session", name); err != nil {
		// One more existence check — zellij may have reaped it between our
		// probe and the kill. Surface a clean nil in that case.
		stillThere, probeErr := z.SessionExists(ctx, name)
		if probeErr == nil && !stillThere {
			return nil
		}
		return fmt.Errorf("zellij: kill-session %q: %w", name, err)
	}
	return nil
}

// SessionExists reports whether a zellij session with the given name is
// currently registered.
func (z *ZellijProvider) SessionExists(ctx context.Context, name string) (bool, error) {
	if strings.TrimSpace(name) == "" {
		return false, errors.New("zellij: SessionExists requires a name")
	}

	names, err := z.ListSessionNames(ctx)
	if err != nil {
		return false, err
	}
	for _, n := range names {
		if n == name {
			return true, nil
		}
	}
	return false, nil
}

// ListSessionNames returns the names of every active zellij session.
func (z *ZellijProvider) ListSessionNames(ctx context.Context) ([]string, error) {
	binary, err := z.resolvePath()
	if err != nil {
		return nil, err
	}

	out, err := runCaptureWith(z.run, ctx, binary, "list-sessions", "--short", "--no-formatting")
	if err != nil {
		// zellij returns non-zero with a specific message when there are
		// no sessions. Treat that as an empty list rather than an error.
		if strings.Contains(err.Error(), "No active zellij sessions") {
			return nil, nil
		}
		return nil, fmt.Errorf("zellij: list-sessions: %w", err)
	}

	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	var names []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			names = append(names, trimmed)
		}
	}
	return names, nil
}

// startZellijClient spawns a `zellij --session NAME --layout L` client
// attached to a PTY in its own process group. The session, once observed
// by waitForSessionUp, lives on the server even after this client exits.
//
// configPath, when non-empty, is passed as `--config` so the session adopts
// yyork's color theme; an empty configPath leaves zellij on its own config.
func startZellijClient(ctx context.Context, binary, configPath, name, layoutPath, cwd string, extraEnv map[string]string) (*pty.Cmd, pty.Pty, error) {
	ptmx, err := pty.New()
	if err != nil {
		return nil, nil, fmt.Errorf("zellij: open pty: %w", err)
	}

	// Resize the PTY before spawning zellij. The default 0x0 size causes
	// zellij to compute its max-session-name length from terminal_width
	// minus a constant, underflow to zero, and reject any non-empty
	// session name with the misleading error "session name must be less
	// than 0 characters". 200x50 is large enough to never trip that.
	if err := ptmx.Resize(200, 50); err != nil {
		_ = ptmx.Close()
		return nil, nil, fmt.Errorf("zellij: resize pty: %w", err)
	}

	// `--session NAME --new-session-with-layout L` (i.e. `-n`) always creates
	// a fresh session. Plain `--session NAME --layout L` tries to attach to
	// an existing session first and fails with "There is no active session!"
	// when NAME doesn't exist — that's the wrong semantic for us.
	args := make([]string, 0, 6)
	if configPath != "" {
		args = append(args, "--config", configPath)
	}
	args = append(args, "--session", name, "--new-session-with-layout", layoutPath)
	cmd := ptmx.CommandContext(ctx, binary, args...)
	cmd.Dir = cwd
	cmd.Env = buildEnv(extraEnv)
	// Do NOT touch cmd.SysProcAttr here: go-pty configures Setsid +
	// Setctty + Ctty so the child gets the PTY as its controlling
	// terminal. Overwriting SysProcAttr strips those flags, leaving
	// zellij with no controlling TTY — its terminal-size query returns
	// 0x0, the max-session-name-length computation underflows, and CLAP
	// rejects every name with the misleading "session name must be less
	// than 0 characters" error.

	if err := cmd.Start(); err != nil {
		_ = ptmx.Close()
		return nil, nil, fmt.Errorf("zellij: start client: %w", err)
	}
	return cmd, ptmx, nil
}

// buildEnv merges extra env vars onto the calling process's environment.
// Later additions override earlier ones; vars listed in extra always win, then
// TERM and the color vars are normalized so zellij never starts from a
// sparse/dumb terminal environment. The attach side already sets
// TERM=xterm-256color; creation must do the same because zellij plugins can
// latch compatibility decisions when the session is first created.
func buildEnv(extra map[string]string) []string {
	base := os.Environ()
	out := make([]string, 0, len(base)+len(extra))
	override := make(map[string]struct{}, len(extra))
	for k, v := range extra {
		out = append(out, k+"="+v)
		override[k] = struct{}{}
	}
	for _, pair := range base {
		eq := strings.IndexByte(pair, '=')
		if eq < 0 {
			out = append(out, pair)
			continue
		}
		if _, replaced := override[pair[:eq]]; replaced {
			continue
		}
		out = append(out, pair)
	}
	return normalizeColorEnv(ensureZellijTerm(out))
}

func ensureZellijTerm(env []string) []string {
	for i, pair := range env {
		key, value, ok := strings.Cut(pair, "=")
		if !ok || key != "TERM" {
			continue
		}
		if strings.TrimSpace(value) == "" {
			env[i] = "TERM=" + defaultZellijTerm
		}
		return env
	}
	return append(env, "TERM="+defaultZellijTerm)
}

// normalizeColorEnv makes the session environment color-capable regardless of
// how the backend was launched. A backend started from an agent/CI shell
// (Codex CLI exports NO_COLOR=1 and a blank COLORTERM) would otherwise bake
// those vars into the long-lived zellij server, and every pane process the
// session ever spawns inherits them — agents render monochrome until the
// session is recreated. The session is always viewed through yyork's web
// terminal (truecolor-capable), so the launching shell's own color support is
// irrelevant: drop NO_COLOR and fill in COLORTERM when it is missing or blank,
// preserving any explicit non-empty value.
func normalizeColorEnv(env []string) []string {
	out := env[:0]
	colortermPresent := false
	for _, pair := range env {
		key, value, _ := strings.Cut(pair, "=")
		switch key {
		case "NO_COLOR":
			continue
		case "COLORTERM":
			if strings.TrimSpace(value) == "" {
				pair = "COLORTERM=" + defaultZellijColorterm
			}
			colortermPresent = true
		}
		out = append(out, pair)
	}
	if !colortermPresent {
		out = append(out, "COLORTERM="+defaultZellijColorterm)
	}
	return out
}

// waitForSessionUp polls list-sessions until target appears or budget
// elapses. interval is the time between probes.
func waitForSessionUp(ctx context.Context, run commandRunner, binary, target string, interval, budget time.Duration) error {
	deadline := time.Now().Add(budget)
	for {
		out, err := runCaptureWith(run, ctx, binary, "list-sessions", "--short", "--no-formatting")
		if err == nil {
			for _, line := range strings.Split(strings.TrimRight(out, "\n"), "\n") {
				if strings.TrimSpace(line) == target {
					return nil
				}
			}
		}

		if time.Now().After(deadline) {
			return fmt.Errorf("timed out after %s", budget)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
		}
	}
}

// writeLaunchLayout renders launchCmd into a temp KDL layout file. Caller
// owns the file and must remove it.
//
// The layout is a single full-screen agent pane and nothing else: zellij's
// tab-bar and status-bar are not implicit — a custom layout only shows them
// if it includes the plugin panes explicitly — so omitting them leaves no
// multiplexer chrome at all. The user must not be able to tell the agent is
// running inside zellij (see internal/zellijconfig for the matching config).
// borderless=true keeps the pane frame-free even if the managed config (which
// also sets pane_frames false) failed to write and zellij fell back to the
// user's own.
func writeLaunchLayout(launchCmd []string, cwd string) (string, error) {
	quoted := shellQuoteArgs(launchCmd)
	bashCmd := quoted + `; exec "${SHELL:-/bin/bash}" -i`

	const layoutTemplate = `layout {
    pane command="bash" cwd=%s borderless=true {
        args "-c" %s
    }
}
`
	kdl := fmt.Sprintf(layoutTemplate,
		kdlQuote(cwd),
		kdlQuote(bashCmd),
	)

	f, err := os.CreateTemp("", "yyork-layout-*.kdl")
	if err != nil {
		return "", fmt.Errorf("zellij: create layout file: %w", err)
	}
	defer func() { _ = f.Close() }()
	if _, err := io.WriteString(f, kdl); err != nil {
		_ = os.Remove(f.Name())
		return "", fmt.Errorf("zellij: write layout: %w", err)
	}
	return f.Name(), nil
}

func terminalHostLaunchCommand(opts session.CreateOpts) ([]string, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("zellij: resolve yyork executable: %w", err)
	}
	socketPath, err := terminalipc.SocketPath(opts.Name)
	if err != nil {
		return nil, err
	}
	agentCmd := shellQuoteArgs(opts.LaunchCmd) + `; exec "${SHELL:-/bin/bash}" -i`
	return []string{
		executable,
		"terminal-host",
		"--session", opts.Name,
		"--socket", socketPath,
		"--cwd", opts.Cwd,
		"--",
		"bash", "-c", agentCmd,
	}, nil
}

// shellQuoteArgs returns args concatenated as a single POSIX shell command,
// with each argument single-quoted (any single quotes inside an arg are
// escaped via the standard single-quote/backslash/single-quote trick).
func shellQuoteArgs(args []string) string {
	parts := make([]string, len(args))
	for i, a := range args {
		parts[i] = shellQuote(a)
	}
	return strings.Join(parts, " ")
}

func shellQuote(s string) string {
	if s == "" {
		return "''"
	}
	// Fast path for "safe" args: alphanumerics and a few specific chars.
	safe := true
	for _, r := range s {
		switch {
		case 'a' <= r && r <= 'z',
			'A' <= r && r <= 'Z',
			'0' <= r && r <= '9',
			r == '/' || r == '.' || r == '_' || r == '-' || r == '+' || r == '=' || r == ':' || r == ',':
		default:
			safe = false
		}
		if !safe {
			break
		}
	}
	if safe {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// kdlQuote returns s wrapped in KDL-safe double quotes, escaping any
// embedded double quotes and backslashes.
func kdlQuote(s string) string {
	var b bytes.Buffer
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// runWith executes a command via the optional runner, falling back to the
// real exec runner when nil. Returns only the error (discards stdout) —
// used for fire-and-forget actions like kill-session and detach.
func runWith(run commandRunner, ctx context.Context, name string, args ...string) error {
	if run != nil {
		return run(ctx, name, args...)
	}
	return defaultCommandRunner(ctx, name, args...)
}

// runCaptureWith executes a command and captures its stdout. The optional
// commandRunner only knows how to run-without-output; when it's set we
// fall back to the real exec path for capture (used by tests that stub the
// runner only for fire-and-forget paths).
func runCaptureWith(_ commandRunner, ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if stderr.Len() > 0 {
			return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
		}
		return "", err
	}
	return stdout.String(), nil
}

// Ensure the package compiles even on builds where filepath isn't otherwise
// used by this file (some Go tooling re-runs imports).
var _ = filepath.Separator

// ringCapture is a bounded io.Writer that keeps the last `limit` bytes
// written to it. Used to surface zellij/agent output when CreateSession
// times out without retaining unlimited memory if an agent prints a lot.
type ringCapture struct {
	limit int
	buf   []byte
	full  bool
	pos   int
}

func newRingCapture(limit int) *ringCapture {
	if limit <= 0 {
		limit = 4 * 1024
	}
	return &ringCapture{limit: limit, buf: make([]byte, 0, limit)}
}

func (r *ringCapture) Write(p []byte) (int, error) {
	for _, b := range p {
		if !r.full {
			r.buf = append(r.buf, b)
			if len(r.buf) == r.limit {
				r.full = true
				r.pos = 0
			}
		} else {
			r.buf[r.pos] = b
			r.pos++
			if r.pos == r.limit {
				r.pos = 0
			}
		}
	}
	return len(p), nil
}

func (r *ringCapture) String() string {
	if !r.full {
		return string(r.buf)
	}
	out := make([]byte, 0, r.limit)
	out = append(out, r.buf[r.pos:]...)
	out = append(out, r.buf[:r.pos]...)
	return string(out)
}
