import { HotkeysProvider } from '@tanstack/react-hotkeys';
import type { ReactNode } from 'react';
import '@/lib/dayjs/config';
import '@/lib/i18n';
import '@fontsource-variable/geist';

import { YyorkGlimmProvider } from '@/lib/glimm/yyork-glimm-provider';
import { QueryClientProvider } from '@/lib/tanstack-query/provider';
import { ThemeProvider } from '@/lib/theme/provider';

import { Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export const Providers = (props: {
  children: ReactNode;
  forcedTheme?: string;
}) => {
  return (
    <ThemeProvider
      attribute="class"
      storageKey="theme"
      disableTransitionOnChange
      forcedTheme={props.forcedTheme}
    >
      <QueryClientProvider>
        <HotkeysProvider defaultOptions={{ hotkey: { ignoreInputs: true } }}>
          <TooltipProvider>
            <YyorkGlimmProvider>{props.children}</YyorkGlimmProvider>
          </TooltipProvider>
        </HotkeysProvider>
        <Sonner />
      </QueryClientProvider>
    </ThemeProvider>
  );
};
