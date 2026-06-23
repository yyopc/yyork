import { useRouter } from '@tanstack/react-router';
import { type SweepOptions, useGlimm } from 'glimm/react';
import { useEffect } from 'react';

type InterceptLinksOptions = {
  shouldIntercept?: (event: MouseEvent, anchor: HTMLAnchorElement) => boolean;
  sweep?: SweepOptions;
};

const defaultShouldIntercept = (
  event: MouseEvent,
  anchor: HTMLAnchorElement
) => {
  if (event.defaultPrevented) {
    return false;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  if (event.button !== 0) {
    return false;
  }
  if (anchor.dataset.glimmSkip !== undefined) {
    return false;
  }
  if (anchor.target && anchor.target !== '_self') {
    return false;
  }
  if (anchor.hasAttribute('download')) {
    return false;
  }
  if (!anchor.href) {
    return false;
  }

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return false;
  }
  if (url.pathname === window.location.pathname && url.hash) {
    return false;
  }

  return true;
};

/**
 * TanStack Router equivalent of glimm/next's `<InterceptLinks />`. Runs
 * same-origin in-app link clicks through a glimm sweep before navigating.
 */
export function GlimmInterceptLinks(props: InterceptLinksOptions) {
  const router = useRouter();
  const { sweep } = useGlimm();

  useEffect(() => {
    const shouldIntercept = props.shouldIntercept ?? defaultShouldIntercept;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest('a');
      if (!anchor || !shouldIntercept(event, anchor)) {
        return;
      }

      const href = new URL(anchor.href, window.location.href);
      event.preventDefault();
      sweep(() => {
        router.history.push(`${href.pathname}${href.search}${href.hash}`);
      }, props.sweep);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [props.shouldIntercept, props.sweep, router.history, sweep]);

  return null;
}
