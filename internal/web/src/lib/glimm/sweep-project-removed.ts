import type { SweepOptions } from 'glimm/react';

import { passionateScarletNightPalette } from '@/lib/glimm/passionate-scarlet-night-palette';
import { getGlimmRemoveProjectSweepOptions } from '@/lib/glimm/sweep-preview-settings';

type GlimmSweep = (commit: () => void, options?: SweepOptions) => void;

export function getProjectRemovedSweepOptions(): SweepOptions {
  const devOptions = import.meta.env.DEV
    ? getGlimmRemoveProjectSweepOptions()
    : undefined;

  return {
    direction: 'ltr',
    palette: passionateScarletNightPalette,
    ...devOptions,
  };
}

/** Runs the glimm sweep when a project is removed and the UI commits the result. */
export function sweepProjectRemoved(sweep: GlimmSweep, commit: () => void) {
  sweep(commit, getProjectRemovedSweepOptions());
}
