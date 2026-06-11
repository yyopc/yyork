package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/app"
)

// execCLI builds the cobra command tree (the same tree main() hands to fang)
// and runs it with the given args, capturing stdout and stderr into one
// buffer. Tests target the cobra layer directly; fang is a presentation
// wrapper applied only in main(), so asserting on cobra's plain output keeps
// these tests deterministic.
func execCLI(t *testing.T, runApp appRunner, args ...string) (string, error) {
	t.Helper()
	root := newRootCmd(runApp)
	var buf bytes.Buffer
	root.SetOut(&buf)
	root.SetErr(&buf)
	// A nil slice makes cobra fall back to os.Args; force an explicit empty
	// slice so "no args" really means no args.
	root.SetArgs(append([]string{}, args...))
	err := root.ExecuteContext(context.Background())
	return buf.String(), err
}

// noopApp returns an app runner that records whether it was invoked and never
// starts a real server.
func noopApp() (appRunner, *bool) {
	called := false
	return func(context.Context, app.Config) error {
		called = true
		return nil
	}, &called
}

func TestRootHelpListsImplementedAndPlannedSurface(t *testing.T) {
	runApp, called := noopApp()

	out, err := execCLI(t, runApp, "--help")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *called {
		t.Fatal("help should not start the server")
	}
	for _, want := range []string{
		"spawn", "session", "stop", "send", // implemented verbs
		"Planned",          // planned group title
		"status",           // a planned verb
		"--addr", "--open", // server flags
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("help output missing %q:\n%s", want, out)
		}
	}
	// hooks is a hidden machine-facing command and should not appear in help.
	if strings.Contains(out, "hooks") {
		t.Fatalf("help output should not list the hidden hooks command:\n%s", out)
	}
	// Absence of the removed start/dashboard verbs is covered by
	// TestRemovedVerbsAreUnknown; the words also appear in the root's prose
	// description, so a substring check here would be misleading.
}

func TestRootNoArgsStartsServerWithDefaults(t *testing.T) {
	var got app.Config
	called := false
	runApp := func(_ context.Context, cfg app.Config) error {
		called = true
		got = cfg
		return nil
	}

	if _, err := execCLI(t, runApp); err != nil {
		t.Fatalf("unexpected error: %v", err)
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
	// WebDir path. The embed lives under cmd/yyork/dashboard/ and is passed via
	// WebFS.
	if got.WebDir != "" {
		t.Fatalf("expected WebDir to be empty (embed mode), got: %s", got.WebDir)
	}
	if got.WebFS == nil {
		t.Fatal("expected WebFS to be set from the embed")
	}
}

func TestRootLeadingFlagsStartServer(t *testing.T) {
	var got app.Config
	runApp := func(_ context.Context, cfg app.Config) error {
		got = cfg
		return nil
	}

	if _, err := execCLI(t, runApp, "--addr", "127.0.0.1:7555", "--open=false"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Addr != "127.0.0.1:7555" {
		t.Fatalf("unexpected addr: %s", got.Addr)
	}
	if got.OpenBrowser {
		t.Fatal("expected --open=false to disable browser open")
	}
}

func TestRemovedVerbsAreUnknown(t *testing.T) {
	for _, verb := range []string{"start", "dashboard"} {
		t.Run(verb, func(t *testing.T) {
			runApp, called := noopApp()

			_, err := execCLI(t, runApp, verb)
			if err == nil {
				t.Fatalf("expected an error for removed verb %q", verb)
			}
			if *called {
				t.Fatalf("%s was routed to the server despite being removed", verb)
			}
			if !strings.Contains(err.Error(), "unknown command") || !strings.Contains(err.Error(), verb) {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestPlannedCommandReportsNotImplemented(t *testing.T) {
	runApp, called := noopApp()

	// `status` is still a planned (unimplemented) command in v1.
	_, err := execCLI(t, runApp, "status")
	if err == nil {
		t.Fatal("expected an error for a planned command")
	}
	if *called {
		t.Fatal("planned command should not start the server")
	}
	if !strings.Contains(err.Error(), "not implemented in yyork yet") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSpawnRequiresPrompt(t *testing.T) {
	runApp, called := noopApp()

	_, err := execCLI(t, runApp, "spawn")
	if err == nil {
		t.Fatal("expected an error when --prompt is missing")
	}
	if *called {
		t.Fatal("spawn should not start the server")
	}
	if !strings.Contains(err.Error(), "prompt") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStopRequiresSessionID(t *testing.T) {
	runApp, _ := noopApp()

	_, err := execCLI(t, runApp, "stop")
	if err == nil {
		t.Fatal("expected an error when <sessionID> is missing")
	}
	if !strings.Contains(err.Error(), "arg") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBareSessionPrintsHelp(t *testing.T) {
	runApp, _ := noopApp()

	// Bare `session` with no subcommand prints help (cobra's idiom for a
	// command group with no action of its own).
	out, err := execCLI(t, runApp, "session")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "list") {
		t.Fatalf("expected session help to mention the list subcommand:\n%s", out)
	}
}

func TestVersionFlagPrintsVersion(t *testing.T) {
	runApp, called := noopApp()

	out, err := execCLI(t, runApp, "--version")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *called {
		t.Fatal("version should not start the server")
	}
	if !strings.Contains(out, version) {
		t.Fatalf("version output missing %q:\n%s", version, out)
	}
}

func TestServerErrorPropagates(t *testing.T) {
	runApp := func(context.Context, app.Config) error {
		return errors.New("boom")
	}

	_, err := execCLI(t, runApp)
	if err == nil {
		t.Fatal("expected the server error to propagate")
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Fatalf("unexpected error: %v", err)
	}
}
