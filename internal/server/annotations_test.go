package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yyovil/yyork/internal/durabilityprovider"
	"github.com/yyovil/yyork/internal/session"
	"github.com/yyovil/yyork/internal/store"
)

type recordingProvider struct {
	name     string
	sessions []session.Session
	messages []string
}

func (p *recordingProvider) Name() string { return p.name }

func (p *recordingProvider) SendMessage(_ context.Context, sess session.Session, message string) error {
	p.sessions = append(p.sessions, sess)
	p.messages = append(p.messages, message)
	return nil
}

type fakeSessionRepo struct {
	byID map[string]store.Session
}

func (f *fakeSessionRepo) Get(_ context.Context, id string) (store.Session, error) {
	s, ok := f.byID[id]
	if !ok {
		return store.Session{}, store.ErrSessionNotFound
	}
	return s, nil
}

func (f *fakeSessionRepo) Insert(context.Context, store.Session) error    { return nil }
func (f *fakeSessionRepo) List(context.Context) ([]store.Session, error)  { return nil, nil }
func (f *fakeSessionRepo) Delete(context.Context, string) error           { return nil }
func (f *fakeSessionRepo) UpdatePID(context.Context, string, int64) error { return nil }
func (f *fakeSessionRepo) MergeMetadata(context.Context, string, map[string]any) error {
	return nil
}

func (f *fakeSessionRepo) ListByProject(context.Context, string) ([]store.Session, error) {
	return nil, nil
}

func TestHandleAnnotationsDeliversFormattedMessage(t *testing.T) {
	provider := &recordingProvider{name: "zellij"}
	srv := New(Config{
		Sessions: &fakeSessionRepo{byID: map[string]store.Session{
			"ao-1": {ID: "ao-1", ZellijSession: "zellij-1"},
		}},
		DurabilityProviders: durabilityprovider.NewRegistry(provider),
	})

	body := `{"annotations":[{"id":"a1","comment":"increase contrast","element":"button","elementPath":"button.cta","severity":"important","intent":"change","reactComponents":"CtaButton"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/annotations/ao-1", strings.NewReader(body))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if len(provider.messages) != 1 {
		t.Fatalf("expected 1 delivered message, got %d", len(provider.messages))
	}
	if got := provider.sessions[0].ZellijSession; got != "zellij-1" {
		t.Errorf("delivered to zellij session %q, want %q", got, "zellij-1")
	}

	message := provider.messages[0]
	for _, want := range []string{"increase contrast", "button.cta", "CtaButton", "important/change"} {
		if !strings.Contains(message, want) {
			t.Errorf("message missing %q\n---\n%s", want, message)
		}
	}

	var resp map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["delivered"] != 1 {
		t.Errorf("delivered = %d, want 1", resp["delivered"])
	}
}

func TestHandleAnnotationsRejectsEmptyPayload(t *testing.T) {
	srv := New(Config{
		Sessions: &fakeSessionRepo{byID: map[string]store.Session{
			"ao-1": {ID: "ao-1", ZellijSession: "zellij-1"},
		}},
		DurabilityProviders: durabilityprovider.NewRegistry(&recordingProvider{name: "zellij"}),
	})

	req := httptest.NewRequest(http.MethodPost, "/api/annotations/ao-1", strings.NewReader(`{"annotations":[]}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHandleAnnotationsUnknownSession(t *testing.T) {
	srv := New(Config{
		Sessions:            &fakeSessionRepo{byID: map[string]store.Session{}},
		DurabilityProviders: durabilityprovider.NewRegistry(&recordingProvider{name: "zellij"}),
	})

	req := httptest.NewRequest(http.MethodPost, "/api/annotations/missing", strings.NewReader(`{"annotations":[{"comment":"x"}]}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404, body = %s", rec.Code, rec.Body.String())
	}
}
