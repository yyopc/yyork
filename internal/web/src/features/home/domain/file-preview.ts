/**
 * Rich-preview support for files opened in the Canvas Files tab.
 *
 * A file can be shown either as raw source ("code" view) or, when its type has
 * a renderer, as a formatted "rich preview". Markdown is the first supported
 * kind; the union is intentionally open so additional renderers (images, etc.)
 * can be added without reworking the toggle plumbing.
 */
export type FilePreviewKind = 'markdown';

export type FileViewMode = 'preview' | 'code';

const markdownExtensions = new Set([
  'markdown',
  'md',
  'mdown',
  'mdx',
  'mkd',
  'mkdn',
]);

/**
 * Returns the rich-preview renderer kind for a file path, or `null` when the
 * file can only be shown as source code.
 */
export function getFilePreviewKind(
  path: string | null | undefined
): FilePreviewKind | null {
  const extension = getFileExtension(path);
  if (extension && markdownExtensions.has(extension)) {
    return 'markdown';
  }

  return null;
}

/**
 * Resolves the effective view mode for a file: non-previewable files always
 * fall back to the code view regardless of the user's toggle preference.
 */
export function resolveFileViewMode(
  previewKind: FilePreviewKind | null,
  preferredMode: FileViewMode
): FileViewMode {
  return previewKind ? preferredMode : 'code';
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
