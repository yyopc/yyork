package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/yyopc/yyork/internal/control"
	"github.com/yyopc/yyork/internal/events"
)

const testControlToken = "test-token"

// postEvent serves a POST /api/events request and returns the recorder.
func postEvent(t *testing.T, srv *Server, token string, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/events", strings.NewReader(body))
	if token != "" {
		request.Header.Set(control.TokenHeader, token)
	}
	response := httptest.NewRecorder()
	srv.Handler().ServeHTTP(response, request)
	return response
}

func postShutdown(t *testing.T, srv *Server, token string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/control/shutdown", nil)
	if token != "" {
		request.Header.Set(control.TokenHeader, token)
	}
	response := httptest.NewRecorder()
	srv.Handler().ServeHTTP(response, request)
	return response
}

func TestPublishEventRejectsMissingToken(t *testing.T) {
	bus := events.NewBus()
	ch, unsubscribe := bus.Subscribe()
	defer unsubscribe()
	srv := New(Config{EventBus: bus, ControlToken: testControlToken})

	response := postEvent(t, srv, "", `{"type":"session.created","id":"s1"}`)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for missing token, got %d", response.Code)
	}
	assertNoEvent(t, ch)
}

func TestPublishEventRejectsWrongToken(t *testing.T) {
	bus := events.NewBus()
	ch, unsubscribe := bus.Subscribe()
	defer unsubscribe()
	srv := New(Config{EventBus: bus, ControlToken: testControlToken})

	response := postEvent(t, srv, "nope", `{"type":"session.created","id":"s1"}`)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for wrong token, got %d", response.Code)
	}
	assertNoEvent(t, ch)
}

// An empty server token must reject everything, otherwise a server started
// without a runfile would accept unauthenticated publishes.
func TestPublishEventRejectsWhenServerTokenUnset(t *testing.T) {
	bus := events.NewBus()
	srv := New(Config{EventBus: bus})

	response := postEvent(t, srv, "", `{"type":"session.created","id":"s1"}`)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when server token unset, got %d", response.Code)
	}
}

func TestPublishEventRejectsUnknownType(t *testing.T) {
	bus := events.NewBus()
	ch, unsubscribe := bus.Subscribe()
	defer unsubscribe()
	srv := New(Config{EventBus: bus, ControlToken: testControlToken})

	response := postEvent(t, srv, testControlToken, `{"type":"session.exploded","id":"s1"}`)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown type, got %d", response.Code)
	}
	assertNoEvent(t, ch)
}

func TestPublishEventPublishesToBus(t *testing.T) {
	bus := events.NewBus()
	ch, unsubscribe := bus.Subscribe()
	defer unsubscribe()
	srv := New(Config{EventBus: bus, ControlToken: testControlToken})

	response := postEvent(t, srv, testControlToken, `{"type":"session.created","id":"abc"}`)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for valid event, got %d", response.Code)
	}

	select {
	case ev := <-ch:
		if ev.Type != events.TypeSessionCreated {
			t.Fatalf("expected session.created, got %q", ev.Type)
		}
		if id, _ := ev.Payload["id"].(string); id != "abc" {
			t.Fatalf("expected payload id abc, got %q", id)
		}
	case <-time.After(time.Second):
		t.Fatal("expected an event on the bus, got none")
	}
}

func TestPublishEventWithoutBusReturnsServiceUnavailable(t *testing.T) {
	srv := New(Config{ControlToken: testControlToken})

	response := postEvent(t, srv, testControlToken, `{"type":"session.created","id":"s1"}`)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 without a bus, got %d", response.Code)
	}
}

func TestControlShutdownRejectsMissingToken(t *testing.T) {
	called := make(chan struct{}, 1)
	srv := New(Config{
		ControlToken: testControlToken,
		Shutdown: func() {
			called <- struct{}{}
		},
	})

	response := postShutdown(t, srv, "")

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for missing token, got %d", response.Code)
	}
	assertNoShutdown(t, called)
}

func TestControlShutdownRejectsWrongToken(t *testing.T) {
	called := make(chan struct{}, 1)
	srv := New(Config{
		ControlToken: testControlToken,
		Shutdown: func() {
			called <- struct{}{}
		},
	})

	response := postShutdown(t, srv, "nope")

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for wrong token, got %d", response.Code)
	}
	assertNoShutdown(t, called)
}

func TestControlShutdownAcceptsValidToken(t *testing.T) {
	called := make(chan struct{}, 1)
	srv := New(Config{
		ControlToken: testControlToken,
		Shutdown: func() {
			called <- struct{}{}
		},
	})

	response := postShutdown(t, srv, testControlToken)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for valid token, got %d", response.Code)
	}
	select {
	case <-called:
	case <-time.After(time.Second):
		t.Fatal("expected shutdown callback")
	}
}

func assertNoEvent(t *testing.T, ch <-chan events.Event) {
	t.Helper()
	select {
	case ev := <-ch:
		t.Fatalf("expected no event, got %q", ev.Type)
	case <-time.After(50 * time.Millisecond):
	}
}

func assertNoShutdown(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
		t.Fatal("expected shutdown callback not to be called")
	case <-time.After(50 * time.Millisecond):
	}
}
