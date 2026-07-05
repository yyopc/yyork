import {
  FolderPlusIcon,
  LayoutDashboardIcon,
  PanelRightIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react';

import { appHotkeys } from '@/lib/app-hotkeys';

import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

const mockBoards = ['yyork', 'agent-orchestrator', 'browser preview research'];

const mockSessions = [
  'yyork / orchestrator',
  'yyork / Hook Confirmation Probe',
  'yyork / Configure HyperFrames Popover',
  'agent-orchestrator / Session wiring cleanup',
  'browser preview research / Annotation transport',
];

export function CommandPaletteMockPage() {
  return (
    <main className="grid min-h-dvh place-items-center overflow-hidden bg-background p-8">
      <CommandDialog
        open
        onOpenChange={() => {
          // Keep the mock pinned open for browser-annotation design review.
        }}
        className="top-1/2 max-h-[min(720px,calc(100dvh-4rem))] -translate-y-1/2 sm:max-w-2xl"
      >
        <CommandInput placeholder="Search boards, sessions, actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Boards">
            {mockBoards.map((board) => (
              <CommandItem key={board} value={`board ${board}`}>
                <LayoutDashboardIcon aria-hidden="true" />
                <span>{board}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator className="my-1" />
          <CommandGroup heading="Sessions">
            {mockSessions.map((session) => (
              <CommandItem key={session} value={`session ${session}`}>
                <TerminalIcon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{session}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator className="my-1" />
          <CommandGroup heading="Actions">
            <CommandItem value="add project open folder">
              <FolderPlusIcon aria-hidden="true" />
              <span>Add project</span>
              <CommandShortcut hotkey={appHotkeys.addProject} />
            </CommandItem>
            <CommandItem value="remove current project yyork">
              <Trash2Icon aria-hidden="true" />
              <span>Remove current project</span>
              <CommandShortcut hotkey={appHotkeys.deleteProject} />
            </CommandItem>
            <CommandItem value="toggle sidebar">
              <PanelRightIcon aria-hidden="true" className="rotate-180" />
              <span>Close sidebar</span>
              <CommandShortcut hotkey={appHotkeys.toggleSidebar} />
            </CommandItem>
            <CommandItem value="toggle canvas panel">
              <PanelRightIcon aria-hidden="true" />
              <span>Close Canvas panel</span>
              <CommandShortcut hotkey={appHotkeys.toggleCanvas} />
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <CommandFooter />
      </CommandDialog>
    </main>
  );
}
