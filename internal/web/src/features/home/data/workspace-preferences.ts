import { validatePreviewUrlInput } from '@/features/home/data/browser-preview';
import {
  type CanvasTab,
  isCanvasTab,
} from '@/features/home/domain/canvas-tabs';
import {
  type WorkerSessionState,
  workerSessionStates,
} from '@/features/home/domain/session-workspace';

const homeWorkspacePreferencesStorageKey = 'yyork.home.workspace-preferences';
const homeWorkspacePreferencesVersion = 1;
export const homeWorkspaceCanvasMinPercent = 22;
export const homeWorkspaceCanvasMaxPercent = 70;

export type OpenWorkerSessionGroupIdsByProject = Partial<
  Record<string, WorkerSessionState[]>
>;

export interface HomeWorkspacePreferences {
  canvasLayout?: HomeWorkspaceCanvasLayout;
  canvasOpenTargetKeys?: string[];
  canvasPreviewUrls?: Record<string, string>;
  canvasPreviewUrl?: string;
  canvasReview?: HomeWorkspaceCanvasReviewPreferences;
  canvasSelectedFilePaths?: Record<string, string>;
  canvasTab?: CanvasTab;
  hiddenProjectIds?: string[];
  openProjectIds?: string[];
  openWorkerSessionGroupIdsByProject?: OpenWorkerSessionGroupIdsByProject;
  pinnedProjectIds?: string[];
  pinnedTerminalSessionKeys?: string[];
  projectNameOverrides?: Record<string, string>;
  seenWorkerSessionResponses?: Record<string, string>;
  sidebarOpen: boolean;
  sidebarWidth?: number;
  skipStopSessionConfirmation?: boolean;
}

export interface HomeWorkspaceCanvasLayout {
  canvas: number;
  main: number;
}

export type HomeWorkspaceCanvasReviewDiffLayout = 'split' | 'stacked';

export interface HomeWorkspaceCanvasReviewPreferences {
  diffLayout?: HomeWorkspaceCanvasReviewDiffLayout;
  wrapLines?: boolean;
}

export type CanvasPreviewTargetSummary = {
  cwd?: string;
  projectId?: string;
  sessionId?: string;
};

interface StoredHomeWorkspacePreferences extends Partial<HomeWorkspacePreferences> {
  canvasOpen?: unknown;
  openWorkerSessionGroupIds?: unknown;
  version?: number;
}

export const defaultHomeWorkspacePreferences: HomeWorkspacePreferences = {
  sidebarOpen: false,
};

export function readHomeWorkspacePreferences(): HomeWorkspacePreferences {
  const storedValue = readStoredValue();

  if (!storedValue) {
    return defaultHomeWorkspacePreferences;
  }

  try {
    return normalizeHomeWorkspacePreferences(JSON.parse(storedValue));
  } catch {
    return defaultHomeWorkspacePreferences;
  }
}

export function writeHomeWorkspacePreferences(
  preferences: HomeWorkspacePreferences
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      homeWorkspacePreferencesStorageKey,
      JSON.stringify({
        ...normalizeHomeWorkspacePreferences(preferences),
        version: homeWorkspacePreferencesVersion,
      })
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export function getCanvasPreviewTargetKey(target: CanvasPreviewTargetSummary) {
  if (target.projectId && target.sessionId) {
    return `session:${encodeURIComponent(target.projectId)}:${encodeURIComponent(
      target.sessionId
    )}`;
  }

  if (target.projectId) {
    return `project:${encodeURIComponent(target.projectId)}`;
  }

  if (target.cwd) {
    return `cwd:${encodeURIComponent(target.cwd)}`;
  }

  return 'global';
}

export function getCanvasOpenForTarget(
  preferences: Pick<HomeWorkspacePreferences, 'canvasOpenTargetKeys'>,
  targetKey: string | undefined
) {
  return Boolean(
    targetKey && preferences.canvasOpenTargetKeys?.includes(targetKey)
  );
}

export function getCanvasOpenPreferenceUpdate(
  preferences: Pick<HomeWorkspacePreferences, 'canvasOpenTargetKeys'>,
  targetKey: string,
  open: boolean
): Pick<HomeWorkspacePreferences, 'canvasOpenTargetKeys'> {
  const nextTargetKeys = new Set(preferences.canvasOpenTargetKeys);

  if (open) {
    nextTargetKeys.add(targetKey);
  } else {
    nextTargetKeys.delete(targetKey);
  }

  return {
    canvasOpenTargetKeys:
      nextTargetKeys.size > 0 ? Array.from(nextTargetKeys) : undefined,
  };
}

export function getCanvasPreviewUrlForTarget(
  preferences: Pick<
    HomeWorkspacePreferences,
    'canvasPreviewUrl' | 'canvasPreviewUrls'
  >,
  targetKey: string
) {
  return (
    preferences.canvasPreviewUrls?.[targetKey] ?? preferences.canvasPreviewUrl
  );
}

export function getCanvasSelectedFilePathForTarget(
  preferences: Pick<HomeWorkspacePreferences, 'canvasSelectedFilePaths'>,
  targetKey: string
) {
  return preferences.canvasSelectedFilePaths?.[targetKey];
}

export function getCanvasSelectedFilePathPreferenceUpdate(
  preferences: Pick<HomeWorkspacePreferences, 'canvasSelectedFilePaths'>,
  targetKey: string,
  path: string | null
): Pick<HomeWorkspacePreferences, 'canvasSelectedFilePaths'> {
  const nextPaths = { ...preferences.canvasSelectedFilePaths };
  const normalizedPath = normalizeString(path);

  if (normalizedPath) {
    nextPaths[targetKey] = normalizedPath;
  } else {
    delete nextPaths[targetKey];
  }

  return {
    canvasSelectedFilePaths:
      Object.keys(nextPaths).length > 0 ? nextPaths : undefined,
  };
}

export function getCanvasPreviewUrlPreferenceUpdate(
  preferences: Pick<
    HomeWorkspacePreferences,
    'canvasPreviewUrl' | 'canvasPreviewUrls'
  >,
  targetKey: string,
  url: string
): Pick<HomeWorkspacePreferences, 'canvasPreviewUrl' | 'canvasPreviewUrls'> {
  const nextUrls = { ...preferences.canvasPreviewUrls };
  const normalizedUrl = normalizeCanvasPreviewUrl(url);

  if (normalizedUrl) {
    nextUrls[targetKey] = normalizedUrl;
  } else {
    delete nextUrls[targetKey];
  }

  return {
    canvasPreviewUrl: undefined,
    canvasPreviewUrls: Object.keys(nextUrls).length > 0 ? nextUrls : undefined,
  };
}

function readStoredValue() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage.getItem(homeWorkspacePreferencesStorageKey);
  } catch {
    return undefined;
  }
}

function normalizeHomeWorkspacePreferences(
  preferences: unknown
): HomeWorkspacePreferences {
  if (!isStoredHomeWorkspacePreferences(preferences)) {
    return defaultHomeWorkspacePreferences;
  }

  return {
    hiddenProjectIds: normalizeStringList(preferences.hiddenProjectIds),
    openProjectIds: normalizeStringList(preferences.openProjectIds),
    openWorkerSessionGroupIdsByProject:
      normalizeOpenWorkerSessionGroupIdsByProject(
        preferences.openWorkerSessionGroupIdsByProject
      ),
    pinnedProjectIds: normalizeStringList(preferences.pinnedProjectIds),
    pinnedTerminalSessionKeys: normalizeStringList(
      preferences.pinnedTerminalSessionKeys
    ),
    projectNameOverrides: normalizeStringRecord(
      preferences.projectNameOverrides
    ),
    seenWorkerSessionResponses: normalizeStringRecord(
      preferences.seenWorkerSessionResponses
    ),
    skipStopSessionConfirmation:
      typeof preferences.skipStopSessionConfirmation === 'boolean'
        ? preferences.skipStopSessionConfirmation
        : undefined,
    sidebarOpen:
      typeof preferences.sidebarOpen === 'boolean'
        ? preferences.sidebarOpen
        : false,
    sidebarWidth: normalizeSidebarWidth(preferences.sidebarWidth),
    canvasLayout: normalizeCanvasLayout(preferences.canvasLayout),
    // Legacy canvasOpen was global and cannot be attributed to a session.
    // Ignore it so every target without an explicit scoped entry starts closed.
    canvasOpenTargetKeys: normalizeCanvasOpenTargetKeys(
      preferences.canvasOpenTargetKeys
    ),
    canvasPreviewUrl: normalizeCanvasPreviewUrl(preferences.canvasPreviewUrl),
    canvasPreviewUrls: normalizeCanvasPreviewUrlRecord(
      preferences.canvasPreviewUrls
    ),
    canvasReview: normalizeCanvasReviewPreferences(preferences.canvasReview),
    canvasSelectedFilePaths: normalizeStringRecord(
      preferences.canvasSelectedFilePaths
    ),
    canvasTab: isCanvasTab(preferences.canvasTab)
      ? preferences.canvasTab
      : undefined,
  };
}

function normalizeSidebarWidth(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizeCanvasLayout(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const main = Reflect.get(value, 'main');
  const canvas = Reflect.get(value, 'canvas');

  if (
    typeof main !== 'number' ||
    !Number.isFinite(main) ||
    typeof canvas !== 'number' ||
    !Number.isFinite(canvas)
  ) {
    return undefined;
  }

  const total = main + canvas;

  if (main <= 0 || canvas <= 0 || total <= 0) {
    return undefined;
  }

  const normalizedCanvas = Math.min(
    homeWorkspaceCanvasMaxPercent,
    Math.max(homeWorkspaceCanvasMinPercent, canvas)
  );

  return {
    canvas: normalizedCanvas,
    main: 100 - normalizedCanvas,
  };
}

function normalizeCanvasReviewPreferences(
  value: unknown
): HomeWorkspaceCanvasReviewPreferences | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const diffLayout = normalizeCanvasReviewDiffLayout(
    Reflect.get(value, 'diffLayout')
  );
  const wrapLines = Reflect.get(value, 'wrapLines');
  const normalizedWrapLines =
    typeof wrapLines === 'boolean' ? wrapLines : undefined;

  if (diffLayout === undefined && normalizedWrapLines === undefined) {
    return undefined;
  }

  return {
    diffLayout,
    wrapLines: normalizedWrapLines,
  };
}

function normalizeCanvasReviewDiffLayout(
  value: unknown
): HomeWorkspaceCanvasReviewDiffLayout | undefined {
  return value === 'split' || value === 'stacked' ? value : undefined;
}

function isStoredHomeWorkspacePreferences(
  value: unknown
): value is StoredHomeWorkspacePreferences {
  return typeof value === 'object' && value !== null;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0
  );

  return values.length > 0 ? Array.from(new Set(values)) : [];
}

function normalizeCanvasOpenTargetKeys(value: unknown) {
  const targetKeys = normalizeStringList(value);

  if (!targetKeys) {
    return undefined;
  }

  const sessionTargetKeys = targetKeys.filter((targetKey) => {
    const [scope, projectId, sessionId, ...rest] = targetKey.split(':');

    return (
      scope === 'session' &&
      Boolean(projectId) &&
      Boolean(sessionId) &&
      rest.length === 0
    );
  });

  return sessionTargetKeys.length > 0 ? sessionTargetKeys : undefined;
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeStringRecord(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 &&
        typeof entry[1] === 'string' &&
        entry[1].trim().length > 0
    )
    .map(([key, label]) => [key, label.trim()]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeCanvasPreviewUrl(value: unknown) {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) {
    return undefined;
  }

  const result = validatePreviewUrlInput(normalizedValue);

  return result.url || undefined;
}

function normalizeCanvasPreviewUrlRecord(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 && typeof entry[1] === 'string'
    )
    .map(([key, url]) => [key, normalizeCanvasPreviewUrl(url)])
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeWorkerSessionStateList(value: unknown) {
  const values = normalizeStringList(value);

  if (!values) {
    return undefined;
  }

  return values.filter((value): value is WorkerSessionState =>
    workerSessionStates.some((state) => state === value)
  );
}

function normalizeOpenWorkerSessionGroupIdsByProject(
  value: unknown
): OpenWorkerSessionGroupIdsByProject | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(
    ([projectId, groupIds]): [string, WorkerSessionState[]][] => {
      if (projectId.trim().length === 0 || !Array.isArray(groupIds)) {
        return [];
      }

      const normalizedGroupIds = normalizeWorkerSessionStateList(groupIds);

      if (
        normalizedGroupIds === undefined ||
        (groupIds.length > 0 && normalizedGroupIds.length === 0)
      ) {
        return [];
      }

      return [[projectId, normalizedGroupIds]];
    }
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
