import * as React from 'react';

const DEFAULT_MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
  const subscribe = (onStoreChange: () => void) => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    mql.addEventListener('change', onStoreChange);

    return () => mql.removeEventListener('change', onStoreChange);
  };

  const getSnapshot = () => window.innerWidth < breakpoint;

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
