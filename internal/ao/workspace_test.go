package ao

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/yyovil/better-ao/internal/session"
)

func TestWorkspaceProviderReadsLiveAOWorkerSessions(t *testing.T) {
	baseDir := t.TempDir()
	writeFile(t, filepath.Join(baseDir, runningFileName), `{
  "configPath": "/repo/agent-orchestrator/agent-orchestrator.yaml",
  "projects": ["agent-orchestrator_abc123"]
}`)
	sessionsDir := filepath.Join(baseDir, "projects", "agent-orchestrator_abc123", "sessions")
	writeFile(t, filepath.Join(sessionsDir, "ao-orchestrator.json"), `{
  "agent": "codex",
  "role": "orchestrator",
  "lifecycle": {
    "session": {"kind": "orchestrator", "state": "idle"},
    "runtime": {"state": "alive", "handle": {"id": "ao-orchestrator", "runtimeName": "zellij", "data": {"sessionName": "ao-orchestrator"}}}
  }
}`)
	writeFile(t, filepath.Join(sessionsDir, "ao-41.json"), `{
  "agent": "codex",
  "branch": "feature/live-terminal",
  "displayName": "Live worker",
  "project": "agent-orchestrator_abc123",
  "status": "mergeable",
  "userPrompt": "Implement the live terminal attach path.",
  "worktree": "/tmp/ao-41",
  "lifecycle": {
    "session": {"kind": "worker", "state": "idle"},
    "runtime": {
      "state": "alive",
      "handle": {
        "id": "ao-41",
        "runtimeName": "zellij",
        "data": {"sessionName": "ao-41", "workspacePath": "/tmp/ao-41"}
      }
    }
  },
  "runtimeHandle": {
    "id": "ao-41",
    "runtimeName": "zellij",
    "data": {"sessionName": "ao-41", "workspacePath": "/tmp/ao-41"}
  },
  "pr": "https://github.com/example/repo/pull/12"
}`)
	writeFile(t, filepath.Join(sessionsDir, "ao-dead.json"), `{
  "agent": "codex",
  "status": "stuck",
  "lifecycle": {
    "session": {"kind": "worker", "state": "stuck"},
    "runtime": {"state": "exited", "handle": {"id": "ao-dead", "runtimeName": "zellij", "data": {"sessionName": "ao-dead"}}}
  }
}`)

	provider := WorkspaceProvider{
		BaseDir:    baseDir,
		ZellijPath: "zellij",
		ZellijHasSession: func(_ context.Context, target string) bool {
			return target == "ao-41" || target == "ao-orchestrator"
		},
	}

	workspace, err := provider.Workspace(context.Background())
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}

	if workspace.ActiveProjectID != "agent-orchestrator_abc123" {
		t.Fatalf("unexpected active project: %q", workspace.ActiveProjectID)
	}
	if got := workspace.Projects[0].Name; got != "Agent Orchestrator" {
		t.Fatalf("unexpected project name: %q", got)
	}
	if got := workspace.Projects[0].CWD; got != "/repo/agent-orchestrator" {
		t.Fatalf("unexpected project cwd: %q", got)
	}
	if len(workspace.Orchestrators) != 1 {
		t.Fatalf("expected one orchestrator session, got %#v", workspace.Orchestrators)
	}
	if len(workspace.Sessions) != 1 {
		t.Fatalf("expected one worker session, got %#v", workspace.Sessions)
	}

	orchestrator := workspace.Orchestrators[0]
	if orchestrator.ID != "ao-orchestrator" || orchestrator.Kind != "orchestrator" {
		t.Fatalf("unexpected orchestrator identity: %#v", orchestrator)
	}
	if !orchestrator.TerminalSupported {
		t.Fatal("expected live orchestrator to support terminals")
	}
	if orchestrator.ZellijSession != "ao-orchestrator" {
		t.Fatalf("unexpected orchestrator zellij session: %q", orchestrator.ZellijSession)
	}

	worker := workspace.Sessions[0]
	if worker.ID != "ao-41" || worker.WorkerID != "[AO-41]" {
		t.Fatalf("unexpected worker identity: %#v", worker)
	}
	if worker.Kind != "worker" {
		t.Fatalf("expected worker kind, got %q", worker.Kind)
	}
	if worker.State != session.StatePrompt {
		t.Fatalf("expected prompt state, got %q", worker.State)
	}
	if !worker.TerminalSupported {
		t.Fatal("expected live zellij worker to support terminals")
	}
	if worker.ZellijSession != "ao-41" {
		t.Fatalf("unexpected zellij session: %q", worker.ZellijSession)
	}
	if worker.TerminalKey != "agent-orchestrator_abc123/ao-41" {
		t.Fatalf("unexpected terminal key: %q", worker.TerminalKey)
	}
	if len(worker.AttachCommand) != 3 || worker.AttachCommand[0] != "zellij" || worker.AttachCommand[1] != "attach" || worker.AttachCommand[2] != "ao-41" {
		t.Fatalf("unexpected attach command: %#v", worker.AttachCommand)
	}
}

func TestWorkspaceProviderSupportsZellijRuntime(t *testing.T) {
	baseDir := t.TempDir()
	writeFile(t, filepath.Join(baseDir, runningFileName), `{
  "projects": ["better-ao_abc123"]
}`)
	sessionsDir := filepath.Join(baseDir, "projects", "better-ao_abc123", "sessions")
	writeFile(t, filepath.Join(sessionsDir, "bao-1.json"), `{
  "agent": "codex",
  "branch": "feature/zellij-runtime",
  "status": "working",
  "lifecycle": {
    "session": {"kind": "worker", "state": "working"},
    "runtime": {
      "state": "alive",
      "handle": {
        "id": "bao-zellij-worker",
        "runtimeName": "zellij",
        "data": {
          "sessionName": "bao-zellij-worker",
          "workspacePath": "/tmp/bao-1"
        }
      }
    }
  }
}`)

	provider := WorkspaceProvider{
		BaseDir:    baseDir,
		ZellijPath: "zellij",
		ZellijHasSession: func(_ context.Context, target string) bool {
			return target == "bao-zellij-worker"
		},
	}

	workspace, err := provider.Workspace(context.Background())
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}
	if len(workspace.Sessions) != 1 {
		t.Fatalf("expected one worker session, got %#v", workspace.Sessions)
	}

	worker := workspace.Sessions[0]
	if !worker.TerminalSupported {
		t.Fatal("expected live zellij worker to support terminals")
	}
	if worker.ZellijSession != "bao-zellij-worker" {
		t.Fatalf("unexpected zellij session: %q", worker.ZellijSession)
	}
	if len(worker.AttachCommand) != 3 || worker.AttachCommand[0] != "zellij" || worker.AttachCommand[1] != "attach" || worker.AttachCommand[2] != "bao-zellij-worker" {
		t.Fatalf("unexpected attach command: %#v", worker.AttachCommand)
	}
}

func TestWorkspaceProviderReturnsEmptyWorkspaceWhenAORuntimeIsNotRunning(t *testing.T) {
	provider := WorkspaceProvider{BaseDir: t.TempDir()}

	workspace, err := provider.Workspace(context.Background())
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}

	if workspace.ActiveProjectID != "local" {
		t.Fatalf("unexpected active project: %q", workspace.ActiveProjectID)
	}
	if len(workspace.Sessions) != 0 {
		t.Fatalf("expected no sessions, got %#v", workspace.Sessions)
	}
}

func TestWorkspaceProviderIgnoresNonZellijRuntimeForTerminalAttach(t *testing.T) {
	baseDir := t.TempDir()
	writeFile(t, filepath.Join(baseDir, runningFileName), `{
  "projects": ["ao-legacy_abc123"]
}`)
	sessionsDir := filepath.Join(baseDir, "projects", "ao-legacy_abc123", "sessions")
	writeFile(t, filepath.Join(sessionsDir, "legacy-1.json"), `{
  "agent": "codex",
  "branch": "feature/legacy-runtime",
  "status": "working",
  "worktree": "/tmp/legacy-1",
  "lifecycle": {
    "session": {"kind": "worker", "state": "working"},
    "runtime": {
      "state": "alive",
      "handle": {
        "id": "legacy-1",
        "runtimeName": "process",
        "data": {
          "workspacePath": "/tmp/legacy-1"
        }
      }
    }
  }
}`)

	provider := WorkspaceProvider{BaseDir: baseDir}
	workspace, err := provider.Workspace(context.Background())
	if err != nil {
		t.Fatalf("workspace: %v", err)
	}
	if len(workspace.Sessions) != 1 {
		t.Fatalf("expected one worker session, got %#v", workspace.Sessions)
	}

	worker := workspace.Sessions[0]
	if worker.TerminalSupported {
		t.Fatal("expected non-zellij worker not to support terminals")
	}
	if len(worker.AttachCommand) != 0 {
		t.Fatalf("non-zellij worker should not use attach command: %#v", worker.AttachCommand)
	}
	if worker.ZellijSession != "" {
		t.Fatalf("non-zellij worker should not expose a zellij session, got %q", worker.ZellijSession)
	}
}

func writeFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
}
