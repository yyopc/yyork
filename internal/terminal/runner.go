package terminal

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	crosspty "github.com/aymanbagabas/go-pty"

	"github.com/yyopc/yyork/internal/durabilityprovider"
)

type StartOptions struct {
	Command []string
	CWD     string
	Cols    int
	Env     []string
	Rows    int
}

type Process interface {
	io.ReadWriteCloser
	Resize(cols int, rows int) error
	Wait() error
}

type Runner interface {
	Start(ctx context.Context, opts StartOptions) (Process, error)
}

type PTYRunner struct{}

func NewPTYRunner() *PTYRunner {
	return &PTYRunner{}
}

var resolveZellijBinaryForStart = durabilityprovider.ResolveZellijBinary

func (r *PTYRunner) Start(ctx context.Context, opts StartOptions) (Process, error) {
	if opts.Cols <= 0 {
		opts.Cols = defaultCols
	}
	if opts.Rows <= 0 {
		opts.Rows = defaultRows
	}

	pty, err := crosspty.New()
	if err != nil {
		return nil, err
	}

	if err := pty.Resize(opts.Cols, opts.Rows); err != nil {
		_ = pty.Close()
		return nil, err
	}

	command, args, err := commandForStart(opts.Command)
	if err != nil {
		_ = pty.Close()
		return nil, err
	}

	cmd := pty.CommandContext(ctx, command, args...)
	cmd.Dir = opts.CWD
	cmd.Env = mergeTerminalEnv(os.Environ(), opts.Env)
	if err := cmd.Start(); err != nil {
		_ = pty.Close()
		return nil, fmt.Errorf("start terminal command %q: %w", command, err)
	}

	return &ptyProcess{cmd: cmd, pty: pty}, nil
}

type ptyProcess struct {
	cmd *crosspty.Cmd
	pty crosspty.Pty
}

func (p *ptyProcess) Read(buf []byte) (int, error) {
	return p.pty.Read(buf)
}

func (p *ptyProcess) Write(buf []byte) (int, error) {
	return p.pty.Write(buf)
}

func (p *ptyProcess) Close() error {
	var err error
	if p.cmd.Process != nil {
		err = errors.Join(err, p.cmd.Process.Kill())
	}
	err = errors.Join(err, p.pty.Close())
	return err
}

func (p *ptyProcess) Resize(cols int, rows int) error {
	return p.pty.Resize(cols, rows)
}

func (p *ptyProcess) Wait() error {
	return p.cmd.Wait()
}

func commandForStart(command []string) (string, []string, error) {
	if len(command) == 0 {
		return defaultShell()
	}
	if command[0] == "" {
		return "", nil, errors.New("terminal command path is required")
	}
	if command[0] == "zellij" {
		binary, err := resolveZellijBinaryForStart()
		if err != nil {
			return "", nil, fmt.Errorf("resolve zellij binary: %w", err)
		}
		return binary.Path, append([]string(nil), command[1:]...), nil
	}

	return command[0], append([]string(nil), command[1:]...), nil
}

func defaultShell() (string, []string, error) {
	if runtime.GOOS == "windows" {
		for _, candidate := range []struct {
			name string
			args []string
		}{
			{name: "pwsh.exe", args: []string{"-NoLogo"}},
			{name: "powershell.exe", args: []string{"-NoLogo"}},
			{name: "cmd.exe"},
		} {
			path, err := exec.LookPath(candidate.name)
			if err == nil {
				return path, candidate.args, nil
			}
		}

		return "", nil, errors.New("no supported Windows shell found")
	}

	if shell := os.Getenv("SHELL"); shell != "" {
		if filepath.IsAbs(shell) {
			if _, err := os.Stat(shell); err == nil {
				return shell, nil, nil
			}
		}
		if path, err := exec.LookPath(shell); err == nil {
			return path, nil, nil
		}
	}

	if path, err := exec.LookPath("sh"); err == nil {
		return path, nil, nil
	}

	return "", nil, errors.New("no supported shell found")
}

func mergeTerminalEnv(base []string, extra []string) []string {
	env := append([]string(nil), base...)
	if runtime.GOOS != "windows" {
		env = upsertEnv(env, "TERM=xterm-256color")
		// Zellij resurrects dead sessions on attach, and the resurrected
		// server inherits THIS attach client's env — which every pane process
		// the session spawns then inherits. A backend launched from an
		// agent/CI shell carries NO_COLOR=1, FORCE_COLOR=0, and a blank
		// COLORTERM, which would force agents in the session to render
		// monochrome. The terminal on the other end is the web frontend, which
		// is truecolor-capable regardless of how the backend started.
		env = removeEnv(env, "NO_COLOR")
		env = removeDisablingForceColor(env)
		env = upsertEnv(env, "COLORTERM=truecolor")
	}

	for _, value := range extra {
		env = upsertEnv(env, value)
	}

	return env
}

func removeEnv(env []string, key string) []string {
	keyPrefix := key + "="
	out := env[:0]
	for _, current := range env {
		if len(current) >= len(keyPrefix) && current[:len(keyPrefix)] == keyPrefix {
			continue
		}
		out = append(out, current)
	}
	return out
}

func removeDisablingForceColor(env []string) []string {
	const keyPrefix = "FORCE_COLOR="
	out := env[:0]
	for _, current := range env {
		if len(current) >= len(keyPrefix) && current[:len(keyPrefix)] == keyPrefix {
			value := strings.ToLower(strings.TrimSpace(current[len(keyPrefix):]))
			if value == "" || value == "0" || value == "false" || value == "no" {
				continue
			}
		}
		out = append(out, current)
	}
	return out
}

func upsertEnv(env []string, value string) []string {
	keyEnd := -1
	for index, char := range value {
		if char == '=' {
			keyEnd = index
			break
		}
	}
	if keyEnd <= 0 {
		return env
	}

	keyPrefix := value[:keyEnd+1]
	for index, current := range env {
		if len(current) >= len(keyPrefix) && current[:len(keyPrefix)] == keyPrefix {
			env[index] = value
			return env
		}
	}

	return append(env, value)
}
