package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/yyopc/yyork/internal/session"
)

func TestHandleSessionFilesReturnsWorkspaceFileTree(t *testing.T) {
	workspacePath := t.TempDir()
	writeTestFile(t, filepath.Join(workspacePath, ".git", "config"))
	writeTestFile(t, filepath.Join(workspacePath, "cmd", "yyork", "main.go"))
	writeTestFile(t, filepath.Join(workspacePath, "web", "src", "main.tsx"))
	writeTestFile(t, filepath.Join(workspacePath, "node_modules", "ignored", "index.js"))
	writeTestFile(t, filepath.Join(workspacePath, "yyork"))

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{
					CWD:     workspacePath,
					ID:      "ao-1",
					Project: "project-a",
				},
			},
		},
	})
	request := httptest.NewRequest(http.MethodGet, "/api/sessions/ao-1/files?project=project-a", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected files request to succeed, got %d: %s", response.Code, response.Body.String())
	}

	var payload fileTreeResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode files response: %v", err)
	}

	if payload.WorkspacePath != workspacePath {
		t.Fatalf("expected workspace path %q, got %q", workspacePath, payload.WorkspacePath)
	}
	wantPaths := []string{
		"cmd/",
		"cmd/yyork/",
		"cmd/yyork/main.go",
		"node_modules/",
		"web/",
		"web/src/",
		"web/src/main.tsx",
		"yyork",
	}
	if !stringSlicesEqual(payload.Paths, wantPaths) {
		t.Fatalf("expected paths %#v, got %#v", wantPaths, payload.Paths)
	}
}

func TestListWorkspaceFilePathsMarksSymlinkedDirectories(t *testing.T) {
	workspacePath := t.TempDir()
	targetPath := filepath.Join(workspacePath, ".agents", "skills", "shadcn")
	if err := os.MkdirAll(targetPath, 0o755); err != nil {
		t.Fatalf("create symlink target: %v", err)
	}
	linkParentPath := filepath.Join(workspacePath, ".claude", "skills")
	if err := os.MkdirAll(linkParentPath, 0o755); err != nil {
		t.Fatalf("create symlink parent: %v", err)
	}
	if err := os.Symlink("../../.agents/skills/shadcn", filepath.Join(linkParentPath, "shadcn")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	paths, _, err := listWorkspaceFilePaths(workspacePath)
	if err != nil {
		t.Fatalf("list workspace file paths: %v", err)
	}

	if !stringSliceContains(paths, ".claude/skills/shadcn/") {
		t.Fatalf("expected symlinked directory path, got %#v", paths)
	}
	if stringSliceContains(paths, ".claude/skills/shadcn") {
		t.Fatalf("expected symlinked directory not to be emitted as file, got %#v", paths)
	}
}

func TestHandleSessionFilesRejectsAmbiguousLegacySessionLookup(t *testing.T) {
	workspacePath := t.TempDir()
	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
				{CWD: workspacePath, ID: "ao-1", Project: "project-b"},
			},
		},
	})
	request := httptest.NewRequest(http.MethodGet, "/api/sessions/ao-1/files", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected ambiguous lookup to be rejected, got %d", response.Code)
	}
}

func TestHandleSessionFileContentReturnsTextFile(t *testing.T) {
	workspacePath := t.TempDir()
	writeTestFile(t, filepath.Join(workspacePath, "left", "hook.yml"), "pre-commit:\n  commands: {}\n")

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{
					CWD:     workspacePath,
					ID:      "ao-1",
					Project: "project-a",
				},
			},
		},
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/content?project=project-a&path="+url.QueryEscape("left/hook.yml"),
		nil,
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected file content request to succeed, got %d: %s", response.Code, response.Body.String())
	}

	var payload fileContentResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode file content response: %v", err)
	}

	if payload.Path != "left/hook.yml" {
		t.Fatalf("expected normalized path %q, got %q", "left/hook.yml", payload.Path)
	}
	if payload.Contents != "pre-commit:\n  commands: {}\n" {
		t.Fatalf("unexpected contents: %q", payload.Contents)
	}
	if payload.Binary {
		t.Fatal("expected text file not to be marked binary")
	}
	if payload.Truncated {
		t.Fatal("expected small text file not to be truncated")
	}
}

func TestHandleSessionFileContentRejectsPathTraversal(t *testing.T) {
	workspacePath := t.TempDir()
	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/content?project=project-a&path="+url.QueryEscape("../secret.txt"),
		nil,
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected path traversal to be rejected, got %d", response.Code)
	}
}

func TestHandleSessionFileContentRejectsSymlinkOutsideWorkspace(t *testing.T) {
	workspacePath := t.TempDir()
	externalPath := filepath.Join(t.TempDir(), "secret.txt")
	writeTestFile(t, externalPath, "do not read\n")
	if err := os.Symlink(externalPath, filepath.Join(workspacePath, "secret-link")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/content?project=project-a&path=secret-link",
		nil,
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected symlink escape to be rejected, got %d", response.Code)
	}
}

func TestParseGitStatusOutput(t *testing.T) {
	status := parseGitStatusOutput([]byte(" M web/src/main.tsx\x00A  README.md\x00?? scratch.txt\x00R  new-name.go\x00old-name.go\x00"))
	want := []fileTreeGitStatusEntry{
		{Path: "web/src/main.tsx", Status: "modified"},
		{Path: "README.md", Status: "added"},
		{Path: "scratch.txt", Status: "untracked"},
		{Path: "new-name.go", Status: "renamed"},
	}

	if len(status) != len(want) {
		t.Fatalf("expected %#v, got %#v", want, status)
	}
	for idx := range want {
		if status[idx] != want[idx] {
			t.Fatalf("expected status[%d] %#v, got %#v", idx, want[idx], status[idx])
		}
	}
}

func writeTestFile(t *testing.T, path string, contents ...string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create parent dir for %s: %v", path, err)
	}
	value := "test"
	if len(contents) > 0 {
		value = contents[0]
	}
	if err := os.WriteFile(path, []byte(value), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func stringSlicesEqual(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for idx := range left {
		if left[idx] != right[idx] {
			return false
		}
	}
	return true
}

func stringSliceContains(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
