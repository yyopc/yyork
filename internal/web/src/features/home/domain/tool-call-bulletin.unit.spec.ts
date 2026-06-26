import { describe, expect, it } from 'vitest';

import {
  isRunningToolCallBulletin,
  parseToolCallBulletin,
} from '@/features/home/domain/tool-call-bulletin';

describe('tool call bulletin parser', () => {
  it('parses hook shell command bulletins', () => {
    expect(
      parseToolCallBulletin(
        'Running shell command: pnpm --filter @yyork/web test:ci'
      )
    ).toEqual({
      detail: 'pnpm --filter @yyork/web test:ci',
      kind: 'shell',
      label: 'Shell',
      raw: 'Running shell command: pnpm --filter @yyork/web test:ci',
      running: true,
    });

    expect(parseToolCallBulletin('Finished shell command: git status')).toEqual(
      {
        detail: 'git status',
        kind: 'shell',
        label: 'Shell',
        raw: 'Finished shell command: git status',
        running: false,
      }
    );
  });

  it('parses hook file, edit, and search bulletins', () => {
    expect(
      parseToolCallBulletin('Running file read: internal/cli/hooks.go')
    ).toEqual({
      detail: 'internal/cli/hooks.go',
      kind: 'read',
      label: 'Read',
      raw: 'Running file read: internal/cli/hooks.go',
      running: true,
    });

    expect(
      parseToolCallBulletin('Running file edit: internal/web/src/app.tsx')
    ).toEqual({
      detail: 'internal/web/src/app.tsx',
      kind: 'edit',
      label: 'Edit',
      raw: 'Running file edit: internal/web/src/app.tsx',
      running: true,
    });

    expect(parseToolCallBulletin('Running search: KanbanCard')).toEqual({
      detail: 'KanbanCard',
      kind: 'search',
      label: 'Search',
      raw: 'Running search: KanbanCard',
      running: true,
    });
  });

  it('parses web and checklist bulletins', () => {
    expect(
      parseToolCallBulletin('Running web fetch: https://example.com/docs')
    ).toEqual({
      detail: 'https://example.com/docs',
      kind: 'web-fetch',
      label: 'Fetch',
      raw: 'Running web fetch: https://example.com/docs',
      running: true,
    });

    expect(parseToolCallBulletin('Running web search: yyork hooks')).toEqual({
      detail: 'yyork hooks',
      kind: 'web-search',
      label: 'Search',
      raw: 'Running web search: yyork hooks',
      running: true,
    });

    expect(parseToolCallBulletin('Running task checklist.')).toEqual({
      detail: '',
      kind: 'checklist',
      label: 'Tasks',
      raw: 'Running task checklist.',
      running: true,
    });
  });

  it('parses permission-request triage bulletins', () => {
    expect(
      parseToolCallBulletin(
        'Needs approval for shell command: git push origin main'
      )
    ).toEqual({
      detail: 'git push origin main',
      kind: 'shell',
      label: 'Shell',
      raw: 'Needs approval for shell command: git push origin main',
      running: false,
    });
  });

  it('parses legacy fixture read strings', () => {
    expect(parseToolCallBulletin('Reading file: README.md')).toEqual({
      detail: 'README.md',
      kind: 'read',
      label: 'Read',
      raw: 'Reading file: README.md',
      running: true,
    });
  });

  it('identifies running bulletins', () => {
    expect(isRunningToolCallBulletin('Running search: foo')).toBe(true);
    expect(isRunningToolCallBulletin('Finished search: foo')).toBe(false);
    expect(isRunningToolCallBulletin('Reading file: README.md')).toBe(true);
  });
});
