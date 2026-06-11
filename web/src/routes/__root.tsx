/// <reference types="vite/client" />
import { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import { PageError } from '@/components/errors/page-error';

import { Providers } from '@/providers';

// react-doctor-disable-next-line react-doctor/only-export-components -- TanStack Router route modules must export Route.
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  notFoundComponent: () => <PageError type="404" />,
  errorComponent: () => <PageError type="error-boundary" />,
  component: RootComponent,
});

export function RootComponent() {
  return (
    <Providers>
      <Outlet />
    </Providers>
  );
}
