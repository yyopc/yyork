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

	"github.com/yyovil/yyork/internal/events"
	"github.com/yyovil/yyork/internal/server"
	"github.com/yyovil/yyork/internal/store"
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
		{ID: "01HRSERVER000000000000000A", ProjectPath: "/tmp/a", ProjectName: "a", AgentPlugin: "codex", WorkspacePath: "/tmp/a/.w", ZellijSession: "01HRSERVER000000000000000A"},
		{ID: "01HRSERVER000000000000000B", ProjectPath: "/tmp/b", ProjectName: "b", AgentPlugin: "codex", WorkspacePath: "/tmp/b/.w", ZellijSession: "01HRSERVER000000000000000B"},
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
	if len(got) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(got))
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
