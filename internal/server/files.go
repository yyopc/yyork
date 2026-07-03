package server

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

const maxFileContentBytes = 1024 * 1024

type fileTreeResponse struct {
	GitStatus     []fileTreeGitStatusEntry `json:"gitStatus"`
	Paths         []string                 `json:"paths"`
	Truncated     bool                     `json:"truncated,omitempty"`
	WorkspacePath string                   `json:"workspacePath"`
}

type fileTreeGitStatusEntry struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

type fileContentResponse struct {
	Binary        bool   `json:"binary,omitempty"`
	Contents      string `json:"contents"`
	Path          string `json:"path"`
	Size          int64  `json:"size"`
	Truncated     bool   `json:"truncated,omitempty"`
	WorkspacePath string `json:"workspacePath"`
}

func (s *Server) handleSessionFiles(w http.ResponseWriter, r *http.Request) {
	cwd, status, err := s.workspaceDirectoryForSessionRequest(r)
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	paths, truncated, err := listWorkspaceFilePaths(cwd)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	gitStatus := gitStatusForWorkspace(r.Context(), cwd)
	writeJSON(w, http.StatusOK, fileTreeResponse{
		GitStatus:     gitStatus,
		Paths:         paths,
		Truncated:     truncated,
		WorkspacePath: cwd,
	})
}

func (s *Server) handleSessionFileContent(w http.ResponseWriter, r *http.Request) {
	cwd, status, err := s.workspaceDirectoryForSessionRequest(r)
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	payload, status, err := readWorkspaceFileContent(cwd, r.URL.Query().Get("path"))
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) workspaceDirectoryForSessionRequest(r *http.Request) (string, int, error) {
	sessionID := r.PathValue("sessionID")
	workspace, err := s.workspaceForRequest(r.Context())
	if err != nil {
		return "", http.StatusInternalServerError, err
	}

	workerSession, ok := terminalSessionForRequest(
		workspace,
		r.URL.Query().Get("project"),
		sessionID,
	)
	if !ok {
		return "", http.StatusNotFound, errors.New("worker session not found")
	}

	cwd, status, err := sessionWorkspaceDirectory(workerSession.CWD)
	if err != nil {
		return "", status, err
	}
	return cwd, http.StatusOK, nil
}

func listWorkspaceFilePaths(cwd string) ([]string, bool, error) {
	return walkedFilePaths(cwd)
}

func readWorkspaceFileContent(cwd string, requestedPath string) (fileContentResponse, int, error) {
	normalizedPath, resolvedPath, status, err := resolveWorkspaceFilePath(cwd, requestedPath)
	if err != nil {
		return fileContentResponse{}, status, err
	}

	file, err := os.Open(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fileContentResponse{}, http.StatusNotFound, err
		}
		return fileContentResponse{}, http.StatusInternalServerError, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return fileContentResponse{}, http.StatusInternalServerError, err
	}
	if !info.Mode().IsRegular() {
		return fileContentResponse{}, http.StatusBadRequest, errors.New("path is not a regular file")
	}

	rawContents, err := io.ReadAll(io.LimitReader(file, maxFileContentBytes+1))
	if err != nil {
		return fileContentResponse{}, http.StatusInternalServerError, err
	}

	truncated := len(rawContents) > maxFileContentBytes
	if truncated {
		rawContents = rawContents[:maxFileContentBytes]
	}

	binary := bytes.IndexByte(rawContents, 0) >= 0 || !utf8.Valid(rawContents)
	contents := ""
	if !binary {
		contents = string(rawContents)
	}

	return fileContentResponse{
		Binary:        binary,
		Contents:      contents,
		Path:          normalizedPath,
		Size:          info.Size(),
		Truncated:     truncated,
		WorkspacePath: cwd,
	}, http.StatusOK, nil
}

func resolveWorkspaceFilePath(cwd string, requestedPath string) (string, string, int, error) {
	normalizedPath := normalizeFileTreePath(requestedPath, false)
	if normalizedPath == "" || strings.HasSuffix(requestedPath, "/") {
		return "", "", http.StatusBadRequest, errors.New("invalid file path")
	}

	resolvedCwd, err := filepath.EvalSymlinks(cwd)
	if err != nil {
		return "", "", http.StatusInternalServerError, err
	}

	candidatePath := filepath.Join(cwd, filepath.FromSlash(normalizedPath))
	resolvedPath, err := filepath.EvalSymlinks(candidatePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", "", http.StatusNotFound, err
		}
		return "", "", http.StatusInternalServerError, err
	}
	if !pathWithin(resolvedCwd, resolvedPath) {
		return "", "", http.StatusForbidden, errors.New("file path escapes workspace")
	}

	return normalizedPath, resolvedPath, http.StatusOK, nil
}

func pathWithin(root string, target string) bool {
	relativePath, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	return relativePath != "." &&
		relativePath != ".." &&
		!strings.HasPrefix(relativePath, ".."+string(filepath.Separator))
}

func walkedFilePaths(cwd string) ([]string, bool, error) {
	var paths []string
	err := filepath.WalkDir(cwd, func(current string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if current == cwd {
			return nil
		}

		relativePath, err := filepath.Rel(cwd, current)
		if err != nil {
			return err
		}

		if entry.IsDir() {
			if shouldSkipFileTreeDirectory(entry.Name()) {
				return filepath.SkipDir
			}

			normalizedPath := normalizeFileTreePath(relativePath, true)
			if normalizedPath != "" {
				paths = append(paths, normalizedPath)
			}
			if shouldCollapseFileTreeDirectory(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}

		if !entry.Type().IsRegular() && entry.Type()&os.ModeSymlink == 0 {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			info, err := os.Stat(current)
			if err == nil && info.IsDir() {
				normalizedPath := normalizeFileTreePath(relativePath, true)
				if normalizedPath != "" {
					paths = append(paths, normalizedPath)
				}
				return nil
			}
		}

		normalizedPath := normalizeFileTreePath(relativePath, false)
		if normalizedPath == "" {
			return nil
		}

		paths = append(paths, normalizedPath)
		return nil
	})
	if err != nil {
		return nil, false, err
	}

	sort.Strings(paths)
	return paths, false, nil
}

func shouldSkipFileTreeDirectory(name string) bool {
	switch name {
	case ".git", ".hg", ".svn":
		return true
	default:
		return false
	}
}

func shouldCollapseFileTreeDirectory(name string) bool {
	switch name {
	case ".next", ".nuxt", ".output", ".turbo", ".vite", "build", "coverage", "dist", "node_modules", "storybook-static", "test-results":
		return true
	default:
		return false
	}
}

func gitStatusForWorkspace(ctx context.Context, cwd string) []fileTreeGitStatusEntry {
	cmd := exec.CommandContext(
		ctx,
		"git",
		"-C",
		cwd,
		"status",
		"--porcelain=v1",
		"-z",
	)
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	return parseGitStatusOutput(output)
}

func parseGitStatusOutput(output []byte) []fileTreeGitStatusEntry {
	records := bytes.Split(output, []byte{0})
	statusEntries := make([]fileTreeGitStatusEntry, 0, len(records))
	for idx := 0; idx < len(records); idx++ {
		record := string(records[idx])
		if len(record) < 4 {
			continue
		}

		code := record[:2]
		normalizedPath := normalizeFileTreePath(record[3:], false)
		status := fileTreeGitStatusFromPorcelain(code)
		if normalizedPath != "" && status != "" {
			statusEntries = append(statusEntries, fileTreeGitStatusEntry{
				Path:   normalizedPath,
				Status: status,
			})
		}

		if strings.ContainsAny(code, "RC") && idx+1 < len(records) {
			idx++
		}
	}

	return statusEntries
}

func fileTreeGitStatusFromPorcelain(code string) string {
	if strings.Contains(code, "?") {
		return "untracked"
	}
	if strings.Contains(code, "R") || strings.Contains(code, "C") {
		return "renamed"
	}
	if strings.Contains(code, "A") {
		return "added"
	}
	if strings.Contains(code, "D") {
		return "deleted"
	}
	if strings.ContainsAny(code, "MTU") {
		return "modified"
	}
	return ""
}

func normalizeFileTreePath(value string, isDirectory bool) string {
	value = filepath.ToSlash(value)
	if value == "" {
		return ""
	}
	cleaned := path.Clean(value)
	if cleaned == "." || strings.HasPrefix(cleaned, "../") || cleaned == ".." || path.IsAbs(cleaned) {
		return ""
	}
	if isDirectory {
		return cleaned + "/"
	}
	return cleaned
}
