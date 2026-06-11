import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCanvasPreviewTargetKey,
  getCanvasPreviewUrlForTarget,
  getCanvasPreviewUrlPreferenceUpdate,
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

  it('uses target-scoped browser URLs with legacy fallback read support', () => {
    const preferences: HomeWorkspacePreferences = {
      canvasOpen: true,
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
      canvasOpen: true,
      canvasPreviewUrl: 'https://google.com',
      canvasPreviewUrls: {
        'session:yyork:kfg2sy': 'https://yyork.localhost',
        'session:yyork:v042rv': 'https://facebook.com',
      },
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toEqual({
      canvasOpen: true,
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
      canvasOpen: true,
      canvasTab: 'browser',
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasOpen: true,
      canvasTab: 'browser',
      sidebarOpen: true,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasOpen: true,
        canvasTab: 'terminal',
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toEqual({
      canvasOpen: true,
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
      canvasOpen: true,
      canvasReview: {
        diffLayout: 'stacked',
        wrapLines: true,
      },
      sidebarOpen: true,
    });

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasOpen: true,
      canvasReview: {
        diffLayout: 'stacked',
        wrapLines: true,
      },
      sidebarOpen: true,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasOpen: true,
        canvasReview: {
          diffLayout: 'side-by-side',
          wrapLines: 'yes',
        },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toEqual({
      canvasOpen: true,
      sidebarOpen: true,
    });

    storage.set(
      'yyork.home.workspace-preferences',
      JSON.stringify({
        canvasOpen: true,
        canvasReview: {
          diffLayout: 'split',
          wrapLines: false,
        },
        sidebarOpen: true,
      })
    );

    expect(readHomeWorkspacePreferences()).toMatchObject({
      canvasOpen: true,
      canvasReview: {
        diffLayout: 'split',
        wrapLines: false,
      },
      sidebarOpen: true,
    });
  });
});
