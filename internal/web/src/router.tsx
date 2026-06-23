import { createRouter } from '@tanstack/react-router';

import { queryClient } from '@/lib/tanstack-query/query-client';

import { routeTree } from './route-tree.gen';

export function getRouter() {
  return createRouter({
    context: {
      queryClient,
    },
    defaultPreload: 'intent',
    // Since we're using React Query, we don't want loader calls to ever be stale
    // This will ensure that the loader is always called when the route is preloaded or visited
    defaultPreloadStaleTime: 0,
    // yyork uses fixed panes and internal scroll containers. TanStack Router's
    // document-level scroll restoration renders an empty script marker, which
    // React 19 reports as a client-render console error.
    scrollRestoration: false,
    routeTree,
  });
}
