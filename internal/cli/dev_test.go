package cli

import (
	"net"
	"testing"
	"testing/fstest"
)

// envFunc builds a getenv-style lookup from a map for resolveDevConfig.
func envFunc(env map[string]string) func(string) string {
	return func(key string) string { return env[key] }
}

func TestResolveDevConfigDefaults(t *testing.T) {
	cfg, err := resolveDevConfig(envFunc(nil))
	if err != nil {
		t.Fatalf("resolveDevConfig: %v", err)
	}

	if cfg.webHost != "127.0.0.1" {
		t.Errorf("webHost = %q, want 127.0.0.1", cfg.webHost)
	}
	if cfg.webPort != 3000 {
		t.Errorf("webPort = %d, want 3000", cfg.webPort)
	}
	// No YYORK_BACKEND_PORT => ephemeral (port 0) on localhost.
	if cfg.backendAddr != "127.0.0.1:0" {
		t.Errorf("backendAddr = %q, want 127.0.0.1:0", cfg.backendAddr)
	}
	if got := cfg.webOrigin(); got != "http://127.0.0.1:3000" {
		t.Errorf("webOrigin = %q, want http://127.0.0.1:3000", got)
	}
}

func TestResolveDevConfigPortlessEnv(t *testing.T) {
	cfg, err := resolveDevConfig(envFunc(map[string]string{
		"PORT":         "4123",
		"HOST":         "0.0.0.0",
		"PORTLESS_URL": "https://yyork.localhost",
	}))
	if err != nil {
		t.Fatalf("resolveDevConfig: %v", err)
	}

	if cfg.webPort != 4123 {
		t.Errorf("webPort = %d, want 4123 (PORT from portless)", cfg.webPort)
	}
	if cfg.webHost != "0.0.0.0" {
		t.Errorf("webHost = %q, want 0.0.0.0 (HOST from portless)", cfg.webHost)
	}
	if got := cfg.webOrigin(); got != "https://yyork.localhost" {
		t.Errorf("webOrigin = %q, want the portless URL", got)
	}
}

func TestResolveDevConfigViteFallbacksAndPinnedBackend(t *testing.T) {
	// The e2e harness pins both ports and does not run under portless.
	cfg, err := resolveDevConfig(envFunc(map[string]string{
		"VITE_PORT":          "5050",
		"VITE_HOST":          "127.0.0.1",
		"YYORK_BACKEND_PORT": "7654",
	}))
	if err != nil {
		t.Fatalf("resolveDevConfig: %v", err)
	}

	if cfg.webPort != 5050 {
		t.Errorf("webPort = %d, want 5050 (VITE_PORT fallback)", cfg.webPort)
	}
	if cfg.backendAddr != "127.0.0.1:7654" {
		t.Errorf("backendAddr = %q, want 127.0.0.1:7654 (pinned)", cfg.backendAddr)
	}
}

func TestResolveDevConfigPortPrecedence(t *testing.T) {
	// PORT (portless) wins over VITE_PORT.
	cfg, err := resolveDevConfig(envFunc(map[string]string{
		"PORT":      "4000",
		"VITE_PORT": "3000",
	}))
	if err != nil {
		t.Fatalf("resolveDevConfig: %v", err)
	}
	if cfg.webPort != 4000 {
		t.Errorf("webPort = %d, want 4000 (PORT beats VITE_PORT)", cfg.webPort)
	}
}

func TestResolveDevConfigRejectsBadPort(t *testing.T) {
	for _, bad := range []string{"bad", "0", "-1", "70000"} {
		if _, err := resolveDevConfig(envFunc(map[string]string{"VITE_PORT": bad})); err == nil {
			t.Errorf("resolveDevConfig with VITE_PORT=%q: want error, got nil", bad)
		}
	}
}

func TestResolvePortFallbackAllowsEphemeralZero(t *testing.T) {
	port, err := resolvePort("", 0)
	if err != nil || port != 0 {
		t.Fatalf("resolvePort(\"\", 0) = %d, %v; want 0, nil", port, err)
	}
}

func TestDevBackendAppConfigCarriesDashboardFS(t *testing.T) {
	webFS := fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html>")},
	}
	cfg := devConfig{backendAddr: "127.0.0.1:0"}

	got := devBackendAppConfig(cfg, webFS, nil)

	if got.Addr != "127.0.0.1:0" {
		t.Fatalf("Addr = %q, want 127.0.0.1:0", got.Addr)
	}
	if got.OpenBrowser {
		t.Fatal("OpenBrowser = true, want false")
	}
	if !got.SuppressBanner {
		t.Fatal("SuppressBanner = false, want true")
	}
	if got.WebDir != "" {
		t.Fatalf("WebDir = %q, want empty", got.WebDir)
	}
	if got.WebFS == nil {
		t.Fatal("WebFS = nil, want dashboard filesystem")
	}
}

func TestDevPreviewAliasPortRequiresPortless(t *testing.T) {
	addr, err := net.ResolveTCPAddr("tcp", "127.0.0.1:7331")
	if err != nil {
		t.Fatalf("resolve addr: %v", err)
	}

	port, ok, err := devPreviewAliasPort(devConfig{}, addr)
	if err != nil {
		t.Fatalf("devPreviewAliasPort: %v", err)
	}
	if ok {
		t.Fatalf("ok = true, want false")
	}
	if port != "" {
		t.Fatalf("port = %q, want empty", port)
	}
}

func TestDevPreviewAliasPortUsesBackendPortUnderPortless(t *testing.T) {
	addr, err := net.ResolveTCPAddr("tcp", "127.0.0.1:7331")
	if err != nil {
		t.Fatalf("resolve addr: %v", err)
	}

	port, ok, err := devPreviewAliasPort(
		devConfig{portlessURL: "https://yyork.localhost"},
		addr,
	)
	if err != nil {
		t.Fatalf("devPreviewAliasPort: %v", err)
	}
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if port != "7331" {
		t.Fatalf("port = %q, want 7331", port)
	}
}
