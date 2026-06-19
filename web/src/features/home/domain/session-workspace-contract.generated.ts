import { z } from 'zod';

const TerminalSessionKind = z.enum(['orchestrator', 'worker']);
const WorkerSessionState = z.enum(['working', 'prompt', 'triage', 'done']);
const Session = z.object({
  agent: z.string(),
  agentPluginId: z.string().optional(),
  cwd: z.string().optional(),
  description: z.string(),
  id: z.string(),
  issue: z.string(),
  kind: TerminalSessionKind.optional(),
  metadata: z.string(),
  project: z.string(),
  recap: z.string(),
  selected: z.boolean().optional(),
  state: WorkerSessionState,
  terminalSupported: z.boolean().optional(),
  title: z.string(),
  workerId: z.string(),
  zellijSession: z.string().optional(),
});
const WorkerWorkspaceMode = z.enum(['local', 'new-worktree']);
const Project = z.object({
  cwd: z.string().optional(),
  id: z.string(),
  name: z.string(),
  workerWorkspaceMode: WorkerWorkspaceMode,
});
const Workspace = z.object({
  $schema: z.string().url().optional(),
  activeProjectId: z.string(),
  orchestrators: z.array(Session).nullish(),
  projects: z.array(Project).nullable(),
  sessions: z.array(Session).nullable(),
});

export const schemas = {
  TerminalSessionKind,
  WorkerSessionState,
  Session,
  WorkerWorkspaceMode,
  Project,
  Workspace,
};

export const workerSessionStateSchema = WorkerSessionState;
export const workerSessionStates = workerSessionStateSchema.options;
export type WorkerSessionState = z.infer<typeof workerSessionStateSchema>;

export const terminalSessionKindSchema = TerminalSessionKind;
export type TerminalSessionKind = z.infer<typeof terminalSessionKindSchema>;

export const workerWorkspaceModeSchema = WorkerWorkspaceMode;
export const workerWorkspaceModes = workerWorkspaceModeSchema.options;
export type WorkerWorkspaceMode = z.infer<typeof workerWorkspaceModeSchema>;

export const projectOrchestratorSchema = Project;
export type ProjectOrchestrator = z.infer<typeof projectOrchestratorSchema>;

export const workerSessionSchema = Session.passthrough();
export type WorkerSession = z.infer<typeof workerSessionSchema>;
export type WorkerAgent = WorkerSession['agent'];

export const sessionWorkspaceSchema = Workspace.omit({ $schema: true }).extend({
  orchestrators: z.array(workerSessionSchema).optional(),
  projects: z.array(projectOrchestratorSchema),
  sessions: z.array(workerSessionSchema),
});
export type SessionWorkspace = z.infer<typeof sessionWorkspaceSchema>;
