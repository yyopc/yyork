import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearFirstRunProjectSetupDraft,
  defaultFirstRunProjectSetupSelection,
  readFirstRunProjectSetupDraft,
  updateFirstRunProjectSetupDraft,
  writeFirstRunProjectSetupDraft,
} from '@/features/home/data/first-run-project-setup-draft';

describe('first-run project setup draft', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearFirstRunProjectSetupDraft();
  });

  it('round-trips agent setup selections with the staged project path', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    writeFirstRunProjectSetupDraft({
      ...defaultFirstRunProjectSetupSelection,
      orchestratorHarnessId: 'codex',
      projectPath: '/Users/example/reverbcode',
      rememberOrchestratorDefault: true,
      rememberWorkerDefault: true,
      workerHarnessId: 'claude-code',
    });

    expect(readFirstRunProjectSetupDraft()).toEqual({
      orchestratorHarnessId: 'codex',
      projectPath: '/Users/example/reverbcode',
      rememberOrchestratorDefault: true,
      rememberWorkerDefault: true,
      workerHarnessId: 'claude-code',
    });
  });

  it('merges partial updates onto the existing draft', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    writeFirstRunProjectSetupDraft({
      ...defaultFirstRunProjectSetupSelection,
      projectPath: '/Users/example/reverbcode',
    });

    updateFirstRunProjectSetupDraft({
      rememberWorkerDefault: true,
      workerHarnessId: 'codex',
    });

    expect(readFirstRunProjectSetupDraft()).toEqual({
      ...defaultFirstRunProjectSetupSelection,
      projectPath: '/Users/example/reverbcode',
      rememberWorkerDefault: true,
    });
  });

  it('ignores invalid stored harness ids and empty paths', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    storage.set(
      'yyork.home.first-run-project-setup-draft',
      JSON.stringify({
        orchestratorHarnessId: 'unknown-agent',
        projectPath: '   ',
        workerHarnessId: 'codex',
      })
    );

    expect(readFirstRunProjectSetupDraft()).toBeUndefined();
  });
});
