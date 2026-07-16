package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
)

type fakeOrchestratorEnsurer struct {
	gotReq  session.SpawnRequest
	called  bool
	created bool
	err     error
}

func (f *fakeOrchestratorEnsurer) EnsureOrchestrator(
	_ context.Context,
	req session.SpawnRequest,
) (store.Session, bool, error) {
	f.called = true
	f.gotReq = req
	if f.err != nil {
		return store.Session{}, false, f.err
	}
	return store.Session{ProjectPath: req.ProjectPath}, f.created, nil
}

// initGitRepo creates an initialized git repository in a temp dir and returns
// the repository root as git resolves it — on macOS that means symlinks are
// already collapsed, so it matches the path handleCreateProject derives.
func initGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	cmd := exec.Command("git", "init", dir)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %v: %s", err, out)
	}
	out, err := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return strings.TrimSpace(string(out))
}

func postProject(t *testing.T, server *Server, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/projects", strings.NewReader(body))
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

func TestHandleCreateProjectEnsuresOrchestrator(t *testing.T) {
	root := initGitRepo(t)
	ensurer := &fakeOrchestratorEnsurer{created: true}
	server := New(Config{Orchestrators: ensurer})

	response := postProject(t, server, `{"path":`+jsonString(root)+`}`)

	if response.Code != http.StatusOK {
		t.Fatalf("expected add project to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if !ensurer.called {
		t.Fatal("expected orchestrator ensurer to be called")
	}
	if ensurer.gotReq.ProjectPath != root {
		t.Fatalf("expected project path %q, got %q", root, ensurer.gotReq.ProjectPath)
	}

	var body createProjectResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.ID != session.ProjectID(root) {
		t.Fatalf("expected id %q, got %q", session.ProjectID(root), body.ID)
	}
	if body.Path != root {
		t.Fatalf("expected path %q, got %q", root, body.Path)
	}
	if body.Name != filepath.Base(root) {
		t.Fatalf("expected name %q, got %q", filepath.Base(root), body.Name)
	}
	if !body.Created {
		t.Fatal("expected created=true")
	}
}

func TestHandleCreateProjectPassesAgentPlugins(t *testing.T) {
	root := initGitRepo(t)
	ensurer := &fakeOrchestratorEnsurer{created: true}
	settings := &fakeProjectSettingsRepo{}
	server := New(Config{Orchestrators: ensurer, ProjectSettings: settings})

	response := postProject(
		t,
		server,
		`{"path":`+jsonString(root)+`,"agentPlugin":"codex","workerAgentPlugin":"claude-code","workerWorkspaceMode":"new-worktree"}`,
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected add project to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if ensurer.gotReq.AgentPlugin != "codex" {
		t.Fatalf("expected orchestrator agent codex, got %q", ensurer.gotReq.AgentPlugin)
	}
	if settings.gotProjectPath != root {
		t.Fatalf("expected worker agent stored for %q, got %q", root, settings.gotProjectPath)
	}
	if settings.gotWorkerAgentPlugin != "claude-code" {
		t.Fatalf("expected worker agent claude-code, got %q", settings.gotWorkerAgentPlugin)
	}
	if settings.gotMode != "new-worktree" {
		t.Fatalf("expected worker workspace new-worktree, got %q", settings.gotMode)
	}
}

func TestHandleCreateProjectRejectsUnknownWorkerWorkspaceMode(t *testing.T) {
	root := initGitRepo(t)
	ensurer := &fakeOrchestratorEnsurer{}
	server := New(Config{Orchestrators: ensurer, ProjectSettings: &fakeProjectSettingsRepo{}})

	response := postProject(
		t,
		server,
		`{"path":`+jsonString(root)+`,"workerWorkspaceMode":"shared"}`,
	)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
	if ensurer.called {
		t.Fatal("expected invalid workspace mode to be rejected before creating an orchestrator")
	}
}

func TestHandleCreateProjectRejectsUnknownAgentPlugin(t *testing.T) {
	root := initGitRepo(t)
	server := New(Config{Orchestrators: &fakeOrchestratorEnsurer{}})

	response := postProject(t, server, `{"path":`+jsonString(root)+`,"agentPlugin":"unknown"}`)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
}

func TestHandleCreateProjectResolvesSubdirectoryToRepoRoot(t *testing.T) {
	root := initGitRepo(t)
	subdir := filepath.Join(root, "nested")
	if err := exec.Command("mkdir", subdir).Run(); err != nil {
		t.Fatalf("mkdir nested: %v", err)
	}
	ensurer := &fakeOrchestratorEnsurer{}
	server := New(Config{Orchestrators: ensurer})

	response := postProject(t, server, `{"path":`+jsonString(subdir)+`}`)

	if response.Code != http.StatusOK {
		t.Fatalf("expected add to succeed, got %d: %s", response.Code, response.Body.String())
	}
	if ensurer.gotReq.ProjectPath != root {
		t.Fatalf("expected subdir to resolve to repo root %q, got %q", root, ensurer.gotReq.ProjectPath)
	}
}

func TestHandleCreateProjectRejectsNonRepo(t *testing.T) {
	dir := t.TempDir()
	ensurer := &fakeOrchestratorEnsurer{}
	server := New(Config{Orchestrators: ensurer})

	response := postProject(t, server, `{"path":`+jsonString(dir)+`}`)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected non-repo path to be rejected, got %d", response.Code)
	}
	if ensurer.called {
		t.Fatal("expected ensurer not to be called for a non-repo path")
	}
}

func TestHandleCreateProjectRejectsEmptyPath(t *testing.T) {
	ensurer := &fakeOrchestratorEnsurer{}
	server := New(Config{Orchestrators: ensurer})

	response := postProject(t, server, `{"path":"  "}`)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected empty path to be rejected, got %d", response.Code)
	}
	if ensurer.called {
		t.Fatal("expected ensurer not to be called for an empty path")
	}
}

func TestHandleCreateProjectDisabledWithoutEnsurer(t *testing.T) {
	server := New(Config{})

	response := postProject(t, server, `{"path":"/tmp/whatever"}`)

	if response.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501 when project creation is disabled, got %d", response.Code)
	}
}

type fakeDirectoryChooser struct {
	path   string
	ok     bool
	err    error
	called bool
}

func (f *fakeDirectoryChooser) Choose(context.Context) (string, bool, error) {
	f.called = true
	return f.path, f.ok, f.err
}

type fakeProjectSettingsRepo struct {
	gotProjectPath       string
	gotMode              string
	gotWorkerAgentPlugin string
	err                  error
}

func (f *fakeProjectSettingsRepo) Get(context.Context, string) (store.ProjectSettings, error) {
	return store.ProjectSettings{}, store.ErrProjectSettingsNotFound
}

func (f *fakeProjectSettingsRepo) List(context.Context) ([]store.ProjectSettings, error) {
	return nil, nil
}

func (f *fakeProjectSettingsRepo) SetWorkerWorkspaceMode(_ context.Context, projectPath string, mode string) error {
	f.gotProjectPath = projectPath
	f.gotMode = mode
	return f.err
}

func (f *fakeProjectSettingsRepo) SetWorkerAgentPlugin(_ context.Context, projectPath string, agentPlugin string) error {
	f.gotProjectPath = projectPath
	f.gotWorkerAgentPlugin = agentPlugin
	return f.err
}

type fakeProjectRemover struct {
	gotProjectPath string
	called         bool
	err            error
}

func (f *fakeProjectRemover) RemoveProject(_ context.Context, projectPath string) error {
	f.called = true
	f.gotProjectPath = projectPath
	return f.err
}

func postChooseDirectory(t *testing.T, server *Server) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/projects/choose-directory", nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

func deleteProject(t *testing.T, server *Server, projectID string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodDelete, "/api/projects/"+projectID, nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

func patchProjectWorkerWorkspace(t *testing.T, server *Server, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPatch, "/api/projects/worker-workspace", strings.NewReader(body))
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

func TestHandleChooseProjectDirectoryReturnsPickedPath(t *testing.T) {
	chooser := &fakeDirectoryChooser{path: "/Users/me/Projects/app", ok: true}
	server := New(Config{DirectoryChooser: chooser})

	response := postChooseDirectory(t, server)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Path != "/Users/me/Projects/app" {
		t.Fatalf("expected picked path, got %q", body.Path)
	}
}

func TestHandleChooseProjectDirectoryReturns204OnCancel(t *testing.T) {
	chooser := &fakeDirectoryChooser{ok: false}
	server := New(Config{DirectoryChooser: chooser})

	response := postChooseDirectory(t, server)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204 on cancel, got %d", response.Code)
	}
}

func TestHandleChooseProjectDirectorySurfacesError(t *testing.T) {
	chooser := &fakeDirectoryChooser{err: errors.New("picker exploded")}
	server := New(Config{DirectoryChooser: chooser})

	response := postChooseDirectory(t, server)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 on chooser error, got %d", response.Code)
	}
}

func TestHandleRemoveProjectRemovesBackendProjectState(t *testing.T) {
	projectPath := "/repo/app"
	projectID := session.ProjectID(projectPath)
	remover := &fakeProjectRemover{}
	server := New(Config{
		ProjectRemover: remover,
		Workspace: session.Workspace{
			Projects: []session.Project{
				{ID: projectID, Path: projectPath, Name: "app"},
			},
		},
	})

	response := deleteProject(t, server, projectID)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", response.Code, response.Body.String())
	}
	if !remover.called {
		t.Fatal("expected project remover to be called")
	}
	if remover.gotProjectPath != projectPath {
		t.Fatalf("project path = %q, want %q", remover.gotProjectPath, projectPath)
	}
}

func TestHandleRemoveProjectRejectsUnknownProject(t *testing.T) {
	remover := &fakeProjectRemover{}
	server := New(Config{ProjectRemover: remover})

	response := deleteProject(t, server, "missing-project")

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
	if remover.called {
		t.Fatal("expected remover not to be called for an unknown project")
	}
}

func TestHandleRemoveProjectAcceptsLegacyProjectPath(t *testing.T) {
	projectPath := "/repo/app"
	projectID := session.ProjectID(projectPath)
	remover := &fakeProjectRemover{}
	server := New(Config{
		ProjectRemover: remover,
		Workspace: session.Workspace{
			Projects: []session.Project{
				{ID: projectID, Path: projectPath, Name: "app"},
			},
		},
	})

	response := deleteProject(t, server, url.PathEscape(projectPath))

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", response.Code, response.Body.String())
	}
	if remover.gotProjectPath != projectPath {
		t.Fatalf("project path = %q, want %q", remover.gotProjectPath, projectPath)
	}
}

func TestHandleRemoveProjectDisabledWithoutRemover(t *testing.T) {
	server := New(Config{})

	response := deleteProject(t, server, "project-a")

	if response.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d: %s", response.Code, response.Body.String())
	}
}

func TestHandleUpdateProjectWorkerWorkspacePersistsMode(t *testing.T) {
	settings := &fakeProjectSettingsRepo{}
	projectPath := "/repo/app"
	projectID := session.ProjectID(projectPath)
	server := New(Config{
		ProjectSettings: settings,
		Workspace: session.Workspace{
			Projects: []session.Project{
				{ID: projectID, Path: projectPath, Name: "app"},
			},
		},
	})

	response := patchProjectWorkerWorkspace(t, server, `{"projectId":"`+projectID+`","workerWorkspaceMode":"local"}`)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if settings.gotProjectPath != "/repo/app" {
		t.Fatalf("project path = %q, want /repo/app", settings.gotProjectPath)
	}
	if settings.gotMode != "local" {
		t.Fatalf("mode = %q, want local", settings.gotMode)
	}

	var body updateProjectWorkerWorkspaceResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.ProjectID != projectID || body.WorkerWorkspaceMode != "local" {
		t.Fatalf("unexpected response: %#v", body)
	}
}

func TestHandleUpdateProjectWorkerWorkspaceKeepsLegacyPathInput(t *testing.T) {
	settings := &fakeProjectSettingsRepo{}
	server := New(Config{ProjectSettings: settings})

	response := patchProjectWorkerWorkspace(t, server, `{"projectId":"/repo/app","workerWorkspaceMode":"local"}`)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if settings.gotProjectPath != "/repo/app" {
		t.Fatalf("project path = %q, want /repo/app", settings.gotProjectPath)
	}
}

func TestHandleUpdateProjectWorkerWorkspaceRejectsBadMode(t *testing.T) {
	settings := &fakeProjectSettingsRepo{}
	server := New(Config{ProjectSettings: settings})

	response := patchProjectWorkerWorkspace(t, server, `{"projectId":"/repo/app","workerWorkspaceMode":"shared"}`)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
	if settings.gotProjectPath != "" {
		t.Fatalf("settings repo should not be called, got project %q", settings.gotProjectPath)
	}
}

func TestHandleUpdateProjectWorkerWorkspaceDisabledWithoutRepo(t *testing.T) {
	server := New(Config{})

	response := patchProjectWorkerWorkspace(t, server, `{"projectId":"/repo/app","workerWorkspaceMode":"local"}`)

	if response.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d", response.Code)
	}
}

func TestIsOsascriptUserCancelDetectsMinus128(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("osascript is only available on macOS")
	}
	// `error number -128` is the canonical AppleScript "user canceled" signal;
	// it errors immediately without popping any UI. Output() (not Run())
	// populates ExitError.Stderr, matching how the production chooser invokes
	// osascript.
	_, err := exec.Command("osascript", "-e", "error number -128").Output()
	if err == nil {
		t.Fatal("expected osascript to exit non-zero")
	}
	if !isOsascriptUserCancel(err) {
		t.Fatalf("expected -128 to be detected as user cancel, got %v", err)
	}
}

func jsonString(s string) string {
	encoded, _ := json.Marshal(s)
	return string(encoded)
}
