package durabilityprovider

import (
	"context"
	"testing"

	"github.com/yyovil/better-ao/internal/session"
)

func TestZellijProviderSendMessagePastesAndSubmits(t *testing.T) {
	var calls [][]string
	provider := &ZellijProvider{
		path: "zellij",
		run: func(_ context.Context, name string, args ...string) error {
			calls = append(calls, append([]string{name}, args...))
			return nil
		},
	}

	err := provider.SendMessage(context.Background(), session.Session{ZellijSession: "ao-1"}, "hello\nworld\n")
	if err != nil {
		t.Fatalf("SendMessage returned error: %v", err)
	}

	if len(calls) != 2 {
		t.Fatalf("expected 2 zellij calls, got %d: %v", len(calls), calls)
	}

	wantPaste := []string{"zellij", "--session", "ao-1", "action", "paste", "--", "hello\nworld"}
	if !equalArgs(calls[0], wantPaste) {
		t.Errorf("paste call = %v, want %v", calls[0], wantPaste)
	}

	wantSubmit := []string{"zellij", "--session", "ao-1", "action", "send-keys", "Enter"}
	if !equalArgs(calls[1], wantSubmit) {
		t.Errorf("submit call = %v, want %v", calls[1], wantSubmit)
	}
}

func TestZellijProviderRequiresSessionName(t *testing.T) {
	provider := &ZellijProvider{
		path: "zellij",
		run:  func(context.Context, string, ...string) error { return nil },
	}

	if err := provider.SendMessage(context.Background(), session.Session{}, "hi"); err == nil {
		t.Fatal("expected an error when the session has no zellij session name")
	}
}

func TestZellijProviderRejectsEmptyMessage(t *testing.T) {
	provider := &ZellijProvider{
		path: "zellij",
		run:  func(context.Context, string, ...string) error { return nil },
	}

	if err := provider.SendMessage(context.Background(), session.Session{ZellijSession: "ao-1"}, "  \n"); err == nil {
		t.Fatal("expected an error for an empty message")
	}
}

func equalArgs(a, b []string) bool {
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
