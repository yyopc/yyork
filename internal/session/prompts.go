package session

import (
	_ "embed"
	"strings"
	"text/template"
)

//go:embed prompts/orchestrator.md
var orchestratorPromptMD string

//go:embed prompts/worker.md
var workerPromptMD string

// Parsed at init via Must so a malformed prompt template fails at startup
// (and in every test run), not mid-spawn.
var (
	orchestratorPromptTmpl = template.Must(template.New("orchestrator").Parse(orchestratorPromptMD))
	workerPromptTmpl       = template.Must(template.New("worker").Parse(workerPromptMD))
)

// PromptContext carries the per-session facts rendered into the built-in
// system prompts.
type PromptContext struct {
	SessionID             string
	ProjectPath           string
	ProjectName           string
	WorkspacePath         string
	Branch                string
	BaseRef               string
	WorkspaceInstruction  string
	CompletionInstruction string
}

// DefaultOrchestratorSystemPrompt renders the built-in instruction set for
// yyork's project coordinator session. It is system/developer context, not an
// initial user message, so the orchestrator starts ready for the user to
// prompt it.
func DefaultOrchestratorSystemPrompt(pc PromptContext) (string, error) {
	return renderPrompt(orchestratorPromptTmpl, pc)
}

// DefaultWorkerSystemPrompt renders the built-in instruction set for worker
// sessions. Like the orchestrator prompt, it only applies when the spawn
// request supplies neither SystemPrompt nor SystemPromptFile.
func DefaultWorkerSystemPrompt(pc PromptContext) (string, error) {
	return renderPrompt(workerPromptTmpl, pc)
}

func renderPrompt(t *template.Template, pc PromptContext) (string, error) {
	var b strings.Builder
	if err := t.Execute(&b, pc); err != nil {
		return "", err
	}
	return strings.TrimSpace(b.String()), nil
}
