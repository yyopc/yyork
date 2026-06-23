import { afterEach, describe, expect, it, vi } from 'vitest';

import { passionateScarletNightPalette } from '@/lib/glimm/passionate-scarlet-night-palette';
import { GLIMM_SWEEP_PALETTE_OPTIONS } from '@/lib/glimm/sweep-preview-settings';
import {
  getProjectRemovedSweepOptions,
  sweepProjectRemoved,
} from '@/lib/glimm/sweep-project-removed';

describe('sweepProjectRemoved', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers passionate scarlet night in the devtool palette menu', () => {
    expect(GLIMM_SWEEP_PALETTE_OPTIONS).toMatchObject({
      'Passionate Scarlet Night': 'passionateScarletNight',
    });
  });

  it('uses the passionate scarlet night palette from left to right', () => {
    expect(getProjectRemovedSweepOptions()).toMatchObject({
      direction: 'ltr',
      palette: passionateScarletNightPalette,
    });
  });

  it('lets devtool settings override the remove project sweep when enabled', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn().mockReturnValue(
          JSON.stringify({
            removeProjectSettings: {
              direction: 'btt',
              palette: 'ember',
            },
          })
        ),
      },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
      },
    });

    expect(getProjectRemovedSweepOptions()).toMatchObject({
      direction: 'btt',
      palette: 'ember',
    });
  });

  it('commits removal through the glimm sweep', () => {
    const commit = vi.fn();
    const sweep = vi.fn();

    sweepProjectRemoved(sweep, commit);

    expect(sweep).toHaveBeenCalledWith(
      commit,
      expect.objectContaining({
        direction: 'ltr',
        palette: passionateScarletNightPalette,
      })
    );
  });
});
