import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readSettingsPreferences,
  writeSettingsPreferences,
} from '@/features/settings/data/settings-preferences';

describe('settings preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults the worker workspace to the current project', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
      },
    });

    expect(readSettingsPreferences()).toEqual({
      defaultWorkerWorkspaceMode: 'local',
    });
  });

  it('persists a versioned worker workspace preference', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeSettingsPreferences({
      defaultWorkerWorkspaceMode: 'new-worktree',
    });

    expect(JSON.parse(storage.get('yyork.settings.preferences') ?? '')).toEqual(
      {
        defaultWorkerWorkspaceMode: 'new-worktree',
        version: 1,
      }
    );
    expect(readSettingsPreferences()).toEqual({
      defaultWorkerWorkspaceMode: 'new-worktree',
    });
  });

  it.each([
    '{',
    'null',
    '[]',
    JSON.stringify({ defaultWorkerWorkspaceMode: 'shared-worktree' }),
  ])('falls back safely for invalid stored value %s', (storedValue) => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => storedValue,
      },
    });

    expect(readSettingsPreferences()).toEqual({
      defaultWorkerWorkspaceMode: 'local',
    });
  });
});
