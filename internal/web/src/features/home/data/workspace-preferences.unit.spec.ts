import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCanvasOpenForTarget,
  getCanvasOpenPreferenceUpdate,
  getCanvasPreviewTargetKey,
  getCanvasPreviewUrlForTarget,
  getCanvasPreviewUrlPreferenceUpdate,
  getCanvasSelectedFilePathForTarget,
  getCanvasSelectedFilePathPreferenceUpdate,
  type HomeWorkspacePreferences,
  readHomeWorkspacePreferences,
  writeHomeWorkspacePreferences,
} from '@/features/home/data/workspace-preferences';

describe('workspace preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds stable canvas preview keys per target scope', () => {
    expect(
      getCanvasPreviewTargetKey({
        cwd: '/Users/example/yyork',
        projectId: 'yyork',
        sessionId: 'kfg2sy',
      })
    ).toBe('session:yyork:kfg2sy');

    expect(
      getCanvasPreviewTargetKey({
        cwd: '/Users/example/yyork',
        projectId: 'yyork',
      })
    ).toBe('project:yyork');

    expect(
      getCanvasPreviewTargetKey({
        cwd: '/Users/example/yyork',
      })
    ).toBe('cwd:%2FUsers%2Fexample%2Fyyork');
  });

  it('opens and closes only the requested Canvas target', () => {
    const workerA = 'session:yyork:worker-a';
    const workerB = 'session:yyork:worker-b';
    const openedA = getCanvasOpenPreferenceUpdate({}, workerA, true);
    const openedBoth = getCanvasOpenPreferenceUpdate(openedA, workerB, true);

    expect(getCanvasOpenForTarget(openedBoth, workerA)).toBe(true);
    expect(getCanvasOpenForTarget(openedBoth, workerB)).toBe(true);

    const closedA = getCanvasOpenPreferenceUpdate(openedBoth, workerA, false);

    expect(closedA).toEqual({ canvasOpenTargetKeys: [workerB] });
    expect(getCanvasOpenForTarget(closedA, workerA)).toBe(false);
    expect(getCanvasOpenForTarget(closedA, workerB)).toBe(true);
    expect(getCanvasOpenPreferenceUpdate(closedA, workerB, false)).toEqual({
      canvasOpenTargetKeys: undefined,
    });
  });

  it('uses target-scoped browser URLs with legacy fallback read support', () => {
    const preferences: HomeWorkspacePreferences = {
      canvasPreviewUrl: 'https://yyork.localhost/',
      canvasPreviewUrls: {
        'session:yyork:kfg2sy': 'http://localhost:3000/',
      },
      sidebarOpen: true,
    };

    expect(
      getCanvasPreviewUrlForTarget(preferences, 'session:yyork:kfg2sy')
    ).toBe('http://localhost:3000/');
    expect(
      getCanvasPreviewUrlForTarget(preferences, 'session:yyork:v042rv')
    ).toBe('https://yyork.localhost/');
  });

  it('writes browser URL updates into the target-scoped map', () => {
    const update = getCanvasPreviewUrlPreferenceUpdate(
      {
        canvasPreviewUrl: 'https://yyork.localhost/',
        canvasPreviewUrls: {
          'session:yyork:v042rv': 'http://localhost:5173/',
        },
      },
      'session:yyork:kfg2sy',
      'https://yyork.localhost'
    );

    expect(update).toEqual({
      canvasPreviewUrl: undefined,
      canvasPreviewUrls: {
        'session:yyork:kfg2sy': 'https://yyork.localhost/',
        'session:yyork:v042rv': 'http://localhost:5173/',
      },
    });
  });

  it('normalizes persisted preview URLs and drops unsupported hosts', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeHomeWorkspacePreferences({
      canvasPreviewUrl: 'https://google.com',
      canvasPreviewUrls: {
        'session:yyork:kfg2sy': 'https://yyork.localhost',
        'session:yyork:v042rv': 'https://facebook.com',
      },
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toEqual({
      canvasPreviewUrls: {
        'session:yyork:kfg2sy': 'https://yyork.localhost/',
      },
      sidebarOpen: true,
    });
  });

  it('persists a valid active canvas tab and drops invalid stored tab values', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeHomeWorkspacePreferences({
      canvasTab: 'browser',
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasTab: 'browser',
      sidebarOpen: true,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasTab: 'terminal',
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toEqual({
      sidebarOpen: true,
    });
  });

  it('clamps persisted canvas layout to the resizable pane limits', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasLayout: { canvas: 5, main: 95 },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasLayout: { canvas: 22, main: 78 },
      sidebarOpen: true,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasLayout: { canvas: 90, main: 10 },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasLayout: { canvas: 70, main: 30 },
      sidebarOpen: true,
    });
  });

  it('persists target-scoped canvas selected file paths and drops invalid values', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeHomeWorkspacePreferences({
      canvasSelectedFilePaths: {
        'session:yyork:kfg2sy': 'README.md',
        'session:yyork:v042rv': 'internal/web/package.json',
      },
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasSelectedFilePaths: {
        'session:yyork:kfg2sy': 'README.md',
        'session:yyork:v042rv': 'internal/web/package.json',
      },
      sidebarOpen: true,
    });

    expect(
      getCanvasSelectedFilePathForTarget(
        readHomeWorkspacePreferences(),
        'session:yyork:kfg2sy'
      )
    ).toBe('README.md');

    const update = getCanvasSelectedFilePathPreferenceUpdate(
      readHomeWorkspacePreferences(),
      'session:yyork:kfg2sy',
      'go.mod'
    );

    expect(update).toEqual({
      canvasSelectedFilePaths: {
        'session:yyork:kfg2sy': 'go.mod',
        'session:yyork:v042rv': 'internal/web/package.json',
      },
    });

    writeHomeWorkspacePreferences({
      ...readHomeWorkspacePreferences(),
      ...getCanvasSelectedFilePathPreferenceUpdate(
        readHomeWorkspacePreferences(),
        'session:yyork:kfg2sy',
        null
      ),
    });

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasSelectedFilePaths: {
        'session:yyork:v042rv': 'internal/web/package.json',
      },
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasSelectedFilePaths: {
          'session:yyork:kfg2sy': '  ',
          'session:yyork:v042rv': 42,
        },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toEqual({
      sidebarOpen: true,
    });
  });

  it('persists normalized Review diff settings and drops invalid values', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeHomeWorkspacePreferences({
      canvasReview: {
        diffLayout: 'stacked',
        wrapLines: true,
      },
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasReview: {
        diffLayout: 'stacked',
        wrapLines: true,
      },
      sidebarOpen: true,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasReview: {
          diffLayout: 'side-by-side',
          wrapLines: 'yes',
        },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toEqual({
      sidebarOpen: true,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasReview: {
          diffLayout: 'split',
          wrapLines: false,
        },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasReview: {
        diffLayout: 'split',
        wrapLines: false,
      },
      sidebarOpen: true,
    });
  });

  it('round-trips worker group expansion state independently per project', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    writeHomeWorkspacePreferences({
      openWorkerSessionGroupIdsByProject: {
        yyoreel: [],
        yyork: ['prompt'],
      },
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toMatchObject({
      openWorkerSessionGroupIdsByProject: {
        yyoreel: [],
        yyork: ['prompt'],
      },
    });
  });

  it('normalizes persisted worker group expansion state per project', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        openWorkerSessionGroupIdsByProject: {
          '': ['done'],
          malformed: ['unknown'],
          nonArray: 'prompt',
          yyoreel: [],
          yyork: ['prompt', 'working', 'prompt', 'unknown'],
        },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toEqual({
      openWorkerSessionGroupIdsByProject: {
        yyoreel: [],
        yyork: ['prompt', 'working'],
      },
      sidebarOpen: true,
    });
  });

  it('drops legacy global worker group state and preserves unrelated preferences', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        openWorkerSessionGroupIds: ['prompt'],
        pinnedProjectIds: ['yyork'],
        sidebarOpen: true,
      })
    );

    const normalizedPreferences = readHomeWorkspacePreferences();

    expect(normalizedPreferences).toEqual({
      pinnedProjectIds: ['yyork'],
      sidebarOpen: true,
    });

    writeHomeWorkspacePreferences(normalizedPreferences);

    expect(
      JSON.parse(storage.get('yyork.home.workspace-preferences') ?? '{}')
    ).not.toHaveProperty('openWorkerSessionGroupIds');
  });

  it('falls back safely when persisted workspace preferences are malformed', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    storage.set('yyork.home.workspace-preferences', '{invalid json');

    expect(readHomeWorkspacePreferences()).toEqual({
      sidebarOpen: false,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        openWorkerSessionGroupIdsByProject: ['prompt'],
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toEqual({
      sidebarOpen: true,
    });
  });

  it('round-trips and normalizes target-scoped Canvas visibility', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasOpenTargetKeys: [
          'session:yyork:worker-a',
          'session:yyork:worker-a',
          42,
          '',
          'session:yyork:worker-b',
        ],
        sidebarOpen: true,
      })
    );

    const normalizedPreferences = readHomeWorkspacePreferences();

    expect(normalizedPreferences).toEqual({
      canvasOpenTargetKeys: [
        'session:yyork:worker-a',
        'session:yyork:worker-b',
      ],
      sidebarOpen: true,
    });

    writeHomeWorkspacePreferences(normalizedPreferences);

    expect(
      JSON.parse(storage.get('yyork.home.workspace-preferences') ?? '{}')
    ).toEqual({
      canvasOpenTargetKeys: [
        'session:yyork:worker-a',
        'session:yyork:worker-b',
      ],
      sidebarOpen: true,
      version: 1,
    });
  });

  it('drops malformed target visibility and legacy global Canvas state', () => {
    const storage = new Map<string, string>();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasOpen: true,
        canvasOpenTargetKeys: { 'session:yyork:worker-a': true },
        pinnedProjectIds: ['yyork'],
        sidebarOpen: true,
      })
    );

    const normalizedPreferences = readHomeWorkspacePreferences();

    expect(normalizedPreferences).toEqual({
      pinnedProjectIds: ['yyork'],
      sidebarOpen: true,
    });

    writeHomeWorkspacePreferences(normalizedPreferences);

    expect(
      JSON.parse(storage.get('yyork.home.workspace-preferences') ?? '{}')
    ).not.toHaveProperty('canvasOpen');
  });
});
