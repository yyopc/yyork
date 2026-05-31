package session_test

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/yyovil/better-ao/internal/events"
	"github.com/yyovil/better-ao/internal/plugin"
	pluginagent "github.com/yyovil/better-ao/internal/plugin/agent"
	"github.com/yyovil/better-ao/internal/session"
	"github.com/yyovil/better-ao/internal/store"
)

// -- Fakes ---------------------------------------------------------------

type fakeWorktree struct {
	mu             sync.Mutex
	isGitRepo      func(string) bool
	baseRef        func(string) (string, error)
	createErr      error
	removeErr      error
	createCalls    []fakeWorktreeCreateCall
	removeCalls    []fakeWorktreeRemoveCall
}

type fakeWorktreeCreateCall struct {
	projectPath, worktreePath, branchName, baseRef string
}

type fakeWorktreeRemoveCall struct {
	projectPath, worktreePath, branchName string
}

func (f *fakeWorktree) IsGitRepo(_ context.Context, projectPath string) bool {
	if f.isGitRepo != nil {
		return f.isGitRepo(projectPath)
	}
	return true
}

func (f *fakeWorktree) BaseRef(_ context.Context, projectPath string) (string, error) {
	if f.baseRef != nil {
		return f.baseRef(projectPath)
	}
	return "refs/heads/main", nil
}

func (f *fakeWorktree) Create(_ context.Context, projectPath, worktreePath, branchName, baseRef string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.createCalls = append(f.createCalls, fakeWorktreeCreateCall{projectPath, worktreePath, branchName, baseRef})
	return f.createErr
}

func (f *fakeWorktree) Remove(_ context.Context, projectPath, worktreePath, branchName string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removeCalls = append(f.removeCalls, fakeWorktreeRemoveCall{projectPath, worktreePath, branchName})
	return f.removeErr
}

type fakeProvider struct {
	mu              sync.Mutex
	createErr       error
	killErr         error
	existsErr       error
	listErr         error
	liveSessions    map[string]bool // name -> exists
	createCalls     []session.CreateOpts
	killCalls       []string
	existsCalls     []string
	listCalls       int
}

func (f *fakeProvider) CreateSession(_ context.Context, opts session.CreateOpts) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.createCalls = append(f.createCalls, opts)
	if f.createErr != nil {
		return f.createErr
	}
	if f.liveSessions == nil {
		f.liveSessions = map[string]bool{}
	}
	f.liveSessions[opts.Name] = true
	return nil
}

func (f *fakeProvider) KillSession(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.killCalls = append(f.killCalls, name)
	if f.killErr != nil {
		return f.killErr
	}
	delete(f.liveSessions, name)
	return nil
}

func (f *fakeProvider) SessionExists(_ context.Context, name string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.existsCalls = append(f.existsCalls, name)
	if f.existsErr != nil {
		return false, f.existsErr
	}
	return f.liveSessions[name], nil
}

func (f *fakeProvider) ListSessionNames(_ context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.listCalls++
	if f.listErr != nil {
		return nil, f.listErr
	}
	out := make([]string, 0, len(f.liveSessions))
	for name := range f.liveSessions {
		out = append(out, name)
	}
	return out, nil
}

// fakeAgent is a minimal agent.Agent + plugin.Plugin used only for tests.
type fakeAgent struct {
	launchCmd []string
	launchErr error
}

func (f *fakeAgent) Manifest() plugin.Manifest {
	return plugin.Manifest{ID: "fake", Capabilities: []plugin.Capability{plugin.CapabilityAgent}}
}
func (f *fakeAgent) GetConfigSpec(context.Context) (pluginagent.ConfigSpec, error) {
	return pluginagent.ConfigSpec{}, nil
}
func (f *fakeAgent) GetLaunchCommand(_ context.Context, _ pluginagent.LaunchConfig) ([]string, error) {
	if f.launchErr != nil {
		return nil, f.launchErr
	}
	return f.launchCmd, nil
}
func (f *fakeAgent) GetPromptDeliveryStrategy(context.Context, pluginagent.LaunchConfig) (pluginagent.PromptDeliveryStrategy, error) {
	return pluginagent.PromptDeliveryInCommand, nil
}
func (f *fakeAgent) GetAgentHooks(context.Context, pluginagent.WorkspaceHookConfig) error { return nil }
func (f *fakeAgent) GetRestoreCommand(context.Context, pluginagent.RestoreConfig) ([]string, bool, error) {
	return nil, false, nil
}
func (f *fakeAgent) SessionInfo(context.Context, pluginagent.SessionRef) (pluginagent.SessionInfo, bool, error) {
	return pluginagent.SessionInfo{}, false, nil
}

// -- Harness -------------------------------------------------------------

type harness struct {
	engine   *session.Engine
	repo     store.SessionRepo
	worktree *fakeWorktree
	provider *fakeProvider
	bus      *events.Bus
	subCh    <-chan events.Event
	unsub    func()
	wbase    string
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	ctx := context.Background()

	dbPath := filepath.Join(t.TempDir(), "state.db")
	s, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	registry := plugin.NewRegistry()
	if err := registry.Register(&fakeAgent{launchCmd: []string{"echo", "hello"}}); err != nil {
		t.Fatalf("register fake plugin: %v", err)
	}

	wt := &fakeWorktree{}
	prov := &fakeProvider{}
	bus := events.NewBus()
	ch, unsub := bus.Subscribe()

	worktreeBase := filepath.Join(t.TempDir(), "worktrees")

	eng, err := session.NewEngine(session.EngineConfig{
		Repo:         s.Sessions(),
		Worktree:     wt,
		Provider:     prov,
		Plugins:      registry,
		Bus:          bus,
		WorktreeBase: worktreeBase,
		DefaultAgent: "fake",
	})
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}

	t.Cleanup(unsub)
	return &harness{
		engine:   eng,
		repo:     s.Sessions(),
		worktree: wt,
		provider: prov,
		bus:      bus,
		subCh:    ch,
		unsub:    unsub,
		wbase:    worktreeBase,
	}
}

func (h *harness) drainEvents(t *testing.T, want int, timeout time.Duration) []events.Event {
	t.Helper()
	got := make([]events.Event, 0, want)
	deadline := time.Now().Add(timeout)
	for len(got) < want {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			t.Fatalf("timed out waiting for %d events, got %d", want, len(got))
		}
		select {
		case e := <-h.subCh:
			got = append(got, e)
		case <-time.After(remaining):
			t.Fatalf("timed out waiting for %d events, got %d", want, len(got))
		}
	}
	return got
}

// -- Tests ---------------------------------------------------------------

func TestSpawnHappyPath(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	ctx := context.Background()

	sess, err := h.engine.Spawn(ctx, session.SpawnRequest{
		ProjectPath: "/tmp/proj",
		Prompt:      "do thing",
	})
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	if sess.ID == "" {
		t.Fatal("expected non-empty session id")
	}
	if sess.ProjectPath != "/tmp/proj" {
		t.Errorf("ProjectPath = %q, want %q", sess.ProjectPath, "/tmp/proj")
	}
	if sess.ProjectName != "proj" {
		t.Errorf("ProjectName = %q, want %q", sess.ProjectName, "proj")
	}
	if sess.AgentPlugin != "fake" {
		t.Errorf("AgentPlugin = %q, want %q", sess.AgentPlugin, "fake")
	}
	if sess.ZellijSession != sess.ID {
		t.Errorf("ZellijSession = %q, want %q", sess.ZellijSession, sess.ID)
	}

	// Row was persisted.
	got, err := h.repo.Get(ctx, sess.ID)
	if err != nil {
		t.Fatalf("Get after spawn: %v", err)
	}
	if got.ID != sess.ID {
		t.Errorf("row ID = %q, want %q", got.ID, sess.ID)
	}

	// Provider was asked to create.
	if len(h.provider.createCalls) != 1 {
		t.Errorf("createCalls = %d, want 1", len(h.provider.createCalls))
	}
	created := h.provider.createCalls[0]
	if created.Name != sess.ID {
		t.Errorf("created.Name = %q, want %q", created.Name, sess.ID)
	}
	wantLaunch := []string{"echo", "hello"}
	if !equalStrings(created.LaunchCmd, wantLaunch) {
		t.Errorf("created.LaunchCmd = %v, want %v", created.LaunchCmd, wantLaunch)
	}
	if created.Env["BETTER_AO_SESSION_ID"] != sess.ID {
		t.Errorf("env[BETTER_AO_SESSION_ID] = %q, want %q", created.Env["BETTER_AO_SESSION_ID"], sess.ID)
	}

	// Worktree was created at the expected path.
	if len(h.worktree.createCalls) != 1 {
		t.Fatalf("worktree createCalls = %d, want 1", len(h.worktree.createCalls))
	}
	wantWorktree := filepath.Join(h.wbase, sess.ID)
	if h.worktree.createCalls[0].worktreePath != wantWorktree {
		t.Errorf("worktree path = %q, want %q", h.worktree.createCalls[0].worktreePath, wantWorktree)
	}
	if h.worktree.createCalls[0].branchName != "better-ao/"+sess.ID {
		t.Errorf("branch = %q, want %q", h.worktree.createCalls[0].branchName, "better-ao/"+sess.ID)
	}

	// Event published.
	events := h.drainEvents(t, 1, 100*time.Millisecond)
	if events[0].Type != "session.created" {
		t.Errorf("event type = %q, want session.created", events[0].Type)
	}
	if events[0].Payload["id"] != sess.ID {
		t.Errorf("event id = %q, want %q", events[0].Payload["id"], sess.ID)
	}
}

func TestSpawnRejectsRelativeProjectPath(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	_, err := h.engine.Spawn(context.Background(), session.SpawnRequest{
		ProjectPath: "relative/path",
	})
	if err == nil {
		t.Fatal("expected error for relative path")
	}
}

func TestSpawnRejectsNonGitProject(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.worktree.isGitRepo = func(string) bool { return false }
	_, err := h.engine.Spawn(context.Background(), session.SpawnRequest{
		ProjectPath: "/tmp/no-git",
	})
	if err == nil {
		t.Fatal("expected error for non-git project")
	}
	if len(h.worktree.createCalls) != 0 {
		t.Errorf("worktree was created despite non-git project; calls = %d", len(h.worktree.createCalls))
	}
}

func TestSpawnRollsBackOnProviderFailure(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.provider.createErr = errors.New("zellij blew up")

	_, err := h.engine.Spawn(context.Background(), session.SpawnRequest{
		ProjectPath: "/tmp/proj",
	})
	if err == nil {
		t.Fatal("expected error from provider failure")
	}

	// Worktree was created then removed.
	if len(h.worktree.createCalls) != 1 {
		t.Errorf("worktree createCalls = %d, want 1", len(h.worktree.createCalls))
	}
	if len(h.worktree.removeCalls) != 1 {
		t.Errorf("worktree removeCalls = %d, want 1 (rollback)", len(h.worktree.removeCalls))
	}
	// Rollback must pass the branch name so the leaked-branch bug stays
	// fixed: the created branch and the removed branch are the same.
	if len(h.worktree.createCalls) == 1 && len(h.worktree.removeCalls) == 1 {
		created := h.worktree.createCalls[0].branchName
		removed := h.worktree.removeCalls[0].branchName
		if removed == "" || removed != created {
			t.Errorf("rollback removed branch %q, want created branch %q", removed, created)
		}
	}

	// No row persisted.
	rows, _ := h.repo.List(context.Background())
	if len(rows) != 0 {
		t.Errorf("rows = %d, want 0 (no persistence on rollback)", len(rows))
	}

	// No event published.
	select {
	case e := <-h.subCh:
		t.Errorf("unexpected event: %+v", e)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestSpawnRollsBackOnWorktreeFailure(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	h.worktree.createErr = errors.New("worktree busted")

	_, err := h.engine.Spawn(context.Background(), session.SpawnRequest{
		ProjectPath: "/tmp/proj",
	})
	if err == nil {
		t.Fatal("expected error from worktree failure")
	}

	if len(h.provider.createCalls) != 0 {
		t.Errorf("provider was called despite worktree failure; calls = %d", len(h.provider.createCalls))
	}
	rows, _ := h.repo.List(context.Background())
	if len(rows) != 0 {
		t.Errorf("rows = %d, want 0", len(rows))
	}
}

func TestStopIsIdempotent(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	if err := h.engine.Stop(context.Background(), "no-such-id"); err != nil {
		t.Fatalf("Stop unknown id: %v", err)
	}
	if len(h.provider.killCalls) != 0 {
		t.Errorf("provider.Kill called for unknown id; calls = %d", len(h.provider.killCalls))
	}
}

func TestStopRemovesWorktreeKillsProviderAndDeletesRow(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	ctx := context.Background()

	sess, err := h.engine.Spawn(ctx, session.SpawnRequest{ProjectPath: "/tmp/proj"})
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	// Drain the created event.
	_ = h.drainEvents(t, 1, 100*time.Millisecond)

	if err := h.engine.Stop(ctx, sess.ID); err != nil {
		t.Fatalf("Stop: %v", err)
	}

	if len(h.provider.killCalls) != 1 || h.provider.killCalls[0] != sess.ID {
		t.Errorf("killCalls = %v, want [%q]", h.provider.killCalls, sess.ID)
	}
	if _, err := h.repo.Get(ctx, sess.ID); err != store.ErrSessionNotFound {
		t.Errorf("Get after stop: err = %v, want ErrSessionNotFound", err)
	}

	events := h.drainEvents(t, 1, 100*time.Millisecond)
	if events[0].Type != "session.terminated" {
		t.Errorf("event type = %q, want session.terminated", events[0].Type)
	}
}

func TestReconcileLiveSessionUnchanged(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	ctx := context.Background()

	sess, _ := h.engine.Spawn(ctx, session.SpawnRequest{ProjectPath: "/tmp/proj"})
	_ = h.drainEvents(t, 1, 100*time.Millisecond)

	got, alive, err := h.engine.Reconcile(ctx, sess.ID)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if !alive {
		t.Errorf("alive = false, want true")
	}
	if got.ID != sess.ID {
		t.Errorf("got.ID = %q, want %q", got.ID, sess.ID)
	}
}

func TestReconcileDeadSessionDeletesRow(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	ctx := context.Background()

	sess, _ := h.engine.Spawn(ctx, session.SpawnRequest{ProjectPath: "/tmp/proj"})
	_ = h.drainEvents(t, 1, 100*time.Millisecond)

	// Externally "kill" the zellij session: drop it from the fake's live set.
	h.provider.mu.Lock()
	delete(h.provider.liveSessions, sess.ID)
	h.provider.mu.Unlock()

	got, alive, err := h.engine.Reconcile(ctx, sess.ID)
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if alive {
		t.Errorf("alive = true, want false")
	}
	if got.ID != "" {
		t.Errorf("got.ID = %q, want empty", got.ID)
	}

	if _, err := h.repo.Get(ctx, sess.ID); err != store.ErrSessionNotFound {
		t.Errorf("Get after Reconcile dead: err = %v, want ErrSessionNotFound", err)
	}

	events := h.drainEvents(t, 1, 100*time.Millisecond)
	if events[0].Type != "session.terminated" {
		t.Errorf("event type = %q, want session.terminated", events[0].Type)
	}
}

func TestReconcileAllDeletesDeadAndKeepsLive(t *testing.T) {
	t.Parallel()
	h := newHarness(t)
	ctx := context.Background()

	live, _ := h.engine.Spawn(ctx, session.SpawnRequest{ProjectPath: "/tmp/live"})
	dead, _ := h.engine.Spawn(ctx, session.SpawnRequest{ProjectPath: "/tmp/dead"})
	_ = h.drainEvents(t, 2, 200*time.Millisecond)

	// Externally kill the second one.
	h.provider.mu.Lock()
	delete(h.provider.liveSessions, dead.ID)
	h.provider.mu.Unlock()

	if err := h.engine.ReconcileAll(ctx); err != nil {
		t.Fatalf("ReconcileAll: %v", err)
	}

	if _, err := h.repo.Get(ctx, live.ID); err != nil {
		t.Errorf("live row missing: %v", err)
	}
	if _, err := h.repo.Get(ctx, dead.ID); err != store.ErrSessionNotFound {
		t.Errorf("dead row should be deleted: err = %v", err)
	}

	events := h.drainEvents(t, 1, 100*time.Millisecond)
	if events[0].Type != "session.terminated" {
		t.Errorf("event type = %q, want session.terminated", events[0].Type)
	}
	if events[0].Payload["id"] != dead.ID {
		t.Errorf("event id = %q, want %q", events[0].Payload["id"], dead.ID)
	}
}

// -- helpers -------------------------------------------------------------

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
