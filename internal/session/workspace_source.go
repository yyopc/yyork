package session

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/yyopc/yyork/internal/store"
)

// StoreWorkspaceSource adapts the SQLite-backed session store into the
// legacy session.Workspace shape the server's terminal-attach pipeline
// still consumes. Every row in the store becomes one WorkerSession with
// AttachCommand wired to `zellij attach <name>` so the browser terminal
// can connect without any additional plumbing.
//
// Unique project_path values across the row set become Projects. The
// active project is the first one we see (the rows are ordered by
// created_at DESC, so this is the most recent project).
type StoreWorkspaceSource struct {
	repo store.SessionRepo
}

// NewStoreWorkspaceSource returns a WorkspaceSource backed by repo.
func NewStoreWorkspaceSource(repo store.SessionRepo) *StoreWorkspaceSource {
	return &StoreWorkspaceSource{repo: repo}
}

// Workspace implements server.WorkspaceSource by adapting store rows.
func (s *StoreWorkspaceSource) Workspace(ctx context.Context) (Workspace, error) {
	rows, err := s.repo.List(ctx)
	if err != nil {
		return Workspace{}, fmt.Errorf("session: list rows: %w", err)
	}

	sessions := make([]Session, 0, len(rows))
	projectIndex := map[string]Project{}
	activeProjectID := ""

	for _, row := range rows {
		project := Project{
			ID:   row.ProjectPath,
			Name: row.ProjectName,
			CWD:  row.ProjectPath,
		}
		if project.Name == "" {
			project.Name = basename(row.ProjectPath)
		}
		if _, seen := projectIndex[project.ID]; !seen {
			projectIndex[project.ID] = project
			if activeProjectID == "" {
				activeProjectID = project.ID
			}
		}

		sessions = append(sessions, toLegacySession(row))
	}

	projects := make([]Project, 0, len(projectIndex))
	for _, p := range projectIndex {
		projects = append(projects, p)
	}

	return Workspace{
		ActiveProjectID: activeProjectID,
		Projects:        projects,
		Sessions:        sessions,
	}, nil
}

func toLegacySession(row store.Session) Session {
	prompt := stringField(row.Metadata, "prompt")
	title := stringField(row.Metadata, "title")
	recap := stringField(row.Metadata, "recap")
	if recap == "" {
		// Legacy compatibility for rows created before the recap rename.
		recap = stringField(row.Metadata, "summary")
	}
	// displayName is a user-set rename; it always wins over the auto-derived
	// title/prompt. The bare id is never shown — an unnamed, un-prompted
	// session reads as "new agent: <id>" instead of an opaque slug.
	displayName := stringField(row.Metadata, "displayName")
	metadataJSON := ""
	if len(row.Metadata) > 0 {
		if buf, err := json.Marshal(row.Metadata); err == nil {
			metadataJSON = string(buf)
		}
	}
	resolvedTitle := displayName
	if resolvedTitle == "" {
		resolvedTitle = title
	}
	if resolvedTitle == "" {
		resolvedTitle = prompt
	}
	if resolvedTitle == "" {
		resolvedTitle = "new agent: " + row.ID
	}
	title = resolvedTitle

	return Session{
		ID:                row.ID,
		AgentPluginID:     row.AgentPlugin,
		Agent:             row.AgentPlugin,
		AttachCommand:     []string{"zellij", "attach", row.ZellijSession},
		CWD:               row.WorkspacePath,
		Description:       recap,
		Kind:              KindWorker,
		Metadata:          metadataJSON,
		Project:           row.ProjectPath,
		Recap:             recap,
		State:             StateWorking, // v1: no activity-state capture yet.
		TerminalKey:       row.ZellijSession,
		TerminalSupported: true,
		Title:             title,
		WorkerID:          row.ID,
		ZellijSession:     row.ZellijSession,
	}
}

func stringField(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func basename(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' || path[i] == '\\' {
			return path[i+1:]
		}
	}
	return path
}
