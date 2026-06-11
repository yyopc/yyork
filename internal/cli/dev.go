package cli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"os"
	"os/exec"
	"strconv"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/yyopc/yyork/internal/app"
)

const devBrowserPreviewAliasName = "yyork-preview.yyork"

// newDevCmd builds the dev-stack launcher. It is hidden because it is a
// development-loop entrypoint (driven by `pnpm dev` -> portless -> `go run .
// dev`), not a product verb. It runs the API server in-process and Vite as a
// child, wiring Vite's /api proxy at the server's bound address.
func newDevCmd(runApp appRunner, webFS fs.FS) *cobra.Command {
	return &cobra.Command{
		Use:    "dev",
		Hidden: true,
		Short:  "Run the dev stack: Vite + the API server (used by `pnpm dev`).",
		Long: "Run the local development stack: the API server in-process plus the " +
			"Vite dev server as a child, with Vite proxying /api to the server.\n\n" +
			"Ports come from the environment, not from scanning: portless assigns the " +
			"web PORT/HOST; the API binds an OS-chosen ephemeral port unless " +
			"YYORK_BACKEND_PORT pins it. Intended to be launched by `pnpm dev`.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDev(cmd, runApp, webFS)
		},
	}
}

// devConfig is the resolved dev-stack wiring. It is produced purely from the
// environment so it can be unit-tested without spawning anything.
type devConfig struct {
	webHost     string
	webPort     int
	backendAddr string // host:port; port 0 means OS-assigned (ephemeral)
	portlessURL string // PORTLESS_URL when running under portless, else ""
}

// webOrigin is the URL a human opens. Under portless that is the stable
// .localhost proxy URL; otherwise it is the direct Vite host:port.
func (c devConfig) webOrigin() string {
	if c.portlessURL != "" {
		return c.portlessURL
	}
	return "http://" + net.JoinHostPort(c.webHost, strconv.Itoa(c.webPort))
}

// resolveDevConfig derives the dev wiring from environment variables.
//
//   - web host: HOST (portless) -> VITE_HOST -> 127.0.0.1
//   - web port: PORT (portless) -> VITE_PORT -> 3000
//   - backend:  127.0.0.1:YYORK_BACKEND_PORT, or 127.0.0.1:0 (ephemeral) when
//     unset. YYORK_BACKEND_HOST overrides the host.
func resolveDevConfig(getenv func(string) string) (devConfig, error) {
	webPort, err := resolvePort(firstNonEmpty(getenv("PORT"), getenv("VITE_PORT")), 3000)
	if err != nil {
		return devConfig{}, fmt.Errorf("web port: %w", err)
	}

	backendPort, err := resolvePort(getenv("YYORK_BACKEND_PORT"), 0)
	if err != nil {
		return devConfig{}, fmt.Errorf("YYORK_BACKEND_PORT: %w", err)
	}

	backendHost := firstNonEmpty(getenv("YYORK_BACKEND_HOST"), "127.0.0.1")

	return devConfig{
		webHost:     firstNonEmpty(getenv("HOST"), getenv("VITE_HOST"), "127.0.0.1"),
		webPort:     webPort,
		backendAddr: net.JoinHostPort(backendHost, strconv.Itoa(backendPort)),
		portlessURL: getenv("PORTLESS_URL"),
	}, nil
}

// resolvePort parses a port string, returning fallback when it is empty. A
// non-empty value must be an integer in 1..65535; the fallback may be 0 to
// request an OS-assigned ephemeral port.
func resolvePort(value string, fallback int) (int, error) {
	if value == "" {
		return fallback, nil
	}
	port, err := strconv.Atoi(value)
	if err != nil || port <= 0 || port > 65535 {
		return 0, fmt.Errorf("must be an integer port between 1 and 65535, got %q", value)
	}
	return port, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func devBackendAppConfig(cfg devConfig, webFS fs.FS, onListen func(net.Addr)) app.Config {
	return app.Config{
		Addr:           cfg.backendAddr,
		OpenBrowser:    false,
		SuppressBanner: true,
		OnListen:       onListen,
		WebFS:          webFS,
	}
}

func devPreviewAliasPort(cfg devConfig, apiAddr net.Addr) (string, bool, error) {
	if cfg.portlessURL == "" {
		return "", false, nil
	}
	_, port, err := net.SplitHostPort(apiAddr.String())
	if err != nil || port == "" {
		return "", false, fmt.Errorf("backend address %q has no port", apiAddr.String())
	}
	return port, true, nil
}

func registerDevPreviewAlias(ctx context.Context, cmd *cobra.Command, cfg devConfig, apiAddr net.Addr) error {
	port, ok, err := devPreviewAliasPort(cfg, apiAddr)
	if err != nil || !ok {
		return err
	}

	alias := exec.CommandContext(
		ctx,
		"pnpm",
		"exec",
		"portless",
		"alias",
		devBrowserPreviewAliasName,
		port,
		"--force",
	)
	alias.Stdout = cmd.OutOrStdout()
	alias.Stderr = cmd.ErrOrStderr()
	if err := alias.Run(); err != nil {
		return fmt.Errorf("register preview alias: %w", err)
	}
	return nil
}

func runDev(cmd *cobra.Command, runApp appRunner, webFS fs.FS) error {
	cfg, err := resolveDevConfig(os.Getenv)
	if err != nil {
		return fmt.Errorf("dev: %w", err)
	}

	// A child context so either process exiting tears down the other: the
	// parent ctx is canceled on SIGINT/SIGTERM (see cli.Main); cancel() is our
	// own lever for "one side died, stop the other".
	ctx, cancel := context.WithCancel(cmd.Context())
	defer cancel()

	// Run the API server in-process. OnListen hands back the bound address so
	// we can point Vite's proxy at the real (possibly ephemeral) port.
	apiAddrCh := make(chan net.Addr, 1)
	appErrCh := make(chan error, 1)
	go func() {
		appErrCh <- runApp(ctx, devBackendAppConfig(
			cfg,
			webFS,
			func(addr net.Addr) { apiAddrCh <- addr },
		))
	}()

	var apiAddr net.Addr
	select {
	case apiAddr = <-apiAddrCh:
	case err := <-appErrCh:
		// Server failed before it began listening (e.g. port in use).
		if err != nil {
			return fmt.Errorf("dev: backend: %w", err)
		}
		return nil
	case <-ctx.Done():
		return <-appErrCh
	}

	backendOrigin := "http://" + apiAddr.String()
	if err := registerDevPreviewAlias(ctx, cmd, cfg, apiAddr); err != nil {
		cancel()
		<-appErrCh
		return fmt.Errorf("dev: %w", err)
	}

	// Vite is the browser-facing process; portless proxies its PORT. It reads
	// VITE_BACKEND_ORIGIN/VITE_PORT/VITE_HOST from the environment (see
	// web/vite.config.ts). CommandContext kills it when ctx is canceled.
	vite := exec.CommandContext(ctx, "pnpm", "--dir", "web", "dev")
	vite.Env = append(os.Environ(),
		"VITE_BACKEND_ORIGIN="+backendOrigin,
		"VITE_PORT="+strconv.Itoa(cfg.webPort),
		"VITE_HOST="+cfg.webHost,
	)
	vite.Stdout = cmd.OutOrStdout()
	vite.Stderr = cmd.ErrOrStderr()
	// Run pnpm in its own process group so shutdown can reach the whole tree.
	// pnpm does not forward signals to the Vite child it spawns, so signaling
	// pnpm alone orphans Vite; signaling the group (negative PID) hits pnpm,
	// Vite, and any descendants. We send SIGTERM (not the CommandContext
	// default SIGKILL) for a clean exit, and WaitDelay force-kills if it lingers.
	vite.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	vite.Cancel = func() error { return syscall.Kill(-vite.Process.Pid, syscall.SIGTERM) }
	vite.WaitDelay = 5 * time.Second
	if err := vite.Start(); err != nil {
		cancel()
		<-appErrCh
		return fmt.Errorf("dev: start vite: %w", err)
	}

	printDevBanner(cmd.OutOrStdout(), cfg.webOrigin(), backendOrigin)

	viteErrCh := make(chan error, 1)
	go func() { viteErrCh <- vite.Wait() }()

	select {
	case err := <-appErrCh:
		cancel()
		<-viteErrCh
		if err != nil {
			return fmt.Errorf("dev: backend: %w", err)
		}
		return nil
	case err := <-viteErrCh:
		cancel()
		<-appErrCh
		// A killed Vite (because ctx was already canceled) is a clean shutdown.
		if err != nil && ctx.Err() == nil {
			return fmt.Errorf("dev: vite: %w", err)
		}
		return nil
	case <-ctx.Done():
		// SIGINT/SIGTERM: let both processes drain.
		appErr := <-appErrCh
		<-viteErrCh
		if appErr != nil && !errors.Is(appErr, context.Canceled) {
			return fmt.Errorf("dev: backend: %w", appErr)
		}
		return nil
	}
}

// printDevBanner mirrors the previous JS launcher's banner. The "yyork web:"
// and "yyork backend:" tokens are a machine contract: web/e2e parses them to
// discover the running stack's origins.
func printDevBanner(w io.Writer, webOrigin, backendOrigin string) {
	fmt.Fprintf(w, "\n  yyork web:      %s\n  yyork backend:  %s\n\n", webOrigin, backendOrigin)
}
