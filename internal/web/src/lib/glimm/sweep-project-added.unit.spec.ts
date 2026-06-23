import { describe, expect, it, vi } from 'vitest';

import { greenGablesPalette } from '@/lib/glimm/green-gables-palette';
import { sweepProjectAdded } from '@/lib/glimm/sweep-project-added';

describe('sweepProjectAdded', () => {
  it('uses the green gables palette from left to right', () => {
    const commit = vi.fn();
    const sweep = vi.fn();

    sweepProjectAdded(sweep, commit);

    expect(sweep).toHaveBeenCalledWith(
      commit,
      expect.objectContaining({
        direction: 'ltr',
        palette: greenGablesPalette,
      })
    );
  });
});
