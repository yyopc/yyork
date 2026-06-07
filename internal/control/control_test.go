package control

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/yyovil/yyork/internal/events"
)

// isolateHome points HOME at a temp dir so Path() resolves to a per-test
// runfile location and never touches the developer's real ~/.yyork.
func isolateHome(t *testing.T) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
}

func TestWriteReadRemoveRoundTrip(t *testing.T) {
	isolateHome(t)

	want := Info{Addr: "127.0.0.1:7331", PID: 4242, Token: "secret"}
	if err := Write(want); err != nil {
		t.Fatalf("write runfile: %v", err)
	}

	got, err := Read()
	if err != nil {
		t.Fatalf("read runfile: %v", err)
	}
	if got != want {
		t.Fatalf("round trip mismatch: got %+v want %+v", got, want)
	}

	// Runfile must be 0600 so browser pages (and other users) can't read the
	// token out of it.
	path, _ := Path()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat runfile: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("expected runfile perm 0600, got %o", perm)
	}

	if err := Remove(); err != nil {
		t.Fatalf("remove runfile: %v", err)
	}
	if _, err := Read(); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected ErrNotExist after remove, got %v", err)
	}
}

func TestRemoveMissingIsNoError(t *testing.T) {
	isolateHome(t)
	if err := Remove(); err != nil {
		t.Fatalf("removing a missing runfile should be a no-op, got %v", err)
	}
}

func TestRemoveIfOwnedBy(t *testing.T) {
	isolateHome(t)

	if err := Write(Info{Addr: "127.0.0.1:7331", PID: 100, Token: "t"}); err != nil {
		t.Fatalf("write: %v", err)
	}

	// A different PID (a newer server owns the runfile) must not delete it.
	if err := RemoveIfOwnedBy(999); err != nil {
		t.Fatalf("RemoveIfOwnedBy(non-owner): %v", err)
	}
	if _, err := Read(); err != nil {
		t.Fatalf("runfile must survive a non-owner removal, got %v", err)
	}

	// The owning PID deletes it.
	if err := RemoveIfOwnedBy(100); err != nil {
		t.Fatalf("RemoveIfOwnedBy(owner): %v", err)
	}
	if _, err := Read(); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("runfile must be gone after owner removal, got %v", err)
	}

	// A missing runfile is a no-op.
	if err := RemoveIfOwnedBy(100); err != nil {
		t.Fatalf("RemoveIfOwnedBy(missing): %v", err)
	}
}

func TestNewTokenIsRandomHex(t *testing.T) {
	a, err := NewToken()
	if err != nil {
		t.Fatalf("new token: %v", err)
	}
	b, err := NewToken()
	if err != nil {
		t.Fatalf("new token: %v", err)
	}
	if a == b {
		t.Fatal("expected distinct tokens")
	}
	if len(a) != 64 { // 32 bytes hex-encoded
		t.Fatalf("expected 64 hex chars, got %d", len(a))
	}
}

func TestToEvent(t *testing.T) {
	cases := []struct {
		name    string
		in      Envelope
		wantOK  bool
		wantTyp events.Type
	}{
		{"created", Envelope{Type: "session.created", ID: "x"}, true, events.TypeSessionCreated},
		{"terminated", Envelope{Type: "session.terminated", ID: "y"}, true, events.TypeSessionTerminated},
		{"unknown", Envelope{Type: "session.exploded", ID: "z"}, false, ""},
		{"empty", Envelope{}, false, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ev, ok := ToEvent(tc.in)
			if ok != tc.wantOK {
				t.Fatalf("ok: got %v want %v", ok, tc.wantOK)
			}
			if ok && ev.Type != tc.wantTyp {
				t.Fatalf("type: got %q want %q", ev.Type, tc.wantTyp)
			}
			if ok {
				if id, _ := ev.Payload["id"].(string); id != tc.in.ID {
					t.Fatalf("id: got %q want %q", id, tc.in.ID)
				}
			}
		})
	}
}

func TestForwardingPublisherPostsToAdvertisedServer(t *testing.T) {
	isolateHome(t)

	type received struct {
		token       string
		contentType string
		body        string
	}
	got := make(chan received, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/events" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		got <- received{
			token:       r.Header.Get(TokenHeader),
			contentType: r.Header.Get("Content-Type"),
			body:        string(body),
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	if err := Write(Info{Addr: strings.TrimPrefix(ts.URL, "http://"), Token: "secret"}); err != nil {
		t.Fatalf("write runfile: %v", err)
	}

	NewForwardingPublisher().Publish(events.NewSessionCreated("sess-1"))

	select {
	case r := <-got:
		if r.token != "secret" {
			t.Fatalf("token header: got %q want secret", r.token)
		}
		if r.contentType != "application/json" {
			t.Fatalf("content-type: got %q", r.contentType)
		}
		if !strings.Contains(r.body, `"session.created"`) || !strings.Contains(r.body, `"sess-1"`) {
			t.Fatalf("unexpected body: %s", r.body)
		}
	default:
		t.Fatal("expected the publisher to POST the event")
	}
}

// With no runfile (no server running), Publish must be a silent no-op rather
// than erroring or blocking — spawning without a dashboard open is normal.
func TestForwardingPublisherNoRunfileIsNoop(t *testing.T) {
	isolateHome(t)
	NewForwardingPublisher().Publish(events.NewSessionCreated("sess-1"))
}
