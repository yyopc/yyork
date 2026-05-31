package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/yyovil/better-ao/internal/app"
)

func TestRunCLIHelpPrintsImplementedAndPlannedSurface(t *testing.T) {
	var stdout, stderr bytes.Buffer
	called := false

	code := runCLI(context.Background(), []string{"--help"}, &stdout, &stderr, func(context.Context, app.Config) error {
		called = true
		return nil
	})

	if code != 0 {
		t.Fatalf("unexpected exit code: %d", code)
	}
	if called {
		t.Fatal("help should not start the app")
	}
	output := stdout.String()
	for _, want := range []string{
		"better-ao [options]",
		"better-ao spawn",
		"better-ao session list",
		"better-ao stop",
		"PLANNED",
		"status",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("help output missing %q:\n%s", want, output)
		}
	}
	for _, unwanted := range []string{
		"better-ao start ",
		"better-ao dashboard",
	} {
		if strings.Contains(output, unwanted) {
			t.Fatalf("help output should not mention removed verb %q:\n%s", unwanted, output)
		}
	}
	if stderr.Len() != 0 {
		t.Fatalf("unexpected stderr: %s", stderr.String())
	}
}

func TestRunCLINoArgsStartsServerWithDefaults(t *testing.T) {
	var stdout, stderr bytes.Buffer
	var got app.Config
	called := false

	code := runCLI(context.Background(), nil, &stdout, &stderr, func(_ context.Context, cfg app.Config) error {
		called = true
		got = cfg
		return nil
	})

	if code != 0 {
		t.Fatalf("unexpected exit code: %d, stderr: %s", code, stderr.String())
	}
	if !called {
		t.Fatal("no-args invocation did not start the server")
	}
	if got.Addr != "127.0.0.1:7331" {
		t.Fatalf("unexpected addr: %s", got.Addr)
	}
	if !got.OpenBrowser {
		t.Fatal("expected server to open the browser by default")
	}
	// In single-binary mode the server is wired to the embedded FS, not a
	// WebDir path. The embed lives under cmd/better-ao/dashboard/ and is
	// passed via WebFS.
	if got.WebDir != "" {
		t.Fatalf("expected WebDir to be empty (embed mode), got: %s", got.WebDir)
	}
	if got.WebFS == nil {
		t.Fatal("expected WebFS to be set from the embed")
	}
}

func TestRunCLILeadingFlagsStartServer(t *testing.T) {
	var stdout, stderr bytes.Buffer
	var got app.Config

	code := runCLI(context.Background(), []string{"-addr", "127.0.0.1:7555", "-open=false"}, &stdout, &stderr, func(_ context.Context, cfg app.Config) error {
		got = cfg
		return nil
	})

	if code != 0 {
		t.Fatalf("unexpected exit code: %d, stderr: %s", code, stderr.String())
	}
	if got.Addr != "127.0.0.1:7555" {
		t.Fatalf("unexpected addr: %s", got.Addr)
	}
	if got.OpenBrowser {
		t.Fatal("expected -open=false to disable browser open")
	}
}

func TestRunCLIRemovedVerbsAreUnknown(t *testing.T) {
	for _, verb := range []string{"start", "dashboard"} {
		t.Run(verb, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			called := false

			code := runCLI(context.Background(), []string{verb}, &stdout, &stderr, func(context.Context, app.Config) error {
				called = true
				return nil
			})

			if code != 1 {
				t.Fatalf("unexpected exit code: %d", code)
			}
			if called {
				t.Fatalf("%s was routed to the app despite being removed", verb)
			}
			if !strings.Contains(stderr.String(), "Unknown command: "+verb) {
				t.Fatalf("unexpected stderr: %s", stderr.String())
			}
		})
	}
}

func TestRunCLIPlannedCommandPrintsPlannedNotice(t *testing.T) {
	var stdout, stderr bytes.Buffer
	called := false

	// `status` is still a planned (unimplemented) command in v1.
	code := runCLI(context.Background(), []string{"status"}, &stdout, &stderr, func(context.Context, app.Config) error {
		called = true
		return nil
	})

	if code != 1 {
		t.Fatalf("unexpected exit code: %d", code)
	}
	if called {
		t.Fatal("planned command should not run the app")
	}
	if !strings.Contains(stderr.String(), "not implemented in better-ao yet") {
		t.Fatalf("unexpected stderr: %s", stderr.String())
	}
}

func TestRunCLISpawnRequiresPrompt(t *testing.T) {
	var stdout, stderr bytes.Buffer
	called := false

	code := runCLI(context.Background(), []string{"spawn"}, &stdout, &stderr, func(context.Context, app.Config) error {
		called = true
		return nil
	})

	if code != 1 {
		t.Fatalf("unexpected exit code: %d, stderr: %s", code, stderr.String())
	}
	if called {
		t.Fatal("spawn should not start the server")
	}
	if !strings.Contains(stderr.String(), "--prompt is required") {
		t.Fatalf("unexpected stderr: %s", stderr.String())
	}
}

func TestRunCLIStopRequiresSessionID(t *testing.T) {
	var stdout, stderr bytes.Buffer

	code := runCLI(context.Background(), []string{"stop"}, &stdout, &stderr, func(context.Context, app.Config) error {
		return nil
	})

	if code != 1 {
		t.Fatalf("unexpected exit code: %d", code)
	}
	if !strings.Contains(stderr.String(), "exactly one <sessionID>") {
		t.Fatalf("unexpected stderr: %s", stderr.String())
	}
}

func TestRunCLISessionListSubcommandHelp(t *testing.T) {
	var stdout, stderr bytes.Buffer

	code := runCLI(context.Background(), []string{"session"}, &stdout, &stderr, func(context.Context, app.Config) error {
		return nil
	})

	// Bare `session` with no subcommand prints help and exits non-zero so
	// scripts can rely on it not silently succeeding.
	if code != 1 {
		t.Fatalf("unexpected exit code: %d", code)
	}
	if !strings.Contains(stdout.String(), "better-ao session") {
		t.Fatalf("expected help output, got:\n%s", stdout.String())
	}
}

func TestRunCLIVersion(t *testing.T) {
	var stdout, stderr bytes.Buffer

	code := runCLI(context.Background(), []string{"-V"}, &stdout, &stderr, func(context.Context, app.Config) error {
		t.Fatal("version should not run the app")
		return nil
	})

	if code != 0 {
		t.Fatalf("unexpected exit code: %d", code)
	}
	if strings.TrimSpace(stdout.String()) != version {
		t.Fatalf("unexpected version output: %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("unexpected stderr: %s", stderr.String())
	}
}

func TestRunCLIServerErrorReturnsFailure(t *testing.T) {
	var stdout, stderr bytes.Buffer

	code := runCLI(context.Background(), nil, &stdout, &stderr, func(context.Context, app.Config) error {
		return errors.New("boom")
	})

	if code != 1 {
		t.Fatalf("unexpected exit code: %d", code)
	}
}
