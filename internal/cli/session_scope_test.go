package cli

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/session"
	"github.com/yyopc/yyork/internal/store"
)

func TestSessionListDefaultsToCurrentProjectInJSON(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_PROJECT_PATH", "/repo/current")
	seedSessionScopeStore(t,
		sessionScopeRow("current-session", "/repo/current"),
		sessionScopeRow("other-session", "/repo/other"),
	)

	runApp, _ := noopApp()
	out, err := execCLI(t, runApp, "session", "list", "--json")
	if err != nil {
		t.Fatalf("session list --json: %v", err)
	}

	var got cliSessionListOutput
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("decode output: %v\n%s", err, out)
	}
	if got.Count != 1 || len(got.Sessions) != 1 || got.Sessions[0].ID != "current-session" {
		t.Fatalf("session list leaked another project: %#v", got)
	}
	if got.Sessions[0].ProjectID != session.ProjectID("/repo/current") ||
		got.Sessions[0].ProjectPath != "/repo/current" {
		t.Fatalf("session list omitted project identity: %#v", got.Sessions[0])
	}
}

func TestSessionListAllReturnsEveryProject(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_PROJECT_PATH", "/repo/current")
	seedSessionScopeStore(t,
		sessionScopeRow("current-session", "/repo/current"),
		sessionScopeRow("other-session", "/repo/other"),
	)

	runApp, _ := noopApp()
	out, err := execCLI(t, runApp, "session", "list", "--json", "--all")
	if err != nil {
		t.Fatalf("session list --all: %v", err)
	}

	var got cliSessionListOutput
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("decode output: %v\n%s", err, out)
	}
	if got.Count != 2 || len(got.Sessions) != 2 {
		t.Fatalf("session list --all count = %d, want 2: %#v", got.Count, got)
	}
}

func TestSessionListRejectsProjectPath(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	runApp, _ := noopApp()

	_, err := execCLI(t, runApp, "session", "list", "--project", "/repo/current")
	if err == nil {
		t.Fatal("session list accepted a project path")
	}
	if got, want := err.Error(), `session list: --project must be a project id, got "/repo/current"`; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestSessionListRejectsAllWithProject(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	runApp, _ := noopApp()
	projectID := session.ProjectID("/repo/current")

	_, err := execCLI(t, runApp, "session", "list", "--all", "--project", projectID)
	if err == nil {
		t.Fatal("session list accepted --all with --project")
	}
	if got, want := err.Error(), "session list: --all and --project cannot be used together"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestSessionListUsesCWDWhenProjectEnvIsEmpty(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_PROJECT_PATH", "")
	projectPath := t.TempDir()
	otherPath := t.TempDir()
	previousCWD, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(projectPath); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(previousCWD); err != nil {
			t.Errorf("restore cwd: %v", err)
		}
	})
	resolvedCWD, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	seedSessionScopeStore(t,
		sessionScopeRow("cwd-session", resolvedCWD),
		sessionScopeRow("other-session", otherPath),
	)

	runApp, _ := noopApp()
	out, err := execCLI(t, runApp, "session", "list", "--json")
	if err != nil {
		t.Fatalf("session list --json: %v", err)
	}

	var got cliSessionListOutput
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("decode output: %v\n%s", err, out)
	}
	if got.Count != 1 || got.Sessions[0].ID != "cwd-session" {
		t.Fatalf("session list did not scope to cwd: %#v", got)
	}
}

func TestSessionListHumanOutputDoesNotMentionHiddenProjects(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_PROJECT_PATH", "/repo/current")
	seedSessionScopeStore(t,
		sessionScopeRow("current-session", "/repo/current"),
		sessionScopeRow("other-session", "/repo/other"),
	)

	runApp, _ := noopApp()
	out, err := execCLI(t, runApp, "session", "list")
	if err != nil {
		t.Fatalf("session list: %v", err)
	}
	if !strings.Contains(out, "current-session") || strings.Contains(out, "other-session") {
		t.Fatalf("human list was not project scoped:\n%s", out)
	}
	if strings.Contains(strings.ToLower(out), "hidden") || strings.Contains(out, "--all") {
		t.Fatalf("human list included a suppression notice:\n%s", out)
	}
}

func TestStopProjectRequiresSessionID(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	runApp, _ := noopApp()

	_, err := execCLI(t, runApp, "stop", "--project", session.ProjectID("/repo/current"))
	if err == nil {
		t.Fatal("stop --project without a session id succeeded")
	}
	if got, want := err.Error(), "stop: --project requires a sessionID"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestStopBlocksCrossProjectSessionBeforeZellij(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_PROJECT_PATH", "/repo/current")
	t.Setenv("YYORK_ZELLIJ", filepath.Join(t.TempDir(), "missing-zellij"))
	seedSessionScopeStore(t, sessionScopeRow("cross-stop", "/repo/other"))

	runApp, _ := noopApp()
	_, err := execCLI(t, runApp, "stop", "cross-stop")
	if err == nil {
		t.Fatal("cross-project stop succeeded")
	}
	ownerID := session.ProjectID("/repo/other")
	want := "stop: blocked cross-project target: session cross-stop belongs to project " + ownerID +
		"; rerun with --project " + ownerID + " to act intentionally"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err, want)
	}
	assertSessionScopeRowExists(t, "cross-stop")
}

func TestSendBlocksCrossProjectSessionBeforeZellij(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("YYORK_PROJECT_PATH", "/repo/current")
	t.Setenv("YYORK_ZELLIJ", filepath.Join(t.TempDir(), "missing-zellij"))
	seedSessionScopeStore(t, sessionScopeRow("cross-send", "/repo/other"))

	runApp, _ := noopApp()
	_, err := execCLI(t, runApp, "send", "--session", "cross-send", "continue")
	if err == nil {
		t.Fatal("cross-project send succeeded")
	}
	ownerID := session.ProjectID("/repo/other")
	want := "send: blocked cross-project target: session cross-send belongs to project " + ownerID +
		"; rerun with --project " + ownerID + " to act intentionally"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err, want)
	}
	assertSessionScopeRowExists(t, "cross-send")
}

func TestStopRejectsProjectPath(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	runApp, _ := noopApp()

	_, err := execCLI(t, runApp, "stop", "--project", "/repo/other", "missing-session")
	if err == nil {
		t.Fatal("stop accepted a project path")
	}
	if got, want := err.Error(), `stop: --project must be a project id, got "/repo/other"`; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestSendRejectsProjectPath(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	runApp, _ := noopApp()

	_, err := execCLI(t, runApp, "send", "--project", "/repo/other", "--session", "missing-session", "continue")
	if err == nil {
		t.Fatal("send accepted a project path")
	}
	if got, want := err.Error(), `send: --project must be a project id, got "/repo/other"`; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestValidateSessionProjectAccessAllowsSameProjectAndMatchingOverride(t *testing.T) {
	currentID := session.ProjectID("/repo/current")
	otherID := session.ProjectID("/repo/other")

	if err := validateSessionProjectAccess("stop", "same-session", currentID, currentID, ""); err != nil {
		t.Fatalf("same-project access: %v", err)
	}
	if err := validateSessionProjectAccess("send", "cross-session", otherID, currentID, otherID); err != nil {
		t.Fatalf("matching project override: %v", err)
	}
}

func TestValidateSessionProjectAccessRejectsWrongOverride(t *testing.T) {
	currentID := session.ProjectID("/repo/current")
	ownerID := session.ProjectID("/repo/owner")
	wrongID := session.ProjectID("/repo/wrong")

	err := validateSessionProjectAccess("send", "cross-session", ownerID, currentID, wrongID)
	want := "send: blocked cross-project target: session cross-session belongs to project " + ownerID +
		"; rerun with --project " + ownerID + " to act intentionally"
	if err == nil || err.Error() != want {
		t.Fatalf("error = %v, want %q", err, want)
	}
}

func TestSessionScopeHelpDocumentsProjectIDContract(t *testing.T) {
	runApp, _ := noopApp()

	listHelp, err := execCLI(t, runApp, "session", "list", "--help")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(listHelp, "--all") || !strings.Contains(listHelp, "project id") {
		t.Fatalf("session list help missing scope flags:\n%s", listHelp)
	}

	stopHelp, err := execCLI(t, runApp, "stop", "--help")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(stopHelp, "--project") || !strings.Contains(stopHelp, "project id") {
		t.Fatalf("stop help missing project-id override:\n%s", stopHelp)
	}

	sendHelp, err := execCLI(t, runApp, "send", "--help")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sendHelp, "project id") || strings.Contains(sendHelp, "duplicate session") {
		t.Fatalf("send help has stale project semantics:\n%s", sendHelp)
	}
}

func sessionScopeRow(id, projectPath string) store.Session {
	return store.Session{
		ID:            id,
		ProjectPath:   projectPath,
		ProjectName:   filepath.Base(projectPath),
		AgentPlugin:   "codex",
		WorkspacePath: projectPath,
		ZellijSession: id,
		Metadata: map[string]any{
			"kind":          "worker",
			"workspaceMode": "local",
		},
	}
}

func seedSessionScopeStore(t *testing.T, rows ...store.Session) {
	t.Helper()
	ctx := context.Background()
	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := dataStore.Close(); err != nil {
			t.Errorf("close store: %v", err)
		}
	})
	for _, row := range rows {
		if err := dataStore.Sessions().Insert(ctx, row); err != nil {
			t.Fatalf("insert %s: %v", row.ID, err)
		}
	}
}

func assertSessionScopeRowExists(t *testing.T, id string) {
	t.Helper()
	ctx := context.Background()
	dbPath, err := store.DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	dataStore, err := store.Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := dataStore.Close(); err != nil {
			t.Errorf("close store: %v", err)
		}
	}()
	if _, err := dataStore.Sessions().Get(ctx, id); err != nil {
		if errors.Is(err, store.ErrSessionNotFound) {
			t.Fatalf("session %s was deleted", id)
		}
		t.Fatalf("get session %s: %v", id, err)
	}
}
