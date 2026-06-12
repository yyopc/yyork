import { describe, expect, it } from 'vitest';

import {
  formatElapsed,
  getElapsedLabel,
  parseSessionMetadata,
  toKanbanCardView,
} from '@/features/home/domain/kanban-card-model';
import type { WorkerSessionRecord } from '@/features/home/domain/session-workspace';

const baseSession = {
  agent: 'claude-code',
  createdAt: '2026-06-07T10:00:00.000Z',
  cwd: '/tmp/project',
  description: '',
  id: 'session-abc123456789',
  issue: '',
  kind: 'worker',
  metadata: JSON.stringify({
    activity: 'working',
    prompt: 'tell me about this project',
    recap: 'Scanning README for project overview.',
    title: 'Tell me about this project',
  }),
  project: '/tmp/project',
  recap: 'Scanning README for project overview.',
  state: 'working',
  terminalSupported: true,
  title: 'Tell me about this project',
  updatedAt: '2026-06-07T10:05:00.000Z',
  workerId: 'session-abc123456789',
} satisfies WorkerSessionRecord;

describe('kanban card model', () => {
  it('uses the backend session recap as the card recap', () => {
    const card = toKanbanCardView(baseSession);

    expect(card.task).toBe('Tell me about this project');
    expect(card.recap).toBe('Scanning README for project overview.');
    expect(card.currentLine).toBe(card.recap);
    expect(card.agentLabel).toBe('Claude Code');
    expect(card.activity).toBe('working');
    expect(card.shortId).toBe('456789');
    expect(card.metadata).toContain('"prompt"');
  });

  it('leaves recap empty until the Stop hook writes recap', () => {
    const card = toKanbanCardView({
      ...baseSession,
      description: '',
      metadata: JSON.stringify({ title: 'Needs review' }),
      recap: '',
      state: 'triage',
    });

    expect(card.activity).toBe('waiting-for-input');
    expect(card.recap).toBe('');
  });

  it('falls back to legacy session.description when recap is unavailable', () => {
    const card = toKanbanCardView({
      ...baseSession,
      description: 'Finished refactoring the session adapter.',
      metadata: '',
      recap: '',
    });

    expect(card.recap).toBe('Finished refactoring the session adapter.');
  });

  it('does not derive the recap by re-parsing frontend metadata', () => {
    const card = toKanbanCardView({
      ...baseSession,
      description: '',
      metadata: JSON.stringify({ recap: 'Frontend-only recap' }),
      recap: '',
    });

    expect(card.recap).toBe('');
  });

  it('prefers hook title over raw prompt duplication', () => {
    expect(
      parseSessionMetadata(
        JSON.stringify({ prompt: 'long prompt', title: 'Short title' })
      )
    ).toEqual({
      prompt: 'long prompt',
      title: 'Short title',
    });
  });

  it('formats elapsed durations compactly', () => {
    expect(formatElapsed(0)).toBe('now');
    expect(formatElapsed(45_000)).toBe('now');
    expect(formatElapsed(59_999)).toBe('now');
    expect(formatElapsed(60_000)).toBe('1m');
    expect(formatElapsed(5 * 60_000)).toBe('5m');
    expect(formatElapsed(2 * 60 * 60_000 + 15 * 60_000)).toBe('2h');
    expect(formatElapsed(16 * 60 * 60_000 + 3 * 60_000)).toBe('16h');
    expect(formatElapsed(3 * 24 * 60 * 60_000)).toBe('3d');
    expect(formatElapsed(10 * 24 * 60 * 60_000)).toBe('1w');
    expect(formatElapsed(45 * 24 * 60 * 60_000)).toBe('1mo');
  });

  it('derives elapsed labels from session timestamps', () => {
    const now = Date.parse('2026-06-07T10:15:00.000Z');
    const originalNow = Date.now;
    Date.now = () => now;

    try {
      expect(
        getElapsedLabel({
          ...baseSession,
          metadata: JSON.stringify({
            lastActivityAt: '2026-06-07T10:14:30.000Z',
          }),
        })
      ).toBe('now');
      expect(
        getElapsedLabel({
          ...baseSession,
          metadata: '',
          updatedAt: '2026-06-07T10:10:00.000Z',
        })
      ).toBe('5m');
    } finally {
      Date.now = originalNow;
    }
  });
});
