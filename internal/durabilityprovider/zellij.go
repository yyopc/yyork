package durabilityprovider

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/yyovil/yyork/internal/session"
)

const zellijRuntimeName = "zellij"

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

// Name reports the AO runtime name this provider handles.
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

// resolvePath finds the zellij binary, mirroring the discovery used by the AO
// workspace provider.
func (z *ZellijProvider) resolvePath() (string, error) {
	if z.path != "" {
		return z.path, nil
	}

	candidates := []string{
		"/opt/homebrew/bin/zellij",
		"/usr/local/bin/zellij",
		"/usr/bin/zellij",
		"/run/current-system/sw/bin/zellij",
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, ".nix-profile", "bin", "zellij"))
	}
	if user := os.Getenv("USER"); user != "" {
		candidates = append(candidates, filepath.Join("/etc/profiles/per-user", user, "bin", "zellij"))
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	if path, err := exec.LookPath("zellij"); err == nil {
		return path, nil
	}

	return "", errors.New("zellij binary not found")
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
