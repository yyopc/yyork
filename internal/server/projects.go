package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/yyopc/yyork/internal/session"
)

type createProjectRequest struct {
	Path string `json:"path"`
}

type createProjectResponse struct {
	// ID is the project's canonical id — the resolved git repository root.
	// It matches the project id the workspace exposes (project paths are the
	// id in StoreWorkspaceSource), so the dashboard can un-hide and navigate
	// to the new project without a second round-trip.
	ID string `json:"id"`
	// Name is the basename of the repository root, the same fallback the
	// workspace uses when a row carries no explicit project name.
	Name string `json:"name"`
	// Created reports whether a new orchestrator was spawned. False means the
	// project already had one and the request was a no-op (idempotent add).
	Created bool `json:"created"`
}

type updateProjectWorkerWorkspaceRequest struct {
	ProjectID           string `json:"projectId"`
	WorkerWorkspaceMode string `json:"workerWorkspaceMode"`
}

type updateProjectWorkerWorkspaceResponse struct {
	ProjectID           string `json:"projectId"`
	WorkerWorkspaceMode string `json:"workerWorkspaceMode"`
}

// handleCreateProject adds a project to the workspace by ensuring it has a
// running orchestrator session. Projects are not first-class rows — a project
// exists because at least one session lives in its directory — so "adding" a
// project means spawning its orchestrator. The spawn emits a session.created
// event, which the dashboard's SSE subscription turns into a workspace refresh.
func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	if s.orchestrators == nil {
		http.Error(w, "project creation is not enabled", http.StatusNotImplemented)
		return
	}

	var payload createProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid project payload", http.StatusBadRequest)
		return
	}

	root, err := resolveGitProjectRoot(r.Context(), payload.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	sess, created, err := s.orchestrators.EnsureOrchestrator(r.Context(), session.SpawnRequest{
		ProjectPath: root,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, createProjectResponse{
		ID:      sess.ProjectPath,
		Name:    filepath.Base(sess.ProjectPath),
		Created: created,
	})
}

func (s *Server) handleUpdateProjectWorkerWorkspace(w http.ResponseWriter, r *http.Request) {
	if s.projectSettings == nil {
		http.Error(w, "project settings are not enabled", http.StatusNotImplemented)
		return
	}

	var payload updateProjectWorkerWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid project settings payload", http.StatusBadRequest)
		return
	}

	projectID := strings.TrimSpace(payload.ProjectID)
	if projectID == "" {
		http.Error(w, "projectId is required", http.StatusBadRequest)
		return
	}
	mode, ok := session.NormalizeWorkerWorkspaceMode(strings.TrimSpace(payload.WorkerWorkspaceMode))
	if !ok {
		http.Error(w, "workerWorkspaceMode must be new-worktree or local", http.StatusBadRequest)
		return
	}

	if err := s.projectSettings.SetWorkerWorkspaceMode(r.Context(), projectID, string(mode)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, updateProjectWorkerWorkspaceResponse{
		ProjectID:           projectID,
		WorkerWorkspaceMode: string(mode),
	})
}

// handleChooseProjectDirectory opens the host OS's native folder picker and
// returns the absolute path the user selected. It's the dashboard's way of
// producing a real filesystem path — a browser tab can't, by design — so the
// "Add project" button can feel native instead of asking the user to type a
// path. Returns 204 when the user cancels the dialog.
func (s *Server) handleChooseProjectDirectory(w http.ResponseWriter, r *http.Request) {
	path, ok, err := s.directoryChooser.Choose(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !ok {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"path": path})
}

// nativeDirectoryChooser opens the host OS's folder picker. macOS only for now
// — yyork's home platform — via AppleScript's `choose folder`. Other platforms
// return an error so the dashboard can fall back to a typed path.
type nativeDirectoryChooser struct{}

func (nativeDirectoryChooser) Choose(ctx context.Context) (string, bool, error) {
	if runtime.GOOS != "darwin" {
		return "", false, errors.New("native folder picker is only available on macOS")
	}

	const script = `POSIX path of (choose folder with prompt "Add a project — choose a git repository")`
	out, err := exec.CommandContext(ctx, "osascript", "-e", script).Output()
	if err != nil {
		if isOsascriptUserCancel(err) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("open folder picker: %w", err)
	}

	path := strings.TrimSpace(string(out))
	if path == "" {
		return "", false, nil
	}
	return path, true, nil
}

// isOsascriptUserCancel reports whether an osascript invocation failed because
// the user dismissed the dialog. AppleScript signals that with error -128
// ("User canceled"), which surfaces on the command's stderr.
func isOsascriptUserCancel(err error) bool {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return strings.Contains(string(exitErr.Stderr), "-128")
	}
	return false
}

// resolveGitProjectRoot turns a user-supplied path into the absolute root of
// the git repository that contains it. A subdirectory resolves to its repo
// root, mirroring the CLI's `yyork <path>` behavior, so the dashboard accepts
// any path inside the project the user means.
func resolveGitProjectRoot(ctx context.Context, path string) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "", errors.New("path is required")
	}

	abs, err := filepath.Abs(trimmed)
	if err != nil {
		return "", fmt.Errorf("resolve project path: %w", err)
	}

	out, err := exec.CommandContext(ctx, "git", "-C", abs, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return "", fmt.Errorf("%q is not inside a git repository", abs)
	}

	root := strings.TrimSpace(string(out))
	if root == "" {
		return "", fmt.Errorf("git reported an empty repository root for %q", abs)
	}
	return root, nil
}
