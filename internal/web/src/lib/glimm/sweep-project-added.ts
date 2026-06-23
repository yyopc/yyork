import type { SweepOptions } from 'glimm/react';

import { applyStagedNamedropAnchor } from '@/lib/glimm/glimm-namedrop-anchor';
import { greenGablesPalette } from '@/lib/glimm/green-gables-palette';
import { getGlimmAddProjectSweepOptions } from '@/lib/glimm/sweep-preview-settings';

type GlimmSweep = (commit: () => void, options?: SweepOptions) => void;

function getProjectAddedSweepOptions(): SweepOptions {
  const devOptions = import.meta.env.DEV
    ? getGlimmAddProjectSweepOptions()
    : undefined;

  return {
    direction: 'ltr',
    palette: greenGablesPalette,
    ...devOptions,
  };
}

/** Runs the glimm sweep when a project is added and the UI commits the result. */
export function sweepProjectAdded(sweep: GlimmSweep, commit: () => void) {
  applyStagedNamedropAnchor();

  const options = getProjectAddedSweepOptions();

  // ensureController() inside sweep() is synchronous — re-apply after it
  // runs so the first-ever sweep still picks up the staged anchor.
  sweep(commit, options);
  applyStagedNamedropAnchor();
}
