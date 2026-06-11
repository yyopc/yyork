package ao

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/yyopc/yyork/internal/session"
)

const runningFileName = "running.json"

type WorkspaceProvider struct {
	BaseDir          string
	ZellijHasSession func(context.Context, string) bool
	ZellijPath       string
}

type runningFile struct {
	ConfigPath string   `json:"configPath"`
	Projects   []string `json:"projects"`
}

type sessionMetadata struct {
	Agent             string          `json:"agent"`
	Branch            string          `json:"branch"`
	CreatedAt         string          `json:"createdAt"`
	DisplayName       string          `json:"displayName"`
	Issue             string          `json:"issue"`
	Lifecycle         lifecycle       `json:"lifecycle"`
	LifecycleEvidence string          `json:"lifecycleEvidence"`
	PR                json.RawMessage `json:"pr"`
	Project           string          `json:"project"`
	Role              string          `json:"role"`
	RuntimeHandle     runtimeHandle   `json:"runtimeHandle"`
	Status            string          `json:"status"`
	UserPrompt        string          `json:"userPrompt"`
	Worktree          string          `json:"worktree"`
	modifiedAt        time.Time
}

type lifecycle struct {
	Session lifecycleSession `json:"session"`
	Runtime lifecycleRuntime `json:"runtime"`
}

type lifecycleSession struct {
	Kind  string `json:"kind"`
	State string `json:"state"`
}

type lifecycleRuntime struct {
	Handle runtimeHandle `json:"handle"`
	State  string        `json:"state"`
}

type runtimeHandle struct {
	ID          string         `json:"id"`
	RuntimeName string         `json:"runtimeName"`
	Data        map[string]any `json:"data"`
}

type sessionRecord struct {
	id   string
	meta sessionMetadata
}

func NewWorkspaceProvider() *WorkspaceProvider {
	return &WorkspaceProvider{}
}

func (p *WorkspaceProvider) Workspace(ctx context.Context) (session.Workspace, error) {
	baseDir, err := p.baseDir()
	if err != nil {
		return session.Workspace{}, err
	}

	running, err := readRunningFile(filepath.Join(baseDir, runningFileName))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return emptyWorkspace(), nil
		}
		return session.Workspace{}, err
	}

	projectIDs := running.Projects
	if len(projectIDs) == 0 {
		projectIDs = listProjectIDs(filepath.Join(baseDir, "projects"))
	}
	if len(projectIDs) == 0 {
		return emptyWorkspace(), nil
	}

	projects := make([]session.Project, 0, len(projectIDs))
	orchestratorSessions := make([]session.Session, 0, len(projectIDs))
	workerSessions := make([]session.Session, 0)
	for _, projectID := range projectIDs {
		records, orchestrators, err := p.readProjectSessions(ctx, baseDir, projectID)
		if err != nil {
			return session.Workspace{}, err
		}
		projects = append(projects, session.Project{
			CWD:  projectCWD(projectID, running.ConfigPath, baseDir, orchestrators),
			ID:   projectID,
			Name: projectName(projectID, running.ConfigPath),
		})
		for _, record := range records {
			workerSessions = append(workerSessions, record)
		}
		for _, record := range orchestrators {
			orchestratorSessions = append(orchestratorSessions, record)
		}
	}

	sort.SliceStable(workerSessions, func(i, j int) bool {
		if workerSessions[i].TerminalSupported != workerSessions[j].TerminalSupported {
			return workerSessions[i].TerminalSupported
		}
		return compareWorkerIDs(workerSessions[i].ID, workerSessions[j].ID) > 0
	})

	for index := range workerSessions {
		workerSessions[index].Selected = index == 0
	}

	return session.Workspace{
		ActiveProjectID: projectIDs[0],
		Orchestrators:   orchestratorSessions,
		Projects:        projects,
		Sessions:        workerSessions,
	}, nil
}

func (p *WorkspaceProvider) readProjectSessions(ctx context.Context, baseDir string, projectID string) ([]session.Session, []session.Session, error) {
	sessionsDir := filepath.Join(baseDir, "projects", projectID, "sessions")
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil, nil
		}
		return nil, nil, fmt.Errorf("read AO sessions for %s: %w", projectID, err)
	}

	orchestratorRecords := make([]sessionRecord, 0, 1)
	workerRecords := make([]sessionRecord, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), ".json")
		meta, err := readSessionMetadata(filepath.Join(sessionsDir, entry.Name()))
		if err != nil {
			return nil, nil, err
		}
		if isTerminal(meta) {
			continue
		}
		if meta.Project == "" {
			meta.Project = projectID
		}

		record := sessionRecord{id: id, meta: meta}
		if isOrchestrator(id, meta) {
			orchestratorRecords = append(orchestratorRecords, record)
			continue
		}

		workerRecords = append(workerRecords, record)
	}

	sort.SliceStable(workerRecords, func(i, j int) bool {
		if !workerRecords[i].meta.modifiedAt.Equal(workerRecords[j].meta.modifiedAt) {
			return workerRecords[i].meta.modifiedAt.After(workerRecords[j].meta.modifiedAt)
		}
		return compareWorkerIDs(workerRecords[i].id, workerRecords[j].id) > 0
	})
	sort.SliceStable(orchestratorRecords, func(i, j int) bool {
		if !orchestratorRecords[i].meta.modifiedAt.Equal(orchestratorRecords[j].meta.modifiedAt) {
			return orchestratorRecords[i].meta.modifiedAt.After(orchestratorRecords[j].meta.modifiedAt)
		}
		return orchestratorRecords[i].id < orchestratorRecords[j].id
	})

	workerSessions := make([]session.Session, 0, len(workerRecords))
	for _, record := range workerRecords {
		workerSessions = append(workerSessions, p.toWorkerSession(ctx, projectID, record))
	}

	orchestratorSessions := make([]session.Session, 0, len(orchestratorRecords))
	for _, record := range orchestratorRecords {
		orchestratorSessions = append(orchestratorSessions, p.toOrchestratorSession(ctx, projectID, record))
	}

	return workerSessions, orchestratorSessions, nil
}

func (p *WorkspaceProvider) toWorkerSession(ctx context.Context, projectID string, record sessionRecord) session.Session {
	meta := record.meta
	handle := firstRuntimeHandle(meta)
	cwd := firstNonEmpty(meta.Worktree, stringFromMap(handle.Data, "workspacePath"))
	zellijSession := zellijSessionName(handle)

	workerSession := session.Session{
		Agent:         firstNonEmpty(meta.Agent, "unknown"),
		AgentPluginID: firstNonEmpty(meta.Agent, "unknown"),
		CWD:           cwd,
		Description:   description(meta),
		ID:            record.id,
		Issue:         issueLabel(meta),
		Kind:          session.KindWorker,
		Metadata:      metadataLabel(meta),
		Project:       projectID,
		State:         mapSessionState(meta),
		TerminalKey:   projectID + "/" + record.id,
		Title:         title(record.id, meta),
		WorkerID:      workerID(record.id),
		ZellijSession: zellijSession,
	}

	if command, ok := p.attachCommand(ctx, zellijSession); ok {
		workerSession.AttachCommand = command
		workerSession.TerminalSupported = true
	}

	return workerSession
}

func (p *WorkspaceProvider) toOrchestratorSession(ctx context.Context, projectID string, record sessionRecord) session.Session {
	meta := record.meta
	handle := firstRuntimeHandle(meta)
	cwd := firstNonEmpty(meta.Worktree, stringFromMap(handle.Data, "workspacePath"))
	zellijSession := zellijSessionName(handle)

	orchestratorSession := session.Session{
		Agent:         firstNonEmpty(meta.Agent, "unknown"),
		AgentPluginID: firstNonEmpty(meta.Agent, "unknown"),
		CWD:           cwd,
		Description:   description(meta),
		ID:            record.id,
		Issue:         "Orchestrator",
		Kind:          session.KindOrchestrator,
		Metadata:      metadataLabel(meta),
		Project:       projectID,
		State:         mapSessionState(meta),
		TerminalKey:   projectID + "/" + record.id,
		Title:         "Project orchestrator",
		WorkerID:      "[ORCHESTRATOR]",
		ZellijSession: zellijSession,
	}

	if command, ok := p.attachCommand(ctx, zellijSession); ok {
		orchestratorSession.AttachCommand = command
		orchestratorSession.TerminalSupported = true
	}

	return orchestratorSession
}

func (p *WorkspaceProvider) attachCommand(ctx context.Context, zellijSession string) ([]string, bool) {
	if zellijSession == "" {
		return nil, false
	}

	zellijPath := p.zellijPath()
	if zellijPath == "" || !p.hasZellijSession(ctx, zellijSession) {
		return nil, false
	}

	return []string{zellijPath, "attach", zellijSession}, true
}

func (p *WorkspaceProvider) hasZellijSession(ctx context.Context, target string) bool {
	if p.ZellijHasSession != nil {
		return p.ZellijHasSession(ctx, target)
	}

	zellijPath := p.zellijPath()
	if zellijPath == "" {
		return false
	}

	probeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(probeCtx, zellijPath, "list-sessions", "--short", "--no-formatting")
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	for _, line := range strings.Split(string(output), "\n") {
		if strings.TrimSpace(line) == target {
			return true
		}
	}

	return false
}

func (p *WorkspaceProvider) zellijPath() string {
	if p.ZellijPath != "" {
		return p.ZellijPath
	}

	candidates := []string{
		"/opt/homebrew/bin/zellij",
		"/usr/local/bin/zellij",
		"/usr/bin/zellij",
		"/run/current-system/sw/bin/zellij",
	}
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates, filepath.Join(home, ".nix-profile", "bin", "zellij"))
	}
	if user := os.Getenv("USER"); user != "" {
		candidates = append(candidates, filepath.Join("/etc/profiles/per-user", user, "bin", "zellij"))
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			p.ZellijPath = candidate
			return candidate
		}
	}

	if path, err := exec.LookPath("zellij"); err == nil {
		p.ZellijPath = path
		return path
	}

	return ""
}

func (p *WorkspaceProvider) baseDir() (string, error) {
	if p.BaseDir != "" {
		return p.BaseDir, nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home: %w", err)
	}

	return filepath.Join(home, ".agent-orchestrator"), nil
}

func readRunningFile(path string) (runningFile, error) {
	var running runningFile
	data, err := os.ReadFile(path)
	if err != nil {
		return runningFile{}, err
	}
	if err := json.Unmarshal(data, &running); err != nil {
		return runningFile{}, fmt.Errorf("decode AO running file: %w", err)
	}

	return running, nil
}

func readSessionMetadata(path string) (sessionMetadata, error) {
	var meta sessionMetadata
	data, err := os.ReadFile(path)
	if err != nil {
		return meta, err
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		return meta, fmt.Errorf("decode AO session metadata %s: %w", path, err)
	}
	if info, err := os.Stat(path); err == nil {
		meta.modifiedAt = info.ModTime()
	}

	return meta, nil
}

func listProjectIDs(projectsDir string) []string {
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return nil
	}

	projectIDs := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			projectIDs = append(projectIDs, entry.Name())
		}
	}
	sort.Strings(projectIDs)
	return projectIDs
}

func emptyWorkspace() session.Workspace {
	return session.Workspace{
		ActiveProjectID: "local",
		Projects: []session.Project{
			{ID: "local", Name: "Local"},
		},
		Sessions: []session.Session{},
	}
}

func firstRuntimeHandle(meta sessionMetadata) runtimeHandle {
	if meta.Lifecycle.Runtime.Handle.RuntimeName != "" || meta.Lifecycle.Runtime.Handle.ID != "" {
		return meta.Lifecycle.Runtime.Handle
	}

	return meta.RuntimeHandle
}

func zellijSessionName(handle runtimeHandle) string {
	if handle.RuntimeName != "zellij" {
		return ""
	}

	return firstNonEmpty(
		stringFromMap(handle.Data, "sessionName"),
		stringFromMap(handle.Data, "session"),
		handle.ID,
	)
}

func isOrchestrator(id string, meta sessionMetadata) bool {
	if meta.Role == "worker" || meta.Lifecycle.Session.Kind == "worker" {
		return false
	}

	return meta.Role == "orchestrator" ||
		meta.Lifecycle.Session.Kind == "orchestrator" ||
		id == "orchestrator" ||
		strings.HasSuffix(id, "-orchestrator") ||
		regexp.MustCompile(`-orchestrator-\d+$`).MatchString(id)
}

func isTerminal(meta sessionMetadata) bool {
	sessionState := meta.Lifecycle.Session.State
	runtimeState := meta.Lifecycle.Runtime.State
	if sessionState == "done" || sessionState == "terminated" {
		return true
	}
	if runtimeState == "missing" || runtimeState == "exited" {
		return true
	}

	switch meta.Status {
	case "merged", "killed", "closed", "done":
		return true
	default:
		return false
	}
}

func mapSessionState(meta sessionMetadata) session.State {
	switch meta.Status {
	case "mergeable", "review_pending", "changes_requested", "needs_response":
		return session.StatePrompt
	case "stuck", "detecting", "ci_failed", "failed":
		return session.StateTriage
	case "merged", "killed", "closed", "done":
		return session.StateDone
	default:
		if meta.Lifecycle.Runtime.State == "alive" {
			return session.StateWorking
		}
		return session.StateTriage
	}
}

func title(id string, meta sessionMetadata) string {
	value := firstNonEmpty(meta.DisplayName, meta.Branch, meta.UserPrompt, id)
	return truncate(value, 96)
}

func description(meta sessionMetadata) string {
	value := firstNonEmpty(meta.UserPrompt, meta.LifecycleEvidence, meta.Branch)
	return truncate(value, 180)
}

func issueLabel(meta sessionMetadata) string {
	if meta.Issue != "" {
		return meta.Issue
	}

	pr := strings.Trim(string(meta.PR), `"`)
	if pr == "" || pr == "null" {
		return meta.Branch
	}

	if match := regexp.MustCompile(`/pull/(\d+)`).FindStringSubmatch(pr); len(match) == 2 {
		return "[PR #" + match[1] + "]"
	}

	return pr
}

func metadataLabel(meta sessionMetadata) string {
	return "[" + firstNonEmpty(meta.Agent, "agent") + "/" + firstNonEmpty(meta.Status, meta.Lifecycle.Session.State, "unknown") + "]"
}

func workerID(id string) string {
	return "[" + strings.ToUpper(id) + "]"
}

func projectName(projectID string, configPath string) string {
	if configPath != "" {
		if parent := filepath.Base(filepath.Dir(configPath)); parent != "." && parent != string(filepath.Separator) {
			return humanizeName(parent)
		}
	}

	if index := strings.LastIndex(projectID, "_"); index > 0 {
		return humanizeName(projectID[:index])
	}

	return humanizeName(projectID)
}

func projectCWD(projectID string, configPath string, baseDir string, orchestrators []session.Session) string {
	for _, orchestrator := range orchestrators {
		if orchestrator.Project == projectID && strings.TrimSpace(orchestrator.CWD) != "" {
			return orchestrator.CWD
		}
	}

	if configPath == "" {
		return ""
	}

	cwd := filepath.Dir(configPath)
	if samePath(cwd, baseDir) {
		return ""
	}

	return cwd
}

func humanizeName(value string) string {
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == '-' || r == '_' || r == '.'
	})
	for index, part := range parts {
		if part == "" {
			continue
		}
		parts[index] = strings.ToUpper(part[:1]) + part[1:]
	}

	return strings.Join(parts, " ")
}

func samePath(a string, b string) bool {
	absA, errA := filepath.Abs(a)
	absB, errB := filepath.Abs(b)
	if errA != nil || errB != nil {
		return a == b
	}

	return absA == absB
}

func stringFromMap(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	value, ok := values[key].(string)
	if !ok {
		return ""
	}

	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}

	return ""
}

func truncate(value string, maxLen int) string {
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) <= maxLen {
		return value
	}

	return string(runes[:maxLen-3]) + "..."
}

func compareWorkerIDs(a string, b string) int {
	aNumber, aOK := trailingNumber(a)
	bNumber, bOK := trailingNumber(b)
	if aOK && bOK && aNumber != bNumber {
		if aNumber > bNumber {
			return 1
		}
		return -1
	}

	return strings.Compare(a, b)
}

func trailingNumber(value string) (int, bool) {
	index := strings.LastIndex(value, "-")
	if index < 0 || index == len(value)-1 {
		return 0, false
	}

	parsed, err := strconv.Atoi(value[index+1:])
	return parsed, err == nil
}
