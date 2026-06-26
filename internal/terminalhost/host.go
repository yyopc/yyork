package terminalhost

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	uv "github.com/charmbracelet/ultraviolet"
	vt "github.com/charmbracelet/x/vt"
	"github.com/yyopc/yyork/internal/terminal"
	"github.com/yyopc/yyork/internal/terminalipc"
)

const (
	defaultCols = 100
	defaultRows = 30
	// Keep this aligned with the browser xterm scrollback. This is still a
	// bounded in-memory repaint model, but 10k rows was too small for long
	// worker conversations.
	defaultScrollback = 100000
	clientQueueSize   = 64
)

type Options struct {
	Command []string
	CWD     string
	Cols    int
	// RingBytes is deprecated and ignored. The host no longer replays raw PTY
	// history because those bytes can encode terminal geometry from an older
	// browser size.
	RingBytes int
	Rows      int
	Session   string
	Socket    string
}

type Host struct {
	clients    map[chan []byte]struct{}
	cols       int
	done       chan struct{}
	doneErr    error
	emulator   *vt.SafeEmulator
	emulatorOK bool
	listener   net.Listener
	mu         sync.Mutex
	process    terminal.Process
	rows       int
}

func Run(ctx context.Context, opts Options) error {
	if strings.TrimSpace(opts.Session) == "" {
		return errors.New("terminal host session is required")
	}
	if strings.TrimSpace(opts.Socket) == "" {
		socketPath, err := terminalipc.SocketPath(opts.Session)
		if err != nil {
			return err
		}
		opts.Socket = socketPath
	}
	if len(opts.Command) == 0 {
		return errors.New("terminal host command is required")
	}
	if opts.Cols <= 0 {
		opts.Cols = defaultCols
	}
	if opts.Rows <= 0 {
		opts.Rows = defaultRows
	}
	if err := terminalipc.EnsureSocketDir(opts.Socket); err != nil {
		return err
	}
	_ = os.Remove(opts.Socket)
	listener, err := net.Listen("unix", opts.Socket)
	if err != nil {
		return fmt.Errorf("terminal host listen: %w", err)
	}
	defer func() {
		_ = listener.Close()
		_ = os.Remove(opts.Socket)
	}()

	process, err := terminal.NewPTYRunner().Start(ctx, terminal.StartOptions{
		Command: opts.Command,
		CWD:     opts.CWD,
		Cols:    opts.Cols,
		Rows:    opts.Rows,
	})
	if err != nil {
		return fmt.Errorf("terminal host start pty: %w", err)
	}

	host := newHost(listener, process, opts.Cols, opts.Rows)
	go host.readLoop()
	go host.pumpResponses()
	go func() {
		<-ctx.Done()
		host.finish(ctx.Err())
	}()

	return host.acceptLoop()
}

func newHost(listener net.Listener, process terminal.Process, cols int, rows int) *Host {
	if cols <= 0 {
		cols = defaultCols
	}
	if rows <= 0 {
		rows = defaultRows
	}
	emulator := vt.NewSafeEmulator(cols, rows)
	emulator.SetScrollbackSize(defaultScrollback)
	return &Host{
		clients:    make(map[chan []byte]struct{}),
		cols:       cols,
		done:       make(chan struct{}),
		emulator:   emulator,
		emulatorOK: true,
		listener:   listener,
		process:    process,
		rows:       rows,
	}
}

func (h *Host) acceptLoop() error {
	for {
		conn, err := h.listener.Accept()
		if err != nil {
			select {
			case <-h.done:
				return h.doneErr
			default:
				return fmt.Errorf("terminal host accept: %w", err)
			}
		}
		go h.handleConn(conn)
	}
}

func (h *Host) readLoop() {
	buf := make([]byte, 32*1024)
	for {
		n, readErr := h.process.Read(buf)
		if n > 0 {
			h.broadcast(buf[:n])
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				readErr = nil
			}
			waitErr := h.process.Wait()
			h.finish(errors.Join(readErr, waitErr))
			return
		}
	}
}

func (h *Host) handleConn(conn net.Conn) {
	defer conn.Close()

	client := make(chan []byte, clientQueueSize)
	replay := h.addClient(client)
	defer h.removeClient(client)

	writerDone := make(chan error, 1)
	go func() {
		writerDone <- h.writeToConn(conn, replay, client)
	}()

	readErr := h.readFromConn(conn)
	_ = conn.SetDeadline(time.Now())
	select {
	case <-writerDone:
	case <-time.After(time.Second):
	}
	_ = readErr
}

func (h *Host) writeToConn(conn net.Conn, replay []byte, client <-chan []byte) error {
	if len(replay) > 0 {
		if err := terminalipc.WriteFrame(conn, terminalipc.FrameOutput, replay); err != nil {
			return err
		}
	}
	for {
		select {
		case chunk, ok := <-client:
			if !ok {
				return nil
			}
			if err := terminalipc.WriteFrame(conn, terminalipc.FrameOutput, chunk); err != nil {
				return err
			}
		case <-h.done:
			return nil
		}
	}
}

func (h *Host) readFromConn(conn net.Conn) error {
	for {
		frameType, payload, err := terminalipc.ReadFrame(conn)
		if err != nil {
			return err
		}
		switch frameType {
		case terminalipc.FrameInput:
			if len(payload) == 0 {
				continue
			}
			if _, err := h.process.Write(payload); err != nil {
				return err
			}
		case terminalipc.FrameResize:
			cols, rows, err := terminalipc.DecodeResize(payload)
			if err != nil {
				return err
			}
			if err := h.resize(cols, rows); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unknown terminal host frame type %d", frameType)
		}
	}
}

func (h *Host) pumpResponses() {
	h.mu.Lock()
	emulator := h.emulator
	h.mu.Unlock()
	if emulator == nil {
		return
	}
	_, _ = io.Copy(h.process, emulator)
}

func (h *Host) resize(cols int, rows int) error {
	h.mu.Lock()
	h.cols = cols
	h.rows = rows
	if h.emulator != nil && h.emulatorOK {
		h.resizeEmulatorLocked(cols, rows)
	}
	h.mu.Unlock()
	return h.process.Resize(cols, rows)
}

func (h *Host) addClient(client chan []byte) []byte {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = struct{}{}
	return h.snapshotLocked()
}

func (h *Host) removeClient(client chan []byte) {
	h.mu.Lock()
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client)
	}
	h.mu.Unlock()
}

func (h *Host) broadcast(chunk []byte) {
	h.mu.Lock()
	copied := append([]byte(nil), chunk...)
	h.feedEmulatorLocked(copied)
	for client := range h.clients {
		select {
		case client <- copied:
		default:
			delete(h.clients, client)
			close(client)
		}
	}
	h.mu.Unlock()
}

func (h *Host) resizeEmulatorLocked(cols int, rows int) {
	defer func() {
		if recover() != nil {
			h.disableEmulatorLocked()
		}
	}()
	h.emulator.Resize(cols, rows)
}

func (h *Host) feedEmulatorLocked(chunk []byte) {
	if h.emulator == nil || !h.emulatorOK || len(chunk) == 0 {
		return
	}
	defer func() {
		if recover() != nil {
			h.disableEmulatorLocked()
		}
	}()
	_, _ = h.emulator.Write(chunk)
}

func (h *Host) disableEmulatorLocked() {
	if h.emulator != nil {
		_ = h.emulator.Close()
	}
	h.emulator = nil
	h.emulatorOK = false
}

// snapshotLocked returns a bounded repaint of the terminal-host screen model.
// It is not raw PTY history: it reconstructs the current screen, buffer mode,
// cursor, attributes, and normal-screen scrollback for a freshly attached
// browser terminal.
func (h *Host) snapshotLocked() []byte {
	if h.emulator == nil || !h.emulatorOK {
		return nil
	}

	var b strings.Builder
	width := h.emulator.Width()
	altScreen := h.emulator.IsAltScreen()

	b.WriteString("\x1b[0m")
	if altScreen {
		b.WriteString("\x1b[?1049h")
	} else {
		b.WriteString("\x1b[?1049l")
		if sb := h.emulator.Scrollback(); sb != nil {
			for _, line := range sb.Lines() {
				b.WriteString(uv.Line(line).Render())
				b.WriteString("\r\n")
			}
		}
	}

	b.WriteString("\x1b[2J")
	rows := strings.Split(h.emulator.Render(), "\n")
	for y, row := range rows {
		fmt.Fprintf(&b, "\x1b[%d;1H", y+1)
		if width > 0 {
			b.WriteString("\x1b[K")
		}
		b.WriteString(row)
	}

	b.WriteString("\x1b[0m")
	pos := h.emulator.CursorPosition()
	fmt.Fprintf(&b, "\x1b[%d;%dH", pos.Y+1, pos.X+1)
	return []byte(b.String())
}

func (h *Host) finish(err error) {
	h.mu.Lock()
	select {
	case <-h.done:
		h.mu.Unlock()
		return
	default:
	}
	h.doneErr = err
	close(h.done)
	for client := range h.clients {
		close(client)
		delete(h.clients, client)
	}
	if h.emulator != nil {
		_ = h.emulator.Close()
		h.emulator = nil
	}
	h.mu.Unlock()

	if h.listener != nil {
		_ = h.listener.Close()
	}
	_ = h.process.Close()
}
