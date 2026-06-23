package session

import "strings"

type State string
type Kind string
type WorkerWorkspaceMode string

const (
	StateWorking State = "working"
	StatePrompt  State = "prompt"
	StateTriage  State = "triage"
	StateDone    State = "done"
)

const (
	KindOrchestrator Kind = "orchestrator"
	KindWorker       Kind = "worker"
)

const (
	WorkerWorkspaceModeNewWorktree WorkerWorkspaceMode = "new-worktree"
	WorkerWorkspaceModeLocal       WorkerWorkspaceMode = "local"
)

func DefaultWorkerWorkspaceMode() WorkerWorkspaceMode {
	return WorkerWorkspaceModeLocal
}

func NormalizeWorkerWorkspaceMode(raw string) (WorkerWorkspaceMode, bool) {
	switch WorkerWorkspaceMode(raw) {
	case "":
		return DefaultWorkerWorkspaceMode(), true
	case WorkerWorkspaceModeNewWorktree:
		return WorkerWorkspaceModeNewWorktree, true
	case WorkerWorkspaceModeLocal:
		return WorkerWorkspaceModeLocal, true
	default:
		return "", false
	}
}

func NormalizeAgentPlugin(raw string) (string, bool) {
	switch strings.TrimSpace(raw) {
	case "":
		return "", true
	case "claude-code", "codex":
		return strings.TrimSpace(raw), true
	default:
		return "", false
	}
}

type Session struct {
	AttachCommand     []string `json:"-"`
	Agent             string   `json:"agent"`
	AgentPluginID     string   `json:"agentPluginId,omitempty"`
	CWD               string   `json:"cwd,omitempty"`
	Description       string   `json:"description"`
	ID                string   `json:"id"`
	Issue             string   `json:"issue"`
	Kind              Kind     `json:"kind,omitempty"`
	Metadata          string   `json:"metadata"`
	Project           string   `json:"project"`
	ProjectPath       string   `json:"projectPath,omitempty"`
	Recap             string   `json:"recap"`
	Selected          bool     `json:"selected,omitempty"`
	State             State    `json:"state"`
	TerminalKey       string   `json:"-"`
	TerminalSupported bool     `json:"terminalSupported,omitempty"`
	Title             string   `json:"title"`
	WorkerID          string   `json:"workerId"`
	ZellijSession     string   `json:"zellijSession,omitempty"`
}

type Project struct {
	CWD                 string              `json:"cwd,omitempty"`
	ID                  string              `json:"id"`
	Name                string              `json:"name"`
	Path                string              `json:"path"`
	WorkerWorkspaceMode WorkerWorkspaceMode `json:"workerWorkspaceMode"`
}

type Workspace struct {
	ActiveProjectID string    `json:"activeProjectId"`
	Orchestrators   []Session `json:"orchestrators,omitempty"`
	Projects        []Project `json:"projects"`
	Sessions        []Session `json:"sessions"`
}

func (w Workspace) Session(id string) (Session, bool) {
	for _, session := range w.allTerminalSessions() {
		if session.ID == id {
			return session, true
		}
	}

	return Session{}, false
}

func (w Workspace) ProjectSession(projectID string, id string) (Session, bool) {
	for _, session := range w.allTerminalSessions() {
		if SessionProjectMatches(session, projectID) && session.ID == id {
			return session, true
		}
	}

	return Session{}, false
}

func (w Workspace) allTerminalSessions() []Session {
	sessions := append([]Session{}, w.Sessions...)
	return append(sessions, w.Orchestrators...)
}
