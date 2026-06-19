import { useSyncExternalStore } from 'react';

function getServerSnapshot() {
  return false;
}

export function useMediaQuery(query: string) {
  const subscribe = (callback: () => unknown) => {
    const matchMedia = window.matchMedia(query);

    matchMedia.addEventListener('change', callback);
    return () => {
      matchMedia.removeEventListener('change', callback);
    };
  };

  const getSnapshot = () => {
    return window.matchMedia(query).matches;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
