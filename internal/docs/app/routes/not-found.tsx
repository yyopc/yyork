import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { Link } from 'react-router';

import { baseOptions } from '@/lib/layout.shared';

import type { Route } from './+types/not-found';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Not Found' }];
}

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <h1 className="mb-2 text-xl font-bold">Not Found</h1>
        <p className="text-fd-muted-foreground mb-4">
          This page could not be found.
        </p>
        <Link
          className="bg-fd-primary text-fd-primary-foreground rounded-full px-4 py-2.5 text-sm font-medium"
          to="/docs"
        >
          Back to Docs
        </Link>
      </div>
    </HomeLayout>
  );
}
