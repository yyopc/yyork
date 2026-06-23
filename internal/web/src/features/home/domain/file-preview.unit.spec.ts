import { describe, expect, it } from 'vitest';

import {
  getFilePreviewKind,
  resolveFileViewMode,
} from '@/features/home/domain/file-preview';

describe('getFilePreviewKind', () => {
  it('detects markdown files by extension', () => {
    expect(getFilePreviewKind('README.md')).toBe('markdown');
    expect(getFilePreviewKind('docs/guide.markdown')).toBe('markdown');
    expect(getFilePreviewKind('notes/post.mdx')).toBe('markdown');
  });

  it('is case-insensitive for the extension', () => {
    expect(getFilePreviewKind('README.MD')).toBe('markdown');
  });

  it('returns null for non-previewable files', () => {
    expect(getFilePreviewKind('src/app.ts')).toBeNull();
    expect(getFilePreviewKind('main.go')).toBeNull();
    expect(getFilePreviewKind('Makefile')).toBeNull();
  });

  it('handles dotfiles and trailing dots without a real extension', () => {
    expect(getFilePreviewKind('.gitignore')).toBeNull();
    expect(getFilePreviewKind('archive.')).toBeNull();
  });

  it('returns null for empty or missing paths', () => {
    expect(getFilePreviewKind(null)).toBeNull();
    expect(getFilePreviewKind(undefined)).toBeNull();
    expect(getFilePreviewKind('')).toBeNull();
  });
});

describe('resolveFileViewMode', () => {
  it('honors the preferred mode for previewable files', () => {
    expect(resolveFileViewMode('markdown', 'preview')).toBe('preview');
    expect(resolveFileViewMode('markdown', 'code')).toBe('code');
  });

  it('forces code view for non-previewable files', () => {
    expect(resolveFileViewMode(null, 'preview')).toBe('code');
    expect(resolveFileViewMode(null, 'code')).toBe('code');
  });
});
