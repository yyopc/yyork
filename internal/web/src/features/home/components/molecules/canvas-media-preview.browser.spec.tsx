import { expect, test } from 'vitest';

import { page, render } from '@/tests/utils';

import { CanvasMediaPreview } from './canvas-media-preview';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const BROKEN_SRC = 'data:image/png;base64,not-an-image';

test('renders an image with the file path as its accessible name', async () => {
  render(
    <CanvasMediaPreview
      kind="image"
      path="assets/logo.png"
      src={ONE_PIXEL_PNG}
    />
  );

  const image = page.getByRole('img', { name: 'assets/logo.png' });
  await expect.element(image).toBeVisible();
  await expect.element(image).toHaveAttribute('src', ONE_PIXEL_PNG);
});

test('renders a video element with native controls', async () => {
  render(
    <CanvasMediaPreview
      kind="video"
      path="videos/demo.mp4"
      src="/media/demo.mp4"
    />
  );

  await expect.poll(() => document.querySelector('video')).not.toBeNull();
  const video = document.querySelector('video');
  expect(video?.getAttribute('src')).toBe('/media/demo.mp4');
  expect(video?.hasAttribute('controls')).toBe(true);
  expect(video?.getAttribute('preload')).toBe('metadata');
});

test('renders an audio element with the filename shown', async () => {
  render(
    <CanvasMediaPreview kind="audio" path="sounds/beep.mp3" src="/beep.mp3" />
  );

  await expect.element(page.getByText('sounds/beep.mp3')).toBeVisible();
  const audio = document.querySelector('audio');
  expect(audio?.getAttribute('src')).toBe('/beep.mp3');
  expect(audio?.hasAttribute('controls')).toBe(true);
});

test('shows a placeholder when the media fails to load', async () => {
  render(
    <CanvasMediaPreview kind="image" path="assets/logo.png" src={BROKEN_SRC} />
  );

  await expect.element(page.getByText('Unable to display media')).toBeVisible();
  await expect.element(page.getByText('assets/logo.png')).toBeVisible();
});

test('clears the failure state when the source changes', async () => {
  const { rerender } = await render(
    <CanvasMediaPreview kind="image" path="assets/logo.png" src={BROKEN_SRC} />
  );

  await expect.element(page.getByText('Unable to display media')).toBeVisible();

  await rerender(
    <CanvasMediaPreview
      kind="image"
      path="assets/logo.png"
      src={ONE_PIXEL_PNG}
    />
  );

  await expect
    .element(page.getByRole('img', { name: 'assets/logo.png' }))
    .toBeVisible();
});
