package store_test

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/store"
)

func TestOpenCreatesDataDirAndAppliesMigrations(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	tmp := t.TempDir()
	dbPath := filepath.Join(tmp, "nested", "deeper", "state.db")

	s, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.Health(ctx); err != nil {
		t.Fatalf("Health: %v", err)
	}

	// Confirm the sessions table is queryable (proves the migration ran).
	if _, err := s.Sessions().List(ctx); err != nil {
		t.Fatalf("Sessions().List on fresh db: %v", err)
	}
}

func TestOpenIsIdempotent(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	dbPath := filepath.Join(t.TempDir(), "state.db")

	for i := 0; i < 3; i++ {
		s, err := store.Open(ctx, dbPath)
		if err != nil {
			t.Fatalf("Open #%d: %v", i+1, err)
		}
		if err := s.Health(ctx); err != nil {
			t.Fatalf("Health #%d: %v", i+1, err)
		}
		if err := s.Close(); err != nil {
			t.Fatalf("Close #%d: %v", i+1, err)
		}
	}
}

func TestOpenRejectsEmptyPath(t *testing.T) {
	t.Parallel()
	_, err := store.Open(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty path, got nil")
	}
	if !strings.Contains(err.Error(), "path") {
		t.Fatalf("expected path-related error, got %v", err)
	}
}

func TestSessionInsertGetListDelete(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := openTestStore(t)
	repo := s.Sessions()

	want := store.Session{
		ID:            "01HRTESTSESSIONID00000000A",
		ProjectPath:   "/tmp/proj",
		ProjectName:   "proj",
		AgentPlugin:   "codex",
		WorkspacePath: "/tmp/proj/.yyork/worktrees/01HRTESTSESSIONID00000000A",
		ZellijSession: "01HRTESTSESSIONID00000000A",
		PID:           12345,
		Metadata: map[string]any{
			"codexThreadId": "thread-abc",
		},
	}

	if err := repo.Insert(ctx, want); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	got, err := repo.Get(ctx, want.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	assertSessionEqual(t, want, got)

	all, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("List length = %d, want 1", len(all))
	}
	assertSessionEqual(t, want, all[0])

	byProj, err := repo.ListByProject(ctx, want.ProjectPath)
	if err != nil {
		t.Fatalf("ListByProject: %v", err)
	}
	if len(byProj) != 1 {
		t.Fatalf("ListByProject length = %d, want 1", len(byProj))
	}

	if err := repo.Delete(ctx, want.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := repo.Get(ctx, want.ID); err != store.ErrSessionNotFound {
		t.Fatalf("Get after delete: err = %v, want %v", err, store.ErrSessionNotFound)
	}

	// Deleting again is a no-op (matches idempotent-stop contract).
	if err := repo.Delete(ctx, want.ID); err != nil {
		t.Fatalf("second Delete: %v", err)
	}
}

func TestSessionMergeMetadata(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := openTestStore(t)
	repo := s.Sessions()

	id := "01HRTESTMETADATA000000000B"
	if err := repo.Insert(ctx, store.Session{
		ID:            id,
		ProjectPath:   "/tmp/proj",
		AgentPlugin:   "codex",
		WorkspacePath: "/tmp/w",
		ZellijSession: id,
		Metadata:      map[string]any{"a": "one"},
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	if err := repo.MergeMetadata(ctx, id, map[string]any{
		"b": "two",
		"a": "overwritten",
	}); err != nil {
		t.Fatalf("MergeMetadata: %v", err)
	}

	got, err := repo.Get(ctx, id)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	want := map[string]any{"a": "overwritten", "b": "two"}
	if !reflect.DeepEqual(got.Metadata, want) {
		t.Fatalf("metadata = %#v, want %#v", got.Metadata, want)
	}

	// MergeMetadata on a non-existent session reports a distinct error.
	err = repo.MergeMetadata(ctx, "no-such-id", map[string]any{"x": 1})
	if err != store.ErrSessionNotFound {
		t.Fatalf("MergeMetadata missing id: err = %v, want %v", err, store.ErrSessionNotFound)
	}
}

func TestSessionUpdatePID(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	s := openTestStore(t)
	repo := s.Sessions()

	id := "01HRTESTUPDATEPID00000000C"
	if err := repo.Insert(ctx, store.Session{
		ID:            id,
		ProjectPath:   "/tmp/proj",
		AgentPlugin:   "codex",
		WorkspacePath: "/tmp/w",
		ZellijSession: id,
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	if err := repo.UpdatePID(ctx, id, 4242); err != nil {
		t.Fatalf("UpdatePID: %v", err)
	}

	got, err := repo.Get(ctx, id)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.PID != 4242 {
		t.Fatalf("PID = %d, want 4242", got.PID)
	}

	if err := repo.UpdatePID(ctx, "no-such-id", 1); err != store.ErrSessionNotFound {
		t.Fatalf("UpdatePID missing id: err = %v, want %v", err, store.ErrSessionNotFound)
	}
}

func TestProjectSettingsSetGetList(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repo := openTestStore(t).ProjectSettings()

	if _, err := repo.Get(ctx, "/tmp/proj"); err != store.ErrProjectSettingsNotFound {
		t.Fatalf("Get missing settings: err = %v, want %v", err, store.ErrProjectSettingsNotFound)
	}

	if err := repo.SetWorkerWorkspaceMode(ctx, "/tmp/proj", "local"); err != nil {
		t.Fatalf("SetWorkerWorkspaceMode: %v", err)
	}
	got, err := repo.Get(ctx, "/tmp/proj")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ProjectPath != "/tmp/proj" {
		t.Fatalf("ProjectPath = %q, want /tmp/proj", got.ProjectPath)
	}
	if got.WorkerWorkspaceMode != "local" {
		t.Fatalf("WorkerWorkspaceMode = %q, want local", got.WorkerWorkspaceMode)
	}
	if got.UpdatedAt.IsZero() {
		t.Fatal("UpdatedAt is zero")
	}

	if err := repo.SetWorkerWorkspaceMode(ctx, "/tmp/proj", "new-worktree"); err != nil {
		t.Fatalf("SetWorkerWorkspaceMode update: %v", err)
	}
	updated, err := repo.Get(ctx, "/tmp/proj")
	if err != nil {
		t.Fatalf("Get updated: %v", err)
	}
	if updated.WorkerWorkspaceMode != "new-worktree" {
		t.Fatalf("updated WorkerWorkspaceMode = %q, want new-worktree", updated.WorkerWorkspaceMode)
	}

	all, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("List length = %d, want 1", len(all))
	}
	if all[0].ProjectPath != "/tmp/proj" {
		t.Fatalf("List[0].ProjectPath = %q, want /tmp/proj", all[0].ProjectPath)
	}
}

func TestInsertRejectsMissingRequiredFields(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	repo := openTestStore(t).Sessions()

	cases := []struct {
		name    string
		s       store.Session
		wantSub string
	}{
		{"missing id", store.Session{ProjectPath: "/p", AgentPlugin: "codex", WorkspacePath: "/w", ZellijSession: "z"}, "id"},
		{"missing project_path", store.Session{ID: "i", AgentPlugin: "codex", WorkspacePath: "/w", ZellijSession: "z"}, "project_path"},
		{"missing agent_plugin", store.Session{ID: "i", ProjectPath: "/p", WorkspacePath: "/w", ZellijSession: "z"}, "agent_plugin"},
		{"missing workspace_path", store.Session{ID: "i", ProjectPath: "/p", AgentPlugin: "codex", ZellijSession: "z"}, "workspace_path"},
		{"missing zellij_session", store.Session{ID: "i", ProjectPath: "/p", AgentPlugin: "codex", WorkspacePath: "/w"}, "zellij_session"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := repo.Insert(ctx, tc.s)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), tc.wantSub) {
				t.Fatalf("err = %v, want substring %q", err, tc.wantSub)
			}
		})
	}
}

// openTestStore opens a fresh database in a temp dir and arranges for cleanup.
func openTestStore(t *testing.T) store.Store {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "state.db")
	s, err := store.Open(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

// assertSessionEqual compares the user-supplied fields of two sessions,
// ignoring CreatedAt/UpdatedAt timestamps which are set by the store.
func assertSessionEqual(t *testing.T, want, got store.Session) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("ID = %q, want %q", got.ID, want.ID)
	}
	if got.ProjectPath != want.ProjectPath {
		t.Errorf("ProjectPath = %q, want %q", got.ProjectPath, want.ProjectPath)
	}
	if got.ProjectName != want.ProjectName {
		t.Errorf("ProjectName = %q, want %q", got.ProjectName, want.ProjectName)
	}
	if got.AgentPlugin != want.AgentPlugin {
		t.Errorf("AgentPlugin = %q, want %q", got.AgentPlugin, want.AgentPlugin)
	}
	if got.WorkspacePath != want.WorkspacePath {
		t.Errorf("WorkspacePath = %q, want %q", got.WorkspacePath, want.WorkspacePath)
	}
	if got.ZellijSession != want.ZellijSession {
		t.Errorf("ZellijSession = %q, want %q", got.ZellijSession, want.ZellijSession)
	}
	if got.PID != want.PID {
		t.Errorf("PID = %d, want %d", got.PID, want.PID)
	}
	if !reflect.DeepEqual(got.Metadata, want.Metadata) {
		t.Errorf("Metadata = %#v, want %#v", got.Metadata, want.Metadata)
	}
	if got.CreatedAt.IsZero() {
		t.Error("CreatedAt is zero")
	}
	if got.UpdatedAt.IsZero() {
		t.Error("UpdatedAt is zero")
	}
}
