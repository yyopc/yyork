/// <reference types="vite/client" />
import { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { GlimmInterceptLinks } from '@/lib/glimm/intercept-links';

import { PageError } from '@/components/errors/page-error';

import { Providers } from '@/providers';

const GlimmSweepDevtool = import.meta.env.DEV
  ? lazy(() =>
      import('@/lib/glimm/glimm-sweep-devtool').then((module) => ({
        default: module.GlimmSweepDevtool,
      }))
    )
  : () => null;

// react-doctor-disable-next-line react-doctor/only-export-components -- TanStack Router route modules must export Route.
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  notFoundComponent: () => <PageError type="404" />,
  errorComponent: () => <PageError type="error-boundary" />,
  component: RootComponent,
});

export function RootComponent() {
  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : undefined;
  const shouldMountGlimmSweepDevtool =
    import.meta.env.DEV && searchParams?.has('glimmDevtool') === true;

  return (
    <Providers>
      <GlimmInterceptLinks />
      {shouldMountGlimmSweepDevtool ? (
        <Suspense fallback={null}>
          <GlimmSweepDevtool />
        </Suspense>
      ) : null}
      <Outlet />
    </Providers>
  );
}
