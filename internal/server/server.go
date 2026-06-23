package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"github.com/yyopc/yyork/internal/durabilityprovider"
	"github.com/yyopc/yyork/internal/events"
	"github.com/yyopc/yyork/internal/plugin"
	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
	"github.com/yyopc/yyork/internal/terminal"
)

// SessionStopper terminates a running session. The session.Engine satisfies
// this interface; the server depends on the narrow surface to keep the
// dependency one-directional.
type SessionStopper interface {
	Stop(ctx context.Context, id string) error
}

// ProjectRemover removes a project from yyork's durable workspace state. The
// session.Engine satisfies this by stopping every session for the project path.
type ProjectRemover interface {
	RemoveProject(ctx context.Context, projectPath string) error
}

// OrchestratorEnsurer makes sure a project has a running orchestrator session,
// spawning one when the project has none. The session.Engine satisfies this
// interface; the server depends on the narrow surface so adding a project from
// the app reuses the exact spawn path the CLI uses.
type OrchestratorEnsurer interface {
	EnsureOrchestrator(ctx context.Context, req session.SpawnRequest) (store.Session, bool, error)
}

type Config struct {
	IDEOpener       IDEOpener
	Registry        *plugin.Registry
	TerminalManager *terminal.Manager

	// WebDir is a filesystem path to serve the app from (dev mode).
	// Takes priority over WebFS when both are set.
	WebDir string

	// WebFS is an embedded app filesystem (single-binary mode).
	// Used when WebDir is empty.
	WebFS fs.FS

	// DashboardDevOrigin is the live app origin — the Vite dev
	// server — that self-target browser previews proxy to instead of the
	// in-process WebDir/WebFS assets. `yyork dev` sets it so the in-app
	// browser previews the running source (with HMR), not the build-time
	// snapshot embedded in this binary. Leave empty in production, where
	// the embedded assets are the live app.
	DashboardDevOrigin string

	Workspace           session.Workspace
	WorkspaceSource     WorkspaceSource
	DurabilityProviders *durabilityprovider.Registry

	// Sessions is the SQLite-backed session repository the new
	// /api/sessions endpoint reads from. Optional — if nil, the endpoint
	// returns an empty list.
	Sessions store.SessionRepo

	// ProjectSettings stores project-scoped app and CLI defaults.
	// Optional — if nil, settings updates return 501.
	ProjectSettings store.ProjectSettingsRepo

	// Stopper terminates a session by id. When set, the app can stop
	// sessions via DELETE /api/sessions/{sessionID}. Optional — if nil, the
	// endpoint returns 501.
	Stopper SessionStopper

	// ProjectRemover removes a project from backend workspace state. When set,
	// the app can remove projects via DELETE /api/projects/{projectID}.
	// Optional — if nil, the endpoint returns 501.
	ProjectRemover ProjectRemover

	// Orchestrators ensures a project has an orchestrator session. When set,
	// the app can add projects via POST /api/projects. Optional — if
	// nil, the endpoint returns 501.
	Orchestrators OrchestratorEnsurer

	// DirectoryChooser opens the native folder picker behind POST
	// /api/projects/choose-directory. Optional — defaults to the host OS's
	// native picker (macOS `osascript`).
	DirectoryChooser DirectoryChooser

	// EventBus is the in-process pub/sub bus the engine publishes
	// lifecycle events on. The /api/events SSE endpoint subscribes to it.
	// Optional — if nil, /api/events returns a clean disconnect after the
	// initial keepalive.
	EventBus *events.Bus

	// ControlToken is the shared secret required on POST /api/events, the
	// ingress that lets out-of-process CLI commands relay lifecycle events
	// onto EventBus. Optional — if empty, the ingress rejects every request
	// (no cross-process forwarding).
	ControlToken string
}

type Server struct {
	ideOpener           IDEOpener
	registry            *plugin.Registry
	terminalManager     *terminal.Manager
	webDir              string
	webFS               fs.FS
	dashboardDevOrigin  *url.URL
	workspace           session.Workspace
	workspaceSource     WorkspaceSource
	durabilityProviders *durabilityprovider.Registry
	sessions            store.SessionRepo
	projectSettings     store.ProjectSettingsRepo
	stopper             SessionStopper
	projectRemover      ProjectRemover
	orchestrators       OrchestratorEnsurer
	directoryChooser    DirectoryChooser
	eventBus            *events.Bus
	controlToken        string
	previewTargets      map[string]*url.URL
	previewTargetsMu    sync.RWMutex
}

type WorkspaceSource interface {
	Workspace(context.Context) (session.Workspace, error)
}

type IDEOpener interface {
	Open(context.Context, string) error
}

// DirectoryChooser opens the host OS's native folder picker and returns the
// absolute path the user selected. ok is false when the user cancels. Browsers
// hide absolute filesystem paths from their file APIs, so the app can't
// produce one itself — but yyork runs locally, so the picker runs server-side
// and the dialog appears on the user's own machine.
type DirectoryChooser interface {
	Choose(ctx context.Context) (path string, ok bool, err error)
}

func New(cfg Config) *Server {
	registry := cfg.Registry
	if registry == nil {
		registry = plugin.NewRegistry()
	}

	workspace := cfg.Workspace
	terminalManager := cfg.TerminalManager
	if terminalManager == nil {
		terminalManager = terminal.NewManager(terminal.ManagerConfig{})
	}
	ideOpener := cfg.IDEOpener
	if ideOpener == nil {
		ideOpener = localIDEOpener{}
	}
	directoryChooser := cfg.DirectoryChooser
	if directoryChooser == nil {
		directoryChooser = nativeDirectoryChooser{}
	}
	durabilityProviders := cfg.DurabilityProviders
	if durabilityProviders == nil {
		durabilityProviders = durabilityprovider.NewDefaultRegistry()
	}

	var dashboardDevOrigin *url.URL
	if cfg.DashboardDevOrigin != "" {
		parsed, err := url.Parse(cfg.DashboardDevOrigin)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			slog.Warn("ignoring invalid dashboard dev origin", "origin", cfg.DashboardDevOrigin)
		} else {
			dashboardDevOrigin = &url.URL{Scheme: parsed.Scheme, Host: parsed.Host}
		}
	}

	return &Server{
		ideOpener:           ideOpener,
		registry:            registry,
		terminalManager:     terminalManager,
		webDir:              cfg.WebDir,
		webFS:               cfg.WebFS,
		dashboardDevOrigin:  dashboardDevOrigin,
		workspace:           workspace,
		workspaceSource:     cfg.WorkspaceSource,
		durabilityProviders: durabilityProviders,
		sessions:            cfg.Sessions,
		projectSettings:     cfg.ProjectSettings,
		stopper:             cfg.Stopper,
		projectRemover:      cfg.ProjectRemover,
		orchestrators:       cfg.Orchestrators,
		directoryChooser:    directoryChooser,
		eventBus:            cfg.EventBus,
		controlToken:        cfg.ControlToken,
		previewTargets:      map[string]*url.URL{},
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/plugins", s.handlePlugins)
	mux.HandleFunc("GET /api/workspace", s.handleWorkspace)
	mux.HandleFunc("POST /api/projects", s.handleCreateProject)
	mux.HandleFunc("POST /api/projects/choose-directory", s.handleChooseProjectDirectory)
	mux.HandleFunc("PATCH /api/projects/worker-workspace", s.handleUpdateProjectWorkerWorkspace)
	mux.HandleFunc("DELETE /api/projects/{projectID}", s.handleRemoveProject)
	mux.HandleFunc("POST /api/projects/{projectID}/ide", s.handleProjectIDE)
	mux.HandleFunc("POST /api/sessions/{sessionID}/ide", s.handleSessionIDE)
	mux.HandleFunc("GET /api/sessions/{sessionID}/files", s.handleSessionFiles)
	mux.HandleFunc("GET /api/sessions/{sessionID}/files/content", s.handleSessionFileContent)
	mux.HandleFunc("GET /api/sessions/{sessionID}/canvas/diff", s.handleSessionCanvasDiff)
	mux.HandleFunc("GET /api/sessions/{sessionID}/terminal", s.handleSessionTerminal)
	mux.HandleFunc("POST /api/annotations/{sessionID}", s.handleAnnotations)
	mux.HandleFunc("POST /api/browser-preview/targets", s.handleBrowserPreviewTarget)
	mux.HandleFunc("GET /api/sessions", s.handleListSessions)
	mux.HandleFunc("PATCH /api/sessions/{sessionID}", s.handleRenameSession)
	mux.HandleFunc("DELETE /api/sessions/{sessionID}", s.handleStopSession)
	mux.HandleFunc("GET /api/events", s.handleEventsStream)
	mux.HandleFunc("POST /api/events", s.handlePublishEvent)
	mux.HandleFunc("/", s.handleDashboard)
	return mux
}

func (s *Server) Close() error {
	return s.terminalManager.Close()
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}

func (s *Server) handlePlugins(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.registry.Manifests())
}

func (s *Server) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	workspace, err := s.workspaceForRequest(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, workspace)
}

func (s *Server) handleProjectIDE(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	workspace, err := s.workspaceForRequest(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	project, ok := projectForRequest(workspace, projectID)
	if !ok {
		http.Error(w, "project not found", http.StatusNotFound)
		return
	}

	cwd, status, err := workspaceDirectory(project.CWD, "project")
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	if err := s.ideOpener.Open(r.Context(), cwd); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"cwd": cwd,
	})
}

func (s *Server) handleSessionTerminal(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	workspace, err := s.workspaceForRequest(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	workerSession, ok := terminalSessionForRequest(
		workspace,
		r.URL.Query().Get("project"),
		sessionID,
	)
	if !ok {
		http.Error(w, "worker session not found", http.StatusNotFound)
		return
	}

	if !workerSession.TerminalSupported {
		http.Error(w, "worker session does not support terminals", http.StatusNotFound)
		return
	}

	cols := parsePositiveInt(r.URL.Query().Get("cols"), 100)
	rows := parsePositiveInt(r.URL.Query().Get("rows"), 30)
	s.terminalManager.ServeWS(w, r, terminal.SessionConfig{
		Command:     workerSession.AttachCommand,
		CWD:         workerSession.CWD,
		Env:         terminalEnvForSession(workerSession),
		ID:          workerSession.ID,
		InitialCols: cols,
		InitialRows: rows,
		TerminalKey: workerSession.TerminalKey,
		Title:       workerSession.Title,
		WorkerID:    workerSession.WorkerID,
	})
}

func (s *Server) handleSessionIDE(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	workspace, err := s.workspaceForRequest(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ideSession, ok := terminalSessionForRequest(
		workspace,
		r.URL.Query().Get("project"),
		sessionID,
	)
	if !ok {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}

	cwd, status, err := sessionWorkspaceDirectory(ideSession.CWD)
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	if err := s.ideOpener.Open(r.Context(), cwd); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"cwd": cwd,
	})
}

func (s *Server) workspaceForRequest(ctx context.Context) (session.Workspace, error) {
	if s.workspaceSource != nil {
		workspace, err := s.workspaceSource.Workspace(ctx)
		if err != nil {
			return session.Workspace{}, err
		}
		return workspace, nil
	}

	return s.workspace, nil
}

func terminalSessionForRequest(workspace session.Workspace, projectID string, sessionID string) (session.Session, bool) {
	sessions := append([]session.Session{}, workspace.Sessions...)
	sessions = append(sessions, workspace.Orchestrators...)

	if projectID != "" {
		for _, terminalSession := range sessions {
			if session.SessionProjectMatches(terminalSession, projectID) && terminalSession.ID == sessionID {
				return terminalSession, true
			}
		}

		return session.Session{}, false
	}

	var found session.Session
	matches := 0
	for _, terminalSession := range sessions {
		if terminalSession.ID != sessionID {
			continue
		}
		found = terminalSession
		matches++
	}

	return found, matches == 1
}

func projectForRequest(workspace session.Workspace, projectID string) (session.Project, bool) {
	for _, project := range workspace.Projects {
		if session.ProjectMatches(project, projectID) {
			return project, true
		}
	}

	return session.Project{}, false
}

func (s *Server) projectPathForRequest(ctx context.Context, projectID string) (string, bool, error) {
	workspace, err := s.workspaceForRequest(ctx)
	if err != nil {
		return "", false, err
	}

	project, ok := projectForRequest(workspace, projectID)
	if !ok {
		return projectID, false, nil
	}
	if project.Path != "" {
		return project.Path, true, nil
	}
	if project.CWD != "" {
		return project.CWD, true, nil
	}
	return "", true, errors.New("project path is unavailable")
}

func sessionWorkspaceDirectory(cwd string) (string, int, error) {
	return workspaceDirectory(cwd, "session")
}

func workspaceDirectory(cwd string, label string) (string, int, error) {
	cwd = strings.TrimSpace(cwd)
	if cwd == "" {
		return "", http.StatusUnprocessableEntity, fmt.Errorf("%s workspace path is unavailable", label)
	}

	absolutePath, err := filepath.Abs(cwd)
	if err != nil {
		return "", http.StatusUnprocessableEntity, fmt.Errorf("resolve %s workspace path: %w", label, err)
	}

	info, err := os.Stat(absolutePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", http.StatusNotFound, fmt.Errorf("%s workspace path does not exist: %s", label, absolutePath)
		}
		return "", http.StatusInternalServerError, fmt.Errorf("read %s workspace path: %w", label, err)
	}
	if !info.IsDir() {
		return "", http.StatusUnprocessableEntity, fmt.Errorf("%s workspace path is not a directory: %s", label, absolutePath)
	}

	return absolutePath, http.StatusOK, nil
}

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	if isBrowserPreviewHost(externalRequestHost(r)) {
		s.handleBrowserPreview(w, r)
		return
	}

	if isAPIHost(externalRequestHost(r)) {
		if r.URL.Path == "/" {
			writeJSON(w, http.StatusOK, map[string]string{
				"service": "yyork api",
				"status":  "ok",
			})
			return
		}

		writeJSON(w, http.StatusNotFound, map[string]string{
			"error": "not found",
		})
		return
	}

	// Prefer the on-disk app when WebDir is set (dev workflow).
	if s.webDir != "" {
		if _, err := os.Stat(filepath.Join(s.webDir, "index.html")); err == nil {
			s.serveSPA(w, r, os.DirFS(s.webDir))
			return
		}
	}

	// Fall back to the embedded app when present (single-binary).
	if s.webFS != nil {
		if _, err := fs.Stat(s.webFS, "index.html"); err == nil {
			s.serveSPA(w, r, s.webFS)
			return
		}
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = fmt.Fprint(w, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>yyork</title>
  </head>
  <body>
    <main>
      <h1>yyork</h1>
      <p>Build the web app first with <code>pnpm web:build</code>.</p>
    </main>
  </body>
</html>`)
}

func externalRequestHost(r *http.Request) string {
	if forwardedHost := r.Header.Get("X-Forwarded-Host"); forwardedHost != "" {
		host, _, _ := strings.Cut(forwardedHost, ",")
		if host = strings.TrimSpace(host); host != "" {
			return host
		}
	}

	return r.Host
}

func isAPIHost(host string) bool {
	hostname := host
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		hostname = parsedHost
	}
	hostname = strings.ToLower(strings.TrimSuffix(hostname, "."))
	return hostname == "api.yyork.localhost"
}

// serveSPA serves static assets from fsys with SPA-style fallback: any
// request whose path doesn't resolve to a real file returns index.html, so
// client-side routes like /board/<id> work on direct navigation and reload.
//
// We use http.ServeFileFS rather than http.FileServer because the latter
// has automatic directory-redirect behavior that rewrites `/index.html`
// to `./` (a 301), which is exactly the wrong thing for a SPA root.
func (s *Server) serveSPA(w http.ResponseWriter, r *http.Request, fsys fs.FS) {
	name := strings.TrimPrefix(r.URL.Path, "/")
	if name == "" {
		name = "index.html"
	}
	if _, err := fs.Stat(fsys, name); err != nil {
		// Unknown path → let the SPA router handle it client-side.
		name = "index.html"
	}
	http.ServeFileFS(w, r, fsys, name)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func parsePositiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func terminalEnvForSession(workerSession session.Session) []string {
	return []string{
		"YYORK_SESSION_ID=" + workerSession.ID,
		"YYORK_WORKER_ID=" + workerSession.WorkerID,
		"YYORK_AGENT=" + workerSession.Agent,
		"YYORK_PROJECT=" + workerSession.Project,
		"YYORK_ZELLIJ_SESSION=" + workerSession.ZellijSession,
	}
}

type localIDEOpener struct{}

func (o localIDEOpener) Open(_ context.Context, cwd string) error {
	command, args, err := ideCommand(cwd)
	if err != nil {
		return err
	}

	return exec.Command(command, args...).Start()
}

func ideCommand(cwd string) (string, []string, error) {
	if command, err := exec.LookPath("code"); err == nil {
		return command, []string{cwd}, nil
	}

	if runtime.GOOS == "darwin" {
		command, err := exec.LookPath("open")
		if err != nil {
			return "", nil, errors.New("neither VS Code's `code` command nor macOS `open` is available")
		}
		return command, []string{"-a", "Visual Studio Code", cwd}, nil
	}

	return "", nil, errors.New("VS Code command `code` was not found")
}
