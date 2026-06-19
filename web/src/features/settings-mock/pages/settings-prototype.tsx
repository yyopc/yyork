import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CommandIcon,
  MapPinIcon,
  MoonIcon,
  RouteIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  SunIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  type ForwardedRef,
  forwardRef,
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/tailwind/utils';
import { useHydrated } from '@/hooks/use-hydrated';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AgentID = 'claude-code' | 'codex' | 'gemini-cli' | 'opencode';
type ProjectID = 'yyork' | 'fireredvad' | 'creatives' | 'reverbcode';
type MockMode = 'first-run' | 'global' | 'project';

type AgentOption = {
  availability: 'available' | 'missing';
  command: string;
  description: string;
  icon?: string;
  id: AgentID;
  label: string;
  provider: string;
};

type ProjectOption = {
  currentAgent: AgentID;
  id: ProjectID;
  label: string;
  path: string;
  sessionID: string;
  state: string;
};

const agents: AgentOption[] = [
  {
    availability: 'available',
    command: '/opt/homebrew/bin/claude',
    description:
      'Best when the orchestrator should stay conversational and coordinate worker tasks from the main worktree.',
    icon: '/agent-icons/claude-agent.svg',
    id: 'claude-code',
    label: 'Claude Code',
    provider: 'Anthropic CLI',
  },
  {
    availability: 'available',
    command: '/opt/homebrew/bin/codex',
    description:
      'Best when you want the orchestrator to use the same Codex CLI workflow as coding workers.',
    icon: '/agent-icons/codex-agent.svg',
    id: 'codex',
    label: 'Codex',
    provider: 'OpenAI CLI',
  },
  {
    availability: 'missing',
    command: 'gemini',
    description:
      'Future harness slot for teams that want project orchestration through Gemini CLI.',
    id: 'gemini-cli',
    label: 'Gemini CLI',
    provider: 'Google CLI',
  },
  {
    availability: 'missing',
    command: 'opencode',
    description:
      'Future harness slot for local-first workflows that prefer opencode sessions.',
    id: 'opencode',
    label: 'opencode',
    provider: 'Local CLI',
  },
];

const projectOptions: ProjectOption[] = [
  {
    currentAgent: 'claude-code',
    id: 'yyork',
    label: 'yyork',
    path: '~/Projects/yyork',
    sessionID: 'v042rv',
    state: 'Running in the main worktree',
  },
  {
    currentAgent: 'claude-code',
    id: 'fireredvad',
    label: 'FireRedVAD',
    path: '~/Projects/FireRedVAD',
    sessionID: 'b711t4',
    state: 'Waiting for your next prompt',
  },
  {
    currentAgent: 'codex',
    id: 'creatives',
    label: 'creatives',
    path: '~/Projects/creatives',
    sessionID: 'n8p20k',
    state: 'Idle',
  },
  {
    currentAgent: 'claude-code',
    id: 'reverbcode',
    label: 'reverbcode',
    path: '~/Projects/reverbcode',
    sessionID: 'q9c31a',
    state: 'Reviewing worker updates',
  },
];

const mockModes: Array<{ id: MockMode; label: string }> = [
  { id: 'first-run', label: 'First run' },
  { id: 'global', label: 'Global' },
  { id: 'project', label: 'Project' },
];

type WalkthroughPhase = 'app' | 'settings';
type WalkthroughTarget = 'agent' | 'app-settings' | 'scope' | 'sidebar';

type WalkthroughStep = {
  description: string;
  icon: typeof SparklesIcon;
  id: string;
  phase: WalkthroughPhase;
  target: WalkthroughTarget | null;
  title: string;
};

const walkthroughSteps: WalkthroughStep[] = [
  {
    description:
      'Before your first project starts, yyork walks you through agent defaults. This guided setup takes about a minute.',
    icon: SparklesIcon,
    id: 'welcome',
    phase: 'app',
    target: null,
    title: 'Welcome to yyork',
  },
  {
    description:
      'Agent harness preferences live at /settings. Open that route from the Settings menu in the app footer whenever you need to review or change defaults.',
    icon: RouteIcon,
    id: 'open-settings',
    phase: 'app',
    target: 'app-settings',
    title: 'Open Settings',
  },
  {
    description:
      'This is the permanent home for yyork preferences. Agent harnesses live under Agents in the sidebar.',
    icon: Settings2Icon,
    id: 'settings-home',
    phase: 'settings',
    target: 'sidebar',
    title: 'Settings live here',
  },
  {
    description:
      'Each project gets one orchestrator session. Global defaults apply to every new project unless a project sets its own override.',
    icon: BotIcon,
    id: 'orchestrator',
    phase: 'settings',
    target: 'scope',
    title: 'One orchestrator per project',
  },
  {
    description:
      'Pick the CLI harness yyork should use when it creates a new project orchestrator. You can change this any time from /settings.',
    icon: CommandIcon,
    id: 'choose-agent',
    phase: 'settings',
    target: 'agent',
    title: 'Choose your default agent',
  },
  {
    description:
      'Your global default is saved. Head back to the app to create your first project — yyork will use these preferences automatically.',
    icon: CheckCircle2Icon,
    id: 'done',
    phase: 'settings',
    target: null,
    title: 'You are ready',
  },
];

const initialProjectAgents: Record<ProjectID, AgentID | 'inherit'> = {
  creatives: 'inherit',
  fireredvad: 'inherit',
  reverbcode: 'inherit',
  yyork: 'codex',
};

export function SettingsPrototypePage() {
  const [mockMode, setMockMode] = useState<MockMode>('first-run');
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [projectID, setProjectID] = useState<ProjectID>('yyork');
  const [globalAgent, setGlobalAgent] = useState<AgentID>('claude-code');
  const [projectAgents, setProjectAgents] =
    useState<Record<ProjectID, AgentID | 'inherit'>>(initialProjectAgents);
  const scopePanelRef = useRef<HTMLDivElement>(null);
  const agentPanelRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const isFirstRun = mockMode === 'first-run';
  const effectiveMode: MockMode = isFirstRun ? 'global' : mockMode;
  const activeWalkthroughStep = walkthroughSteps[walkthroughStep];
  const activeWalkthroughPhase = activeWalkthroughStep?.phase ?? 'app';
  const activeWalkthroughTarget = isFirstRun
    ? (activeWalkthroughStep?.target ?? null)
    : null;
  const showSettingsChrome =
    !isFirstRun || activeWalkthroughPhase === 'settings';
  const isWalkthroughIntro =
    isFirstRun && activeWalkthroughStep?.id === 'welcome';
  const isWalkthroughDone = isFirstRun && activeWalkthroughStep?.id === 'done';

  function isWalkthroughPanelDimmed(target: WalkthroughTarget) {
    if (!isFirstRun || !showSettingsChrome || isWalkthroughDone) {
      return false;
    }
    if (isWalkthroughIntro) {
      return true;
    }
    return activeWalkthroughTarget !== target;
  }

  const isWalkthroughAsideDimmed =
    isFirstRun &&
    showSettingsChrome &&
    !isWalkthroughDone &&
    (isWalkthroughIntro || activeWalkthroughTarget !== null);
  const selectedProject =
    projectOptions.find((project) => project.id === projectID) ??
    projectOptions[0]!;
  const projectAgent = projectAgents[selectedProject.id] ?? 'inherit';
  const selectedAgent =
    effectiveMode === 'project' && projectAgent !== 'inherit'
      ? projectAgent
      : globalAgent;
  const currentOrchestrator =
    effectiveMode === 'project'
      ? {
          agent: selectedProject.currentAgent,
          id: selectedProject.sessionID,
          state: selectedProject.state,
        }
      : undefined;

  const projectOverrideCount = Object.values(projectAgents).filter(
    (agent) => agent !== 'inherit'
  );

  const previewSummary = useMemo(() => {
    if (mockMode === 'first-run') {
      return 'Guided walkthrough from the app to /settings before the first project starts.';
    }
    if (mockMode === 'project') {
      return projectAgent === 'inherit'
        ? 'This project inherits the global orchestrator agent.'
        : 'This project overrides the global orchestrator agent.';
    }
    return 'Global defaults apply to newly-created project orchestrators.';
  }, [mockMode, projectAgent]);

  useEffect(() => {
    if (!isFirstRun || !showSettingsChrome || !activeWalkthroughTarget) {
      return;
    }

    if (activeWalkthroughTarget === 'app-settings') {
      return;
    }

    const targetRef =
      activeWalkthroughTarget === 'scope'
        ? scopePanelRef
        : activeWalkthroughTarget === 'agent'
          ? agentPanelRef
          : sidebarRef;

    targetRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [
    activeWalkthroughTarget,
    isFirstRun,
    showSettingsChrome,
    walkthroughStep,
  ]);

  function handleMockModeChange(mode: MockMode) {
    setMockMode(mode);
    if (mode === 'first-run') {
      setWalkthroughStep(0);
    }
    if (mode === 'project') {
      setProjectID('yyork');
    }
    if (mode === 'global') {
      setProjectID('yyork');
    }
  }

  function handleWalkthroughBack() {
    setWalkthroughStep((current) => Math.max(0, current - 1));
  }

  function handleWalkthroughNext() {
    if (walkthroughStep >= walkthroughSteps.length - 1) {
      setMockMode('global');
      return;
    }
    setWalkthroughStep((current) =>
      Math.min(walkthroughSteps.length - 1, current + 1)
    );
  }

  function handleWalkthroughSkip() {
    setMockMode('global');
  }

  function handleProjectAgentChange(agent: AgentID | 'inherit') {
    setProjectAgents((current) => ({
      ...current,
      [selectedProject.id]: agent,
    }));
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {isFirstRun && activeWalkthroughPhase === 'app' ? (
        <AppWalkthroughShell
          highlightSettings={activeWalkthroughTarget === 'app-settings'}
        >
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-8">
            <SettingsHeader
              mockMode={mockMode}
              previewSummary={previewSummary}
              onMockModeChange={handleMockModeChange}
            />
            <FirstRunWalkthrough
              selectedAgent={globalAgent}
              step={walkthroughStep}
              onAgentChange={setGlobalAgent}
              onBack={handleWalkthroughBack}
              onNext={handleWalkthroughNext}
              onSkip={handleWalkthroughSkip}
            />
          </div>
        </AppWalkthroughShell>
      ) : (
        <div className="grid min-h-screen grid-cols-1 overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)]">
          <SettingsSidebar
            ref={sidebarRef}
            highlighted={activeWalkthroughTarget === 'sidebar'}
            dimmed={isWalkthroughPanelDimmed('sidebar')}
          />
          <section className="min-w-0 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-12 lg:py-14">
              <SettingsHeader
                mockMode={mockMode}
                previewSummary={previewSummary}
                onMockModeChange={handleMockModeChange}
              />

              {isFirstRun ? (
                <FirstRunWalkthrough
                  selectedAgent={globalAgent}
                  step={walkthroughStep}
                  onAgentChange={setGlobalAgent}
                  onBack={handleWalkthroughBack}
                  onNext={handleWalkthroughNext}
                  onSkip={handleWalkthroughSkip}
                />
              ) : null}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="flex min-w-0 flex-col gap-5">
                  <WalkthroughTarget
                    ref={scopePanelRef}
                    dimmed={isWalkthroughPanelDimmed('scope')}
                    highlighted={activeWalkthroughTarget === 'scope'}
                  >
                    <ScopePanel
                      globalAgent={globalAgent}
                      mode={effectiveMode}
                      projectAgent={projectAgent}
                      projectOverrideCount={projectOverrideCount.length}
                      selectedProject={selectedProject}
                      onEditGlobal={() => setMockMode('global')}
                      onEditProject={() => setMockMode('project')}
                      onProjectChange={(nextProjectID) => {
                        setMockMode('project');
                        setProjectID(nextProjectID);
                      }}
                    />
                  </WalkthroughTarget>
                  <WalkthroughTarget
                    ref={agentPanelRef}
                    dimmed={isWalkthroughPanelDimmed('agent')}
                    highlighted={activeWalkthroughTarget === 'agent'}
                  >
                    <AgentPreferencePanel
                      globalAgent={globalAgent}
                      mode={effectiveMode}
                      projectAgent={projectAgent}
                      selectedAgent={selectedAgent}
                      selectedProject={selectedProject}
                      onGlobalAgentChange={setGlobalAgent}
                      onProjectAgentChange={handleProjectAgentChange}
                    />
                  </WalkthroughTarget>
                </div>

                <aside
                  className={cn(
                    'flex min-w-0 flex-col gap-5 transition-opacity',
                    isWalkthroughAsideDimmed && 'pointer-events-none opacity-35'
                  )}
                >
                  <CurrentOrchestratorPanel
                    currentOrchestrator={currentOrchestrator}
                    selectedAgent={selectedAgent}
                  />
                  <CascadePanel
                    globalAgent={globalAgent}
                    mode={effectiveMode}
                    projectAgent={projectAgent}
                    selectedAgent={selectedAgent}
                  />
                </aside>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function SettingsSidebar(props: {
  dimmed?: boolean;
  highlighted?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <aside
      ref={props.ref}
      className={cn(
        'flex min-h-0 flex-col border-b border-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-[opacity,box-shadow] lg:border-r lg:border-b-0',
        props.dimmed && 'opacity-35',
        props.highlighted &&
          'relative z-10 opacity-100 ring-2 ring-ring ring-offset-2 ring-offset-background'
      )}
    >
      <a
        href="https://yyork.localhost"
        className="mb-5 flex h-8 w-full items-center gap-2 rounded-sm px-2 text-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        <span>Back to app</span>
      </a>

      <Input
        size="sm"
        placeholder="Search settings..."
        className="mb-6 border-sidebar-border bg-background/70 shadow-none dark:bg-black/20"
        startAddon={<SearchIcon aria-hidden="true" className="size-4" />}
      />

      <nav className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="space-y-2">
          <p className="px-2 text-xs font-medium text-muted-foreground">
            Agents
          </p>
          <button
            type="button"
            className="flex h-9 w-full min-w-0 items-center gap-3 rounded-md bg-sidebar-accent px-3 text-sm font-medium text-sidebar-accent-foreground"
          >
            <BotIcon aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Harnesses</span>
          </button>
        </div>
      </nav>

      <div className="mt-6 rounded-md border border-sidebar-border bg-background/50 p-3 text-xs text-muted-foreground dark:bg-black/20">
        <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <Settings2Icon aria-hidden="true" className="size-3.5" />
          <span>Settings mock</span>
        </div>
        <p>
          Fake data only. No backend settings are changed from this surface.
        </p>
      </div>
    </aside>
  );
}

function SettingsHeader(props: {
  mockMode: MockMode;
  onMockModeChange: (mode: MockMode) => void;
  previewSummary: string;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">Agents</h1>
            <Badge variant="secondary" size="sm">
              Prototype
            </Badge>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Configure the agent harness yyork uses for new project
            orchestrators. Running sessions keep their current runtime until
            they are explicitly restarted.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Preview state</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {props.previewSummary}
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-md bg-muted p-1">
          {mockModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={cn(
                'h-7 rounded-sm px-3 text-xs font-medium transition-colors',
                props.mockMode === mode.id
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => props.onMockModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const hydrated = useHydrated();
  const { setTheme, theme } = useTheme();
  const activeTheme = hydrated ? theme : undefined;

  return (
    <div className="flex items-center rounded-md border border-border bg-card p-1">
      <button
        type="button"
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium',
          activeTheme === 'light'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setTheme('light')}
      >
        <SunIcon aria-hidden="true" className="size-3.5" />
        <span>Light</span>
      </button>
      <button
        type="button"
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium',
          activeTheme === 'dark'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setTheme('dark')}
      >
        <MoonIcon aria-hidden="true" className="size-3.5" />
        <span>Dark</span>
      </button>
    </div>
  );
}

function FirstRunWalkthrough(props: {
  onAgentChange: (agent: AgentID) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  selectedAgent: AgentID;
  step: number;
}) {
  const currentStep = walkthroughSteps[props.step] ?? walkthroughSteps[0]!;
  const StepIcon = currentStep.icon;
  const isFirstStep = props.step === 0;
  const isLastStep = props.step === walkthroughSteps.length - 1;
  const availableAgents = agents.filter(
    (agent) => agent.availability === 'available'
  );

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="positive" size="sm">
            First run walkthrough
          </Badge>
          <p className="text-xs text-muted-foreground">
            Step {props.step + 1} of {walkthroughSteps.length}
          </p>
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            <StepIcon aria-hidden="true" className="size-4 text-foreground" />
          </span>
          <div className="min-w-0 space-y-2">
            <h2 className="text-lg font-semibold">{currentStep.title}</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {currentStep.description}
            </p>
          </div>
        </div>

        {currentStep.id === 'open-settings' ? (
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RouteIcon aria-hidden="true" className="size-4 shrink-0" />
              <span>Where to find it later</span>
            </div>
            <div className="mt-3 rounded-sm border border-border bg-background/80 p-3 font-mono text-xs">
              <p className="text-muted-foreground">App footer → Settings</p>
              <p className="mt-1 font-medium text-foreground">/settings</p>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The highlighted Settings control in the app footer opens this
              route. Continue to walk through the settings page itself.
            </p>
          </div>
        ) : null}

        {currentStep.id === 'settings-home' ? (
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPinIcon aria-hidden="true" className="size-4 shrink-0" />
              <span>Permanent home for preferences</span>
            </div>
            <div className="mt-3 rounded-sm border border-border bg-background/80 p-3 font-mono text-xs">
              <p className="text-muted-foreground">App menu → Settings</p>
              <p className="mt-1 font-medium text-foreground">/settings</p>
              <div className="mt-3 flex flex-col gap-1 border-l-2 border-border pl-3 text-muted-foreground">
                <span>Agents</span>
                <span className="font-medium text-foreground">Harnesses</span>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The highlighted sidebar on the left is what users see when they
              open settings from the app.
            </p>
          </div>
        ) : null}

        {currentStep.id === 'choose-agent' ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              Quick pick — or use the highlighted panel below
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={cn(
                    'flex min-w-0 items-center gap-3 rounded-md border border-border px-3 py-3 text-left transition-colors hover:bg-muted/50',
                    props.selectedAgent === agent.id &&
                      'bg-muted/70 ring-1 ring-ring'
                  )}
                  onClick={() => props.onAgentChange(agent.id)}
                >
                  <AgentAvatar agent={agent.id} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {agent.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {agent.provider}
                    </p>
                  </div>
                  <SelectionDot checked={props.selectedAgent === agent.id} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {currentStep.id === 'done' ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
            <AgentAvatar agent={props.selectedAgent} />
            <div className="min-w-0">
              <p className="font-medium">
                Global default: {labelForAgent(props.selectedAgent)}
              </p>
              <p className="text-xs text-muted-foreground">
                New project orchestrators will start with this harness. Change
                it anytime at{' '}
                <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[11px]">
                  /settings
                </code>
                .
              </p>
            </div>
          </div>
        ) : null}

        <ol className="flex flex-wrap gap-2">
          {walkthroughSteps.map((step, index) => (
            <li
              key={step.id}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === props.step
                  ? 'w-8 bg-foreground'
                  : index < props.step
                    ? 'w-4 bg-muted-foreground/50'
                    : 'w-4 bg-muted'
              )}
              aria-hidden="true"
            />
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={props.onSkip}
          >
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            {!isFirstStep ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={props.onBack}
              >
                Back
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={props.onNext}>
              {isLastStep ? (
                'Finish setup'
              ) : currentStep.id === 'open-settings' ? (
                <>
                  Open /settings
                  <ArrowRightIcon
                    aria-hidden="true"
                    data-icon="inline-end"
                    className="size-3.5"
                  />
                </>
              ) : (
                <>
                  Continue
                  <ArrowRightIcon
                    aria-hidden="true"
                    data-icon="inline-end"
                    className="size-3.5"
                  />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

const WalkthroughTarget = forwardRef(function WalkthroughTarget(
  props: {
    children: ReactNode;
    dimmed?: boolean;
    highlighted?: boolean;
  },
  ref: ForwardedRef<HTMLDivElement>
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-md transition-[opacity,box-shadow]',
        props.dimmed && 'pointer-events-none opacity-35',
        props.highlighted &&
          'relative z-10 opacity-100 ring-2 ring-ring ring-offset-2 ring-offset-background'
      )}
    >
      {props.children}
    </div>
  );
});

function AppWalkthroughShell(props: {
  children: ReactNode;
  highlightSettings?: boolean;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 overflow-hidden md:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-border bg-sidebar px-3 py-4 text-sidebar-foreground md:border-r md:border-b-0">
        <div className="mb-4 flex min-w-0 items-center gap-1.5 border-b border-sidebar-border pb-4">
          <h1 className="truncate text-base font-bold text-sidebar-foreground">
            yyork
          </h1>
          <Badge variant="secondary" size="xs">
            alpha
          </Badge>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="px-1 text-xs font-medium text-muted-foreground">
            Projects
          </p>
          <div className="rounded-sm border border-dashed border-sidebar-border px-3 py-6 text-center text-xs text-muted-foreground">
            Your first project appears here after setup.
          </div>
        </div>

        <div className="mt-4 border-t border-sidebar-border pt-3">
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-sm border border-sidebar-border bg-sidebar px-3 text-sm text-muted-foreground transition-[box-shadow,opacity]',
              props.highlightSettings
                ? 'relative z-10 opacity-100 ring-2 ring-ring ring-offset-2 ring-offset-sidebar'
                : 'opacity-70'
            )}
          >
            <Settings2Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>Settings</span>
            {props.highlightSettings ? (
              <Badge variant="default" size="xs" className="ms-auto">
                /settings
              </Badge>
            ) : null}
          </button>
        </div>
      </aside>

      <section className="relative min-w-0 overflow-y-auto bg-muted/15">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-background/80 to-transparent" />
        {props.children}
      </section>
    </div>
  );
}

function ScopePanel(props: {
  globalAgent: AgentID;
  mode: MockMode;
  onEditGlobal: () => void;
  onEditProject: () => void;
  onProjectChange: (projectID: ProjectID) => void;
  projectAgent: AgentID | 'inherit';
  projectOverrideCount: number;
  selectedProject: ProjectOption;
}) {
  const isProjectMode = props.mode === 'project';
  const effectiveAgent =
    isProjectMode && props.projectAgent !== 'inherit'
      ? props.projectAgent
      : props.globalAgent;

  return (
    <SettingsSection
      description="Pick whether you are editing the global default or one project's override."
      title="Scope"
    >
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
          <ScopeModeButton
            active={!isProjectMode}
            label="Global default"
            meta={`${projectOptions.length} projects inherit unless overridden`}
            badge="default"
            onClick={props.onEditGlobal}
          />
          <ScopeModeButton
            active={isProjectMode}
            label="Project override"
            meta={`${props.projectOverrideCount} project override${
              props.projectOverrideCount === 1 ? '' : 's'
            }`}
            badge="per project"
            onClick={props.onEditProject}
          />
        </div>

        <div className="min-w-0 rounded-md border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-4">
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Editing
              </p>
              <p className="truncate text-sm font-medium">
                {isProjectMode
                  ? `${props.selectedProject.label} override`
                  : 'Global defaults'}
              </p>
              <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                {isProjectMode
                  ? props.selectedProject.path
                  : 'Used for every new project orchestrator unless a project has its own override.'}
              </p>
            </div>

            {isProjectMode ? (
              <label className="max-w-sm min-w-0 space-y-2">
                <span className="block text-xs font-medium text-muted-foreground">
                  Project
                </span>
                <span className="relative block">
                  <select
                    value={props.selectedProject.id}
                    className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onChange={(event) =>
                      props.onProjectChange(event.target.value as ProjectID)
                    }
                  >
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                </span>
              </label>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 border-t border-border pt-4 text-xs sm:grid-cols-3">
            <ScopeSummaryItem
              label="Effective agent"
              value={labelForAgent(effectiveAgent)}
            />
            <ScopeSummaryItem
              label="Source"
              value={
                isProjectMode && props.projectAgent !== 'inherit'
                  ? 'Project override'
                  : 'Global default'
              }
            />
            <ScopeSummaryItem
              label="Stored at"
              value={isProjectMode ? 'Project settings' : 'App settings'}
            />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

function ScopeModeButton(props: {
  active: boolean;
  badge: string;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50',
        props.active && 'bg-muted/70'
      )}
      onClick={props.onClick}
    >
      <SelectionDot checked={props.active} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {props.label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {props.meta}
        </span>
      </span>
      <Badge variant={props.active ? 'default' : 'secondary'} size="xs">
        {props.badge}
      </Badge>
    </button>
  );
}

function ScopeSummaryItem(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{props.label}</p>
      <p className="mt-1 font-medium break-words text-foreground">
        {props.value}
      </p>
    </div>
  );
}

function AgentPreferencePanel(props: {
  globalAgent: AgentID;
  mode: MockMode;
  onGlobalAgentChange: (agent: AgentID) => void;
  onProjectAgentChange: (agent: AgentID | 'inherit') => void;
  projectAgent: AgentID | 'inherit';
  selectedAgent: AgentID;
  selectedProject: ProjectOption;
}) {
  const isProjectMode = props.mode === 'project';

  return (
    <SettingsSection
      description="Used only when yyork creates a new project orchestrator."
      title="Default agent harness"
    >
      <AgentChoiceList
        globalAgent={props.globalAgent}
        inheritSelected={isProjectMode && props.projectAgent === 'inherit'}
        selectedAgent={props.selectedAgent}
        showInherit={isProjectMode}
        onSelectAgent={(agent) =>
          isProjectMode
            ? props.onProjectAgentChange(agent)
            : props.onGlobalAgentChange(agent)
        }
        onSelectInherit={() => props.onProjectAgentChange('inherit')}
      />

      <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        Existing orchestrators keep running with their current agent. This value
        is read the next time yyork creates an orchestrator for{' '}
        {isProjectMode ? props.selectedProject.label : 'a project'}.
      </div>
    </SettingsSection>
  );
}

function AgentChoiceList(props: {
  globalAgent?: AgentID;
  inheritSelected?: boolean;
  onSelectAgent: (agent: AgentID) => void;
  onSelectInherit?: () => void;
  selectedAgent: AgentID;
  showInherit?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filteredAgents = agents.filter((agent) => {
    const text =
      `${agent.label} ${agent.provider} ${agent.command}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-3">
      <Input
        size="sm"
        value={query}
        placeholder="Search agent harnesses..."
        className="w-full shadow-none"
        startAddon={<SearchIcon aria-hidden="true" className="size-4" />}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="overflow-hidden rounded-md border border-border bg-background">
        {props.showInherit ? (
          <button
            type="button"
            className={cn(
              'flex w-full min-w-0 items-center gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/50',
              props.inheritSelected && 'bg-muted/70'
            )}
            onClick={props.onSelectInherit}
          >
            <SelectionDot checked={props.inheritSelected ?? false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                Use global default (
                {labelForAgent(props.globalAgent ?? 'claude-code')})
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Keep this project aligned with the global agent harness.
              </p>
            </div>
            <Badge variant="secondary" size="xs">
              inherited
            </Badge>
          </button>
        ) : null}

        <div className="divide-y divide-border">
          {filteredAgents.map((agent) => (
            <AgentOptionRow
              key={agent.id}
              agent={agent}
              checked={
                !props.inheritSelected && props.selectedAgent === agent.id
              }
              onSelect={() => props.onSelectAgent(agent.id)}
            />
          ))}
          {filteredAgents.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No agent harnesses match this search.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AgentOptionRow(props: {
  agent: AgentOption;
  checked: boolean;
  onSelect: () => void;
}) {
  const missing = props.agent.availability === 'missing';

  return (
    <button
      type="button"
      disabled={missing}
      className={cn(
        'grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-55',
        props.checked && 'bg-muted/70'
      )}
      onClick={props.onSelect}
    >
      <AgentAvatar agent={props.agent.id} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium">{props.agent.label}</p>
          <Badge
            variant={missing ? 'warning' : 'positive'}
            size="xs"
            className="shrink-0"
          >
            {missing ? 'setup needed' : 'available'}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {props.agent.provider} · {props.agent.command}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {props.agent.description}
        </p>
      </div>
      <SelectionDot checked={props.checked} />
    </button>
  );
}

function SelectionDot(props: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border',
        props.checked
          ? 'border-foreground bg-foreground text-background'
          : 'border-muted-foreground/40'
      )}
    >
      {props.checked ? <CheckCircle2Icon className="size-3.5" /> : null}
    </span>
  );
}

function CurrentOrchestratorPanel(props: {
  currentOrchestrator?: { agent: AgentID; id: string; state: string };
  selectedAgent: AgentID;
}) {
  if (!props.currentOrchestrator) {
    return (
      <SettingsSection
        description="Global defaults do not point to one running session."
        title="Current orchestrator"
      >
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
          <CommandIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Select a project to inspect its running orchestrator.
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Project-level settings can show whether the current runtime
              matches the selected default.
            </p>
          </div>
        </div>
      </SettingsSection>
    );
  }

  const currentAgent = props.currentOrchestrator.agent;
  const matches = currentAgent === props.selectedAgent;

  return (
    <SettingsSection
      description="This reflects the session already running for the selected project."
      title="Current orchestrator"
    >
      <div className="flex flex-col gap-4 rounded-md border border-border bg-background p-4">
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar agent={currentAgent} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">
                {labelForAgent(currentAgent)} orchestrator
              </p>
              <Badge variant={matches ? 'positive' : 'warning'} size="xs">
                {matches ? 'matches default' : 'differs from default'}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Session {props.currentOrchestrator.id} ·{' '}
              {props.currentOrchestrator.state}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" className="w-fit">
          Restart with {labelForAgent(props.selectedAgent)}
        </Button>
      </div>
    </SettingsSection>
  );
}

function AgentAvatar(props: { agent: AgentID }) {
  const agent = agents.find((item) => item.id === props.agent);

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-black">
      {agent?.icon ? (
        <img src={agent.icon} alt="" className="size-5" draggable={false} />
      ) : (
        <BotIcon aria-hidden="true" className="size-5 text-white" />
      )}
    </span>
  );
}

function CascadePanel(props: {
  globalAgent: AgentID;
  mode: MockMode;
  projectAgent: AgentID | 'inherit';
  selectedAgent: AgentID;
}) {
  const rows = [
    {
      label: 'Factory fallback',
      value: 'Claude Code',
      active: false,
      detail: 'Used only when no user setting exists.',
    },
    {
      label: 'Global default',
      value: labelForAgent(props.globalAgent),
      active: props.mode !== 'project' || props.projectAgent === 'inherit',
      detail: 'Stored once for this yyork install.',
    },
    {
      label: 'Project override',
      value:
        props.mode === 'project' && props.projectAgent !== 'inherit'
          ? labelForAgent(props.projectAgent)
          : 'Not set',
      active: props.mode === 'project' && props.projectAgent !== 'inherit',
      detail: 'Optional setting for one project.',
    },
    {
      label: 'Creation override',
      value: 'Future',
      active: false,
      detail: 'A one-time choice in an Add Project flow.',
    },
  ];

  return (
    <SettingsSection title="Preference order">
      <ol className="overflow-hidden rounded-md border border-border bg-background">
        {rows.map((row, index) => (
          <li
            key={row.label}
            className={cn(
              'grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-border px-3 py-3 last:border-b-0',
              row.active && 'bg-muted/70'
            )}
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{row.label}</p>
                <Badge
                  variant={row.active ? 'default' : 'secondary'}
                  size="xs"
                  className="max-w-28 shrink-0 truncate"
                >
                  {row.value}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {row.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Effective for next creation: {labelForAgent(props.selectedAgent)}.
      </p>
    </SettingsSection>
  );
}

function SettingsSection(props: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

function labelForAgent(agent: AgentID) {
  return agents.find((item) => item.id === agent)?.label ?? agent;
}
