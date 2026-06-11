package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const maxCanvasDiffPatchBytes = 2 * 1024 * 1024

type canvasDiffResponse struct {
	BaseLabel      string           `json:"baseLabel"`
	CWD            string           `json:"cwd"`
	Files          []canvasDiffFile `json:"files"`
	GeneratedAt    string           `json:"generatedAt"`
	Patch          string           `json:"patch"`
	Target         canvasDiffTarget `json:"target"`
	PatchTruncated bool             `json:"patchTruncated,omitempty"`
}

type canvasDiffTarget struct {
	Kind      string `json:"kind"`
	ProjectID string `json:"projectId,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}

type canvasDiffFile struct {
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Path      string `json:"path"`
	Status    string `json:"status"`
}

type canvasDiffNumstat struct {
	Additions int
	Deletions int
	Path      string
}

type canvasDiffError struct {
	Status  int
	Message string
}

func (e canvasDiffError) Error() string {
	return e.Message
}

func (s *Server) handleSessionCanvasDiff(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionID")
	projectID := r.URL.Query().Get("project")
	workspace, err := s.workspaceForRequest(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	workerSession, ok := terminalSessionForRequest(
		workspace,
		projectID,
		sessionID,
	)
	if !ok {
		http.Error(w, "worker session not found", http.StatusNotFound)
		return
	}

	cwd, status, err := sessionWorkspaceDirectory(workerSession.CWD)
	if err != nil {
		http.Error(w, err.Error(), status)
		return
	}

	diff, err := canvasDiffForWorkspace(r.Context(), cwd, canvasDiffTarget{
		Kind:      "session",
		ProjectID: workerSession.Project,
		SessionID: workerSession.ID,
	})
	if err != nil {
		var diffErr canvasDiffError
		if errors.As(err, &diffErr) {
			http.Error(w, diffErr.Message, diffErr.Status)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, diff)
}

func canvasDiffForWorkspace(ctx context.Context, cwd string, target canvasDiffTarget) (canvasDiffResponse, error) {
	if err := ensureGitWorkspace(ctx, cwd); err != nil {
		return canvasDiffResponse{}, err
	}

	statusEntries := gitStatusForWorkspace(ctx, cwd)
	trackedPatch, err := gitOutput(ctx, cwd, "diff", "--no-ext-diff", "--binary", "HEAD", "--")
	if err != nil {
		return canvasDiffResponse{}, err
	}
	numstatOutput, err := gitOutput(ctx, cwd, "diff", "--numstat", "HEAD", "--")
	if err != nil {
		return canvasDiffResponse{}, err
	}

	untrackedPatches, untrackedStats := untrackedDiffsForWorkspace(cwd, statusEntries)
	patch := joinPatchSections(string(trackedPatch), untrackedPatches)
	patchTruncated := len(patch) > maxCanvasDiffPatchBytes
	if patchTruncated {
		patch = ""
	}

	return canvasDiffResponse{
		BaseLabel:      "HEAD",
		CWD:            cwd,
		Files:          canvasDiffFiles(statusEntries, parseCanvasDiffNumstat(numstatOutput), untrackedStats),
		GeneratedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		Patch:          patch,
		Target:         target,
		PatchTruncated: patchTruncated,
	}, nil
}

func ensureGitWorkspace(ctx context.Context, cwd string) error {
	output, err := gitOutput(ctx, cwd, "rev-parse", "--is-inside-work-tree")
	if err != nil {
		return canvasDiffError{
			Status:  http.StatusUnprocessableEntity,
			Message: "selected session is not inside a git worktree",
		}
	}
	if strings.TrimSpace(string(output)) != "true" {
		return canvasDiffError{
			Status:  http.StatusUnprocessableEntity,
			Message: "selected session is not inside a git worktree",
		}
	}
	return nil
}

func gitOutput(ctx context.Context, cwd string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", cwd}, args...)...)
	output, err := cmd.Output()
	if err == nil {
		return output, nil
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		message := strings.TrimSpace(string(exitErr.Stderr))
		if message == "" {
			message = err.Error()
		}
		return nil, fmt.Errorf("git %s: %s", strings.Join(args, " "), message)
	}
	return nil, fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
}

func parseCanvasDiffNumstat(output []byte) []canvasDiffNumstat {
	lines := bytes.Split(output, []byte{'\n'})
	stats := make([]canvasDiffNumstat, 0, len(lines))
	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		parts := bytes.Split(line, []byte{'\t'})
		if len(parts) < 3 {
			continue
		}

		pathValue := string(parts[len(parts)-1])
		normalizedPath := normalizeFileTreePath(pathValue, false)
		if normalizedPath == "" {
			continue
		}

		stats = append(stats, canvasDiffNumstat{
			Additions: parseNumstatCount(parts[0]),
			Deletions: parseNumstatCount(parts[1]),
			Path:      normalizedPath,
		})
	}
	return stats
}

func parseNumstatCount(value []byte) int {
	count, err := strconv.Atoi(string(value))
	if err != nil {
		return 0
	}
	return count
}

func untrackedDiffsForWorkspace(cwd string, statusEntries []fileTreeGitStatusEntry) ([]string, []canvasDiffNumstat) {
	patches := make([]string, 0)
	stats := make([]canvasDiffNumstat, 0)
	for _, entry := range statusEntries {
		if entry.Status != "untracked" {
			continue
		}

		absolutePath := filepath.Join(cwd, filepath.FromSlash(entry.Path))
		info, err := os.Lstat(absolutePath)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		contents, err := os.ReadFile(absolutePath)
		if err != nil || !isTextPatchContent(contents) {
			continue
		}

		patch, additions := newFilePatch(entry.Path, contents, info.Mode())
		patches = append(patches, patch)
		stats = append(stats, canvasDiffNumstat{
			Additions: additions,
			Path:      entry.Path,
		})
	}
	return patches, stats
}

func isTextPatchContent(contents []byte) bool {
	return !bytes.Contains(contents, []byte{0})
}

func newFilePatch(path string, contents []byte, mode os.FileMode) (string, int) {
	fileMode := "100644"
	if mode&0o111 != 0 {
		fileMode = "100755"
	}

	lines := splitPatchLines(string(contents))
	var builder strings.Builder
	builder.WriteString("diff --git a/")
	builder.WriteString(path)
	builder.WriteString(" b/")
	builder.WriteString(path)
	builder.WriteString("\nnew file mode ")
	builder.WriteString(fileMode)
	builder.WriteString("\nindex 0000000..0000000\n--- /dev/null\n+++ b/")
	builder.WriteString(path)
	builder.WriteByte('\n')

	if len(lines) == 0 {
		return builder.String(), 0
	}

	builder.WriteString(fmt.Sprintf("@@ -0,0 +1,%d @@\n", len(lines)))
	for _, line := range lines {
		builder.WriteByte('+')
		builder.WriteString(strings.TrimSuffix(line.Text, "\n"))
		builder.WriteByte('\n')
		if !line.HasNewline {
			builder.WriteString("\\ No newline at end of file\n")
		}
	}
	return builder.String(), len(lines)
}

type patchLine struct {
	HasNewline bool
	Text       string
}

func splitPatchLines(contents string) []patchLine {
	if contents == "" {
		return nil
	}

	parts := strings.SplitAfter(contents, "\n")
	lines := make([]patchLine, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		lines = append(lines, patchLine{
			HasNewline: strings.HasSuffix(part, "\n"),
			Text:       part,
		})
	}
	return lines
}

func joinPatchSections(trackedPatch string, untrackedPatches []string) string {
	var sections []string
	if strings.TrimSpace(trackedPatch) != "" {
		sections = append(sections, strings.TrimRight(trackedPatch, "\n"))
	}
	for _, patch := range untrackedPatches {
		if strings.TrimSpace(patch) != "" {
			sections = append(sections, strings.TrimRight(patch, "\n"))
		}
	}
	if len(sections) == 0 {
		return ""
	}
	return strings.Join(sections, "\n") + "\n"
}

func canvasDiffFiles(statusEntries []fileTreeGitStatusEntry, trackedStats, untrackedStats []canvasDiffNumstat) []canvasDiffFile {
	statsByPath := make(map[string]canvasDiffNumstat, len(trackedStats)+len(untrackedStats))
	for _, stat := range trackedStats {
		statsByPath[stat.Path] = stat
	}
	for _, stat := range untrackedStats {
		statsByPath[stat.Path] = stat
	}

	filesByPath := make(map[string]canvasDiffFile, len(statusEntries)+len(statsByPath))
	for _, entry := range statusEntries {
		if entry.Path == "" || entry.Status == "" {
			continue
		}
		stat := statsByPath[entry.Path]
		filesByPath[entry.Path] = canvasDiffFile{
			Additions: stat.Additions,
			Deletions: stat.Deletions,
			Path:      entry.Path,
			Status:    entry.Status,
		}
	}
	for _, stat := range statsByPath {
		if _, ok := filesByPath[stat.Path]; ok {
			continue
		}
		filesByPath[stat.Path] = canvasDiffFile{
			Additions: stat.Additions,
			Deletions: stat.Deletions,
			Path:      stat.Path,
			Status:    "modified",
		}
	}

	files := make([]canvasDiffFile, 0, len(filesByPath))
	for _, file := range filesByPath {
		files = append(files, file)
	}
	sort.Slice(files, func(left, right int) bool {
		return files[left].Path < files[right].Path
	})
	return files
}
