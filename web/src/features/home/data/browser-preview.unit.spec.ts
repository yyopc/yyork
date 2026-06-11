import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isBrowserPreviewBridgeMessage,
  isLocalPreviewHostname,
  normalizePreviewUrlInput,
  registerBrowserPreviewTarget,
  validatePreviewUrlInput,
} from '@/features/home/data/browser-preview';

describe('browser-preview data helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes schemeless preview URLs as http URLs', () => {
    expect(normalizePreviewUrlInput('localhost:3000')).toBe(
      'http://localhost:3000'
    );
    expect(normalizePreviewUrlInput('https://yyork.localhost')).toBe(
      'https://yyork.localhost'
    );
    expect(normalizePreviewUrlInput('  ')).toBe('');
  });

  it('allows localhost, loopback, and portless localhost aliases', () => {
    expect(isLocalPreviewHostname('localhost')).toBe(true);
    expect(isLocalPreviewHostname('127.0.0.1')).toBe(true);
    expect(isLocalPreviewHostname('127.42.0.9')).toBe(true);
    expect(isLocalPreviewHostname('::1')).toBe(true);
    expect(isLocalPreviewHostname('::')).toBe(true);
    expect(isLocalPreviewHostname('0.0.0.0')).toBe(true);
    expect(isLocalPreviewHostname('yyork.localhost')).toBe(true);
    expect(isLocalPreviewHostname('preview-kfg2sy.localhost')).toBe(true);
  });

  it('rejects arbitrary web hosts', () => {
    expect(validatePreviewUrlInput('https://facebook.com')).toEqual({
      error:
        'yyork Browser only supports localhost, loopback, wildcard bind, and *.localhost preview URLs.',
      url: '',
    });
    expect(validatePreviewUrlInput('https://google.com')).toEqual({
      error:
        'yyork Browser only supports localhost, loopback, wildcard bind, and *.localhost preview URLs.',
      url: '',
    });
  });

  it('returns canonical local preview URLs', () => {
    expect(validatePreviewUrlInput('yyork.localhost')).toEqual({
      url: 'http://yyork.localhost/',
    });
    expect(validatePreviewUrlInput('https://yyork.localhost')).toEqual({
      url: 'https://yyork.localhost/',
    });
    expect(validatePreviewUrlInput('http://127.0.0.1:5173/app')).toEqual({
      url: 'http://127.0.0.1:5173/app',
    });
    expect(validatePreviewUrlInput('http://[::1]:5173/app')).toEqual({
      url: 'http://[::1]:5173/app',
    });
    expect(validatePreviewUrlInput('http://[::]:5173/app')).toEqual({
      url: 'http://[::]:5173/app',
    });
    expect(validatePreviewUrlInput('http://0.0.0.0:8000')).toEqual({
      url: 'http://0.0.0.0:8000/',
    });
  });

  it('accepts only yyork preview bridge messages', () => {
    expect(
      isBrowserPreviewBridgeMessage({
        source: 'yyork-preview-bridge',
        type: 'yyork:dom-event',
      })
    ).toBe(true);
    expect(
      isBrowserPreviewBridgeMessage({
        source: 'yyork-preview-bridge',
        type: 'random:event',
      })
    ).toBe(false);
    expect(
      isBrowserPreviewBridgeMessage({
        source: 'other',
        type: 'yyork:dom-event',
      })
    ).toBe(false);
    expect(isBrowserPreviewBridgeMessage(null)).toBe(false);
  });

  it('sends the optional preview name when registering a target', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          previewUrl: 'http://yyork-preview.yyork.localhost/app',
          targetUrl: 'http://localhost:3000/app',
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      registerBrowserPreviewTarget('http://localhost:3000/app', {
        previewName: 'yyork',
      })
    ).resolves.toEqual({
      previewUrl: 'http://yyork-preview.yyork.localhost/app',
      targetUrl: 'http://localhost:3000/app',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/browser-preview/targets',
      expect.objectContaining({
        body: JSON.stringify({
          previewName: 'yyork',
          url: 'http://localhost:3000/app',
        }),
      })
    );
  });
});
