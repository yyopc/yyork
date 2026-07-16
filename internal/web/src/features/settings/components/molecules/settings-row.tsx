import type { ReactNode } from 'react';

export function SettingsRow(props: {
  control: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-18 flex-col justify-center gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:py-0">
      <div className="min-w-0 sm:w-105 sm:shrink-0">
        <h3 className="text-sm leading-5 font-medium text-foreground">
          {props.title}
        </h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {props.description}
        </p>
      </div>
      <div className="flex w-full shrink-0 justify-start sm:w-60 sm:justify-end">
        {props.control}
      </div>
    </div>
  );
}
