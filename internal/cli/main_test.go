package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/yyopc/yyork/internal/app"
	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
)

// execCLI builds the cobra command tree (the same tree main() hands to fang)
// and runs it with the given args, capturing stdout and stderr into one
// buffer. Tests target the cobra layer directly; fang is a presentation
// wrapper applied only in main(), so asserting on cobra's plain output keeps
// these tests deterministic.
func execCLI(t *testing.T, runApp appRunner, args ...string) (string, error) {
	t.Helper()
	root := newRootCmd(runApp, fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html>")},
	})
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
		"spawn", "session", "stop", "send", "doctor", // implemented verbs
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
	if strings.Contains(out, "orchestrator [--flags]") {
		t.Fatalf("help output should not list a separate orchestrator command:\n%s", out)
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
	// WebDir path.
	if got.WebDir != "" {
		t.Fatalf("expected WebDir to be empty (embed mode), got: %s", got.WebDir)
	}
	if got.WebFS == nil {
		t.Fatal("expected WebFS to be set from the embed")
	}
}

func TestRootProjectPathStartsServerWithResolvedProject(t *testing.T) {
	projectPath := t.TempDir()
	runGit(t, projectPath, "init")

	var got app.Config
	runApp := func(_ context.Context, cfg app.Config) error {
		got = cfg
		return nil
	}

	if _, err := execCLI(t, runApp, projectPath); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wantProjectPath, err := filepath.EvalSymlinks(projectPath)
	if err != nil {
		t.Fatal(err)
	}
	if got.ProjectPath != wantProjectPath {
		t.Fatalf("ProjectPath = %q, want %q", got.ProjectPath, wantProjectPath)
	}
}

func TestRootProjectPathRejectsNonGitDirectory(t *testing.T) {
	runApp, called := noopApp()

	_, err := execCLI(t, runApp, t.TempDir())
	if err == nil {
		t.Fatal("expected an error for a non-git project path")
	}
	if *called {
		t.Fatal("invalid project path should not start the server")
	}
	if !strings.Contains(err.Error(), "not inside a git repository") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSpawnHelpListsPublicFlags(t *testing.T) {
	runApp, called := noopApp()

	out, err := execCLI(t, runApp, "spawn", "--help")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *called {
		t.Fatal("spawn help should not start the server")
	}
	for _, want := range []string{"--type", "--json", "worker", "orchestrator"} {
		if !strings.Contains(out, want) {
			t.Fatalf("spawn help missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "--workspace") {
		t.Fatalf("spawn help should not list removed --workspace flag:\n%s", out)
	}
}

func TestSpawnRejectsWorkspaceFlagBeforeStartingServer(t *testing.T) {
	runApp, called := noopApp()

	_, err := execCLI(t, runApp, "spawn", "--workspace", "local", "--prompt", "do it")
	if err == nil {
		t.Fatal("expected an error for removed --workspace flag")
	}
	if *called {
		t.Fatal("spawn should not start the server")
	}
	if !strings.Contains(err.Error(), "unknown flag: --workspace") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestApplyConfiguredSpawnDefaultsUsesPersistedWorkerWorkspaceMode(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	ctx := context.Background()
	projectPath := filepath.Join(t.TempDir(), "repo")

	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := dataStore.ProjectSettings().SetWorkerWorkspaceMode(ctx, projectPath, string(session.WorkerWorkspaceModeNewWorktree)); err != nil {
		t.Fatal(err)
	}
	if err := dataStore.Close(); err != nil {
		t.Fatal(err)
	}

	got, err := applyConfiguredSpawnDefaults(ctx, session.SpawnRequest{
		Kind:   session.KindWorker,
		Prompt: "do it",
	}, projectPath)
	if err != nil {
		t.Fatalf("apply configured defaults: %v", err)
	}
	if got.ProjectPath != projectPath {
		t.Fatalf("ProjectPath = %q, want %q", got.ProjectPath, projectPath)
	}
	if got.WorkspaceMode != session.WorkerWorkspaceModeNewWorktree {
		t.Fatalf("WorkspaceMode = %q, want %q", got.WorkspaceMode, session.WorkerWorkspaceModeNewWorktree)
	}
}

func TestApplyConfiguredSpawnDefaultsLeavesWorkspaceModeUnsetWithoutProjectSetting(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	ctx := context.Background()
	projectPath := filepath.Join(t.TempDir(), "repo")

	got, err := applyConfiguredSpawnDefaults(ctx, session.SpawnRequest{
		Kind:   session.KindWorker,
		Prompt: "do it",
	}, projectPath)
	if err != nil {
		t.Fatalf("apply configured defaults: %v", err)
	}
	if got.WorkspaceMode != "" {
		t.Fatalf("WorkspaceMode = %q, want empty so engine default applies", got.WorkspaceMode)
	}
}

func TestApplyConfiguredSpawnDefaultsDoesNotOverrideInternalWorkspaceMode(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	ctx := context.Background()
	projectPath := filepath.Join(t.TempDir(), "repo")

	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := dataStore.ProjectSettings().SetWorkerWorkspaceMode(ctx, projectPath, string(session.WorkerWorkspaceModeNewWorktree)); err != nil {
		t.Fatal(err)
	}
	if err := dataStore.Close(); err != nil {
		t.Fatal(err)
	}

	got, err := applyConfiguredSpawnDefaults(ctx, session.SpawnRequest{
		Kind:          session.KindWorker,
		Prompt:        "do it",
		WorkspaceMode: session.WorkerWorkspaceModeLocal,
	}, projectPath)
	if err != nil {
		t.Fatalf("apply configured defaults: %v", err)
	}
	if got.WorkspaceMode != session.WorkerWorkspaceModeLocal {
		t.Fatalf("WorkspaceMode = %q, want internal override preserved", got.WorkspaceMode)
	}
}

func TestSessionListJSON(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	ctx := context.Background()
	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	createdAt := time.Unix(100, 0).UTC()
	if err := dataStore.Sessions().Insert(ctx, store.Session{
		ID:            "sess-1",
		ProjectPath:   "/repo/app",
		ProjectName:   "app",
		AgentPlugin:   "claude-code",
		WorkspacePath: "/repo/app",
		ZellijSession: "sess-1",
		Metadata: map[string]any{
			"kind":   "orchestrator",
			"prompt": "Coordinate the project",
			"state":  "prompt",
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	}); err != nil {
		t.Fatal(err)
	}
	if err := dataStore.Close(); err != nil {
		t.Fatal(err)
	}

	runApp, called := noopApp()
	out, err := execCLI(t, runApp, "session", "list", "--json")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *called {
		t.Fatal("session list should not start the server")
	}

	var got cliSessionListOutput
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("session list --json produced invalid JSON: %v\n%s", err, out)
	}
	if got.Count != 1 || len(got.Sessions) != 1 {
		t.Fatalf("got count=%d len=%d, want 1 session; output=%s", got.Count, len(got.Sessions), out)
	}
	session := got.Sessions[0]
	if session.ID != "sess-1" || session.ProjectPath != "/repo/app" || session.Kind != "orchestrator" || session.Agent != "claude-code" || session.State != "prompt" {
		t.Fatalf("unexpected session JSON: %#v", session)
	}
	if session.Title != "Orchestrator" {
		t.Fatalf("Title = %q, want orchestrator fallback title", session.Title)
	}
	if session.Metadata["prompt"] != "Coordinate the project" {
		t.Fatalf("metadata = %#v, want prompt", session.Metadata)
	}
}

func TestSessionListJSONNoSessions(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	runApp, called := noopApp()

	out, err := execCLI(t, runApp, "session", "list", "--json")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *called {
		t.Fatal("session list should not start the server")
	}

	var got cliSessionListOutput
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("session list --json produced invalid JSON: %v\n%s", err, out)
	}
	if got.Count != 0 || len(got.Sessions) != 0 {
		t.Fatalf("got count=%d len=%d, want no sessions", got.Count, len(got.Sessions))
	}
}

func TestCommandAcknowledgementJSON(t *testing.T) {
	cmd := newRootCmd(func(context.Context, app.Config) error {
		return nil
	}, fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}})
	var buf bytes.Buffer
	cmd.SetOut(&buf)

	if err := writeJSON(cmd, cliStopOutput{ID: "sess-1", Stopped: true}); err != nil {
		t.Fatalf("write stop json: %v", err)
	}
	var stop cliStopOutput
	if err := json.Unmarshal(buf.Bytes(), &stop); err != nil {
		t.Fatalf("stop output is not JSON: %v", err)
	}
	if stop.ID != "sess-1" || !stop.Stopped {
		t.Fatalf("unexpected stop JSON: %#v", stop)
	}

	buf.Reset()
	if err := writeJSON(cmd, cliSendOutput{SessionID: "sess-1", ProjectPath: "/repo/app", Sent: true}); err != nil {
		t.Fatalf("write send json: %v", err)
	}
	var send cliSendOutput
	if err := json.Unmarshal(buf.Bytes(), &send); err != nil {
		t.Fatalf("send output is not JSON: %v", err)
	}
	if send.SessionID != "sess-1" || send.ProjectPath != "/repo/app" || !send.Sent {
		t.Fatalf("unexpected send JSON: %#v", send)
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

func TestRemovedVerbsDoNotStartServer(t *testing.T) {
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
			if !strings.Contains(err.Error(), "not inside a git repository") {
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

func TestSpawnAllowsOrchestratorWithoutPromptAtValidation(t *testing.T) {
	if err := validateSpawnRequest(session.SpawnRequest{
		Kind: session.KindOrchestrator,
	}); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestSpawnRejectsInvalidTypeBeforeStartingServer(t *testing.T) {
	runApp, called := noopApp()

	_, err := execCLI(t, runApp, "spawn", "--type", "manager", "--prompt", "do it")
	if err == nil {
		t.Fatal("expected an error for an invalid spawn type")
	}
	if *called {
		t.Fatal("spawn should not start the server")
	}
	if !strings.Contains(err.Error(), "--type") {
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
	if !strings.Contains(out, Version) {
		t.Fatalf("version output missing %q:\n%s", Version, out)
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

func runGit(t *testing.T, cwd string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
}
