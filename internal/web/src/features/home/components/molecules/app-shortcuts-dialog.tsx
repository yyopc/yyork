import type { RegisterableHotkey } from '@tanstack/react-hotkeys';

import { appShortcutCatalog } from '@/lib/app-hotkeys';
import { cn } from '@/lib/tailwind/utils';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShortcutKbdGroup } from '@/components/ui/shortcut-kbd';

export function AppShortcutsDialog(props: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            All available shortcuts in yyork.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-2">
            {appShortcutCatalog.map((shortcut) => (
              <ShortcutHintRow
                key={shortcut.id}
                label={shortcut.label}
                hotkeys={shortcut.hotkeys}
              />
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function ShortcutHintRow(props: {
  className?: string;
  hotkeys: readonly RegisterableHotkey[];
  kbdClassName?: string;
  label: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center justify-between gap-3 text-sm leading-5',
        props.className
      )}
    >
      <span className="truncate">{props.label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {props.hotkeys.map((hotkey, index) => (
          <span
            key={typeof hotkey === 'string' ? hotkey : JSON.stringify(hotkey)}
            className="contents"
          >
            {index > 0 ? (
              <span className="text-xs text-muted-foreground">or</span>
            ) : null}
            <ShortcutKbdGroup
              hotkey={hotkey}
              kbdClassName={props.kbdClassName}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
