package terminal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"

	uv "github.com/charmbracelet/ultraviolet"
	vt "github.com/charmbracelet/x/vt"
	"github.com/coder/websocket"
)

// Option B — shared process + server-side emulator + faithful snapshot.
//
// One SHARED `zellij attach` process per session feeds all PTY output into a
// `vt` emulator that maintains the authoritative live screen. On attach, a
// client receives a faithful repaint SNAPSHOT (alt-screen mode + grid + cursor
// + scrollback) instead of a raw byte tail, then streams live deltas.

// serveWSEmulator ensures the shared terminal exists for cfg, then attaches the
// connection to it.
func (m *Manager) serveWSEmulator(conn *websocket.Conn, cfg SessionConfig) {
	term, err := m.ensure(cfg)
	if err != nil {
		_ = conn.Close(websocket.StatusInternalError, err.Error())
		return
	}

	if err := term.attach(conn); err != nil && !isExpectedWebsocketClose(err) {
		slog.Debug("terminal websocket closed", "session_id", cfg.ID, "error", err)
	}
}

func (m *Manager) ensure(cfg SessionConfig) (*sessionTerminal, error) {
	if cfg.ID == "" {
		return nil, errors.New("terminal session id is required")
	}
	if err := m.ctx.Err(); err != nil {
		return nil, err
	}

	cfg = withDefaults(cfg)

	m.mu.Lock()
	key := terminalKey(cfg)
	current := m.emulator[key]
	if current != nil && !current.exited() {
		m.mu.Unlock()
		return current, nil
	}
	if current != nil {
		delete(m.emulator, key)
	}
	m.mu.Unlock()

	process, err := m.runner.Start(m.ctx, StartOptions{
		Command: cfg.Command,
		CWD:     cfg.CWD,
		Cols:    cfg.InitialCols,
		Env:     cfg.Env,
		Rows:    cfg.InitialRows,
	})
	if err != nil {
		return nil, fmt.Errorf("start terminal: %w", err)
	}

	term := newSessionTerminal(cfg, process, m.scrollback, m.idleDelay)

	m.mu.Lock()
	existing := m.emulator[key]
	if existing != nil && !existing.exited() {
		m.mu.Unlock()
		_ = term.close()
		return existing, nil
	}
	m.emulator[key] = term
	m.mu.Unlock()

	go term.readLoop()
	go term.pumpResponses()
	go func() {
		<-term.done
		m.mu.Lock()
		if m.emulator[key] == term {
			delete(m.emulator, key)
		}
		m.mu.Unlock()
	}()

	return term, nil
}

type sessionTerminal struct {
	cfg       SessionConfig
	clients   map[chan []byte]struct{}
	done      chan struct{}
	doneOnce  sync.Once
	emulator  *vt.SafeEmulator
	exitErr   error
	idleTimer *time.Timer
	idleDelay time.Duration
	mu        sync.Mutex
	process   Process
}

func newSessionTerminal(cfg SessionConfig, process Process, scrollback int, idleDelay time.Duration) *sessionTerminal {
	cols := cfg.InitialCols
	if cols <= 0 {
		cols = defaultCols
	}
	rows := cfg.InitialRows
	if rows <= 0 {
		rows = defaultRows
	}

	emulator := vt.NewSafeEmulator(cols, rows)
	if scrollback > 0 {
		emulator.SetScrollbackSize(scrollback)
	}

	return &sessionTerminal{
		cfg:       cfg,
		clients:   make(map[chan []byte]struct{}),
		done:      make(chan struct{}),
		emulator:  emulator,
		idleDelay: idleDelay,
		process:   process,
	}
}

func (t *sessionTerminal) attach(conn *websocket.Conn) error {
	conn.SetReadLimit(64 * 1024)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	client := make(chan []byte, clientBufferChunks)
	replay := t.addClient(client)
	defer t.removeClient(client)

	writerDone := make(chan error, 1)
	go func() {
		writerDone <- t.writeToConn(ctx, conn, replay, client)
	}()

	readErr := t.readFromConn(ctx, conn)
	cancel()
	_ = conn.Close(websocket.StatusNormalClosure, "")

	select {
	case writerErr := <-writerDone:
		return errors.Join(readErr, writerErr)
	case <-ctx.Done():
		return errors.Join(readErr, ctx.Err())
	}
}

func (t *sessionTerminal) readLoop() {
	defer func() {
		t.finish(t.process.Wait())
	}()

	buf := make([]byte, 32*1024)
	for {
		n, err := t.process.Read(buf)
		if n > 0 {
			t.broadcast(buf[:n])
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				t.finish(err)
			}
			return
		}
	}
}

// pumpResponses drains the emulator's reply stream and writes it back to the
// attached process. The vt emulator generates answers to the program's own
// terminal queries (DSR cursor/status reports, primary/secondary device
// attributes, OSC color reports, in-band resize) and emits them into an
// UNBUFFERED io.Pipe that the host is expected to consume.
//
// If nothing drains that pipe, the first query a program issues blocks the
// emulator's Write forever — and broadcast calls emulator.Write while holding
// t.mu, so the whole session wedges: every subsequent client attach blocks in
// addClient on t.mu and the terminal renders a permanent blank screen. (Zellij
// probes the background color with OSC 11 right after attach, so this triggers
// in practice on the very first connection.) Draining keeps the program's
// queries answered and the lock free. io.Copy returns when finish() closes the
// emulator (Read yields io.EOF) or the process write fails.
func (t *sessionTerminal) pumpResponses() {
	_, _ = io.Copy(t.process, t.emulator)
}

func (t *sessionTerminal) writeToConn(ctx context.Context, conn *websocket.Conn, replay []byte, client <-chan []byte) error {
	if len(replay) > 0 {
		if err := conn.Write(ctx, websocket.MessageBinary, replay); err != nil {
			return err
		}
	}

	for {
		select {
		case chunk, ok := <-client:
			if !ok {
				return nil
			}
			if err := conn.Write(ctx, websocket.MessageBinary, chunk); err != nil {
				return err
			}
		case <-t.done:
			if err := t.exitErr; err != nil {
				return conn.Close(websocket.StatusInternalError, err.Error())
			}
			return conn.Close(websocket.StatusNormalClosure, "terminal exited")
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (t *sessionTerminal) readFromConn(ctx context.Context, conn *websocket.Conn) error {
	for {
		messageType, payload, err := conn.Read(ctx)
		if err != nil {
			return err
		}

		switch messageType {
		case websocket.MessageBinary:
			if _, err := t.process.Write(payload); err != nil {
				return err
			}
		case websocket.MessageText:
			if err := t.handleControl(payload); err != nil {
				return err
			}
		}
	}
}

func (t *sessionTerminal) handleControl(payload []byte) error {
	var message controlMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return fmt.Errorf("decode terminal control message: %w", err)
	}

	switch message.Type {
	case "resize":
		if message.Cols <= 0 || message.Rows <= 0 {
			return errors.New("terminal resize requires positive cols and rows")
		}
		// Resize the emulator under t.mu so its grid dimensions stay in lockstep
		// with the PTY. The program's redraw (emitted in response to the PTY
		// resize) then flows through broadcast into a correctly sized emulator.
		t.mu.Lock()
		t.emulator.Resize(message.Cols, message.Rows)
		t.mu.Unlock()
		return t.process.Resize(message.Cols, message.Rows)
	default:
		return fmt.Errorf("unknown terminal control message %q", message.Type)
	}
}

func (t *sessionTerminal) addClient(client chan []byte) []byte {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.idleTimer != nil {
		t.idleTimer.Stop()
		t.idleTimer = nil
	}

	// Register the client and snapshot the emulator atomically under t.mu.
	// broadcast also holds t.mu while it feeds the emulator and fans out, so
	// the snapshot reflects exactly the output processed before any live delta
	// this client will subsequently receive: no gaps, no double-applied bytes.
	t.clients[client] = struct{}{}
	return t.snapshot()
}

// snapshot returns a faithful repaint of the emulator's current screen: a byte
// sequence that reconstructs the exact visible grid (with SGR attributes),
// alt-screen mode, and cursor position when written to a fresh terminal. This
// replaces the old raw-scrollback replay, which could not rebuild a long-lived
// full-screen TUI because the bytes that set up the alt screen had already aged
// out of the byte window.
//
// Must be called with t.mu held.
func (t *sessionTerminal) snapshot() []byte {
	var b strings.Builder

	width := t.emulator.Width()
	altScreen := t.emulator.IsAltScreen()

	// Start from a known pen: reset all SGR attributes.
	b.WriteString("\x1b[0m")

	// Match the screen buffer the program is currently driving. A TUI in the
	// alternate screen owns the whole viewport; a normal shell session keeps
	// its scrollback. Setting the mode explicitly means a reconnecting client
	// (which may be in either state) is forced into the correct one.
	if altScreen {
		b.WriteString("\x1b[?1049h")
	} else {
		b.WriteString("\x1b[?1049l")
		// For a normal-screen session, replay the scrolled-off history first so
		// the client can scroll back. These lines flow into the terminal's own
		// scrollback as the visible grid is painted over them below.
		if sb := t.emulator.Scrollback(); sb != nil {
			for _, line := range sb.Lines() {
				b.WriteString(uv.Line(line).Render())
				b.WriteString("\r\n")
			}
		}
	}

	// Clear the viewport so stale content from the client's prior state cannot
	// bleed through, then paint each visible row at an absolute position. Using
	// explicit cursor addressing (rather than relying on newline/auto-wrap flow)
	// keeps the repaint exact regardless of the receiving terminal's wrap mode.
	b.WriteString("\x1b[2J")
	rows := strings.Split(t.emulator.Render(), "\n")
	for y, row := range rows {
		fmt.Fprintf(&b, "\x1b[%d;1H", y+1)
		// Render() trims trailing blanks per row; clear to end-of-line so any
		// residue past the content is wiped, then write the row.
		if width > 0 {
			b.WriteString("\x1b[K")
		}
		b.WriteString(row)
	}

	// Reset the pen again before restoring the cursor so the live stream that
	// follows starts from default attributes, then place the cursor exactly
	// where the program left it (emulator coordinates are 0-based).
	b.WriteString("\x1b[0m")
	pos := t.emulator.CursorPosition()
	fmt.Fprintf(&b, "\x1b[%d;%dH", pos.Y+1, pos.X+1)

	return []byte(b.String())
}

func (t *sessionTerminal) removeClient(client chan []byte) {
	t.mu.Lock()

	if _, ok := t.clients[client]; ok {
		delete(t.clients, client)
		close(client)
		if len(t.clients) == 0 {
			t.scheduleIdleCloseLocked()
		}
	}
	t.mu.Unlock()
}

func (t *sessionTerminal) scheduleIdleCloseLocked() {
	if t.idleTimer != nil {
		t.idleTimer.Stop()
	}

	if t.idleDelay <= 0 {
		go func() {
			_ = t.close()
		}()
		return
	}

	t.idleTimer = time.AfterFunc(t.idleDelay, func() {
		_ = t.close()
	})
}

func (t *sessionTerminal) broadcast(chunk []byte) {
	t.mu.Lock()
	defer t.mu.Unlock()

	copied := append([]byte(nil), chunk...)

	// Feed every byte of PTY output into the authoritative server-side terminal
	// emulator. It tracks the live screen grid, cursor, SGR attributes, modes
	// (alt-screen), and scrollback so newly attached clients can be handed a
	// faithful repaint of the current screen instead of a stale byte tail.
	_, _ = t.emulator.Write(copied)

	for client := range t.clients {
		select {
		case client <- copied:
		default:
		}
	}
}

func (t *sessionTerminal) exited() bool {
	select {
	case <-t.done:
		return true
	default:
		return false
	}
}

func (t *sessionTerminal) close() error {
	err := t.process.Close()
	t.finish(err)
	return err
}

func (t *sessionTerminal) finish(err error) {
	t.doneOnce.Do(func() {
		t.mu.Lock()
		if t.idleTimer != nil {
			t.idleTimer.Stop()
			t.idleTimer = nil
		}
		t.exitErr = err
		for client := range t.clients {
			close(client)
			delete(t.clients, client)
		}
		if t.emulator != nil {
			_ = t.emulator.Close()
		}
		t.mu.Unlock()
		close(t.done)
	})
}
