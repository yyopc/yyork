package session_test

import (
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/session"
)

func TestDefaultPromptsRenderContext(t *testing.T) {
	t.Parallel()
	pc := session.PromptContext{
		SessionID:             "abc123",
		ProjectPath:           "/home/u/proj",
		ProjectName:           "proj",
		WorkspacePath:         "/data/worktrees/abc123",
		Branch:                "yyork/abc123",
		BaseRef:               "refs/heads/main",
		WorkspaceInstruction:  "Your workspace is an isolated git worktree at /data/worktrees/abc123, on branch yyork/abc123 (cut from refs/heads/main).",
		CompletionInstruction: "Commit your work on this branch and stay on it.",
	}

	renderers := map[string]func(session.PromptContext) (string, error){
		"orchestrator": session.DefaultOrchestratorSystemPrompt,
		"worker":       session.DefaultWorkerSystemPrompt,
	}
	for name, render := range renderers {
		got, err := render(pc)
		if err != nil {
			t.Fatalf("%s: render: %v", name, err)
		}
		if strings.Contains(got, "{{") {
			t.Errorf("%s: unrendered template syntax in %q", name, got)
		}
		if !strings.Contains(got, pc.ProjectName) || !strings.Contains(got, pc.ProjectPath) {
			t.Errorf("%s: prompt missing project context: %q", name, got)
		}
	}

	worker, err := session.DefaultWorkerSystemPrompt(pc)
	if err != nil {
		t.Fatalf("worker: render: %v", err)
	}
	for _, want := range []string{pc.WorkspacePath, pc.Branch, pc.BaseRef} {
		if !strings.Contains(worker, want) {
			t.Errorf("worker prompt missing %q", want)
		}
	}
	if !strings.Contains(worker, "choose `new worktree`") ||
		!strings.Contains(worker, "session\n  workspace menu") {
		t.Errorf("worker prompt missing fork handoff instruction: %q", worker)
	}

	orchestrator, err := session.DefaultOrchestratorSystemPrompt(pc)
	if err != nil {
		t.Fatalf("orchestrator: render: %v", err)
	}
	if !strings.Contains(orchestrator, `yyork spawn --json --type worker --prompt "<task>"`) {
		t.Errorf("orchestrator prompt missing plain spawn example: %q", orchestrator)
	}
	if !strings.Contains(orchestrator, "Start implementation.") {
		t.Errorf("orchestrator prompt missing fork implementation prompt: %q", orchestrator)
	}
	if strings.Contains(orchestrator, "--workspace") {
		t.Errorf("orchestrator prompt should not expose --workspace: %q", orchestrator)
	}
}

func TestDefaultPromptsTellYyorkAgentsToUsePortlessURL(t *testing.T) {
	t.Parallel()
	pc := session.PromptContext{
		ProjectPath:           "/home/u/yyork",
		ProjectName:           "yyork",
		WorkspacePath:         "/data/worktrees/abc123",
		Branch:                "yyork/abc123",
		BaseRef:               "refs/heads/main",
		WorkspaceInstruction:  "Your workspace is an isolated git worktree.",
		CompletionInstruction: "Commit your work on this branch and stay on it.",
	}

	renderers := map[string]func(session.PromptContext) (string, error){
		"orchestrator": session.DefaultOrchestratorSystemPrompt,
		"worker":       session.DefaultWorkerSystemPrompt,
	}
	for name, render := range renderers {
		got, err := render(pc)
		if err != nil {
			t.Fatalf("%s: render: %v", name, err)
		}
		for _, want := range []string{
			"d3k:agent",
			"pnpm dev",
			"https://yyork.localhost",
			"dev:docs",
			"dev:mock",
			"dev:sb",
			"http://127.0.0.1:3000",
		} {
			if !strings.Contains(got, want) {
				t.Errorf("%s prompt missing %q in %q", name, want, got)
			}
		}
	}
}
