import {
  NavigateOptions,
  RouterHistory,
  useCanGoBack,
  useRouter,
} from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

// TanStack Router has no "can we go forward?" primitive, and deriving one from
// router state is a trap: a freshly *pushed* location's state carries no
// __TSR_index (only locations parsed back out of the history stack do), and
// router.history.length is window.history.length, which counts entries from
// before the app loaded. Comparing those two enabled Forward on a fresh tab
// and disabled it right after navigating. Instead, watch the history itself:
// remember the highest in-app index reached, and let a push reset it — pushing
// discards every entry that was ahead of the cursor.

type ForwardTracker = {
  maxIndex: number;
  listeners: Set<() => void>;
};

const forwardTrackers = new WeakMap<RouterHistory, ForwardTracker>();

const historyIndex = (history: RouterHistory): number =>
  (history.location.state.__TSR_index as number | undefined) ?? 0;

function forwardTrackerFor(history: RouterHistory): ForwardTracker {
  const existing = forwardTrackers.get(history);
  if (existing) {
    return existing;
  }

  const tracker: ForwardTracker = {
    maxIndex: historyIndex(history),
    listeners: new Set(),
  };
  forwardTrackers.set(history, tracker);

  // The subscription lives as long as the history instance itself, so there
  // is nothing to tear down here.
  history.subscribe(({ action }) => {
    const index = historyIndex(history);
    tracker.maxIndex =
      action.type === 'PUSH' ? index : Math.max(tracker.maxIndex, index);
    for (const listener of tracker.listeners) {
      listener();
    }
  });

  return tracker;
}

export const useBrowserHistoryNavigation = () => {
  const canGoBack = useCanGoBack();
  const router = useRouter();
  const canGoForward = useSyncExternalStore(
    (onStoreChange) => {
      const tracker = forwardTrackerFor(router.history);
      tracker.listeners.add(onStoreChange);
      return () => {
        tracker.listeners.delete(onStoreChange);
      };
    },
    () =>
      historyIndex(router.history) < forwardTrackerFor(router.history).maxIndex,
    () => false
  );

  const navigateBack = (options?: NavigateOptions) => {
    if (canGoBack) {
      router.history.back({ ignoreBlocker: options?.ignoreBlocker });
      return;
    }

    router.navigate({
      to: '..',
      replace: true,
      ...options,
    });
  };

  const navigateForward = (options?: NavigateOptions) => {
    if (!canGoForward) {
      return;
    }

    router.history.forward({ ignoreBlocker: options?.ignoreBlocker });
  };

  return { canGoBack, canGoForward, navigateBack, navigateForward };
};
