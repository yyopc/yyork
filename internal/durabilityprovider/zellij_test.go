package durabilityprovider

import (
	"context"
	"errors"
	"net"
	"os"
	"testing"

	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/terminalipc"
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

func TestZellijProviderSendMessagePastesAndSubmitsWhenTerminalHostReachable(t *testing.T) {
	home, err := os.MkdirTemp("/tmp", "yyork-send-test-*")
	if err != nil {
		t.Fatalf("create short test home: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(home) })
	t.Setenv("HOME", home)
	socketPath, err := terminalipc.SocketPath("ao-1")
	if err != nil {
		t.Fatalf("terminal host socket path: %v", err)
	}
	if err := terminalipc.EnsureSocketDir(socketPath); err != nil {
		t.Fatalf("create terminal host socket dir: %v", err)
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("listen on terminal host socket: %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	provider := &ZellijProvider{
		path: "zellij",
		run: func(context.Context, string, ...string) error {
			return errors.New("zellij must not be used while terminal host is reachable")
		},
	}

	if err := provider.SendMessage(context.Background(), session.Session{ZellijSession: "ao-1"}, "hello"); err != nil {
		t.Fatalf("SendMessage returned error: %v", err)
	}

	conn, err := listener.Accept()
	if err != nil {
		t.Fatalf("accept terminal host connection: %v", err)
	}
	defer conn.Close()

	for i, want := range []string{"\x1b[200~hello\x1b[201~", "\r"} {
		frameType, payload, err := terminalipc.ReadFrame(conn)
		if err != nil {
			t.Fatalf("read terminal host frame %d: %v", i+1, err)
		}
		if frameType != terminalipc.FrameInput {
			t.Errorf("frame %d type = %d, want input", i+1, frameType)
		}
		if got := string(payload); got != want {
			t.Errorf("frame %d payload = %q, want %q", i+1, got, want)
		}
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
