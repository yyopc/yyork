package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/session"
)

func TestHandleSessionCanvasDiffReturnsProjectScopedSessionPatch(t *testing.T) {
	projectA := createGitRepo(t)
	projectB := createGitRepo(t)
	writeTestFile(t, filepath.Join(projectA, "app.txt"))
	writeTestFile(t, filepath.Join(projectB, "app.txt"))
	runTestGit(t, projectA, "add", "app.txt")
	runTestGit(t, projectA, "commit", "-m", "seed a")
	runTestGit(t, projectB, "add", "app.txt")
	runTestGit(t, projectB, "commit", "-m", "seed b")
	writeTestFileContents(t, filepath.Join(projectA, "app.txt"), "project a change\n")
	writeTestFileContents(t, filepath.Join(projectB, "app.txt"), "project b change\n")
	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: projectA, ID: "ao-1", Project: "project-a"},
				{CWD: projectB, ID: "ao-1", Project: "project-b"},
			},
		},
	})
	request := httptest.NewRequest(http.MethodGet, "/api/sessions/ao-1/canvas/diff?project=project-b", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected diff request to succeed, got %d: %s", response.Code, response.Body.String())
	}
	var payload canvasDiffResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diff response: %v", err)
	}
	if payload.CWD != projectB {
		t.Fatalf("expected project-b cwd %q, got %q", projectB, payload.CWD)
	}
	if payload.Target.SessionID != "ao-1" || payload.Target.ProjectID != "project-b" {
		t.Fatalf("unexpected target: %#v", payload.Target)
	}
	if !strings.Contains(payload.Patch, "project b change") {
		t.Fatalf("expected project-b patch, got:\n%s", payload.Patch)
	}
	if strings.Contains(payload.Patch, "project a change") {
		t.Fatalf("patch leaked project-a changes:\n%s", payload.Patch)
	}
}

func TestHandleSessionCanvasDiffIncludesUntrackedTextFile(t *testing.T) {
	workspacePath := createGitRepo(t)
	writeTestFileContents(t, filepath.Join(workspacePath, "README.md"), "seed\n")
	runTestGit(t, workspacePath, "add", "README.md")
	runTestGit(t, workspacePath, "commit", "-m", "seed")
	writeTestFileContents(t, filepath.Join(workspacePath, "scratch.txt"), "new file\nline two")
	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})
	request := httptest.NewRequest(http.MethodGet, "/api/sessions/ao-1/canvas/diff?project=project-a", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected diff request to succeed, got %d: %s", response.Code, response.Body.String())
	}
	var payload canvasDiffResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diff response: %v", err)
	}
	if !strings.Contains(payload.Patch, "new file mode") ||
		!strings.Contains(payload.Patch, "+++ b/scratch.txt") ||
		!strings.Contains(payload.Patch, "+line two") {
		t.Fatalf("expected untracked file patch, got:\n%s", payload.Patch)
	}
	if len(payload.Files) != 1 {
		t.Fatalf("expected one changed file, got %#v", payload.Files)
	}
	if payload.Files[0].Path != "scratch.txt" || payload.Files[0].Status != "untracked" || payload.Files[0].Additions != 2 {
		t.Fatalf("unexpected file stats: %#v", payload.Files[0])
	}
}

func TestHandleSessionCanvasDiffRejectsAmbiguousLegacySessionLookup(t *testing.T) {
	workspacePath := createGitRepo(t)
	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
				{CWD: workspacePath, ID: "ao-1", Project: "project-b"},
			},
		},
	})
	request := httptest.NewRequest(http.MethodGet, "/api/sessions/ao-1/canvas/diff", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected ambiguous lookup to be rejected, got %d", response.Code)
	}
}

func createGitRepo(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	runTestGit(t, repo, "init")
	runTestGit(t, repo, "config", "user.email", "test@example.com")
	runTestGit(t, repo, "config", "user.name", "Test User")
	return repo
}

func runTestGit(t *testing.T, cwd string, args ...string) {
	t.Helper()
	output, err := gitOutput(t.Context(), cwd, args...)
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, string(output))
	}
}

func writeTestFileContents(t *testing.T, path string, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create parent dir for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
