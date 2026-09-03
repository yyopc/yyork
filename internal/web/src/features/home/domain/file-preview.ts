/**
 * Rich-preview support for files opened in the Canvas Files tab.
 *
 * A file can be shown either as raw source ("code" view) or, when its type has
 * a renderer, as a formatted "rich preview". Markdown and media (image, video,
 * audio) are the supported kinds; the union is intentionally open so additional
 * renderers can be added without reworking the toggle plumbing.
 */
export type FilePreviewKind = 'markdown' | 'image' | 'video' | 'audio';

export type FileViewMode = 'preview' | 'code';

const markdownExtensions = new Set([
  'markdown',
  'md',
  'mdown',
  'mdx',
  'mkd',
  'mkdn',
]);

const imageExtensions = new Set([
  'avif',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

const videoExtensions = new Set(['mp4', 'webm']);

const audioExtensions = new Set(['m4a', 'mp3', 'ogg', 'wav']);

/**
 * Returns the rich-preview renderer kind for a file path, or `null` when the
 * file can only be shown as source code.
 */
export function getFilePreviewKind(
  path: string | null | undefined
): FilePreviewKind | null {
  const extension = getFileExtension(path);
  if (!extension) {
    return null;
  }
  if (markdownExtensions.has(extension)) {
    return 'markdown';
  }
  if (imageExtensions.has(extension)) {
    return 'image';
  }
  if (videoExtensions.has(extension)) {
    return 'video';
  }
  if (audioExtensions.has(extension)) {
    return 'audio';
  }

  return null;
}

/**
 * Whether the file has a meaningful source ("code") view. Binary media does
 * not; SVG is text, so it keeps the code/preview toggle alongside markdown and
 * plain source files.
 */
export function fileHasCodeView(path: string | null | undefined): boolean {
  const kind = getFilePreviewKind(path);
  if (kind === 'video' || kind === 'audio') {
    return false;
  }
  if (kind === 'image') {
    return getFileExtension(path) === 'svg';
  }

  return true;
}

/**
 * Resolves the effective view mode for a file: non-previewable files always
 * fall back to the code view, and files without a code view (binary media)
 * always render their preview, regardless of the user's toggle preference.
 */
export function resolveFileViewMode(
  previewKind: FilePreviewKind | null,
  preferredMode: FileViewMode,
  hasCodeView = true
): FileViewMode {
  if (!previewKind) {
    return 'code';
  }
  if (!hasCodeView) {
    return 'preview';
  }

  return preferredMode;
}

function getFileExtension(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const fileName = path.split('/').pop() ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}
