package terminal

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/yyopc/yyork/internal/terminalipc"
)

// These tests exercise the direct attach strategy. Some still select the legacy
// StrategyPerClient alias explicitly to prove old config values continue to use
// the direct pipe.

// TestClientAttachHandlesResizeAndInput verifies that resize control messages
// and binary input route to the per-connection attach process.
func TestClientAttachHandlesResizeAndInput(t *testing.T) {
	process := newFakeProcess()
	client := newClientAttach(process)

	if err := client.handleControl([]byte(`{"type":"resize","cols":120,"rows":40}`)); err != nil {
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

// TestClientAttachRejectsUnknownControl ensures malformed/unknown control
// messages surface an error instead of being silently dropped.
func TestClientAttachRejectsUnknownControl(t *testing.T) {
	client := newClientAttach(newFakeProcess())

	if err := client.handleControl([]byte(`{"type":"nope"}`)); err == nil {
		t.Fatal("expected error for unknown control message")
	}
	if err := client.handleControl([]byte(`{"type":"resize","cols":0,"rows":0}`)); err == nil {
		t.Fatal("expected error for non-positive resize dimensions")
	}
	if err := client.handleControl([]byte(`not json`)); err == nil {
		t.Fatal("expected error for malformed control payload")
	}
}

// TestManagerAcquireReleaseTracksSessionsPerClient verifies the logical
// session bookkeeping: a session entry exists while any client is attached and
// is removed once the last client releases (idleDelay <= 0 removes eagerly).
// Crucially this is pure bookkeeping — no process is started here.
func TestManagerAcquireReleaseTracksSessionsPerClient(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, IdleTimeout: -1, Runner: runner})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	const key = "session-1"

	first := manager.acquire(key)
	second := manager.acquire(key)
	if first != second {
		t.Fatal("expected concurrent clients to share the same logical session")
	}
	if got := managerSessionClients(manager, key); got != 2 {
		t.Fatalf("expected 2 tracked clients, got %d", got)
	}
	if runner.startCount() != 0 {
		t.Fatalf("acquire must not start any process, got %d starts", runner.startCount())
	}

	manager.release(key, first)
	if got := managerSessionClients(manager, key); got != 1 {
		t.Fatalf("expected 1 tracked client after one release, got %d", got)
	}
	if !managerHasSession(manager, key) {
		t.Fatal("session must stay alive while a client remains")
	}

	manager.release(key, second)
	if managerHasSession(manager, key) {
		t.Fatal("expected logical session removed after last client released")
	}
}

// TestManagerReleaseKeepsSessionDuringIdleGrace verifies that with a positive
// idle timeout, releasing the last client does not immediately drop the
// logical session — it lingers for the grace window so a quick reconnect
// reuses the same bookkeeping entry.
func TestManagerReleaseKeepsSessionDuringIdleGrace(t *testing.T) {
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, IdleTimeout: time.Minute})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	const key = "session-1"
	sess := manager.acquire(key)
	manager.release(key, sess)

	if !managerHasSession(manager, key) {
		t.Fatal("session should linger during idle grace window")
	}

	// A reconnect within the grace window cancels the idle timer and reuses
	// the same session struct.
	reused := manager.acquire(key)
	if reused != sess {
		t.Fatal("expected reconnect within grace to reuse the logical session")
	}
	if reused.idleTimer != nil {
		t.Fatal("expected idle timer cleared on reconnect")
	}
}

// TestPerClientServeWSWithPTYRunner is an end-to-end smoke test: ServeWS spawns
// a real PTY process (a plain shell, since there is no zellij binary in this
// env), pipes input in, and streams the PTY output back over the WebSocket.
func TestPerClientServeWSWithPTYRunner(t *testing.T) {
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient})
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

	command, marker := terminalSmokeCommand("yyork-perclient-ws-smoke")
	if err := conn.Write(ctx, websocket.MessageBinary, []byte(command)); err != nil {
		t.Fatalf("write command: %v", err)
	}

	var output strings.Builder
	for {
		_, payload, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read output: %v; output=%q", err, output.String())
		}
		output.Write(payload)
		if strings.Contains(output.String(), marker) {
			return
		}
	}
}

// TestPerClientServeWSPipesProcessIO verifies the thin pipe: input written to
// the socket reaches the connection's own process, and process output reaches
// the socket. With the fake runner we can assert against the exact process.
func TestPerClientServeWSPipesProcessIO(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, Runner: runner})
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
	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if string(payload) != "output" {
		t.Fatalf("expected output, got %q", string(payload))
	}
}

func TestDirectServeWSUsesTerminalHostSocket(t *testing.T) {
	home, err := os.MkdirTemp("/tmp", "yyh-*")
	if err != nil {
		t.Fatalf("create short test home: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(home) })
	t.Setenv("HOME", home)

	socketPath, err := terminalipc.SocketPath("zellij-session-1")
	if err != nil {
		t.Fatalf("terminal host socket path: %v", err)
	}
	if err := terminalipc.EnsureSocketDir(socketPath); err != nil {
		t.Fatalf("create terminal host socket dir: %v", err)
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("listen terminal host socket: %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	type hostFrame struct {
		payload []byte
		typ     byte
	}
	frames := make(chan hostFrame, 4)
	hostDone := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			hostDone <- err
			return
		}
		defer conn.Close()
		for {
			frameType, payload, err := terminalipc.ReadFrame(conn)
			if err != nil {
				hostDone <- nil
				return
			}
			frames <- hostFrame{payload: payload, typ: frameType}
			if frameType == terminalipc.FrameResize {
				if err := terminalipc.WriteFrame(conn, terminalipc.FrameOutput, []byte("host-ready")); err != nil {
					hostDone <- err
					return
				}
			}
		}
	}()

	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{Runner: runner})
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Fatalf("close manager: %v", err)
		}
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		manager.ServeWS(w, r, SessionConfig{
			ID:            "session-1",
			InitialCols:   111,
			InitialRows:   37,
			ZellijSession: "zellij-session-1",
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

	select {
	case frame := <-frames:
		if frame.typ != terminalipc.FrameResize {
			t.Fatalf("expected initial resize frame, got type %d", frame.typ)
		}
		cols, rows, err := terminalipc.DecodeResize(frame.payload)
		if err != nil {
			t.Fatalf("decode initial resize: %v", err)
		}
		if cols != 111 || rows != 37 {
			t.Fatalf("expected initial resize 111x37, got %dx%d", cols, rows)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for initial terminal-host resize")
	}

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read terminal-host output: %v", err)
	}
	if string(payload) != "host-ready" {
		t.Fatalf("expected terminal-host output, got %q", string(payload))
	}
	if got := runner.startCount(); got != 0 {
		t.Fatalf("expected terminal-host socket to bypass runner, got %d runner starts", got)
	}
}

// TestPerClientServeWSSpawnsOwnAttachProcessPerConnection covers the fallback
// runner path: when there is no terminal-host socket, every WebSocket connection
// gets its own process and is driven independently.
func TestPerClientServeWSSpawnsOwnAttachProcessPerConnection(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, Runner: runner})
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

	connA, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial first websocket: %v", err)
	}
	defer connA.Close(websocket.StatusNormalClosure, "")
	if err := connA.Write(ctx, websocket.MessageBinary, []byte("A")); err != nil {
		t.Fatalf("write A: %v", err)
	}
	waitForStartCount(t, runner, 1)
	processA := runner.lastProcess()
	waitForProcessInput(t, processA, "A")

	connB, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial second websocket: %v", err)
	}
	defer connB.Close(websocket.StatusNormalClosure, "")
	if err := connB.Write(ctx, websocket.MessageBinary, []byte("B")); err != nil {
		t.Fatalf("write B: %v", err)
	}
	waitForStartCount(t, runner, 2)
	processB := runner.lastProcess()
	waitForProcessInput(t, processB, "B")

	if processA == processB {
		t.Fatal("expected each connection to get its own attach process")
	}
	// Input is routed per-connection: A's process saw only "A", B's only "B".
	if got := processInput(processA); got != "A" {
		t.Fatalf("expected process A input %q, got %q", "A", got)
	}
	if got := processInput(processB); got != "B" {
		t.Fatalf("expected process B input %q, got %q", "B", got)
	}
}

// TestPerClientServeWSNoRawByteReplayOnAttach verifies there is no replay
// buffer. A connection only ever receives bytes emitted by ITS OWN attach
// process after attach — never bytes from a prior connection's process.
func TestPerClientServeWSNoRawByteReplayOnAttach(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, IdleTimeout: time.Minute, Runner: runner})
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

	// First connection: its process emits output, then it disconnects.
	first, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial first websocket: %v", err)
	}
	firstProcess := waitForLastProcess(t, runner)
	firstProcess.emit([]byte("history-from-first\n"))
	if _, payload, err := first.Read(ctx); err != nil {
		t.Fatalf("read first output: %v", err)
	} else if string(payload) != "history-from-first\n" {
		t.Fatalf("expected first connection to see its own output, got %q", string(payload))
	}
	if err := first.Close(websocket.StatusNormalClosure, "done"); err != nil {
		t.Fatalf("close first websocket: %v", err)
	}

	// Second connection: a brand new fallback process. It must NOT receive the
	// first process's bytes replayed. Any repaint must arrive as fresh output
	// from the current process/host connection.
	second, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("dial second websocket: %v", err)
	}
	defer second.Close(websocket.StatusNormalClosure, "")
	secondProcess := waitForDistinctLastProcess(t, runner, firstProcess)

	secondProcess.emit([]byte("fresh-repaint\n"))
	_, payload, err := second.Read(ctx)
	if err != nil {
		t.Fatalf("read second output: %v", err)
	}
	if string(payload) != "fresh-repaint\n" {
		t.Fatalf("expected only the fresh per-client repaint, got %q (no replay allowed)", string(payload))
	}
	if strings.Contains(string(payload), "history-from-first") {
		t.Fatal("second connection must not receive replayed bytes from the first process")
	}
}

func TestPerClientServeWSAppliesResizeControlMessages(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, Runner: runner})
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

// TestPerClientServeWSClosesAttachProcessOnDisconnect verifies that closing the
// WebSocket tears down that connection's Process and removes the now-clientless
// logical session, and that a reconnect starts a fresh fallback process.
func TestPerClientServeWSClosesAttachProcessOnDisconnect(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, IdleTimeout: -1, Runner: runner})
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

// TestPerClientServeWSReconnectSpawnsFreshAttach confirms that reconnecting on
// the fallback path always produces a new process, even within an idle-grace
// window. The Manager only reuses bookkeeping.
func TestPerClientServeWSReconnectSpawnsFreshAttach(t *testing.T) {
	runner := &fakeRunner{}
	manager := NewManager(ManagerConfig{AttachStrategy: StrategyPerClient, IdleTimeout: time.Minute, Runner: runner})
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
	if err := conn.Close(websocket.StatusNormalClosure, "reconnect"); err != nil {
		t.Fatalf("close websocket: %v", err)
	}
	waitForProcessClosed(t, firstProcess)

	reconnected, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("redial terminal websocket: %v", err)
	}
	defer reconnected.Close(websocket.StatusNormalClosure, "")

	// A new fallback connection = a new process.
	waitForStartCount(t, runner, 2)
	secondProcess := runner.lastProcess()
	if secondProcess == firstProcess {
		t.Fatal("expected reconnect to spawn a fresh attach process")
	}

	// The logical session lingered through the grace window (idle timer set),
	// so the same bookkeeping entry is reused rather than recreated.
	if !managerHasSession(manager, "session-1") {
		t.Fatal("expected logical session to be live for the reconnected client")
	}
}

// --- Direct attach helpers --------------------------------------------------

func processInput(process *fakeProcess) string {
	process.mu.Lock()
	defer process.mu.Unlock()
	return process.written.String()
}

func waitForDistinctLastProcess(t *testing.T, runner *fakeRunner, prev *fakeProcess) *fakeProcess {
	t.Helper()

	deadline := time.After(time.Second)
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()

	for {
		if runner.startCount() >= 1 {
			if latest := runner.lastProcess(); latest != prev {
				return latest
			}
		}

		select {
		case <-deadline:
			t.Fatal("timed out waiting for a new attach process")
		case <-tick.C:
		}
	}
}

func managerSessionClients(manager *Manager, key string) int {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	sess := manager.perClient[key]
	if sess == nil {
		return 0
	}
	return sess.clients
}

func managerHasSession(manager *Manager, key string) bool {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	_, ok := manager.perClient[key]
	return ok
}
