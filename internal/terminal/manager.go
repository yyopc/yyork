package terminal

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	defaultCols        = 100
	defaultRows        = 30
	defaultIdleTimeout = 30 * time.Second
	defaultScrollback  = 10000
	clientBufferChunks = 64
)

// AttachStrategy selects how the Manager bridges a WebSocket connection to the
// underlying Zellij session.
type AttachStrategy string

const (
	// StrategyPerClient is Option A: every WebSocket connection spawns its OWN
	// `zellij attach` process (its own PTY). Zellij itself maintains the screen
	// state and redraws the full screen on every attach, so a fresh per-client
	// attach is a faithful repaint for free — no shared process, no scrollback
	// buffer, no server-side emulator. The Manager only tracks logical sessions
	// for idle bookkeeping.
	StrategyPerClient AttachStrategy = "per-client"

	// StrategyEmulator is Option B: one SHARED `zellij attach` process per
	// session feeds all PTY output into a server-side `vt` emulator that keeps
	// the authoritative live screen. On attach, a client receives a faithful
	// repaint SNAPSHOT (alt-screen mode + grid + cursor + scrollback) rather
	// than a raw byte tail, then streams live deltas.
	StrategyEmulator AttachStrategy = "emulator"

	// defaultStrategy is used when neither the config field nor the env var
	// selects a valid strategy. The emulator is the proven-faithful fix, so it
	// is the default; per-client remains unverified against live Zellij.
	defaultStrategy = StrategyEmulator

	// strategyEnvVar is the environment variable read to select a strategy when
	// ManagerConfig.AttachStrategy is unset.
	strategyEnvVar = "BETTER_AO_TERMINAL_ATTACH"
)

// SessionConfig describes the terminal a WebSocket connection wants to drive.
type SessionConfig struct {
	Command     []string
	CWD         string
	Env         []string
	ID          string
	InitialCols int
	InitialRows int
	TerminalKey string
	Title       string
	WorkerID    string
}

// ManagerConfig configures a Manager.
type ManagerConfig struct {
	IdleTimeout time.Duration
	// MaxScroll bounds the emulator strategy's scrollback in lines (not bytes).
	// The emulator keeps the live, authoritative screen state; this only caps
	// how many scrolled-off lines of history are retained for the snapshot. It
	// is ignored by the per-client strategy (which has no shared scrollback).
	MaxScroll int
	Runner    Runner
	// AttachStrategy, when non-empty and valid, OVERRIDES the env var and the
	// default. Precedence: this field > BETTER_AO_TERMINAL_ATTACH env var >
	// default ("emulator"). An invalid value falls through to the next source.
	AttachStrategy AttachStrategy
}

type controlMessage struct {
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
	Type string `json:"type"`
}

// Manager owns the WebSocket <-> Zellij-attach plumbing for both attach
// strategies. The resolved strategy is fixed at construction; ServeWS
// dispatches to the matching code path and Close tears down whichever
// per-strategy state was used.
//
// The Zellij SESSION itself is created and kept alive entirely outside this
// package (see internal/durabilityprovider): the zellij server owns the
// session and keeps it alive after every client detaches. Tearing down an
// attach process here only detaches a client; it never kills the session.
type Manager struct {
	cancel     context.CancelFunc
	ctx        context.Context
	idleDelay  time.Duration
	scrollback int
	strategy   AttachStrategy
	runner     Runner

	mu sync.Mutex
	// perClient holds Option A bookkeeping (no processes, just client counts).
	perClient map[string]*session
	// emulator holds Option B shared terminals (process + emulator + clients).
	emulator map[string]*sessionTerminal
}

// resolveStrategy applies the precedence rule: explicit config field > env var
// > default. Invalid values at any level fall through to the next source.
func resolveStrategy(field AttachStrategy) AttachStrategy {
	if s, ok := validStrategy(string(field)); ok {
		return s
	}
	if s, ok := validStrategy(os.Getenv(strategyEnvVar)); ok {
		return s
	}
	return defaultStrategy
}

func validStrategy(value string) (AttachStrategy, bool) {
	switch AttachStrategy(value) {
	case StrategyPerClient:
		return StrategyPerClient, true
	case StrategyEmulator:
		return StrategyEmulator, true
	default:
		return "", false
	}
}

func NewManager(cfg ManagerConfig) *Manager {
	runner := cfg.Runner
	if runner == nil {
		runner = NewPTYRunner()
	}

	scrollback := cfg.MaxScroll
	if scrollback <= 0 {
		scrollback = defaultScrollback
	}

	ctx, cancel := context.WithCancel(context.Background())

	strategy := resolveStrategy(cfg.AttachStrategy)
	slog.Info("terminal attach strategy", "strategy", strategy)

	return &Manager{
		cancel:     cancel,
		ctx:        ctx,
		idleDelay:  idleTimeoutOrDefault(cfg.IdleTimeout),
		scrollback: scrollback,
		strategy:   strategy,
		runner:     runner,
		perClient:  make(map[string]*session),
		emulator:   make(map[string]*sessionTerminal),
	}
}

// Strategy reports the attach strategy this Manager resolved at construction.
func (m *Manager) Strategy() AttachStrategy {
	return m.strategy
}

func (m *Manager) ServeWS(w http.ResponseWriter, r *http.Request, cfg SessionConfig) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{
			"localhost:*",
			"127.0.0.1:*",
			"[::1]:*",
			"http://localhost:*",
			"http://127.0.0.1:*",
			"http://[::1]:*",
		},
	})
	if err != nil {
		slog.Warn("failed to accept terminal websocket", "session_id", cfg.ID, "error", err)
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	switch m.strategy {
	case StrategyPerClient:
		m.serveWSPerClient(conn, cfg)
	default:
		m.serveWSEmulator(conn, cfg)
	}
}

func (m *Manager) Close() error {
	m.cancel()

	m.mu.Lock()
	sessions := make([]*session, 0, len(m.perClient))
	for _, sess := range m.perClient {
		sessions = append(sessions, sess)
	}
	m.perClient = make(map[string]*session)

	terminals := make([]*sessionTerminal, 0, len(m.emulator))
	for _, term := range m.emulator {
		terminals = append(terminals, term)
	}
	m.emulator = make(map[string]*sessionTerminal)
	m.mu.Unlock()

	for _, sess := range sessions {
		sess.cancelIdle()
	}

	var closeErr error
	for _, term := range terminals {
		if err := term.close(); err != nil {
			closeErr = errors.Join(closeErr, err)
		}
	}

	return closeErr
}

func withDefaults(cfg SessionConfig) SessionConfig {
	if cfg.InitialCols <= 0 {
		cfg.InitialCols = defaultCols
	}
	if cfg.InitialRows <= 0 {
		cfg.InitialRows = defaultRows
	}
	return cfg
}

func terminalKey(cfg SessionConfig) string {
	if cfg.TerminalKey != "" {
		return cfg.TerminalKey
	}

	return cfg.ID
}

func idleTimeoutOrDefault(timeout time.Duration) time.Duration {
	if timeout == 0 {
		return defaultIdleTimeout
	}

	return timeout
}

func isExpectedWebsocketClose(err error) bool {
	if err == nil {
		return true
	}
	if errors.Is(err, context.Canceled) {
		return true
	}

	status := websocket.CloseStatus(err)
	return status == websocket.StatusNormalClosure ||
		status == websocket.StatusGoingAway ||
		status == websocket.StatusNoStatusRcvd
}
