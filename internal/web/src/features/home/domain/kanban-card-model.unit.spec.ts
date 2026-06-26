import { describe, expect, it } from 'vitest';

import {
  formatElapsed,
  getElapsedLabel,
  KANBAN_CARD_RECAP_PREVIEW_MAX_LEN,
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
    expect(card.recapPreview).toBe('Scanning README for project overview.');
    expect(card.currentLine).toBe(card.recap);
    expect(card.descriptionLines).toEqual([
      'Scanning README for project overview.',
    ]);
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
    expect(card.recapPreview).toBe('');
    expect(card.description).toBe('Needs triage before it can continue.');
  });

  it('caps recap previews at 120 characters for kanban card rendering', () => {
    const longRecap =
      'Implemented generated worker recaps through native agent metadata commands, preserved existing session titles, and added hover-card access for the full recap.';
    const card = toKanbanCardView({
      ...baseSession,
      metadata: JSON.stringify({ title: 'Generated recaps' }),
      recap: longRecap,
      state: 'prompt',
    });

    expect(card.recap).toBe(longRecap);
    expect(card.recapPreview.length).toBe(KANBAN_CARD_RECAP_PREVIEW_MAX_LEN);
    expect(card.recapPreview).toMatch(/\.\.\.$/);
    expect(card.descriptionLines).toEqual([card.recapPreview]);
  });

  it('shows only the active tool call for working cards', () => {
    const card = toKanbanCardView({
      ...baseSession,
      metadata: JSON.stringify({
        currentToolCall: 'Running shell command: pnpm test',
        toolCallBulletins: [
          'Running shell command: pnpm test',
          'Reading file: internal/web/src/features/home/domain/kanban-card-model.ts',
          'Finished search: KanbanCard',
          'Ignored fourth line',
        ],
      }),
      state: 'working',
    });

    expect(card.recap).toBe('Scanning README for project overview.');
    expect(card.descriptionLines).toEqual(['Running shell command: pnpm test']);
    expect(card.description).toBe('Running shell command: pnpm test');
    expect(card.activeToolCall).toEqual({
      detail: 'pnpm test',
      kind: 'shell',
      label: 'Shell',
      raw: 'Running shell command: pnpm test',
      running: true,
    });
    expect(card.activeToolCallLabel).toBe('Shell · pnpm test');
  });

  it('falls back to recap when only finished tool bulletins remain', () => {
    const card = toKanbanCardView({
      ...baseSession,
      metadata: JSON.stringify({
        toolCallBulletins: [
          'Finished shell command: pnpm test',
          'Finished search: KanbanCard',
        ],
      }),
      state: 'working',
    });

    expect(card.descriptionLines).toEqual([
      'Scanning README for project overview.',
    ]);
    expect(card.activeToolCall).toBeUndefined();
    expect(card.activeToolCallLabel).toBeUndefined();
  });

  it('uses state-specific descriptions for prompt triage and done cards', () => {
    expect(
      toKanbanCardView({
        ...baseSession,
        metadata: JSON.stringify({
          recap: 'metadata recap must not override backend recap',
          triageReason: 'Needs approval for shell command: git push',
        }),
        state: 'triage',
      }).description
    ).toBe('Needs approval for shell command: git push');

    expect(
      toKanbanCardView({
        ...baseSession,
        state: 'prompt',
      }).description
    ).toBe('Scanning README for project overview.');

    expect(
      toKanbanCardView({
        ...baseSession,
        metadata: JSON.stringify({ doneSummary: 'Landed the full cleanup.' }),
        state: 'done',
      }).description
    ).toBe('Landed the full cleanup.');
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
    const card = toKanbanCardView({
      ...baseSession,
      metadata: JSON.stringify({ prompt: 'long prompt', title: 'Short title' }),
      title: 'Short title',
    });

    expect(card.task).toBe('Short title');
  });

  it('does not use raw prompt metadata as a card title fallback', () => {
    const card = toKanbanCardView({
      ...baseSession,
      metadata: JSON.stringify({ prompt: 'very long launch prompt' }),
      title: 'New worker agent',
    });

    expect(card.task).toBe('New worker agent');
  });

  it('marks prompt responses as delivered until the delivered timestamp is seen', () => {
    const deliveredAt = '2026-06-07T10:20:00.000Z';
    const session = {
      ...baseSession,
      metadata: JSON.stringify({
        lastAssistantMessageAt: deliveredAt,
        title: 'Review implementation',
      }),
      state: 'prompt',
    } satisfies WorkerSessionRecord;
    const selectionKey = `${encodeURIComponent(session.project)}:${encodeURIComponent(session.id)}`;

    expect(toKanbanCardView(session).responseAttention).toEqual({
      deliveredAt,
      label: 'Response delivered',
      status: 'delivered',
    });
    expect(
      toKanbanCardView(session, {
        [selectionKey]: deliveredAt,
      }).responseAttention
    ).toEqual({
      deliveredAt,
      label: 'Response seen',
      status: 'seen',
    });
  });

  it('falls back to lastActivityAt for legacy prompt response delivery', () => {
    const deliveredAt = '2026-06-07T10:22:00.000Z';
    const card = toKanbanCardView({
      ...baseSession,
      metadata: JSON.stringify({
        lastActivityAt: deliveredAt,
        title: 'Legacy prompt',
      }),
      state: 'prompt',
    });

    expect(card.responseAttention).toMatchObject({
      deliveredAt,
      status: 'delivered',
    });
  });

  it('does not show response attention for non-prompt sessions', () => {
    const card = toKanbanCardView({
      ...baseSession,
      metadata: JSON.stringify({
        lastAssistantMessageAt: '2026-06-07T10:20:00.000Z',
      }),
      state: 'working',
    });

    expect(card.responseAttention).toBeUndefined();
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
