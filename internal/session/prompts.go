package session

import (
	_ "embed"
	"strings"
)

//go:embed prompts/orchestrator.md
var orchestratorPrompt string

//go:embed prompts/worker.md
var workerPrompt string

// DefaultOrchestratorSystemPrompt is the built-in instruction set for yyork's
// project coordinator session. It is system/developer context, not an initial
// user message, so the orchestrator starts ready for the user to prompt it.
func DefaultOrchestratorSystemPrompt() string {
	return strings.TrimSpace(orchestratorPrompt)
}

// DefaultWorkerSystemPrompt is the built-in instruction set for worker
// sessions. Like the orchestrator prompt, it only applies when the spawn
// request supplies neither SystemPrompt nor SystemPromptFile.
func DefaultWorkerSystemPrompt() string {
	return strings.TrimSpace(workerPrompt)
}
