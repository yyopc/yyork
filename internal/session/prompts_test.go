package session_test

import (
	"strings"
	"testing"

	"github.com/yyopc/yyork/internal/session"
)

func TestDefaultPromptsRenderContext(t *testing.T) {
	t.Parallel()
	pc := session.PromptContext{
		SessionID:     "abc123",
		ProjectPath:   "/home/u/proj",
		ProjectName:   "proj",
		WorkspacePath: "/data/worktrees/abc123",
		Branch:        "yyork/abc123",
		BaseRef:       "refs/heads/main",
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
}
