import {
  NavigateOptions,
  useCanGoBack,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';

export const useBrowserHistoryNavigation = () => {
  const canGoBack = useCanGoBack();
  const router = useRouter();
  const historyIndex = useRouterState({
    select: (state) => state.location.state.__TSR_index as number | undefined,
  });
  const canGoForward =
    historyIndex !== undefined && historyIndex < router.history.length - 1;

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

export const useNavigateBack = () => {
  const { canGoBack, navigateBack } = useBrowserHistoryNavigation();

  return { navigateBack, canGoBack };
};
