package session

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/yyopc/yyork/internal/store"
	"github.com/yyopc/yyork/internal/zellijconfig"
)

// StoreWorkspaceSource adapts the SQLite-backed session store into the
// legacy session.Workspace shape the server's terminal-attach pipeline
// still consumes. Every row in the store becomes one WorkerSession with
// AttachCommand wired to `zellij attach <name>` so the browser terminal
// can connect without any additional plumbing.
type projectMeta struct {
	project Project
	addedAt time.Time
}

// Unique project_path values across the row set become Projects. The
// active project is the first one we see (the rows are ordered by
// created_at DESC, so this is the most recent project).
type StoreWorkspaceSource struct {
	repo            store.SessionRepo
	projectSettings store.ProjectSettingsRepo
}

// NewStoreWorkspaceSource returns a WorkspaceSource backed by repo.
func NewStoreWorkspaceSource(repo store.SessionRepo, projectSettings ...store.ProjectSettingsRepo) *StoreWorkspaceSource {
	var settings store.ProjectSettingsRepo
	if len(projectSettings) > 0 {
		settings = projectSettings[0]
	}
	return &StoreWorkspaceSource{repo: repo, projectSettings: settings}
}

// Workspace implements server.WorkspaceSource by adapting store rows.
func (s *StoreWorkspaceSource) Workspace(ctx context.Context) (Workspace, error) {
	rows, err := s.repo.List(ctx)
	if err != nil {
		return Workspace{}, fmt.Errorf("session: list rows: %w", err)
	}
	projectWorkspaceModes, err := s.projectWorkspaceModes(ctx)
	if err != nil {
		return Workspace{}, err
	}

	// configPath selects yyork's color theme on the attach invocation. Best-
	// effort: an empty path just means the terminal attaches with the user's
	// own zellij config instead of the yyork theme. Resolved once per build.
	configPath, _ := zellijconfig.Ensure()

	orchestrators := make([]Session, 0)
	sessions := make([]Session, 0, len(rows))
	projectIndex := map[string]projectMeta{}
	activeProjectID := ""

	for _, row := range rows {
		projectID := ProjectID(row.ProjectPath)
		project := Project{
			ID:                  projectID,
			Name:                row.ProjectName,
			CWD:                 row.ProjectPath,
			Path:                row.ProjectPath,
			WorkerWorkspaceMode: projectWorkspaceModes[row.ProjectPath],
		}
		if project.WorkerWorkspaceMode == "" {
			project.WorkerWorkspaceMode = DefaultWorkerWorkspaceMode()
		}
		if project.Name == "" {
			project.Name = basename(row.ProjectPath)
		}
		existing, seen := projectIndex[project.ID]
		if !seen || (!row.CreatedAt.IsZero() && (existing.addedAt.IsZero() || row.CreatedAt.Before(existing.addedAt))) {
			projectIndex[project.ID] = projectMeta{
				project: project,
				addedAt: row.CreatedAt,
			}
			if activeProjectID == "" {
				activeProjectID = project.ID
			}
		}

		legacySession := toLegacySession(row, configPath)
		if legacySession.Kind == KindOrchestrator {
			orchestrators = append(orchestrators, legacySession)
			continue
		}
		sessions = append(sessions, legacySession)
	}

	projects := make([]projectMeta, 0, len(projectIndex))
	for _, p := range projectIndex {
		projects = append(projects, p)
	}
	sort.SliceStable(projects, func(i, j int) bool {
		if !projects[i].addedAt.Equal(projects[j].addedAt) {
			return projects[i].addedAt.Before(projects[j].addedAt)
		}
		return projects[i].project.Name < projects[j].project.Name
	})

	orderedProjects := make([]Project, 0, len(projects))
	for _, project := range projects {
		orderedProjects = append(orderedProjects, project.project)
	}

	return Workspace{
		ActiveProjectID: activeProjectID,
		Orchestrators:   orchestrators,
		Projects:        orderedProjects,
		Sessions:        sessions,
	}, nil
}

func (s *StoreWorkspaceSource) projectWorkspaceModes(ctx context.Context) (map[string]WorkerWorkspaceMode, error) {
	modes := map[string]WorkerWorkspaceMode{}
	if s.projectSettings == nil {
		return modes, nil
	}

	settingsRows, err := s.projectSettings.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("session: list project settings: %w", err)
	}
	for _, settings := range settingsRows {
		mode, ok := NormalizeWorkerWorkspaceMode(settings.WorkerWorkspaceMode)
		if !ok {
			continue
		}
		modes[settings.ProjectPath] = mode
	}
	return modes, nil
}

func toLegacySession(row store.Session, configPath string) Session {
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
	kind := rowKind(row.Metadata)

	return Session{
		ID:                row.ID,
		AgentPluginID:     row.AgentPlugin,
		Agent:             row.AgentPlugin,
		AttachCommand:     zellijAttachCommand(configPath, row.ZellijSession),
		CWD:               row.WorkspacePath,
		Description:       recap,
		Kind:              kind,
		Metadata:          metadataJSON,
		Project:           ProjectID(row.ProjectPath),
		ProjectPath:       row.ProjectPath,
		Recap:             recap,
		State:             rowState(row.Metadata),
		TerminalKey:       row.ZellijSession,
		TerminalSupported: true,
		Title:             title,
		WorkerID:          row.ID,
		ZellijSession:     row.ZellijSession,
	}
}

func rowState(metadata map[string]any) State {
	switch State(stringField(metadata, "state")) {
	case StatePrompt:
		return StatePrompt
	case StateTriage:
		return StateTriage
	case StateDone:
		return StateDone
	case StateWorking:
		return StateWorking
	default:
		return StateWorking
	}
}

func rowKind(metadata map[string]any) Kind {
	for _, key := range []string{"kind", "role"} {
		switch stringField(metadata, key) {
		case string(KindOrchestrator):
			return KindOrchestrator
		case string(KindWorker):
			return KindWorker
		}
	}
	return KindWorker
}

// zellijAttachCommand builds the command the browser terminal runs to attach
// to a session. When configPath is non-empty it is passed as `--config` so
// the session renders with yyork's color theme; zellij applies a theme from
// the attaching client's config, so this is the invocation that governs what
// the user actually sees.
func zellijAttachCommand(configPath, sessionName string) []string {
	if configPath == "" {
		return []string{"zellij", "attach", sessionName}
	}
	return []string{"zellij", "--config", configPath, "attach", sessionName}
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
