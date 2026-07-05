'use client';

import type { RegisterableHotkey } from '@tanstack/react-hotkeys';
import { Command as CommandPrimitive } from 'cmdk';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  SearchIcon,
} from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/tailwind/utils';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ShortcutKbdGroup } from '@/components/ui/shortcut-kbd';

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground',
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, 'children'> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn(
          'top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0',
          className
        )}
        showCloseButton={showCloseButton}
      >
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            'w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        'no-scrollbar -mx-1 max-h-72 scroll-fade-y scroll-py-1 overflow-x-hidden overflow-y-auto px-1 outline-none [--scroll-fade-reveal:calc(var(--spacing)*6)] scroll-fade-6',
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm', className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 h-px w-[calc(100%+0.5rem)] bg-border', className)}
      {...props}
    />
  );
}

function CommandFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="command-footer"
      className={cn(
        'sticky bottom-0 z-10 -mx-1 flex min-h-10 shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-popover px-4 py-2 text-xs text-muted-foreground',
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex size-5 items-center justify-center rounded-sm border border-border bg-background text-muted-foreground">
            <ArrowUpIcon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="inline-flex size-5 items-center justify-center rounded-sm border border-border bg-background text-muted-foreground">
            <ArrowDownIcon aria-hidden="true" className="size-3.5" />
          </span>
        </span>
        <span>Navigate</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <Kbd>return</Kbd>
        <span>Open</span>
      </span>
      <span className="inline-flex items-center gap-2 sm:ml-auto">
        <Kbd>esc</Kbd>
        <span>Close</span>
      </span>
    </div>
  );
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-hidden select-none hover:bg-muted hover:text-foreground in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:**:[svg]:text-foreground data-[selected=true]:**:[svg]:text-foreground",
        className
      )}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({
  children,
  className,
  hotkey,
  kbdClassName,
  ...props
}: React.ComponentProps<typeof KbdGroup> & {
  hotkey?: RegisterableHotkey;
  kbdClassName?: string;
}) {
  if (hotkey) {
    return (
      <ShortcutKbdGroup
        data-slot="command-shortcut"
        hotkey={hotkey}
        kbdClassName={kbdClassName}
        className={cn('ml-auto shrink-0', className)}
        {...props}
      />
    );
  }

  return (
    <KbdGroup
      data-slot="command-shortcut"
      className={cn('ml-auto shrink-0', className)}
      {...props}
    >
      {children}
    </KbdGroup>
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
