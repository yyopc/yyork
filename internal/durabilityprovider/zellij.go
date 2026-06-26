package durabilityprovider

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/terminalipc"
)

const zellijRuntimeName = "zellij"
const zellijPathEnv = "YYORK_ZELLIJ"

const (
	ZellijBinarySourceOverride = "override"
	ZellijBinarySourceBundled  = "bundled"
	ZellijBinarySourcePath     = "path"
)

type ZellijBinary struct {
	Path   string
	Source string
}

// commandRunner runs an external command to completion. Injected for tests.
type commandRunner func(ctx context.Context, name string, args ...string) error

// ZellijProvider delivers a message into a Zellij session by pasting it
// (bracketed paste keeps multi-line content intact and unsubmitted) and then
// sending Enter to submit it. The message lands in the session's active pane,
// which hosts the agent CLI.
type ZellijProvider struct {
	// path, when set, overrides binary discovery (used by tests).
	path string
	// run, when set, replaces real command execution (used by tests).
	run commandRunner
}

// NewZellijProvider returns a provider that locates the zellij binary lazily.
func NewZellijProvider() *ZellijProvider {
	return &ZellijProvider{}
}

// Name reports the runtime name this provider handles.
func (z *ZellijProvider) Name() string { return zellijRuntimeName }

// SendMessage pastes message into sess's Zellij session and submits it.
func (z *ZellijProvider) SendMessage(ctx context.Context, sess session.Session, message string) error {
	name := strings.TrimSpace(sess.ZellijSession)
	if name == "" {
		return errors.New("session has no zellij session name")
	}

	if strings.TrimSpace(message) == "" {
		return errors.New("message is empty")
	}
	message = strings.TrimRight(message, "\n")

	if socketPath, err := terminalipc.SocketPath(name); err == nil {
		if err := sendToTerminalHost(ctx, socketPath, message+"\r"); err == nil {
			return nil
		}
	}

	path, err := z.resolvePath()
	if err != nil {
		return err
	}

	run := z.run
	if run == nil {
		run = defaultCommandRunner
	}

	// "--" guards against messages that begin with "-" being read as flags.
	if err := run(ctx, path, "--session", name, "action", "paste", "--", message); err != nil {
		return fmt.Errorf("zellij paste to %q: %w", name, err)
	}
	if err := run(ctx, path, "--session", name, "action", "send-keys", "Enter"); err != nil {
		return fmt.Errorf("zellij submit to %q: %w", name, err)
	}

	return nil
}

func sendToTerminalHost(ctx context.Context, socketPath string, input string) error {
	dialCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	dialer := net.Dialer{}
	conn, err := dialer.DialContext(dialCtx, "unix", socketPath)
	if err != nil {
		return err
	}
	defer conn.Close()
	return terminalipc.WriteFrame(conn, terminalipc.FrameInput, []byte(input))
}

// resolvePath finds the zellij binary yyork should use for its managed runtime.
func (z *ZellijProvider) resolvePath() (string, error) {
	if z.path != "" {
		return z.path, nil
	}

	binary, err := ResolveZellijBinary()
	if err != nil {
		return "", err
	}
	return binary.Path, nil
}

func defaultCommandRunner(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
		}
		return err
	}

	return nil
}

// ResolveZellijBinary locates the zellij binary yyork should use for its own
// session runtime. Packaged builds should ship a bundled zellij next to the
// yyork app; PATH fallback keeps source checkouts usable.
func ResolveZellijBinary() (ZellijBinary, error) {
	return resolveZellijBinary(zellijResolver{
		getenv:     os.Getenv,
		lookPath:   exec.LookPath,
		executable: os.Executable,
		stat:       os.Stat,
		goos:       runtime.GOOS,
		goarch:     runtime.GOARCH,
	})
}

type zellijResolver struct {
	getenv     func(string) string
	lookPath   func(string) (string, error)
	executable func() (string, error)
	stat       func(string) (os.FileInfo, error)
	goos       string
	goarch     string
}

func resolveZellijBinary(r zellijResolver) (ZellijBinary, error) {
	name := zellijExecutableName(r.goos)
	if override := strings.TrimSpace(r.getenv(zellijPathEnv)); override != "" {
		if isExecutable(r, override) {
			return ZellijBinary{Path: override, Source: ZellijBinarySourceOverride}, nil
		}
		return ZellijBinary{}, fmt.Errorf("zellij binary from %s is not executable: %s", zellijPathEnv, override)
	}

	if exe, err := r.executable(); err == nil && exe != "" {
		for _, candidate := range bundledZellijCandidates(exe, r.goos, r.goarch) {
			if isExecutable(r, candidate) {
				return ZellijBinary{Path: candidate, Source: ZellijBinarySourceBundled}, nil
			}
		}
	}

	if path, err := r.lookPath(name); err == nil && path != "" {
		return ZellijBinary{Path: path, Source: ZellijBinarySourcePath}, nil
	}

	return ZellijBinary{}, errors.New("zellij binary not found")
}

func bundledZellijCandidates(executablePath, goos, goarch string) []string {
	name := zellijExecutableName(goos)
	exeDir := filepath.Dir(executablePath)
	prefix := filepath.Dir(exeDir)

	candidates := []string{
		filepath.Join(exeDir, name),
		filepath.Join(prefix, "libexec", "yyork", "bin", name),
		filepath.Join(prefix, "vendor", "zellij", name),
	}
	for _, platformDir := range zellijPlatformDirs(goos, goarch) {
		candidates = append(candidates, filepath.Join(prefix, "vendor", "zellij", platformDir, name))
	}
	return candidates
}

func zellijPlatformDirs(goos, goarch string) []string {
	dirs := []string{goos + "-" + goarch}
	switch goarch {
	case "amd64":
		dirs = append(dirs, goos+"-x64")
	case "386":
		dirs = append(dirs, goos+"-ia32")
	}
	return dirs
}

func zellijExecutableName(goos string) string {
	if goos == "windows" {
		return "zellij.exe"
	}
	return "zellij"
}

func isExecutable(r zellijResolver, path string) bool {
	info, err := r.stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	if r.goos == "windows" {
		return true
	}
	return info.Mode()&0o111 != 0
}
