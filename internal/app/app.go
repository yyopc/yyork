package app

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/yyovil/better-ao/internal/control"
	"github.com/yyovil/better-ao/internal/durabilityprovider"
	"github.com/yyovil/better-ao/internal/events"
	"github.com/yyovil/better-ao/internal/logging"
	"github.com/yyovil/better-ao/internal/plugin"
	"github.com/yyovil/better-ao/internal/plugin/agent/claudecode"
	"github.com/yyovil/better-ao/internal/plugin/agent/codex"
	"github.com/yyovil/better-ao/internal/server"
	"github.com/yyovil/better-ao/internal/session"
	"github.com/yyovil/better-ao/internal/store"
	"github.com/yyovil/better-ao/internal/worktree"
)

type Config struct {
	Addr        string
	OpenBrowser bool

	// WebDir is a filesystem path the server serves the dashboard from.
	// Used in development; takes priority over WebFS when set.
	WebDir string

	// WebFS is an embedded dashboard filesystem (typically populated by
	// cmd/better-ao via //go:embed). Used in production single-binary
	// builds. If WebDir is empty and WebFS contains an index.html, the
	// server serves the dashboard from the embed.
	WebFS fs.FS
}

func Run(ctx context.Context, cfg Config) error {
	registry := plugin.NewRegistry()
	if err := registerBuiltInPlugins(registry); err != nil {
		return err
	}

	dbPath, err := store.DefaultPath()
	if err != nil {
		return err
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		return err
	}
	defer func() {
		if err := dataStore.Close(); err != nil {
			slog.Warn("failed to close store", "error", err)
		}
	}()

	bus := events.NewBus()
	engine, err := session.NewEngine(session.EngineConfig{
		Repo:     dataStore.Sessions(),
		Worktree: worktree.New(),
		Provider: durabilityprovider.NewZellijProvider(),
		Plugins:  registry,
		Bus:      bus,
	})
	if err != nil {
		return err
	}

	// Sweep any stale rows whose zellij sessions no longer exist (typical
	// after a Mac reboot or a manual `zellij kill-session`). This runs
	// before the HTTP listener accepts so the dashboard's first read sees
	// an accurate state.
	if err := engine.ReconcileAll(ctx); err != nil {
		slog.Warn("session reconcile-all on boot failed", "error", err)
	}

	listener, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return err
	}

	// Advertise this server in the runfile so out-of-process CLI commands
	// (spawn/stop) can forward their lifecycle events to our bus and light up
	// open boards live. The token gates the POST /api/events ingress; the
	// runfile is 0600 so a browser page can't read it to forge requests.
	controlToken, err := control.NewToken()
	if err != nil {
		return err
	}
	if err := control.Write(control.Info{
		Addr:  listener.Addr().String(),
		PID:   os.Getpid(),
		Token: controlToken,
	}); err != nil {
		slog.Warn("failed to advertise server runfile", "error", err)
	}
	defer func() {
		// Only remove the runfile if it still advertises us. A server that
		// exits slowly (e.g. draining connections) must not delete a runfile a
		// newer server has already written for the same port.
		if err := control.RemoveIfOwnedBy(os.Getpid()); err != nil {
			slog.Warn("failed to remove server runfile", "error", err)
		}
	}()

	appServer := server.New(server.Config{
		Registry: registry,
		WebDir:   cfg.WebDir,
		WebFS:    cfg.WebFS,
		// The workspace source the server's existing terminal-attach
		// pipeline reads from is now backed by the SQLite store rather
		// than the legacy ~/.agent-orchestrator/ reader. better-ao spawns
		// its own sessions; they appear in the dashboard via the same
		// pipeline that already powers browser terminal attach.
		WorkspaceSource: session.NewStoreWorkspaceSource(dataStore.Sessions()),
		Sessions:        dataStore.Sessions(),
		Stopper:         engine,
		EventBus:        bus,
		ControlToken:    controlToken,
	})
	defer func() {
		if err := appServer.Close(); err != nil {
			slog.Warn("failed to close app server", "error", err)
		}
	}()

	// requestCtx is the base context for every incoming request. Canceling it
	// at shutdown unblocks long-lived handlers — specifically the /api/events
	// SSE stream, which otherwise blocks http.Server.Shutdown for the full
	// timeout (Shutdown waits for active connections but never cancels their
	// request contexts itself).
	requestCtx, cancelRequests := context.WithCancel(context.Background())
	defer cancelRequests()

	httpServer := &http.Server{
		Handler:           appServer.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return requestCtx },
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- httpServer.Serve(listener)
	}()

	url := "http://" + listener.Addr().String()
	logging.Banner(os.Stderr, "better-ao", [][2]string{
		{"server", url},
		{"store", dbPath},
	})

	if cfg.OpenBrowser {
		if err := openURL(url); err != nil {
			slog.Warn("failed to open dashboard", "url", url, "error", err)
		}
	}

	<-ctx.Done()

	// Cancel in-flight request contexts first so the SSE handler returns,
	// letting Shutdown complete promptly instead of waiting out the timeout.
	cancelRequests()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return err
	}

	err = <-errCh
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return ctx.Err()
}

func registerBuiltInPlugins(registry *plugin.Registry) error {
	for _, builtIn := range []plugin.Plugin{
		codex.New(),
		claudecode.New(),
	} {
		if err := registry.Register(builtIn); err != nil {
			return err
		}
	}

	return nil
}
