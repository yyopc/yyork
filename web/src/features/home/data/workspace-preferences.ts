import {
  type WorkerSessionState,
  workerSessionStates,
} from '@/features/home/domain/session-workspace';

const homeWorkspacePreferencesStorageKey =
  'yyork.home.workspace-preferences';
const homeWorkspacePreferencesVersion = 1;

export interface HomeWorkspacePreferences {
  canvasLayout?: HomeWorkspaceCanvasLayout;
  canvasOpen: boolean;
  canvasPreviewUrl?: string;
  hiddenProjectIds?: string[];
  hiddenTerminalSessionKeys?: string[];
  openProjectIds?: string[];
  openWorkerSessionGroupIds?: WorkerSessionState[];
  pinnedProjectIds?: string[];
  pinnedTerminalSessionKeys?: string[];
  projectNameOverrides?: Record<string, string>;
  sessionLabelOverrides?: Record<string, string>;
  sidebarOpen: boolean;
  sidebarWidth?: number;
}

export interface HomeWorkspaceCanvasLayout {
  canvas: number;
  main: number;
}

interface StoredHomeWorkspacePreferences extends Partial<HomeWorkspacePreferences> {
  version?: number;
}

export const defaultHomeWorkspacePreferences: HomeWorkspacePreferences = {
  canvasOpen: false,
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
    hiddenTerminalSessionKeys: normalizeStringList(
      preferences.hiddenTerminalSessionKeys
    ),
    openProjectIds: normalizeStringList(preferences.openProjectIds),
    openWorkerSessionGroupIds: normalizeWorkerSessionStateList(
      preferences.openWorkerSessionGroupIds
    ),
    pinnedProjectIds: normalizeStringList(preferences.pinnedProjectIds),
    pinnedTerminalSessionKeys: normalizeStringList(
      preferences.pinnedTerminalSessionKeys
    ),
    projectNameOverrides: normalizeStringRecord(
      preferences.projectNameOverrides
    ),
    sessionLabelOverrides: normalizeStringRecord(
      preferences.sessionLabelOverrides
    ),
    sidebarOpen:
      typeof preferences.sidebarOpen === 'boolean'
        ? preferences.sidebarOpen
        : false,
    sidebarWidth: normalizeSidebarWidth(preferences.sidebarWidth),
    canvasLayout: normalizeCanvasLayout(preferences.canvasLayout),
    canvasOpen:
      typeof preferences.canvasOpen === 'boolean'
        ? preferences.canvasOpen
        : false,
    canvasPreviewUrl: normalizeString(preferences.canvasPreviewUrl),
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

  return main > 0 && canvas > 0 && total > 0
    ? {
        canvas,
        main,
      }
    : undefined;
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

function normalizeWorkerSessionStateList(value: unknown) {
  const values = normalizeStringList(value);

  if (!values) {
    return undefined;
  }

  return values.filter((value): value is WorkerSessionState =>
    workerSessionStates.some((state) => state === value)
  );
}
