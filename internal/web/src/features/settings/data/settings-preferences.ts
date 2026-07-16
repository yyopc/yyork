import type { WorkerWorkspaceMode } from '@/features/home/domain/session-workspace';

const settingsPreferencesStorageKey = 'yyork.settings.preferences';
const settingsPreferencesVersion = 1;

export interface SettingsPreferences {
  defaultWorkerWorkspaceMode: WorkerWorkspaceMode;
}

interface StoredSettingsPreferences extends Partial<SettingsPreferences> {
  version?: number;
}

export const defaultSettingsPreferences: SettingsPreferences = {
  defaultWorkerWorkspaceMode: 'local',
};

export function readSettingsPreferences(): SettingsPreferences {
  if (typeof window === 'undefined') {
    return defaultSettingsPreferences;
  }

  try {
    const storedValue = window.localStorage.getItem(
      settingsPreferencesStorageKey
    );

    return storedValue
      ? normalizeSettingsPreferences(JSON.parse(storedValue))
      : defaultSettingsPreferences;
  } catch {
    return defaultSettingsPreferences;
  }
}

export function writeSettingsPreferences(preferences: SettingsPreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      settingsPreferencesStorageKey,
      JSON.stringify({
        ...normalizeSettingsPreferences(preferences),
        version: settingsPreferencesVersion,
      })
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function normalizeSettingsPreferences(value: unknown): SettingsPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return defaultSettingsPreferences;
  }

  const preferences = value as StoredSettingsPreferences;

  return {
    defaultWorkerWorkspaceMode:
      preferences.defaultWorkerWorkspaceMode === 'new-worktree'
        ? 'new-worktree'
        : 'local',
  };
}
