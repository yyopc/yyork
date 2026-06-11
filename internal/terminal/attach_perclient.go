package terminal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/coder/websocket"
)

// Option A — per-client attach.
//
// Each WebSocket connection gets its OWN `zellij attach` process (its own
// PTY). Zellij is a multiplexer whose core job is maintaining the session's
// screen state and redrawing the FULL screen whenever a client attaches, so a
// fresh per-connection attach IS a faithful repaint for free — no byte replay,
// no scrollback buffer, no fan-out.
//
// The Manager only tracks logical sessions for idle bookkeeping. Closing an
// attach process detaches that single client; it never kills the session.

// serveWSPerClient registers the connection for idle bookkeeping, spawns its
// own attach process, and pipes PTY <-> WebSocket.
func (m *Manager) serveWSPerClient(conn *websocket.Conn, cfg SessionConfig) {
	cfg = withDefaults(cfg)
	if cfg.ID == "" {
		_ = conn.Close(websocket.StatusInternalError, "terminal session id is required")
		return
	}
	if err := m.ctx.Err(); err != nil {
		_ = conn.Close(websocket.StatusInternalError, err.Error())
		return
	}

	// Register this connection against its logical session so idle cleanup can
	// track when the last client leaves. This does NOT start a process.
	key := terminalKey(cfg)
	sess := m.acquire(key)
	defer m.release(key, sess)

	// Each connection spawns its OWN attach process. A fresh attach is a
	// faithful Zellij redraw of the current screen — no replay needed.
	process, err := m.runner.Start(m.ctx, StartOptions{
		Command: cfg.Command,
		CWD:     cfg.CWD,
		Cols:    cfg.InitialCols,
		Env:     cfg.Env,
		Rows:    cfg.InitialRows,
	})
	if err != nil {
		slog.Warn("failed to start terminal attach", "session_id", cfg.ID, "error", err)
		_ = conn.Close(websocket.StatusInternalError, "failed to start terminal")
		return
	}

	client := newClientAttach(process)
	if err := client.pipe(conn); err != nil && !isExpectedWebsocketClose(err) {
		slog.Debug("terminal websocket closed", "session_id", cfg.ID, "error", err)
	}
}

// acquire returns the logical session for key, creating it if needed, and
// increments its live-client count.
func (m *Manager) acquire(key string) *session {
	m.mu.Lock()
	defer m.mu.Unlock()

	sess := m.perClient[key]
	if sess == nil {
		sess = &session{}
		m.perClient[key] = sess
	}
	sess.cancelIdle()
	sess.clients++
	return sess
}

// release decrements the live-client count for key. When the last client
// leaves, the logical session is scheduled for removal after the idle delay.
// Removing the session entry does NOT touch the Zellij session — the zellij
// server keeps it alive independently.
func (m *Manager) release(key string, sess *session) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if sess.clients > 0 {
		sess.clients--
	}
	if sess.clients > 0 {
		return
	}

	if m.idleDelay <= 0 {
		if m.perClient[key] == sess {
			delete(m.perClient, key)
		}
		return
	}

	sess.idleTimer = time.AfterFunc(m.idleDelay, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		if m.perClient[key] == sess && sess.clients == 0 {
			delete(m.perClient, key)
		}
	})
}

// session is pure bookkeeping for a logical terminal. It owns no process and
// no scrollback; it just counts live attach connections so the Manager knows
// when a session has gone idle. The actual screen state lives in the Zellij
// server, reached anew by each per-client attach process.
type session struct {
	clients   int
	idleTimer *time.Timer
}

// cancelIdle stops any pending idle-removal timer. Callers must hold the
// Manager mutex.
func (s *session) cancelIdle() {
	if s.idleTimer != nil {
		s.idleTimer.Stop()
		s.idleTimer = nil
	}
}

// clientAttach is a thin PTY <-> WebSocket pipe bound to a single connection's
// own attach process.
type clientAttach struct {
	process Process
}

func newClientAttach(process Process) *clientAttach {
	return &clientAttach{process: process}
}

// pipe streams the attach process's PTY output to conn, forwards conn input
// and resize control messages to the process, and tears the process down when
// the connection ends. Closing the attach process detaches this client only;
// the Zellij session survives.
func (c *clientAttach) pipe(conn *websocket.Conn) error {
	conn.SetReadLimit(64 * 1024)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Closing the process unblocks the writer's PTY read and detaches this
	// client from Zellij. It does NOT kill the Zellij session.
	defer func() { _ = c.process.Close() }()

	writerDone := make(chan error, 1)
	go func() {
		writerDone <- c.writeToConn(ctx, conn)
	}()

	readErr := c.readFromConn(ctx, conn)
	cancel()
	_ = conn.Close(websocket.StatusNormalClosure, "")

	select {
	case writerErr := <-writerDone:
		return errors.Join(readErr, writerErr)
	case <-ctx.Done():
		return errors.Join(readErr, ctx.Err())
	}
}

// writeToConn copies PTY output straight to the WebSocket. There is no replay
// buffer: the first bytes a client receives are Zellij's fresh repaint.
func (c *clientAttach) writeToConn(ctx context.Context, conn *websocket.Conn) error {
	buf := make([]byte, 32*1024)
	for {
		n, err := c.process.Read(buf)
		if n > 0 {
			if writeErr := conn.Write(ctx, websocket.MessageBinary, buf[:n]); writeErr != nil {
				return writeErr
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return conn.Close(websocket.StatusNormalClosure, "terminal detached")
			}
			if ctx.Err() != nil {
				return nil
			}
			return conn.Close(websocket.StatusInternalError, err.Error())
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

func (c *clientAttach) readFromConn(ctx context.Context, conn *websocket.Conn) error {
	for {
		messageType, payload, err := conn.Read(ctx)
		if err != nil {
			return err
		}

		switch messageType {
		case websocket.MessageBinary:
			if _, err := c.process.Write(payload); err != nil {
				return err
			}
		case websocket.MessageText:
			if err := c.handleControl(payload); err != nil {
				return err
			}
		}
	}
}

func (c *clientAttach) handleControl(payload []byte) error {
	var message controlMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return fmt.Errorf("decode terminal control message: %w", err)
	}

	switch message.Type {
	case "resize":
		if message.Cols <= 0 || message.Rows <= 0 {
			return errors.New("terminal resize requires positive cols and rows")
		}
		return c.process.Resize(message.Cols, message.Rows)
	default:
		return fmt.Errorf("unknown terminal control message %q", message.Type)
	}
}
