package terminalhost

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	uv "github.com/charmbracelet/ultraviolet"
	vt "github.com/charmbracelet/x/vt"
	"github.com/yyopc/yyork/internal/terminalipc"
)

func TestHostStreamsPTYThroughSocket(t *testing.T) {
	socketDir, err := os.MkdirTemp("/tmp", "yyork-termhost-test-*")
	if err != nil {
		t.Fatalf("create socket dir: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(socketDir) })
	socketPath := filepath.Join(socketDir, "term.sock")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- Run(ctx, Options{
			Command: []string{"cat"},
			Cols:    80,
			Rows:    24,
			Session: "session-1",
			Socket:  socketPath,
		})
	}()

	conn := dialTestSocket(t, socketPath)
	defer conn.Close()

	if err := terminalipc.WriteFrame(conn, terminalipc.FrameInput, []byte("hello\n")); err != nil {
		t.Fatalf("write input frame: %v", err)
	}

	var output strings.Builder
	deadline := time.After(3 * time.Second)
	for !strings.Contains(output.String(), "hello") {
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for echoed PTY output, got %q", output.String())
		default:
		}
		frameType, payload, err := terminalipc.ReadFrame(conn)
		if err != nil {
			t.Fatalf("read output frame: %v", err)
		}
		if frameType != terminalipc.FrameOutput {
			t.Fatalf("frame type = %d, want output", frameType)
		}
		output.Write(payload)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil && err != context.Canceled {
			t.Fatalf("host returned error: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("host did not stop after context cancellation")
	}
}

func TestHostSnapshotReconstructsAltScreenOnAttach(t *testing.T) {
	const cols, rows = 40, 12
	host := newTestHost(cols, rows)
	t.Cleanup(func() { host.finish(nil) })

	host.broadcast([]byte(
		"\x1b[?1049h" +
			"\x1b[2J\x1b[H" +
			"\x1b[2;5H" +
			"agent ready" +
			"\x1b[6;1H" +
			"status: \x1b[33mrunning\x1b[0m" +
			"\x1b[9;14H",
	))

	client := make(chan []byte, 1)
	snapshot := host.addClient(client)
	defer host.removeClient(client)

	host.mu.Lock()
	wantScreen := host.emulator.String()
	wantRender := host.emulator.Render()
	wantCursor := host.emulator.CursorPosition()
	host.mu.Unlock()

	fresh := vt.NewSafeEmulator(cols, rows)
	if _, err := fresh.Write(snapshot); err != nil {
		t.Fatalf("write snapshot into fresh emulator: %v", err)
	}
	if got := fresh.String(); got != wantScreen {
		t.Fatalf("screen mismatch after snapshot replay:\nwant %q\ngot  %q", wantScreen, got)
	}
	if got := fresh.Render(); got != wantRender {
		t.Fatalf("render mismatch after snapshot replay:\nwant %q\ngot  %q", wantRender, got)
	}
	if !fresh.IsAltScreen() {
		t.Fatal("snapshot did not restore alternate screen mode")
	}
	if got := fresh.CursorPosition(); got != wantCursor {
		t.Fatalf("cursor mismatch after snapshot replay: want %+v got %+v", wantCursor, got)
	}
	if !strings.Contains(fresh.String(), "agent ready") || !strings.Contains(fresh.String(), "running") {
		t.Fatalf("snapshot missing expected content: %q", fresh.String())
	}
}

func TestHostSnapshotRetainsLongNormalScreenHistory(t *testing.T) {
	const cols, rows = 24, 5
	host := newTestHost(cols, rows)
	t.Cleanup(func() { host.finish(nil) })

	var output strings.Builder
	for i := 1; i <= 10_050; i++ {
		fmt.Fprintf(&output, "line-%05d\r\n", i)
	}
	host.broadcast([]byte(output.String()))

	client := make(chan []byte, 1)
	snapshot := host.addClient(client)
	defer host.removeClient(client)

	if !strings.Contains(string(snapshot), "line-00001") {
		t.Fatal("snapshot dropped the beginning of a 10,050-line transcript")
	}

	fresh := vt.NewSafeEmulator(cols, rows)
	fresh.SetScrollbackSize(defaultScrollback)
	if _, err := fresh.Write(snapshot); err != nil {
		t.Fatalf("write snapshot into fresh emulator: %v", err)
	}

	sb := fresh.Scrollback()
	if sb == nil || sb.Len() == 0 {
		t.Fatal("snapshot did not restore scrollback")
	}
	if got := uv.Line(sb.Lines()[0]).Render(); got != "line-00001" {
		t.Fatalf("oldest replayed scrollback line = %q, want line-00001", got)
	}
}

func TestHostResizeKeepsEmulatorAndPTYInLockstep(t *testing.T) {
	host := newTestHost(80, 24)
	t.Cleanup(func() { host.finish(nil) })

	if err := host.resize(111, 37); err != nil {
		t.Fatalf("resize host: %v", err)
	}

	host.mu.Lock()
	width := host.emulator.Width()
	height := host.emulator.Height()
	host.mu.Unlock()
	if width != 111 || height != 37 {
		t.Fatalf("emulator size = %dx%d, want 111x37", width, height)
	}

	process := host.process.(*fakeHostProcess)
	process.mu.Lock()
	cols, rows := process.cols, process.rows
	process.mu.Unlock()
	if cols != 111 || rows != 37 {
		t.Fatalf("process size = %dx%d, want 111x37", cols, rows)
	}
}

func TestHostVTFailureDoesNotCrashLiveStream(t *testing.T) {
	host := newTestHost(80, 39)
	t.Cleanup(func() { host.finish(nil) })

	client := make(chan []byte, 2)
	_ = host.addClient(client)
	defer host.removeClient(client)

	host.broadcast([]byte("\x1b[1;47r\x1b[1;1H\x1bM"))

	host.mu.Lock()
	emulatorOK := host.emulatorOK
	host.mu.Unlock()
	if emulatorOK {
		t.Fatal("expected invalid vt sequence to disable snapshots for this host")
	}

	select {
	case got := <-client:
		if string(got) != "\x1b[1;47r\x1b[1;1H\x1bM" {
			t.Fatalf("client got %q", string(got))
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for live bytes after vt failure")
	}
}

func dialTestSocket(t *testing.T, socketPath string) net.Conn {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		conn, err := net.Dial("unix", socketPath)
		if err == nil {
			return conn
		}
		lastErr = err
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("dial test socket: %v", lastErr)
	return nil
}

func newTestHost(cols int, rows int) *Host {
	return newHost(nil, &fakeHostProcess{}, cols, rows)
}

type fakeHostProcess struct {
	closed bool
	cols   int
	mu     sync.Mutex
	output bytes.Buffer
	rows   int
}

func (p *fakeHostProcess) Read(buf []byte) (int, error) {
	return 0, io.EOF
}

func (p *fakeHostProcess) Write(buf []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.output.Write(buf)
}

func (p *fakeHostProcess) Close() error {
	p.mu.Lock()
	p.closed = true
	p.mu.Unlock()
	return nil
}

func (p *fakeHostProcess) Resize(cols int, rows int) error {
	p.mu.Lock()
	p.cols = cols
	p.rows = rows
	p.mu.Unlock()
	return nil
}

func (p *fakeHostProcess) Wait() error {
	return nil
}
