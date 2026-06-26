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
)

// AttachStrategy selects how the Manager bridges a WebSocket connection to the
// durable terminal PTY.
type AttachStrategy string

const (
	// StrategyDirect is the only runtime attach mode: each WebSocket is a thin
	// pipe to yyork's terminal-host PTY when available, falling back to a local PTY
	// runner for isolated tests and non-durable sessions.
	StrategyDirect AttachStrategy = "direct"

	// StrategyPerClient is a legacy alias for StrategyDirect. It used to mean a
	// fresh attach process per browser connection.
	StrategyPerClient AttachStrategy = "per-client"

	// StrategyEmulator is a legacy alias for StrategyDirect. The attach-side
	// Charmbracelet vt emulator was removed because terminal-host now owns the
	// PTY; screen emulation at this layer duplicates state and can panic on
	// geometry-specific replay.
	StrategyEmulator AttachStrategy = "emulator"

	// defaultStrategy is used when neither the config field nor the env var
	// selects a valid strategy.
	defaultStrategy = StrategyDirect

	// strategyEnvVar is the environment variable read to select a strategy when
	// ManagerConfig.AttachStrategy is unset.
	strategyEnvVar = "YYORK_TERMINAL_ATTACH"
)

// SessionConfig describes the terminal a WebSocket connection wants to drive.
type SessionConfig struct {
	Command       []string
	CWD           string
	Env           []string
	ID            string
	InitialCols   int
	InitialRows   int
	TerminalKey   string
	Title         string
	WorkerID      string
	ZellijSession string
}

// ManagerConfig configures a Manager.
type ManagerConfig struct {
	IdleTimeout time.Duration
	// MaxScroll is deprecated and ignored. The attach layer no longer keeps a
	// server-side terminal emulator or replay buffer.
	MaxScroll int
	Runner    Runner
	// AttachStrategy, when non-empty and valid, OVERRIDES the env var and the
	// default. Precedence: this field > YYORK_TERMINAL_ATTACH env var >
	// default ("direct"). Legacy values normalize to StrategyDirect.
	AttachStrategy AttachStrategy
}

type controlMessage struct {
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
	Type string `json:"type"`
}

// Manager owns the WebSocket <-> terminal-host plumbing. The resolved strategy
// is fixed at construction so callers can inspect which compatibility mode was
// accepted, but ServeWS always uses the direct pipe.
//
// The durable terminal process is created and kept alive outside this package
// (see internal/terminalhost and internal/durabilityprovider). Closing a browser
// connection here only detaches that socket; it never kills the durable session.
type Manager struct {
	cancel    context.CancelFunc
	ctx       context.Context
	idleDelay time.Duration
	strategy  AttachStrategy
	runner    Runner

	mu sync.Mutex
	// perClient holds logical session bookkeeping: no processes, just client counts.
	perClient map[string]*session
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
	case StrategyDirect, StrategyPerClient, StrategyEmulator:
		return StrategyDirect, true
	default:
		return "", false
	}
}

func NewManager(cfg ManagerConfig) *Manager {
	runner := cfg.Runner
	if runner == nil {
		runner = NewPTYRunner()
	}

	ctx, cancel := context.WithCancel(context.Background())

	strategy := resolveStrategy(cfg.AttachStrategy)
	slog.Info("terminal attach strategy", "strategy", strategy)

	return &Manager{
		cancel:    cancel,
		ctx:       ctx,
		idleDelay: idleTimeoutOrDefault(cfg.IdleTimeout),
		strategy:  strategy,
		runner:    runner,
		perClient: make(map[string]*session),
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
			"yyork.localhost",
			"yyork.localhost:*",
			"*.yyork.localhost",
			"*.yyork.localhost:*",
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

	m.serveWSPerClient(conn, cfg)
}

func (m *Manager) Close() error {
	m.cancel()

	m.mu.Lock()
	sessions := make([]*session, 0, len(m.perClient))
	for _, sess := range m.perClient {
		sessions = append(sessions, sess)
	}
	m.perClient = make(map[string]*session)
	m.mu.Unlock()

	for _, sess := range sessions {
		sess.cancelIdle()
	}

	return nil
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
