import { HomeLayout } from 'fumadocs-ui/layouts/home';
import {
  ArrowRight,
  Boxes,
  Database,
  GitBranch,
  MonitorPlay,
  RadioTower,
  Terminal,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router';

import { baseOptions } from '@/lib/layout.shared';

import type { Route } from './+types/home';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'yyork docs' },
    {
      name: 'description',
      content:
        'Design decisions, architecture notes, and investigations for yyork.',
    },
  ];
}

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-12 md:px-10 md:py-16">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-fd-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">
              yyork design record
            </p>
            <h1 className="text-fd-foreground text-4xl font-semibold tracking-normal md:text-5xl">
              Decisions behind the local agent workspace.
            </h1>
            <p className="text-fd-muted-foreground mt-5 max-w-2xl text-base leading-7">
              This site records why yyork is built the way it is: local-first
              orchestration, durable terminals, project identity, live workspace
              updates, agent hooks, and the Canvas inspection model.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="bg-fd-primary text-fd-primary-foreground inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
                to="/docs/decisions"
              >
                Read decisions
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                className="text-fd-foreground hover:bg-fd-accent inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium"
                to="/docs/architecture"
              >
                Architecture notes
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="bg-fd-card grid gap-3 rounded-md border p-4 text-sm">
            <HomeFact icon={Database} title="Truth lives locally">
              State is stored under ~/.yyork, with SQLite as the durable source
              for projects and sessions.
            </HomeFact>
            <HomeFact icon={Terminal} title="Agents stay attachable">
              Worker sessions run in Zellij-backed terminals and isolated git
              worktrees.
            </HomeFact>
            <HomeFact icon={MonitorPlay} title="Canvas stays contextual">
              Files, Review, and Browser inspect the selected project or worker
              instead of becoming a separate workspace.
            </HomeFact>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <HomeLink
            icon={Boxes}
            title="Local-first orchestration"
            href="/docs/decisions/local-first-orchestration"
          >
            Why yyork owns spawn, store, worktrees, and durable terminals
            itself.
          </HomeLink>
          <HomeLink
            icon={GitBranch}
            title="Project identity"
            href="/docs/decisions/project-identity"
          >
            How filesystem paths remain the source of truth while URLs use
            stable project ids.
          </HomeLink>
          <HomeLink
            icon={RadioTower}
            title="Live workspace updates"
            href="/docs/decisions/live-workspace-updates"
          >
            Why SSE, a narrow workspace contract, and light polling coexist.
          </HomeLink>
        </section>
      </div>
    </HomeLayout>
  );
}

type HomeIcon = ComponentType<{ className?: string; 'aria-hidden'?: true }>;

function HomeFact({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: HomeIcon;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[1.75rem_1fr] gap-3">
      <span className="bg-fd-muted mt-0.5 flex size-7 items-center justify-center rounded-md">
        <Icon className="text-fd-muted-foreground size-4" aria-hidden />
      </span>
      <div>
        <h2 className="text-fd-foreground font-medium">{title}</h2>
        <p className="text-fd-muted-foreground mt-1 leading-6">{children}</p>
      </div>
    </div>
  );
}

function HomeLink({
  children,
  href,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  href: string;
  icon: HomeIcon;
  title: string;
}) {
  return (
    <Link
      className="group bg-fd-card hover:bg-fd-accent rounded-md border p-4 transition-colors"
      to={href}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="bg-fd-muted flex size-8 items-center justify-center rounded-md">
          <Icon className="text-fd-muted-foreground size-4" aria-hidden />
        </span>
        <ArrowRight
          className="text-fd-muted-foreground size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <h2 className="text-fd-foreground font-medium">{title}</h2>
      <p className="text-fd-muted-foreground mt-2 text-sm leading-6">
        {children}
      </p>
    </Link>
  );
}
