import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { subscribeToSessionEvents } from '@/features/home/data/workspace';

/**
 * SessionEventsSubscriber attaches a long-lived EventSource to /api/events
 * and invalidates the workspace query when session.created / session.terminated
 * arrive. Mount it once near the root — typically inside the
 * QueryClientProvider so it can reach the query cache.
 *
 * Renders nothing; effects only.
 */
export function SessionEventsSubscriber(): null {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeToSessionEvents(queryClient);
    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  return null;
}
