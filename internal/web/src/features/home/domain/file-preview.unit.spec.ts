import { describe, expect, it } from 'vitest';

import {
  fileHasCodeView,
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

  it('detects image files by extension', () => {
    expect(getFilePreviewKind('assets/logo.png')).toBe('image');
    expect(getFilePreviewKind('photo.jpg')).toBe('image');
    expect(getFilePreviewKind('photo.jpeg')).toBe('image');
    expect(getFilePreviewKind('anim.gif')).toBe('image');
    expect(getFilePreviewKind('pic.webp')).toBe('image');
    expect(getFilePreviewKind('pic.avif')).toBe('image');
    expect(getFilePreviewKind('icons/arrow.svg')).toBe('image');
    expect(getFilePreviewKind('LOGO.PNG')).toBe('image');
  });

  it('detects video files by extension', () => {
    expect(getFilePreviewKind('videos/demo.mp4')).toBe('video');
    expect(getFilePreviewKind('clip.webm')).toBe('video');
  });

  it('detects audio files by extension', () => {
    expect(getFilePreviewKind('song.mp3')).toBe('audio');
    expect(getFilePreviewKind('sound.wav')).toBe('audio');
    expect(getFilePreviewKind('sound.ogg')).toBe('audio');
    expect(getFilePreviewKind('voice.m4a')).toBe('audio');
  });

  it('returns null for non-previewable files', () => {
    expect(getFilePreviewKind('src/app.ts')).toBeNull();
    expect(getFilePreviewKind('main.go')).toBeNull();
    expect(getFilePreviewKind('Makefile')).toBeNull();
    expect(getFilePreviewKind('archive.tar.gz')).toBeNull();
    expect(getFilePreviewKind('bundle.zip')).toBeNull();
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

  it('forces preview for files without a code view', () => {
    expect(resolveFileViewMode('image', 'code', false)).toBe('preview');
    expect(resolveFileViewMode('video', 'code', false)).toBe('preview');
    expect(resolveFileViewMode('audio', 'code', false)).toBe('preview');
  });

  it('honors the preferred mode when a code view exists', () => {
    expect(resolveFileViewMode('image', 'code', true)).toBe('code');
    expect(resolveFileViewMode('image', 'preview', true)).toBe('preview');
  });
});

describe('fileHasCodeView', () => {
  it('keeps the code view for text files', () => {
    expect(fileHasCodeView('README.md')).toBe(true);
    expect(fileHasCodeView('main.go')).toBe(true);
    expect(fileHasCodeView('Makefile')).toBe(true);
    expect(fileHasCodeView(null)).toBe(true);
  });

  it('keeps the code view for svg (text) but not binary images', () => {
    expect(fileHasCodeView('icons/arrow.svg')).toBe(true);
    expect(fileHasCodeView('assets/logo.png')).toBe(false);
    expect(fileHasCodeView('pic.webp')).toBe(false);
  });

  it('has no code view for video and audio', () => {
    expect(fileHasCodeView('videos/demo.mp4')).toBe(false);
    expect(fileHasCodeView('song.mp3')).toBe(false);
  });
});
