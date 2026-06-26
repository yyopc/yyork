package session

import (
	"context"
	"testing"
	"time"

	"github.com/yyopc/yyork/internal/store"
)

type fakeStoreWorkspaceRepo struct {
	rows []store.Session
}

func (f fakeStoreWorkspaceRepo) Insert(context.Context, store.Session) error { return nil }
func (f fakeStoreWorkspaceRepo) Get(context.Context, string) (store.Session, error) {
	return store.Session{}, store.ErrSessionNotFound
}
func (f fakeStoreWorkspaceRepo) List(context.Context) ([]store.Session, error) {
	return f.rows, nil
}
func (f fakeStoreWorkspaceRepo) ListByProject(context.Context, string) ([]store.Session, error) {
	return nil, nil
}
func (f fakeStoreWorkspaceRepo) Delete(context.Context, string) error { return nil }
func (f fakeStoreWorkspaceRepo) UpdatePID(context.Context, string, int64) error {
	return nil
}
func (f fakeStoreWorkspaceRepo) MergeMetadata(context.Context, string, map[string]any) error {
	return nil
}

type fakeProjectSettingsRepo struct {
	rows []store.ProjectSettings
}

func (f fakeProjectSettingsRepo) Get(context.Context, string) (store.ProjectSettings, error) {
	return store.ProjectSettings{}, store.ErrProjectSettingsNotFound
}

func (f fakeProjectSettingsRepo) List(context.Context) ([]store.ProjectSettings, error) {
	return f.rows, nil
}

func (f fakeProjectSettingsRepo) SetWorkerWorkspaceMode(context.Context, string, string) error {
	return nil
}

func (f fakeProjectSettingsRepo) SetWorkerAgentPlugin(context.Context, string, string) error {
	return nil
}

func TestToLegacySessionTitlePrecedence(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		metadata map[string]any
		want     string
	}{
		{
			name:     "displayName wins over title and prompt",
			metadata: map[string]any{"displayName": "Renamed", "title": "Hook Title", "prompt": "do a thing"},
			want:     "Renamed",
		},
		{
			name:     "title wins when no displayName",
			metadata: map[string]any{"title": "Hook Title", "prompt": "do a thing"},
			want:     "Hook Title",
		},
		{
			name:     "worker waits for hook title instead of showing prompt",
			metadata: map[string]any{"prompt": "do a thing"},
			want:     "New worker agent",
		},
		{
			name:     "worker falls back to pending label when nothing set",
			metadata: nil,
			want:     "New worker agent",
		},
		{
			name:     "empty strings are ignored in precedence",
			metadata: map[string]any{"displayName": "", "title": "", "prompt": "the prompt"},
			want:     "New worker agent",
		},
		{
			name:     "orchestrator falls back to orchestrator label",
			metadata: map[string]any{"kind": "orchestrator", "prompt": "Coordinate the project"},
			want:     "Orchestrator",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			row := store.Session{ID: "v042rv", Metadata: tc.metadata}
			got := toLegacySession(row, "")
			if got.Title != tc.want {
				t.Fatalf("Title = %q, want %q", got.Title, tc.want)
			}
		})
	}
}

func TestToLegacySessionAttachCommandIncludesConfig(t *testing.T) {
	t.Parallel()

	row := store.Session{ID: "v042rv", ZellijSession: "yyork-v042rv"}

	withConfig := toLegacySession(row, "/home/me/.yyork/zellij/config.kdl")
	wantWith := []string{"zellij", "--config", "/home/me/.yyork/zellij/config.kdl", "attach", "yyork-v042rv"}
	if !equalStrings(withConfig.AttachCommand, wantWith) {
		t.Fatalf("AttachCommand = %#v, want %#v", withConfig.AttachCommand, wantWith)
	}

	// Empty config path degrades to the plain attach command.
	withoutConfig := toLegacySession(row, "")
	wantWithout := []string{"zellij", "attach", "yyork-v042rv"}
	if !equalStrings(withoutConfig.AttachCommand, wantWithout) {
		t.Fatalf("AttachCommand = %#v, want %#v", withoutConfig.AttachCommand, wantWithout)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestToLegacySessionRecapUsesHookRecap(t *testing.T) {
	t.Parallel()

	row := store.Session{
		ID:       "v042rv",
		Metadata: map[string]any{"prompt": "do a thing", "recap": "Finished the investigation.", "displayName": "Renamed"},
	}
	got := toLegacySession(row, "")

	if got.Recap != "Finished the investigation." {
		t.Fatalf("Recap = %q, want %q", got.Recap, "Finished the investigation.")
	}
	if got.Description != got.Recap {
		t.Fatalf("Description = %q, want compatibility alias for Recap %q", got.Description, got.Recap)
	}
	// The rename must not bleed into the recap.
	if got.Title != "Renamed" {
		t.Fatalf("Title = %q, want %q", got.Title, "Renamed")
	}
}

func TestToLegacySessionRecapDoesNotFallbackToPrompt(t *testing.T) {
	t.Parallel()

	row := store.Session{
		ID:       "v042rv",
		Metadata: map[string]any{"prompt": "do a thing"},
	}
	got := toLegacySession(row, "")

	if got.Recap != "" {
		t.Fatalf("Recap = %q, want empty until hook recap exists", got.Recap)
	}
}

func TestToLegacySessionRecapDoesNotUsePromptWhenSessionRenamed(t *testing.T) {
	t.Parallel()

	row := store.Session{
		ID:       "v042rv",
		Metadata: map[string]any{"displayName": "Project overview", "prompt": "tell me about this project"},
	}
	got := toLegacySession(row, "")

	if got.Title != "Project overview" {
		t.Fatalf("Title = %q, want rename", got.Title)
	}
	if got.Recap != "" {
		t.Fatalf("Recap = %q, want empty until last assistant message exists", got.Recap)
	}
}

func TestToLegacySessionReadsMetadataState(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		metadata map[string]any
		want     State
	}{
		{name: "prompt", metadata: map[string]any{"state": "prompt"}, want: StatePrompt},
		{name: "triage", metadata: map[string]any{"state": "triage"}, want: StateTriage},
		{name: "done", metadata: map[string]any{"state": "done"}, want: StateDone},
		{name: "working", metadata: map[string]any{"state": "working"}, want: StateWorking},
		{name: "unknown falls back", metadata: map[string]any{"state": "blocked"}, want: StateWorking},
		{name: "missing falls back", metadata: nil, want: StateWorking},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := toLegacySession(store.Session{ID: "v042rv", Metadata: tc.metadata}, "")
			if got.State != tc.want {
				t.Fatalf("State = %q, want %q", got.State, tc.want)
			}
		})
	}
}

func TestWorkspaceSplitsOrchestratorRowsFromWorkerRows(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	source := NewStoreWorkspaceSource(fakeStoreWorkspaceRepo{
		rows: []store.Session{
			{
				ID:            "orch1",
				AgentPlugin:   "claude-code",
				ProjectName:   "Project A",
				ProjectPath:   "/repo/project-a",
				WorkspacePath: "/worktrees/orch1",
				ZellijSession: "orch1",
				Metadata:      map[string]any{"kind": "orchestrator", "title": "Orchestrator"},
			},
			{
				ID:            "wrk1",
				AgentPlugin:   "codex",
				ProjectName:   "Project A",
				ProjectPath:   "/repo/project-a",
				WorkspacePath: "/worktrees/wrk1",
				ZellijSession: "wrk1",
				Metadata:      map[string]any{"prompt": "do the task"},
			},
		},
	})

	workspace, err := source.Workspace(context.Background())
	if err != nil {
		t.Fatalf("Workspace: %v", err)
	}

	if len(workspace.Orchestrators) != 1 {
		t.Fatalf("orchestrators = %#v, want 1", workspace.Orchestrators)
	}
	if got := workspace.Orchestrators[0]; got.ID != "orch1" || got.Kind != KindOrchestrator {
		t.Fatalf("unexpected orchestrator row: %#v", got)
	}
	if len(workspace.Sessions) != 1 {
		t.Fatalf("sessions = %#v, want 1", workspace.Sessions)
	}
	if got := workspace.Sessions[0]; got.ID != "wrk1" || got.Kind != KindWorker {
		t.Fatalf("unexpected worker row: %#v", got)
	}
}

func TestWorkspaceProjectsCarryWorkerWorkspaceMode(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	source := NewStoreWorkspaceSource(
		fakeStoreWorkspaceRepo{
			rows: []store.Session{
				{
					ID:            "orch1",
					AgentPlugin:   "claude-code",
					ProjectName:   "Project A",
					ProjectPath:   "/repo/project-a",
					WorkspacePath: "/repo/project-a",
					ZellijSession: "orch1",
					Metadata:      map[string]any{"kind": "orchestrator"},
				},
				{
					ID:            "wrk1",
					AgentPlugin:   "codex",
					ProjectName:   "Project B",
					ProjectPath:   "/repo/project-b",
					WorkspacePath: "/worktrees/wrk1",
					ZellijSession: "wrk1",
				},
			},
		},
		fakeProjectSettingsRepo{
			rows: []store.ProjectSettings{
				{ProjectPath: "/repo/project-a", WorkerWorkspaceMode: string(WorkerWorkspaceModeLocal)},
			},
		},
	)

	workspace, err := source.Workspace(context.Background())
	if err != nil {
		t.Fatalf("Workspace: %v", err)
	}
	if len(workspace.Projects) != 2 {
		t.Fatalf("projects = %#v, want 2", workspace.Projects)
	}
	if got := workspace.Projects[0].WorkerWorkspaceMode; got != WorkerWorkspaceModeLocal {
		t.Fatalf("project-a WorkerWorkspaceMode = %q, want local", got)
	}
	if got := workspace.Projects[1].WorkerWorkspaceMode; got != WorkerWorkspaceModeLocal {
		t.Fatalf("project-b WorkerWorkspaceMode = %q, want local", got)
	}
}

func TestWorkspaceOrdersProjectsByAddedAt(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	source := NewStoreWorkspaceSource(fakeStoreWorkspaceRepo{
		rows: []store.Session{
			{
				ID:            "s2",
				AgentPlugin:   "codex",
				ProjectName:   "yyork",
				ProjectPath:   "/Users/me/yyork",
				WorkspacePath: "/worktrees/s2",
				ZellijSession: "yyork2",
				CreatedAt:     time.Unix(30, 0),
				Metadata:      map[string]any{"prompt": "newer"},
			},
			{
				ID:            "s1",
				AgentPlugin:   "codex",
				ProjectName:   "skills",
				ProjectPath:   "/Users/me/skills",
				WorkspacePath: "/worktrees/s1",
				ZellijSession: "skills1",
				CreatedAt:     time.Unix(10, 0),
				Metadata:      map[string]any{"prompt": "oldest"},
			},
			{
				ID:            "s3",
				AgentPlugin:   "codex",
				ProjectName:   "skills",
				ProjectPath:   "/Users/me/skills",
				WorkspacePath: "/worktrees/s3",
				ZellijSession: "skills2",
				CreatedAt:     time.Unix(20, 0),
				Metadata:      map[string]any{"prompt": "more recent for skills"},
			},
		},
	})

	workspace, err := source.Workspace(context.Background())
	if err != nil {
		t.Fatalf("Workspace: %v", err)
	}

	if len(workspace.Projects) != 2 {
		t.Fatalf("projects = %#v, want 2", workspace.Projects)
	}
	if got := workspace.Projects[0].Name; got != "skills" {
		t.Fatalf("projects[0].Name = %q, want %q", got, "skills")
	}
	if got := workspace.Projects[1].Name; got != "yyork" {
		t.Fatalf("projects[1].Name = %q, want %q", got, "yyork")
	}
	if got, want := workspace.Projects[0].ID, ProjectID("/Users/me/skills"); got != want {
		t.Fatalf("projects[0].ID = %q, want %q", got, want)
	}
	if got := workspace.Projects[0].Path; got != "/Users/me/skills" {
		t.Fatalf("projects[0].Path = %q, want /Users/me/skills", got)
	}
	if got := workspace.Sessions[1].Project; got != ProjectID("/Users/me/skills") {
		t.Fatalf("session Project = %q, want opaque project id", got)
	}
	if got := workspace.Sessions[1].ProjectPath; got != "/Users/me/skills" {
		t.Fatalf("session ProjectPath = %q, want /Users/me/skills", got)
	}
}
