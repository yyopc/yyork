import type { ReactNode } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function OrchestratorWorkspaceTemplate(props: {
  main: ReactNode;
  onSidebarOpenChange: (open: boolean) => void;
  onSidebarWidthChange: (width: number) => void;
  primarySidebar: ReactNode;
  sidebarOpen: boolean;
  sidebarWidth?: number;
  topbar: ReactNode;
}) {
  return (
    <div className="h-dvh overflow-hidden bg-background font-sans text-foreground">
      <SidebarProvider
        defaultOpen={false}
        open={props.sidebarOpen}
        onOpenChange={props.onSidebarOpenChange}
        width={props.sidebarWidth}
        onWidthChange={props.onSidebarWidthChange}
        className="h-full min-h-160 overflow-hidden bg-background [--sidebar-width:13rem]"
      >
        {props.primarySidebar}
        <SidebarInset className="min-w-0 overflow-hidden bg-background">
          {props.topbar}
          {props.main}
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
