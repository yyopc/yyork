package durabilityprovider

import (
	"context"
	"testing"

	"github.com/yyovil/better-ao/internal/session"
)

type fakeProvider struct {
	name         string
	sentSessions []session.Session
	sentMessages []string
}

func (f *fakeProvider) Name() string { return f.name }

func (f *fakeProvider) SendMessage(_ context.Context, sess session.Session, message string) error {
	f.sentSessions = append(f.sentSessions, sess)
	f.sentMessages = append(f.sentMessages, message)
	return nil
}

func TestSendToSessionResolvesProjectScopedDuplicateIDs(t *testing.T) {
	fake := &fakeProvider{name: "zellij"}
	registry := NewRegistry(fake)

	ws := session.Workspace{
		Sessions: []session.Session{
			{ID: "ao-1", Project: "p1", ZellijSession: "zellij-a"},
			{ID: "ao-1", Project: "p2", ZellijSession: "zellij-b"},
		},
	}

	if err := SendToSession(context.Background(), registry, ws, "p2", "ao-1", "feedback"); err != nil {
		t.Fatalf("SendToSession returned error: %v", err)
	}

	if len(fake.sentMessages) != 1 {
		t.Fatalf("expected 1 delivery, got %d", len(fake.sentMessages))
	}
	if fake.sentMessages[0] != "feedback" {
		t.Errorf("message = %q, want %q", fake.sentMessages[0], "feedback")
	}
	if got := fake.sentSessions[0].ZellijSession; got != "zellij-b" {
		t.Errorf("resolved zellij session = %q, want %q (project-scoped)", got, "zellij-b")
	}
}

func TestSendToSessionUnknownSession(t *testing.T) {
	registry := NewRegistry(&fakeProvider{name: "zellij"})
	ws := session.Workspace{}

	err := SendToSession(context.Background(), registry, ws, "p1", "missing", "feedback")
	if err == nil {
		t.Fatal("expected an error for an unknown session")
	}
}

func TestSendToSessionNoRuntime(t *testing.T) {
	registry := NewRegistry(&fakeProvider{name: "zellij"})
	ws := session.Workspace{
		Sessions: []session.Session{{ID: "ao-1", Project: "p1"}},
	}

	err := SendToSession(context.Background(), registry, ws, "p1", "ao-1", "feedback")
	if err == nil {
		t.Fatal("expected an error when the session has no durable runtime")
	}
}
