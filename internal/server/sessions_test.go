package server_test

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yyopc/yyork/internal/events"
	"github.com/yyopc/yyork/internal/server"
	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
)

func openTestStore(t *testing.T) store.Store {
	t.Helper()
	s, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestListSessionsReturnsEmptyByDefault(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	srv := server.New(server.Config{
		Sessions: s.Sessions(),
		EventBus: events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp, err := http.Get(ts.URL + "/api/sessions")
	if err != nil {
		t.Fatalf("GET /api/sessions: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var got []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty list, got %#v", got)
	}
}

func TestListSessionsReturnsSeededRows(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	repo := s.Sessions()

	for _, row := range []store.Session{
		{ID: "01HRSERVER000000000000000A", ProjectPath: "/tmp/a", ProjectName: "a", AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRSERVER000000000000000A", Metadata: map[string]any{"recap": "Reviewed the workspace setup."}},
		{ID: "01HRSERVER000000000000000B", ProjectPath: "/tmp/b", ProjectName: "b", AgentPlugin: "codex", WorkspacePath: "/tmp/b/.w", ZellijSession: "01HRSERVER000000000000000B", Metadata: map[string]any{"displayName": "Project overview", "prompt": "tell me about this project"}},
		{ID: "01HRSERVER000000000000000C", ProjectPath: "/tmp/c", ProjectName: "c", AgentPlugin: "codex", WorkspacePath: "/tmp/c/.w", ZellijSession: "01HRSERVER000000000000000C", Metadata: map[string]any{"prompt": "do not show this full prompt as the session title"}},
	} {
		if err := repo.Insert(context.Background(), row); err != nil {
			t.Fatalf("Insert: %v", err)
		}
	}

	srv := server.New(server.Config{Sessions: repo, EventBus: events.NewBus()})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp, err := http.Get(ts.URL + "/api/sessions")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	var got []map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&got)
	if len(got) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(got))
	}
	var recap string
	var renamedTitle string
	var renamedRecap string
	var pendingTitle string
	for _, row := range got {
		if row["id"] == "01HRSERVER000000000000000A" {
			recap, _ = row["recap"].(string)
		}
		if row["id"] == "01HRSERVER000000000000000B" {
			renamedTitle, _ = row["title"].(string)
			renamedRecap, _ = row["recap"].(string)
		}
		if row["id"] == "01HRSERVER000000000000000C" {
			pendingTitle, _ = row["title"].(string)
		}
	}
	if recap != "Reviewed the workspace setup." {
		t.Fatalf("recap = %q, want hook recap", recap)
	}
	if renamedTitle != "Project overview" {
		t.Fatalf("renamed title = %q, want displayName", renamedTitle)
	}
	if renamedRecap != "" {
		t.Fatalf("renamed recap = %q, want empty until last assistant message exists", renamedRecap)
	}
	if pendingTitle != "New worker agent" {
		t.Fatalf("pending title = %q, want generic worker label", pendingTitle)
	}

	// ?project filter
	resp, err = http.Get(ts.URL + "/api/sessions?project=/tmp/a")
	if err != nil {
		t.Fatalf("GET filtered: %v", err)
	}
	defer resp.Body.Close()
	var filtered []map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&filtered)
	if len(filtered) != 1 {
		t.Fatalf("expected 1 filtered row, got %d", len(filtered))
	}
	if filtered[0]["id"] != "01HRSERVER000000000000000A" {
		t.Fatalf("filtered id = %v, want 01HRSERVER000000000000000A", filtered[0]["id"])
	}
}

func TestEventsStreamDeliversPublishedEvents(t *testing.T) {
	t.Parallel()
	bus := events.NewBus()
	srv := server.New(server.Config{Sessions: openTestStore(t).Sessions(), EventBus: bus})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/api/events", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET /api/events: %v", err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })

	if resp.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("Content-Type = %q, want text/event-stream", resp.Header.Get("Content-Type"))
	}

	reader := bufio.NewReader(resp.Body)

	// Consume the initial ": connected" comment line + blank line.
	if err := drainUntilBlank(reader); err != nil {
		t.Fatalf("draining initial comment: %v", err)
	}

	// Give the handler a moment to install the subscriber before
	// publishing — without this, fast tests can publish before subscribe
	// returns and the event drops.
	time.Sleep(20 * time.Millisecond)
	bus.Publish(events.NewSessionCreated("test-session-id"))

	eventLine, dataLine, err := readSSEFrame(reader)
	if err != nil {
		t.Fatalf("read SSE frame: %v", err)
	}
	if eventLine != "event: session.created" {
		t.Errorf("event line = %q, want %q", eventLine, "event: session.created")
	}
	if !strings.Contains(dataLine, `"id":"test-session-id"`) {
		t.Errorf("data line = %q, want id payload", dataLine)
	}
}

// drainUntilBlank reads SSE preamble lines (`: comment`) until it hits the
// blank line that terminates an SSE message.
func drainUntilBlank(r *bufio.Reader) error {
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return err
		}
		if line == "\n" || line == "\r\n" {
			return nil
		}
	}
}

// readSSEFrame reads one `event: X\ndata: Y\n\n` frame.
func readSSEFrame(r *bufio.Reader) (eventLine, dataLine string, err error) {
	for {
		line, e := r.ReadString('\n')
		if e != nil {
			return "", "", e
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "" {
			if eventLine != "" || dataLine != "" {
				return eventLine, dataLine, nil
			}
			continue
		}
		switch {
		case strings.HasPrefix(trimmed, "event: "):
			eventLine = trimmed
		case strings.HasPrefix(trimmed, "data: "):
			dataLine = trimmed
		}
	}
}

// Compile-time guard: io.Reader is implicitly satisfied by *bufio.Reader.
var _ io.Reader = (*bufio.Reader)(nil)

type fakeStopper struct {
	stopped []string
}

func (f *fakeStopper) Stop(_ context.Context, id string) error {
	f.stopped = append(f.stopped, id)
	return nil
}

type fakeForker struct {
	err   error
	reqs  []session.ForkRequest
	reply store.Session
}

func (f *fakeForker) Fork(_ context.Context, req session.ForkRequest) (store.Session, error) {
	f.reqs = append(f.reqs, req)
	if f.err != nil {
		return store.Session{}, f.err
	}
	return f.reply, nil
}

type fakeRestarter struct {
	err   error
	reqs  []session.RestartRequest
	reply store.Session
}

func (f *fakeRestarter) Restart(_ context.Context, req session.RestartRequest) (store.Session, error) {
	f.reqs = append(f.reqs, req)
	if f.err != nil {
		return store.Session{}, f.err
	}
	return f.reply, nil
}

func TestStopSessionCallsStopper(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	stopper := &fakeStopper{}
	srv := server.New(server.Config{
		Sessions: s.Sessions(),
		Stopper:  stopper,
		EventBus: events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	req, err := http.NewRequest(http.MethodDelete, ts.URL+"/api/sessions/abc123", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE /api/sessions/abc123: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", resp.StatusCode)
	}
	if len(stopper.stopped) != 1 || stopper.stopped[0] != "abc123" {
		t.Fatalf("stopper.stopped = %v, want [abc123]", stopper.stopped)
	}
}

func TestForkSessionCallsForker(t *testing.T) {
	t.Parallel()
	forker := &fakeForker{
		reply: store.Session{
			ID:            "fork-1",
			ProjectPath:   "/tmp/a",
			ProjectName:   "a",
			AgentPlugin:   "codex",
			WorkspacePath: "/tmp/worktrees/fork-1",
			ZellijSession: "fork-1",
			Metadata:      map[string]any{"kind": "worker", "workspaceMode": "new-worktree"},
		},
	}
	srv := server.New(server.Config{
		Forker:   forker,
		Sessions: openTestStore(t).Sessions(),
		EventBus: events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := forkSession(t, ts.URL, "source-1", `{"prompt":"Start implementation."}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}
	if len(forker.reqs) != 1 {
		t.Fatalf("fork reqs = %d, want 1", len(forker.reqs))
	}
	if forker.reqs[0].SourceSessionID != "source-1" || forker.reqs[0].Prompt != "Start implementation." {
		t.Fatalf("fork req = %#v, want source/prompt", forker.reqs[0])
	}

	var dto map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&dto); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if dto["id"] != "fork-1" || dto["workspacePath"] != "/tmp/worktrees/fork-1" {
		t.Fatalf("dto = %#v, want fork session", dto)
	}
}

func TestForkSessionReturnsConflictWhenUnsupported(t *testing.T) {
	t.Parallel()
	srv := server.New(server.Config{
		Forker:   &fakeForker{err: session.ErrForkUnsupported},
		Sessions: openTestStore(t).Sessions(),
		EventBus: events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := forkSession(t, ts.URL, "source-1", `{"prompt":"Start implementation."}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}
}

func TestRestartSessionCallsRestarter(t *testing.T) {
	t.Parallel()
	restarter := &fakeRestarter{
		reply: store.Session{
			ID:            "sess-1",
			ProjectPath:   "/tmp/a",
			ProjectName:   "a",
			AgentPlugin:   "codex",
			WorkspacePath: "/tmp/a",
			ZellijSession: "sess-1",
			Metadata:      map[string]any{"kind": "orchestrator", "restartCount": 1},
		},
	}
	srv := server.New(server.Config{
		Restarter: restarter,
		Sessions:  openTestStore(t).Sessions(),
		EventBus:  events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := restartSession(t, ts.URL, "sess-1")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if len(restarter.reqs) != 1 || restarter.reqs[0].SessionID != "sess-1" {
		t.Fatalf("restart reqs = %#v, want sess-1", restarter.reqs)
	}

	var dto map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&dto); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if dto["id"] != "sess-1" || dto["workspacePath"] != "/tmp/a" {
		t.Fatalf("dto = %#v, want restarted session", dto)
	}
}

func TestRestartSessionReturnsConflictWhenUnsupported(t *testing.T) {
	t.Parallel()
	srv := server.New(server.Config{
		Restarter: &fakeRestarter{err: session.ErrRestartUnsupported},
		Sessions:  openTestStore(t).Sessions(),
		EventBus:  events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := restartSession(t, ts.URL, "sess-1")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}
}

func TestRenameSessionSetsDisplayName(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	repo := s.Sessions()
	if err := repo.Insert(context.Background(), store.Session{
		ID: "01HRRENAME0000000000000001", ProjectPath: "/tmp/a", ProjectName: "a",
		AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRRENAME0000000000000001",
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	srv := server.New(server.Config{Sessions: repo, EventBus: events.NewBus()})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "01HRRENAME0000000000000001", `{"displayName":"  My Agent  "}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var dto map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&dto); err != nil {
		t.Fatalf("decode: %v", err)
	}
	metadata, _ := dto["metadata"].(map[string]any)
	if metadata["displayName"] != "My Agent" {
		t.Fatalf("displayName = %v, want %q (trimmed)", metadata["displayName"], "My Agent")
	}

	// The write must persist to the store, not just echo back.
	row, err := repo.Get(context.Background(), "01HRRENAME0000000000000001")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if row.Metadata["displayName"] != "My Agent" {
		t.Fatalf("persisted displayName = %v, want %q", row.Metadata["displayName"], "My Agent")
	}
}

func TestRenameSessionEmptyClearsDisplayName(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	repo := s.Sessions()
	if err := repo.Insert(context.Background(), store.Session{
		ID: "01HRRENAME0000000000000002", ProjectPath: "/tmp/a", ProjectName: "a",
		AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRRENAME0000000000000002",
		Metadata: map[string]any{"displayName": "Old Name"},
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	srv := server.New(server.Config{Sessions: repo, EventBus: events.NewBus()})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "01HRRENAME0000000000000002", `{"displayName":"   "}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	row, err := repo.Get(context.Background(), "01HRRENAME0000000000000002")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if row.Metadata["displayName"] != "" {
		t.Fatalf("displayName = %v, want empty (cleared)", row.Metadata["displayName"])
	}
}

func TestRenameSessionNotFound(t *testing.T) {
	t.Parallel()
	srv := server.New(server.Config{
		Sessions: openTestStore(t).Sessions(),
		EventBus: events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "missing", `{"displayName":"x"}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestPatchSessionMarksPromptWorkerDone(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	repo := s.Sessions()
	if err := repo.Insert(context.Background(), store.Session{
		ID: "01HRDONE00000000000000001", ProjectPath: "/tmp/a", ProjectName: "a",
		AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRDONE00000000000000001",
		Metadata: map[string]any{"displayName": "Keep Name", "kind": "worker", "state": "prompt"},
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	srv := server.New(server.Config{Sessions: repo, EventBus: events.NewBus()})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "01HRDONE00000000000000001", `{"state":"done"}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var dto map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&dto); err != nil {
		t.Fatalf("decode: %v", err)
	}
	metadata, _ := dto["metadata"].(map[string]any)
	if metadata["state"] != "done" {
		t.Fatalf("state = %v, want done", metadata["state"])
	}
	if metadata["displayName"] != "Keep Name" {
		t.Fatalf("displayName = %v, want preserved display name", metadata["displayName"])
	}

	row, err := repo.Get(context.Background(), "01HRDONE00000000000000001")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if row.Metadata["state"] != "done" {
		t.Fatalf("persisted state = %v, want done", row.Metadata["state"])
	}
}

func TestPatchSessionRejectsDoneForNonPromptSession(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	repo := s.Sessions()
	if err := repo.Insert(context.Background(), store.Session{
		ID: "01HRDONE00000000000000002", ProjectPath: "/tmp/a", ProjectName: "a",
		AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRDONE00000000000000002",
		Metadata: map[string]any{"kind": "worker", "state": "working"},
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	srv := server.New(server.Config{Sessions: repo, EventBus: events.NewBus()})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "01HRDONE00000000000000002", `{"state":"done"}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}

	row, err := repo.Get(context.Background(), "01HRDONE00000000000000002")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if row.Metadata["state"] != "working" {
		t.Fatalf("persisted state = %v, want working", row.Metadata["state"])
	}
}

func TestPatchSessionMarksWorkerResponseSeen(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	repo := s.Sessions()
	deliveredAt := "2026-06-07T10:20:00Z"
	if err := repo.Insert(context.Background(), store.Session{
		ID: "01HRSEEN0000000000000001", ProjectPath: "/tmp/a", ProjectName: "a",
		AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRSEEN0000000000000001",
		Metadata: map[string]any{"kind": "worker", "state": "prompt", "lastAssistantMessageAt": deliveredAt},
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	srv := server.New(server.Config{Sessions: repo, EventBus: events.NewBus()})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "01HRSEEN0000000000000001", `{"seenResponse":true}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	row, err := repo.Get(context.Background(), "01HRSEEN0000000000000001")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if row.Metadata["seenWorkerResponseAt"] != deliveredAt {
		t.Fatalf("seenWorkerResponseAt = %v, want %q", row.Metadata["seenWorkerResponseAt"], deliveredAt)
	}
}

func TestPatchSessionRejectsSeenResponseForWorkingSession(t *testing.T) {
	t.Parallel()
	s := openTestStore(t)
	repo := s.Sessions()
	if err := repo.Insert(context.Background(), store.Session{
		ID: "01HRSEEN0000000000000002", ProjectPath: "/tmp/a", ProjectName: "a",
		AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRSEEN0000000000000002",
		Metadata: map[string]any{"kind": "worker", "state": "working", "lastAssistantMessageAt": "2026-06-07T10:20:00Z"},
	}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	srv := server.New(server.Config{Sessions: repo, EventBus: events.NewBus()})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "01HRSEEN0000000000000002", `{"seenResponse":true}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}
}

func TestPatchSessionRejectsUnsupportedState(t *testing.T) {
	t.Parallel()
	srv := server.New(server.Config{
		Sessions: openTestStore(t).Sessions(),
		EventBus: events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	resp := patchSession(t, ts.URL, "any", `{"state":"working"}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

// patchSession issues a PATCH /api/sessions/{id} with the given JSON body.
func patchSession(t *testing.T, baseURL, id, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPatch, baseURL+"/api/sessions/"+id, strings.NewReader(body))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PATCH /api/sessions/%s: %v", id, err)
	}
	return resp
}

func forkSession(t *testing.T, baseURL, id, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/sessions/"+id+"/fork", strings.NewReader(body))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /api/sessions/%s/fork: %v", id, err)
	}
	return resp
}

func restartSession(t *testing.T, baseURL, id string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/sessions/"+id+"/restart", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /api/sessions/%s/restart: %v", id, err)
	}
	return resp
}

func TestStopSessionReturns501WithoutStopper(t *testing.T) {
	t.Parallel()
	srv := server.New(server.Config{
		Sessions: openTestStore(t).Sessions(),
		EventBus: events.NewBus(),
	})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	req, err := http.NewRequest(http.MethodDelete, ts.URL+"/api/sessions/abc123", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501", resp.StatusCode)
	}
}
