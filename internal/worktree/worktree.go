// Package worktree wraps the `git worktree` CLI behind a small interface so
// the spawn engine can create and remove per-session worktrees without
// knowing git's command-line details.
//
// In v1, every spawn calls Create with a path under ~/.yyork/worktrees/
// and a branch named yyork/{sessionId}. The base ref is detected from
// the project's actual git state via BaseRef.
package worktree

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/yyopc/yyork/internal/paths"
)

// ErrNotAGitRepo is returned by BaseRef and Create when the supplied
// projectPath is not inside a git working tree.
var ErrNotAGitRepo = errors.New("worktree: not a git repository")

// Module is the public surface for worktree operations. Implementations are
// expected to be safe for concurrent use across distinct sessions; the
// caller serializes operations on the same worktree path.
type Module interface {
	// IsGitRepo reports whether projectPath is inside a git working tree.
	IsGitRepo(ctx context.Context, projectPath string) bool

	// BaseRef returns the ref to fork new worktrees from. It tries
	// `git symbolic-ref refs/remotes/origin/HEAD` first, then falls back to
	// the currently checked-out branch (`git symbolic-ref HEAD`). Returns
	// ErrNotAGitRepo if projectPath is not a git repo.
	BaseRef(ctx context.Context, projectPath string) (string, error)

	// Create adds a new worktree at worktreePath, checked out on a new
	// branch branchName forked from baseRef. The parent directory of
	// worktreePath is created if missing.
	Create(ctx context.Context, projectPath, worktreePath, branchName, baseRef string) error

	// Remove tears down the worktree at worktreePath via
	// `git worktree remove --force`, then force-deletes branchName via
	// `git branch -D`. It is best-effort: a missing worktree directory or
	// a missing branch is not an error. Pass an empty branchName to skip
	// branch deletion.
	//
	// Branch deletion is force (`-D`) because the session's branch is
	// almost always unmerged — in the v1 ephemeral-session model a stopped
	// session is fully discarded, branch included. Commits made on the
	// branch become unreachable (recoverable via `git reflog` until gc).
	Remove(ctx context.Context, projectPath, worktreePath, branchName string) error
}

// DefaultBase returns ~/.yyork/worktrees, the v1 default location for
// session worktrees.
func DefaultBase() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, paths.DataDirName, "worktrees"), nil
}

// New returns the default Module backed by the `git` binary on PATH.
func New() Module {
	return &gitModule{}
}

type gitModule struct{}

func (m *gitModule) IsGitRepo(ctx context.Context, projectPath string) bool {
	out, err := m.run(ctx, projectPath, "rev-parse", "--is-inside-work-tree")
	if err != nil {
		return false
	}
	return strings.TrimSpace(out) == "true"
}

func (m *gitModule) BaseRef(ctx context.Context, projectPath string) (string, error) {
	if !m.IsGitRepo(ctx, projectPath) {
		return "", ErrNotAGitRepo
	}

	if ref, err := m.run(ctx, projectPath, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"); err == nil {
		trimmed := strings.TrimSpace(ref)
		if trimmed != "" {
			return trimmed, nil
		}
	}

	ref, err := m.run(ctx, projectPath, "symbolic-ref", "--quiet", "HEAD")
	if err != nil {
		return "", fmt.Errorf("worktree: detect base ref: %w", err)
	}
	trimmed := strings.TrimSpace(ref)
	if trimmed == "" {
		return "", errors.New("worktree: detected empty HEAD ref")
	}
	return trimmed, nil
}

func (m *gitModule) Create(ctx context.Context, projectPath, worktreePath, branchName, baseRef string) error {
	if projectPath == "" {
		return errors.New("worktree: projectPath is required")
	}
	if worktreePath == "" {
		return errors.New("worktree: worktreePath is required")
	}
	if branchName == "" {
		return errors.New("worktree: branchName is required")
	}
	if baseRef == "" {
		return errors.New("worktree: baseRef is required")
	}
	if !m.IsGitRepo(ctx, projectPath) {
		return ErrNotAGitRepo
	}

	if err := os.MkdirAll(filepath.Dir(worktreePath), 0o755); err != nil {
		return fmt.Errorf("worktree: create parent directory: %w", err)
	}

	if _, err := m.run(ctx, projectPath, "worktree", "add", "-b", branchName, worktreePath, baseRef); err != nil {
		return fmt.Errorf("worktree: git worktree add: %w", err)
	}
	allowWorktreeDirenv(ctx, worktreePath)
	return nil
}

func allowWorktreeDirenv(ctx context.Context, worktreePath string) {
	envrcPath := filepath.Join(worktreePath, ".envrc")
	if _, err := os.Stat(envrcPath); err != nil {
		return
	}
	binary, err := exec.LookPath("direnv")
	if err != nil || binary == "" {
		return
	}
	cmd := exec.CommandContext(ctx, binary, "allow", envrcPath)
	cmd.Dir = worktreePath
	_ = cmd.Run()
}

func (m *gitModule) Remove(ctx context.Context, projectPath, worktreePath, branchName string) error {
	if projectPath == "" || worktreePath == "" {
		return errors.New("worktree: projectPath and worktreePath are required")
	}

	if _, err := os.Stat(worktreePath); errors.Is(err, os.ErrNotExist) {
		// Worktree dir already gone. Prune git's registry, then still
		// attempt branch deletion below (the branch can outlive the dir).
		_, _ = m.run(ctx, projectPath, "worktree", "prune")
	} else if _, err := m.run(ctx, projectPath, "worktree", "remove", "--force", worktreePath); err != nil {
		return fmt.Errorf("worktree: git worktree remove: %w", err)
	}

	// Force-delete the branch. Best-effort: a branch that was never
	// created (early spawn failure) or already deleted is not an error.
	// `git worktree remove` must happen first — git refuses to delete a
	// branch that's still checked out in a worktree.
	if branchName != "" {
		if _, err := m.run(ctx, projectPath, "branch", "-D", branchName); err != nil {
			// Swallow "branch not found"; surface anything else as a soft
			// signal but don't fail the whole teardown over it.
			if !strings.Contains(err.Error(), "not found") {
				return fmt.Errorf("worktree: delete branch %q: %w", branchName, err)
			}
		}
	}
	return nil
}

// run executes git in cwd with the given args and returns stdout. The error,
// if any, includes stderr to make failures actionable.
func (m *gitModule) run(ctx context.Context, cwd string, args ...string) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = cwd
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg != "" {
			return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, msg)
		}
		return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return stdout.String(), nil
}
