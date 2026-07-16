package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/durabilityprovider"
	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
)

// recordingReviver records Revive calls and optionally appends to a shared
// ordering log so tests can assert revive-before-send sequencing.
type recordingReviver struct {
	calls []string
	log   *[]string
}

func (r *recordingReviver) Revive(_ context.Context, id string) (store.Session, error) {
	r.calls = append(r.calls, id)
	if r.log != nil {
		*r.log = append(*r.log, "revive:"+id)
	}
	return store.Session{ID: id}, nil
}

// orderRecordingProvider is a recordingProvider that also appends to the
// shared ordering log on delivery.
type orderRecordingProvider struct {
	recordingProvider
	log *[]string
}

func (p *orderRecordingProvider) SendMessage(ctx context.Context, sess session.Session, message string) error {
	*p.log = append(*p.log, "send")
	return p.recordingProvider.SendMessage(ctx, sess, message)
}

// TestHandleSessionTerminalRevivesBeforeAttach verifies the terminal attach
// endpoint asks the reviver to restore the session before it bridges the
// WebSocket. The request intentionally lacks WebSocket upgrade headers: the
// revive must already have happened by the time the upgrade is attempted.
func TestHandleSessionTerminalRevivesBeforeAttach(t *testing.T) {
	reviver := &recordingReviver{}
	srv := New(Config{
		Workspace: session.Workspace{
			Sessions: []session.Session{{
				ID:                "ao-1",
				Project:           "project-a",
				TerminalSupported: true,
				ZellijSession:     "ao-1",
			}},
		},
		Reviver: reviver,
	})

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/ao-1/terminal?project=project-a", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if len(reviver.calls) != 1 || reviver.calls[0] != "ao-1" {
		t.Fatalf("reviver.calls = %#v, want [ao-1]", reviver.calls)
	}
}

// TestHandleSessionTerminalSkipsUnknownSessions verifies sessions that fail
// resolution never reach the reviver.
func TestHandleSessionTerminalSkipsUnknownSessions(t *testing.T) {
	reviver := &recordingReviver{}
	srv := New(Config{Reviver: reviver})

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/missing/terminal", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if len(reviver.calls) != 0 {
		t.Fatalf("reviver.calls = %#v, want none", reviver.calls)
	}
}

// TestHandleAnnotationsRevivesSessionBeforeSend verifies annotation delivery
// revives the target session before pasting the message, so a dead session
// receives its agent back instead of the message landing in a blank shell.
func TestHandleAnnotationsRevivesSessionBeforeSend(t *testing.T) {
	var order []string
	reviver := &recordingReviver{log: &order}
	provider := &orderRecordingProvider{
		recordingProvider: recordingProvider{name: "zellij"},
		log:               &order,
	}
	srv := New(Config{
		Sessions: &fakeSessionRepo{byID: map[string]store.Session{
			"ao-1": {ID: "ao-1", ZellijSession: "zellij-1"},
		}},
		DurabilityProviders: durabilityprovider.NewRegistry(provider),
		Reviver:             reviver,
	})

	body := `{"annotations":[{"id":"a1","comment":"increase contrast"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/annotations/ao-1", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if want := []string{"revive:ao-1", "send"}; !reflect.DeepEqual(order, want) {
		t.Fatalf("order = %#v, want %#v", order, want)
	}
}
