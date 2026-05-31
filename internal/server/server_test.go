package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/yyovil/better-ao/internal/session"
)

func TestServerWithoutWorkspaceSourceReturnsEmptyWorkspace(t *testing.T) {
	server := New(Config{})
	request := httptest.NewRequest(http.MethodGet, "/api/workspace", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected workspace request to succeed, got %d", response.Code)
	}

	var workspace session.Workspace
	if err := json.NewDecoder(response.Body).Decode(&workspace); err != nil {
		t.Fatalf("decode workspace response: %v", err)
	}
	if len(workspace.Sessions) != 0 {
		t.Fatalf("expected no implicit demo sessions, got %#v", workspace.Sessions)
	}
}

func TestTerminalSessionForRequestScopesLookupByProject(t *testing.T) {
	workspace := session.Workspace{
		Sessions: []session.Session{
			{
				ID:      "ao-1",
				Project: "project-a",
				CWD:     "/worktrees/project-a/ao-1",
			},
			{
				ID:      "ao-1",
				Project: "project-b",
				CWD:     "/worktrees/project-b/ao-1",
			},
		},
	}

	workerSession, ok := terminalSessionForRequest(workspace, "project-b", "ao-1")
	if !ok {
		t.Fatal("expected project-scoped session lookup to find a worker")
	}
	if workerSession.CWD != "/worktrees/project-b/ao-1" {
		t.Fatalf("expected project-b worker, got %#v", workerSession)
	}
}

func TestTerminalSessionForRequestKeepsLegacySessionLookup(t *testing.T) {
	workspace := session.Workspace{
		Sessions: []session.Session{
			{
				ID:      "ao-1",
				Project: "project-a",
			},
		},
	}

	workerSession, ok := terminalSessionForRequest(workspace, "", "ao-1")
	if !ok {
		t.Fatal("expected legacy session lookup to find a worker")
	}
	if workerSession.Project != "project-a" {
		t.Fatalf("unexpected worker session: %#v", workerSession)
	}
}

func TestTerminalSessionForRequestFindsOrchestratorSessions(t *testing.T) {
	workspace := session.Workspace{
		Orchestrators: []session.Session{
			{
				ID:      "ao-orchestrator",
				Kind:    "orchestrator",
				Project: "project-a",
			},
		},
	}

	orchestratorSession, ok := terminalSessionForRequest(workspace, "project-a", "ao-orchestrator")
	if !ok {
		t.Fatal("expected project-scoped lookup to find the orchestrator session")
	}
	if orchestratorSession.Kind != "orchestrator" {
		t.Fatalf("unexpected terminal session: %#v", orchestratorSession)
	}
}

func TestTerminalSessionForRequestRejectsAmbiguousLegacySessionLookup(t *testing.T) {
	workspace := session.Workspace{
		Sessions: []session.Session{
			{
				ID:      "ao-1",
				Project: "project-a",
			},
			{
				ID:      "ao-1",
				Project: "project-b",
			},
		},
	}

	if workerSession, ok := terminalSessionForRequest(workspace, "", "ao-1"); ok {
		t.Fatalf("expected ambiguous legacy lookup to fail, got %#v", workerSession)
	}
}

func TestHandleProjectIDEOpensProjectWorkspace(t *testing.T) {
	projectWorkspace := t.TempDir()
	opener := &recordingIDEOpener{}
	server := New(Config{
		IDEOpener: opener,
		Workspace: session.Workspace{
			Projects: []session.Project{
				{
					CWD:  projectWorkspace,
					ID:   "project-a",
					Name: "Project A",
				},
			},
		},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/projects/project-a/ide", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected IDE request to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(opener.cwd) != 1 || opener.cwd[0] != projectWorkspace {
		t.Fatalf("expected project workspace to open, got %#v", opener.cwd)
	}
}

func TestHandleProjectIDERejectsProjectsWithoutWorkspacePath(t *testing.T) {
	opener := &recordingIDEOpener{}
	server := New(Config{
		IDEOpener: opener,
		Workspace: session.Workspace{
			Projects: []session.Project{
				{
					ID:   "project-a",
					Name: "Project A",
				},
			},
		},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/projects/project-a/ide", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected missing workspace path to be rejected, got %d", response.Code)
	}
	if len(opener.cwd) != 0 {
		t.Fatalf("expected opener not to be called, got %#v", opener.cwd)
	}
}

func TestHandleSessionIDEOpensProjectScopedWorkspace(t *testing.T) {
	projectAWorkspace := t.TempDir()
	projectBWorkspace := t.TempDir()
	opener := &recordingIDEOpener{}
	server := New(Config{
		IDEOpener: opener,
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{
					CWD:     projectAWorkspace,
					ID:      "ao-1",
					Project: "project-a",
				},
				{
					CWD:     projectBWorkspace,
					ID:      "ao-1",
					Project: "project-b",
				},
			},
		},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/sessions/ao-1/ide?project=project-b", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected IDE request to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if len(opener.cwd) != 1 || opener.cwd[0] != projectBWorkspace {
		t.Fatalf("expected project-b workspace to open, got %#v", opener.cwd)
	}
}

func TestHandleSessionIDERejectsSessionsWithoutWorkspacePath(t *testing.T) {
	opener := &recordingIDEOpener{}
	server := New(Config{
		IDEOpener: opener,
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{
					ID:      "ao-1",
					Project: "project-a",
				},
			},
		},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/sessions/ao-1/ide?project=project-a", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected missing workspace path to be rejected, got %d", response.Code)
	}
	if len(opener.cwd) != 0 {
		t.Fatalf("expected opener not to be called, got %#v", opener.cwd)
	}
}

func TestHandleSessionIDERejectsMissingWorkspaceDirectory(t *testing.T) {
	opener := &recordingIDEOpener{}
	missingWorkspacePath := filepath.Join(t.TempDir(), "missing")
	server := New(Config{
		IDEOpener: opener,
		Workspace: session.Workspace{
			Sessions: []session.Session{
				{
					CWD:     missingWorkspacePath,
					ID:      "ao-1",
					Project: "project-a",
				},
			},
		},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/sessions/ao-1/ide?project=project-a", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected missing workspace directory to be rejected, got %d", response.Code)
	}
	if len(opener.cwd) != 0 {
		t.Fatalf("expected opener not to be called, got %#v", opener.cwd)
	}
}

func TestHandleSessionIDEReturnsOpenerErrors(t *testing.T) {
	workspacePath := t.TempDir()
	opener := &recordingIDEOpener{err: errors.New("code command unavailable")}
	server := New(Config{
		IDEOpener: opener,
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
	request := httptest.NewRequest(http.MethodPost, "/api/sessions/ao-1/ide?project=project-a", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected opener failure to be returned, got %d", response.Code)
	}
	if len(opener.cwd) != 1 || opener.cwd[0] != workspacePath {
		t.Fatalf("expected opener to receive workspace path, got %#v", opener.cwd)
	}
}

type recordingIDEOpener struct {
	cwd []string
	err error
}

func (o *recordingIDEOpener) Open(_ context.Context, cwd string) error {
	o.cwd = append(o.cwd, cwd)
	return o.err
}
