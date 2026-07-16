package worktree_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/worktree"
)

func TestIsGitRepo(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	repo := initRepo(t)
	if !m.IsGitRepo(ctx, repo) {
		t.Fatalf("IsGitRepo(%s) = false, want true", repo)
	}

	notRepo := t.TempDir()
	if m.IsGitRepo(ctx, notRepo) {
		t.Fatalf("IsGitRepo(%s) = true, want false", notRepo)
	}
}

func TestBaseRefFallbacksToLocalHEAD(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	repo := initRepo(t)
	branch := currentBranch(t, repo)

	got, err := m.BaseRef(ctx, repo)
	if err != nil {
		t.Fatalf("BaseRef: %v", err)
	}
	want := "refs/heads/" + branch
	if got != want {
		t.Fatalf("BaseRef = %q, want %q", got, want)
	}
}

func TestBaseRefPrefersOriginHEAD(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	repo := initRepoWithOrigin(t)

	got, err := m.BaseRef(ctx, repo)
	if err != nil {
		t.Fatalf("BaseRef: %v", err)
	}
	// origin/HEAD should resolve to whatever the remote's default is,
	// which is the branch we pushed up. The exact value depends on
	// git's default branch name, but it must be prefixed by origin/.
	if !strings.HasPrefix(got, "refs/remotes/origin/") {
		t.Fatalf("BaseRef = %q, want refs/remotes/origin/* prefix", got)
	}
}

func TestBaseRefRejectsNonRepo(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	notRepo := t.TempDir()
	_, err := m.BaseRef(ctx, notRepo)
	if !errors.Is(err, worktree.ErrNotAGitRepo) {
		t.Fatalf("BaseRef on non-repo: err = %v, want ErrNotAGitRepo", err)
	}
}

func TestCreateAndRemoveWorktree(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	repo := initRepo(t)
	branch := currentBranch(t, repo)
	baseRef := "refs/heads/" + branch

	worktreesBase := filepath.Join(t.TempDir(), "worktrees")
	sid := "01HRTESTSESSION00000000000"
	worktreePath := filepath.Join(worktreesBase, sid)
	branchName := "yyork/" + sid

	if err := m.Create(ctx, repo, worktreePath, branchName, baseRef); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Filesystem should contain the worktree.
	if _, err := os.Stat(filepath.Join(worktreePath, ".git")); err != nil {
		t.Fatalf("expected .git pointer in worktree, got: %v", err)
	}

	// `git worktree list` in the project should mention our new path.
	out := runGit(t, repo, "worktree", "list")
	if !strings.Contains(out, worktreePath) {
		t.Fatalf("git worktree list does not mention %q:\n%s", worktreePath, out)
	}
	if !strings.Contains(out, branchName) {
		t.Fatalf("git worktree list does not mention branch %q:\n%s", branchName, out)
	}

	if err := m.Remove(ctx, repo, worktreePath, branchName); err != nil {
		t.Fatalf("Remove: %v", err)
	}

	if _, err := os.Stat(worktreePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("worktree directory still exists: %v", err)
	}

	// The branch must be gone too — no leaked yyork/<sid> branches.
	branches := runGit(t, repo, "branch", "--list", branchName)
	if strings.TrimSpace(branches) != "" {
		t.Fatalf("branch %q still exists after Remove:\n%s", branchName, branches)
	}

	// Removing twice is a no-op (worktree gone, branch gone).
	if err := m.Remove(ctx, repo, worktreePath, branchName); err != nil {
		t.Fatalf("second Remove: %v", err)
	}
}

func TestCreateAllowsWorktreeEnvrcWhenDirenvIsAvailable(t *testing.T) {
	ctx := context.Background()
	m := worktree.New()

	repo := initRepo(t)
	if err := os.WriteFile(filepath.Join(repo, ".envrc"), []byte("use flake\n"), 0o644); err != nil {
		t.Fatalf("write .envrc: %v", err)
	}
	runGit(t, repo, "add", ".envrc")
	runGit(t, repo, "commit", "-m", "add envrc")

	binDir := t.TempDir()
	logPath := filepath.Join(t.TempDir(), "direnv.log")
	direnvPath := filepath.Join(binDir, "direnv")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > " + shellQuote(logPath) + "\n"
	if err := os.WriteFile(direnvPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake direnv: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	baseRef := "refs/heads/" + currentBranch(t, repo)
	worktreePath := filepath.Join(t.TempDir(), "worktrees", "01HRENVRCSESSION0000000000")
	branchName := "yyork/01HRENVRCSESSION0000000000"

	if err := m.Create(ctx, repo, worktreePath, branchName, baseRef); err != nil {
		t.Fatalf("Create: %v", err)
	}

	raw, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read fake direnv log: %v", err)
	}
	want := "allow\n" + filepath.Join(worktreePath, ".envrc") + "\n"
	if string(raw) != want {
		t.Fatalf("direnv args = %q, want %q", string(raw), want)
	}
}

func TestRemoveDeletesBranchEvenWithCommits(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	repo := initRepo(t)
	baseRef := "refs/heads/" + currentBranch(t, repo)

	sid := "01HRTESTCOMMITS0000000000"
	worktreePath := filepath.Join(t.TempDir(), "worktrees", sid)
	branchName := "yyork/" + sid

	if err := m.Create(ctx, repo, worktreePath, branchName, baseRef); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Simulate the agent committing work on the session branch.
	if err := os.WriteFile(filepath.Join(worktreePath, "work.txt"), []byte("agent work\n"), 0o644); err != nil {
		t.Fatalf("write work file: %v", err)
	}
	runGit(t, worktreePath, "add", "work.txt")
	runGit(t, worktreePath, "commit", "-m", "agent did work")

	// Remove must force-delete the unmerged branch (v1 ephemeral model).
	if err := m.Remove(ctx, repo, worktreePath, branchName); err != nil {
		t.Fatalf("Remove with committed work: %v", err)
	}

	branches := runGit(t, repo, "branch", "--list", branchName)
	if strings.TrimSpace(branches) != "" {
		t.Fatalf("unmerged branch %q survived Remove:\n%s", branchName, branches)
	}
}

func TestRemoveWithEmptyBranchSkipsBranchDeletion(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	repo := initRepo(t)
	baseRef := "refs/heads/" + currentBranch(t, repo)

	sid := "01HRTESTNOBRANCH000000000"
	worktreePath := filepath.Join(t.TempDir(), "worktrees", sid)
	branchName := "yyork/" + sid
	if err := m.Create(ctx, repo, worktreePath, branchName, baseRef); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Passing an empty branchName removes the worktree but leaves branches
	// untouched — exercises the "skip branch deletion" path.
	if err := m.Remove(ctx, repo, worktreePath, ""); err != nil {
		t.Fatalf("Remove with empty branch: %v", err)
	}
	branches := runGit(t, repo, "branch", "--list", branchName)
	if strings.TrimSpace(branches) == "" {
		t.Fatalf("expected branch %q to survive when branchName empty", branchName)
	}
	// Clean up the leftover branch ourselves.
	runGit(t, repo, "branch", "-D", branchName)
}

func TestCreateRejectsNonGitProject(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	notRepo := t.TempDir()
	err := m.Create(ctx, notRepo, filepath.Join(t.TempDir(), "w"), "br", "refs/heads/main")
	if !errors.Is(err, worktree.ErrNotAGitRepo) {
		t.Fatalf("Create on non-repo: err = %v, want ErrNotAGitRepo", err)
	}
}

func TestCreateRejectsEmptyArgs(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	m := worktree.New()

	repo := initRepo(t)
	cases := []struct {
		name                                           string
		projectPath, worktreePath, branchName, baseRef string
	}{
		{"empty projectPath", "", "/w", "br", "refs/heads/main"},
		{"empty worktreePath", repo, "", "br", "refs/heads/main"},
		{"empty branchName", repo, "/w", "", "refs/heads/main"},
		{"empty baseRef", repo, "/w", "br", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := m.Create(ctx, tc.projectPath, tc.worktreePath, tc.branchName, tc.baseRef)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

// initRepo creates a fresh git repo with one commit and returns its path.
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	runGit(t, dir, "init", "--initial-branch=main")
	runGit(t, dir, "config", "user.email", "test@example.com")
	runGit(t, dir, "config", "user.name", "Test")
	runGit(t, dir, "config", "commit.gpgsign", "false")

	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("hello\n"), 0o644); err != nil {
		t.Fatalf("write README: %v", err)
	}
	runGit(t, dir, "add", "README.md")
	runGit(t, dir, "commit", "-m", "initial")
	return dir
}

// initRepoWithOrigin sets up a fresh repo plus a bare "origin" with
// refs/remotes/origin/HEAD pointing at the main branch.
func initRepoWithOrigin(t *testing.T) string {
	t.Helper()
	work := initRepo(t)

	bare := t.TempDir()
	runGit(t, bare, "init", "--bare", "--initial-branch=main")

	runGit(t, work, "remote", "add", "origin", bare)
	runGit(t, work, "push", "-u", "origin", "main")
	runGit(t, work, "remote", "set-head", "origin", "main")
	return work
}

func currentBranch(t *testing.T, repo string) string {
	t.Helper()
	out := runGit(t, repo, "rev-parse", "--abbrev-ref", "HEAD")
	return strings.TrimSpace(out)
}

func runGit(t *testing.T, cwd string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return string(out)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
