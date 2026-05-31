import { describe, expect, it } from 'vitest';

import { createOpenSessionIdePath } from './session-ide';

describe('session IDE helpers', () => {
  it('builds project-scoped IDE open paths for the selected session', () => {
    expect(
      createOpenSessionIdePath({
        id: 'session/ao 2',
        project: 'agent-orchestrator',
      })
    ).toBe('/api/sessions/session%2Fao%202/ide?project=agent-orchestrator');
  });
});
