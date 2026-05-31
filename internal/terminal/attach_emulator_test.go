package terminal

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	uv "github.com/charmbracelet/ultraviolet"
	vt "github.com/charmbracelet/x/vt"
	"github.com/coder/websocket"
)

// These tests exercise Option B — the shared process + server-side emulator +
// faithful snapshot strategy. WebSocket-level tests select StrategyEmulator
// explicitly via ManagerConfig. The lower-level tests drive sessionTerminal /
// the emulator directly and so are strategy-agnostic.

// TestEmulatorDrainsQueryResponsesWithoutWedging is a regression test for a
// deadlock that left the terminal panel permanently blank. The vt emulator
// answers a program's own terminal queries (here a DSR cursor-position
// request) by writing the reply into an UNBUFFERED response pipe. broadcast
// feeds the emulator while holding t.mu, so if nothing drains that pipe the
// write blocks forever and every later client attach hangs in addClient on
// t.mu — exactly what wedged the live backend (zellij probes OSC 11 on attach).
//
// With pumpResponses draining the pipe, the reply reaches the program and the
// per-terminal lock stays free.
func TestEmulatorDrainsQueryResponsesWithoutWedging(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{
		AttachStrategy: StrategyEmulator,
		Runner:         runner,
	})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	cfg := SessionConfig{ID: "session-1", InitialCols: 80, InitialRows: 24}
	term, err := manager.ensure(cfg)
	if err != nil {
		t.Fatalf("ensure terminal: %v", err)
	}
	process := waitForLastProcess(t, runner)

	// The program asks the terminal to report the cursor position (DSR 6n).
	// The emulator always answers this, writing the reply to its response pipe.
	process.emit([]byte("\x1b[6n"))

	// The reply must be forwarded back to the program. If the pipe is not
	// drained, broadcast is blocked inside emulator.Write while holding t.mu
	// and this reply never appears.
	waitForProcessWritten(t, process, "\x1b[")

	// And the per-terminal lock must still be free: a fresh client can attach
	// and receive a snapshot. Run it under a timeout so the regression fails
	// loudly (deadlock) instead of hanging the whole suite.
	done := make(chan []byte, 1)
	go func() {
		client := make(chan []byte, clientBufferChunks)
		replay := term.addClient(client)
		term.removeClient(client)
		done <- replay
	}()

	select {
	case replay := <-done:
		if len(replay) == 0 {
			t.Fatal("expected a non-empty snapshot for the attaching client")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("addClient blocked: t.mu held by a stuck emulator response write (regression)")
	}
}

func TestManagerReusesSessionTerminalAndReplaysSnapshot(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{
		AttachStrategy: StrategyEmulator,
		Runner:         runner,
	})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	cfg := SessionConfig{ID: "session-1", InitialCols: 80, InitialRows: 24}
	term, err := manager.ensure(cfg)
	if err != nil {
		t.Fatalf("ensure terminal: %v", err)
	}
	process := runner.lastProcess()
	process.emit([]byte("hello\n"))
	waitForScreenContains(t, term, "hello")

	reused, err := manager.ensure(cfg)
	if err != nil {
		t.Fatalf("ensure terminal again: %v", err)
	}
	if reused != term {
		t.Fatal("expected manager to reuse live terminal")
	}
	if runner.startCount() != 1 {
		t.Fatalf("expected one terminal start, got %d", runner.startCount())
	}

	client := make(chan []byte, 1)
	replay := term.addClient(client)
	t.Cleanup(func() {
		term.removeClient(client)
	})

	// The replay is now a faithful repaint snapshot, not the raw byte tail.
	if string(replay) == "hello\n" {
		t.Fatal("expected a repaint snapshot, got the raw byte tail")
	}
	if replayed := renderSnapshot(t, replay, 80, 24); !strings.Contains(replayed, "hello") {
		t.Fatalf("expected snapshot to reconstruct screen text, got %q", replayed)
	}
}

func TestSessionTerminalHandlesResizeAndInput(t *testing.T) {
	process := newFakeProcess()
	term := newSessionTerminal(SessionConfig{ID: "session-1"}, process, 1024, 0)

	if err := term.handleControl([]byte(`{"type":"resize","cols":120,"rows":40}`)); err != nil {
		t.Fatalf("resize control failed: %v", err)
	}
	if process.cols != 120 || process.rows != 40 {
		t.Fatalf("expected resize 120x40, got %dx%d", process.cols, process.rows)
	}

	if _, err := process.Write([]byte("printf hi\n")); err != nil {
		t.Fatalf("write input: %v", err)
	}
	if got := process.written.String(); got != "printf hi\n" {
		t.Fatalf("expected process input, got %q", got)
	}
}

func TestManagerStartsNewTerminalAfterExit(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyEmulator, Runner: runner})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	cfg := SessionConfig{ID: "session-1"}
	first, err := manager.ensure(cfg)
	if err != nil {
		t.Fatalf("ensure first terminal: %v", err)
	}
	runner.lastProcess().finish(io.EOF)
	waitForDone(t, first.done)

	second, err := manager.ensure(cfg)
	if err != nil {
		t.Fatalf("ensure second terminal: %v", err)
	}
	if second == first {
		t.Fatal("expected a new terminal after exit")
	}
	if runner.startCount() != 2 {
		t.Fatalf("expected two terminal starts, got %d", runner.startCount())
	}
}

func TestManagerReadsPTYRunnerOutput(t *testing.T) {
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyEmulator})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	term, err := manager.ensure(SessionConfig{ID: "session-1", InitialCols: 80, InitialRows: 24})
	if err != nil {
		t.Fatalf("ensure terminal: %v", err)
	}

	command, marker := terminalSmokeCommand("better-ao-manager-pty-smoke")
	if _, err := term.process.Write([]byte(command)); err != nil {
		t.Fatalf("write command: %v", err)
	}

	waitForScreenContains(t, term, marker)
}

func TestSessionTerminalReadsPTYRunnerOutput(t *testing.T) {
	process, err := NewPTYRunner().Start(context.Background(), StartOptions{Cols: 80, Rows: 24})
	if err != nil {
		t.Fatalf("start pty runner: %v", err)
	}

	term := newSessionTerminal(SessionConfig{ID: "session-1"}, process, 4096, 0)
	t.Cleanup(func() {
		if err := term.close(); err != nil {
			t.Fatalf("close terminal: %v", err)
		}
	})
	go term.readLoop()

	command, marker := terminalSmokeCommand("better-ao-session-pty-smoke")
	if _, err := term.process.Write([]byte(command)); err != nil {
		t.Fatalf("write command: %v", err)
	}

	waitForScreenContains(t, term, marker)
}

func TestEmulatorServeWSWithPTYRunner(t *testing.T) {
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyEmulator})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manager.ServeWS(w, r, SessionConfig{
			ID:          "session-1",
			InitialCols: 80,
			InitialRows: 24,
		})
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	command, marker := terminalSmokeCommand("better-ao-emulator-ws-smoke")
	if err := conn.Write(ctx, websocket.MessageBinary, []byte(command)); err != nil {
		t.Fatalf("write command: %v", err)
	}

	var output strings.Builder
	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read output: %v; screen=%q output=%q", err, managerScreen(manager, "session-1"), output.String())
		}
		output.Write(payload)
		if strings.Contains(output.String(), marker) {
			return
		}
	}
}

func TestEmulatorServeWSPipesProcessIO(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyEmulator, Runner: runner})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manager.ServeWS(w, r, SessionConfig{ID: "session-1"})
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	if err := conn.Write(ctx, websocket.MessageBinary, []byte("input")); err != nil {
		t.Fatalf("write input: %v", err)
	}

	process := waitForLastProcess(t, runner)
	waitForProcessInput(t, process, "input")

	process.emit([]byte("output"))

	// Each client first receives a repaint snapshot, then the live stream. Drive
	// a client-side emulator with everything we read and assert the live output
	// lands on the reconstructed screen.
	client := vt.NewSafeEmulator(defaultCols, defaultRows)
	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read output: %v; client screen=%q", err, client.String())
		}
		if _, err := client.Write(payload); err != nil {
			t.Fatalf("write payload into client emulator: %v", err)
		}
		if strings.Contains(client.String(), "output") {
			return
		}
	}
}

func TestEmulatorServeWSAppliesResizeControlMessages(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyEmulator, Runner: runner})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manager.ServeWS(w, r, SessionConfig{ID: "session-1"})
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"resize","cols":132,"rows":43}`)); err != nil {
		t.Fatalf("write resize control: %v", err)
	}

	waitForProcessSize(t, waitForLastProcess(t, runner), 132, 43)
}

func TestEmulatorServeWSClosesAttachProcessWhenClientDisconnects(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyEmulator, IdleTimeout: -1, Runner: runner})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manager.ServeWS(w, r, SessionConfig{ID: "session-1"})
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}

	firstProcess := waitForLastProcess(t, runner)
	if err := conn.Close(websocket.StatusNormalClosure, "test disconnect"); err != nil {
		t.Fatalf("close websocket: %v", err)
	}
	waitForProcessClosed(t, firstProcess)
	waitForManagerSessionRemoved(t, manager, "session-1")

	conn, _, err = websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("redial terminal websocket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	waitForStartCount(t, runner, 2)
}

func TestEmulatorServeWSReusesIdleAttachProcessAndReplaysSnapshot(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{
		AttachStrategy: StrategyEmulator,
		IdleTimeout:    time.Minute,
		Runner:         runner,
	})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manager.ServeWS(w, r, SessionConfig{ID: "session-1"})
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}

	process := waitForLastProcess(t, runner)
	process.emit([]byte("before disconnect\n"))

	// The first client receives an (empty) repaint snapshot, then the live
	// stream. Drain into a client-side emulator until the live output appears.
	firstClient := vt.NewSafeEmulator(defaultCols, defaultRows)
	for !strings.Contains(firstClient.String(), "before disconnect") {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read initial output: %v; client screen=%q", err, firstClient.String())
		}
		if _, err := firstClient.Write(payload); err != nil {
			t.Fatalf("write payload into client emulator: %v", err)
		}
	}

	if err := conn.Close(websocket.StatusNormalClosure, "test reconnect"); err != nil {
		t.Fatalf("close websocket: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	if processClosed(process) {
		t.Fatal("expected attach process to stay alive during idle reconnect grace")
	}

	reconnected, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("redial terminal websocket: %v", err)
	}
	defer reconnected.Close(websocket.StatusNormalClosure, "")

	if runner.startCount() != 1 {
		t.Fatalf("expected reconnect to reuse attach process, got %d starts", runner.startCount())
	}

	// The reconnecting client gets a faithful repaint snapshot, not the raw byte
	// tail. Rendering it into a fresh emulator must reproduce the screen content.
	_, payload, err := reconnected.Read(ctx)
	if err != nil {
		t.Fatalf("read replayed output: %v", err)
	}
	if string(payload) == "before disconnect\n" {
		t.Fatal("expected a repaint snapshot, got the raw byte tail")
	}
	if replayed := renderSnapshot(t, payload, defaultCols, defaultRows); !strings.Contains(replayed, "before disconnect") {
		t.Fatalf("expected snapshot to reconstruct screen text, got %q", replayed)
	}
}

func TestEmulatorServeWSClosesIdleAttachProcessAfterGrace(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{
		AttachStrategy: StrategyEmulator,
		IdleTimeout:    25 * time.Millisecond,
		Runner:         runner,
	})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manager.ServeWS(w, r, SessionConfig{ID: "session-1"})
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}

	process := waitForLastProcess(t, runner)
	if err := conn.Close(websocket.StatusNormalClosure, "test idle timeout"); err != nil {
		t.Fatalf("close websocket: %v", err)
	}

	waitForProcessClosed(t, process)
	waitForManagerSessionRemoved(t, manager, "session-1")
}

// --- Option B-only helpers -------------------------------------------------

func managerScreen(manager *Manager, sessionID string) string {
	manager.mu.Lock()
	term := manager.emulator[sessionID]
	manager.mu.Unlock()
	if term == nil {
		return ""
	}

	return terminalScreen(term)
}

func processClosed(process *fakeProcess) bool {
	process.mu.Lock()
	defer process.mu.Unlock()
	return process.closed
}

func waitForDone(t *testing.T, done <-chan struct{}) {
	t.Helper()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for terminal to exit")
	}
}

func waitForScreenContains(t *testing.T, term *sessionTerminal, expected string) {
	t.Helper()

	if !waitForScreenContaining(term, expected, 5*time.Second) {
		t.Fatalf("timed out waiting for screen containing %q, got %q", expected, terminalScreen(term))
	}
}

func waitForScreenContaining(term *sessionTerminal, expected string, timeout time.Duration) bool {
	deadline := time.After(timeout)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		if strings.Contains(terminalScreen(term), expected) {
			return true
		}

		select {
		case <-deadline:
			return false
		case <-tick.C:
		}
	}
}

// terminalScreen returns the emulator's current screen as plain text, including
// any scrolled-off history, so assertions can match output regardless of which
// row it currently occupies in the viewport.
func terminalScreen(term *sessionTerminal) string {
	term.mu.Lock()
	defer term.mu.Unlock()

	var b strings.Builder
	if sb := term.emulator.Scrollback(); sb != nil {
		for _, line := range sb.Lines() {
			b.WriteString(uv.Line(line).String())
			b.WriteByte('\n')
		}
	}
	b.WriteString(term.emulator.String())
	return b.String()
}

// renderSnapshot feeds a snapshot payload into a fresh emulator of the given
// size and returns the resulting plain-text screen. This is how the tests prove
// fidelity: a snapshot reconstructs the screen when written to a clean terminal.
func renderSnapshot(t *testing.T, snapshot []byte, cols, rows int) string {
	t.Helper()
	em := vt.NewSafeEmulator(cols, rows)
	if _, err := em.Write(snapshot); err != nil {
		t.Fatalf("write snapshot into emulator: %v", err)
	}
	return em.String()
}
