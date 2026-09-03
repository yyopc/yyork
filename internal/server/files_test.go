package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/session"
)

func TestHandleSessionFilesReturnsWorkspaceFileTree(t *testing.T) {
	workspacePath := t.TempDir()
	writeTestFile(t, filepath.Join(workspacePath, ".git", "config"))
	writeTestFile(t, filepath.Join(workspacePath, "cmd", "yyork", "main.go"))
	writeTestFile(t, filepath.Join(workspacePath, "internal", "web", "src", "main.tsx"))
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
		"internal/",
		"internal/web/",
		"internal/web/src/",
		"internal/web/src/main.tsx",
		"node_modules/",
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

func TestHandleSessionFilesDoesNotTruncateLargeWorkspaceTree(t *testing.T) {
	workspacePath := t.TempDir()
	for index := 0; index < 20005; index++ {
		writeTestFile(t, filepath.Join(workspacePath, ".cache", "entry-"+formatPaddedInt(index)+".txt"))
	}
	writeTestFile(t, filepath.Join(workspacePath, "launch-video", "README.md"))

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

	if payload.Truncated {
		t.Fatal("expected large workspace tree not to be marked truncated")
	}
	if !stringSliceContains(payload.Paths, "launch-video/") {
		t.Fatalf("expected launch-video directory after large earlier-sorting tree, got %d paths", len(payload.Paths))
	}
	if !stringSliceContains(payload.Paths, "launch-video/README.md") {
		t.Fatalf("expected launch-video README after large earlier-sorting tree, got %d paths", len(payload.Paths))
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

func TestHandleSessionFileRawServesBytesWithContentType(t *testing.T) {
	workspacePath := t.TempDir()
	pngBytes := "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
	writeTestFile(t, filepath.Join(workspacePath, "assets", "logo.png"), pngBytes)

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/raw?project=project-a&path="+url.QueryEscape("assets/logo.png"),
		nil,
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected raw file request to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("expected Content-Type image/png, got %q", got)
	}
	if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("expected nosniff header, got %q", got)
	}
	if response.Body.String() != pngBytes {
		t.Fatalf("expected exact file bytes, got %q", response.Body.String())
	}
}

func TestHandleSessionFileRawSupportsRangeRequests(t *testing.T) {
	workspacePath := t.TempDir()
	writeTestFile(t, filepath.Join(workspacePath, "clip.mp4"), "0123456789")

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/raw?project=project-a&path=clip.mp4",
		nil,
	)
	request.Header.Set("Range", "bytes=2-5")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusPartialContent {
		t.Fatalf("expected 206 for range request, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Range"); got != "bytes 2-5/10" {
		t.Fatalf("expected Content-Range bytes 2-5/10, got %q", got)
	}
	if response.Body.String() != "2345" {
		t.Fatalf("expected partial body %q, got %q", "2345", response.Body.String())
	}
}

func TestHandleSessionFileRawPinsExplicitContentTypes(t *testing.T) {
	cases := []struct {
		fileName    string
		contentType string
	}{
		{"icon.svg", "image/svg+xml"},
		{"voice.m4a", "audio/mp4"},
		{"clip.webm", "video/webm"},
		{"song.MP3", "audio/mpeg"},
	}

	workspacePath := t.TempDir()
	for _, testCase := range cases {
		writeTestFile(t, filepath.Join(workspacePath, testCase.fileName))
	}

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})

	for _, testCase := range cases {
		request := httptest.NewRequest(
			http.MethodGet,
			"/api/sessions/ao-1/files/raw?project=project-a&path="+url.QueryEscape(testCase.fileName),
			nil,
		)
		response := httptest.NewRecorder()

		server.Handler().ServeHTTP(response, request)

		if response.Code != http.StatusOK {
			t.Fatalf("%s: expected raw request to succeed, got %d", testCase.fileName, response.Code)
		}
		if got := response.Header().Get("Content-Type"); got != testCase.contentType {
			t.Fatalf("%s: expected Content-Type %q, got %q", testCase.fileName, testCase.contentType, got)
		}
	}
}

func TestHandleSessionFileRawServesFileLargerThanContentCap(t *testing.T) {
	workspacePath := t.TempDir()
	largeContents := strings.Repeat("a", maxFileContentBytes+10)
	writeTestFile(t, filepath.Join(workspacePath, "large.mp4"), largeContents)

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/raw?project=project-a&path=large.mp4",
		nil,
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected large raw file request to succeed, got %d", response.Code)
	}
	if response.Body.Len() != len(largeContents) {
		t.Fatalf("expected %d bytes without truncation, got %d", len(largeContents), response.Body.Len())
	}
}

func TestHandleSessionFileRawRejectsPathTraversal(t *testing.T) {
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
		"/api/sessions/ao-1/files/raw?project=project-a&path="+url.QueryEscape("../secret.png"),
		nil,
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected path traversal to be rejected, got %d", response.Code)
	}
}

func TestHandleSessionFileRawRejectsSymlinkOutsideWorkspace(t *testing.T) {
	workspacePath := t.TempDir()
	externalPath := filepath.Join(t.TempDir(), "secret.png")
	writeTestFile(t, externalPath, "do not read\n")
	if err := os.Symlink(externalPath, filepath.Join(workspacePath, "secret-link.png")); err != nil {
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
		"/api/sessions/ao-1/files/raw?project=project-a&path=secret-link.png",
		nil,
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected symlink escape to be rejected, got %d", response.Code)
	}
}

func TestHandleSessionFileRawRejectsMissingAndDirectoryPaths(t *testing.T) {
	workspacePath := t.TempDir()
	writeTestFile(t, filepath.Join(workspacePath, "media", "logo.png"))

	server := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{CWD: workspacePath, ID: "ao-1", Project: "project-a"},
			},
		},
	})

	missingRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/raw?project=project-a&path=missing.png",
		nil,
	)
	missingResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(missingResponse, missingRequest)
	if missingResponse.Code != http.StatusNotFound {
		t.Fatalf("expected missing file to 404, got %d", missingResponse.Code)
	}

	directoryRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/sessions/ao-1/files/raw?project=project-a&path=media",
		nil,
	)
	directoryResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(directoryResponse, directoryRequest)
	if directoryResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected directory path to be rejected, got %d", directoryResponse.Code)
	}
}

func TestParseGitStatusOutput(t *testing.T) {
	status := parseGitStatusOutput([]byte(" M internal/web/src/main.tsx\x00A  README.md\x00?? scratch.txt\x00R  new-name.go\x00old-name.go\x00"))
	want := []fileTreeGitStatusEntry{
		{Path: "internal/web/src/main.tsx", Status: "modified"},
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

func formatPaddedInt(value int) string {
	return fmt.Sprintf("%05d", value)
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
