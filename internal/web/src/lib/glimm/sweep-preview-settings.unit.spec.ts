import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadGlimmShaderMode } from '@/lib/glimm/sweep-preview-settings';

describe('loadGlimmShaderMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the sweep shader when no mode is stored', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn().mockReturnValue(null),
      },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
      },
    });

    expect(loadGlimmShaderMode()).toBe('sweep');
  });

  it('still honors an explicitly stored shader mode', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn().mockReturnValue('mesh'),
      },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
      },
    });

    expect(loadGlimmShaderMode()).toBe('mesh');
  });
});
