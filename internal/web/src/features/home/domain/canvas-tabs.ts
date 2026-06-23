export type CanvasTab = 'files' | 'review' | 'browser';

export function isCanvasTab(value: unknown): value is CanvasTab {
  return value === 'files' || value === 'review' || value === 'browser';
}
