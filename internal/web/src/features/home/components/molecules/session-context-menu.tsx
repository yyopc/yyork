import {
  CheckIcon,
  EyeOffIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export function SessionContextMenu(props: {
  children: ReactNode;
  isPinned?: boolean;
  onDelete?: () => void;
  onHide?: () => void;
  onMarkDone?: () => void;
  onOpen: () => void;
  onPinToggle?: () => void;
  onRename?: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="contents" />}>
        {props.children}
      </ContextMenuTrigger>
      <ContextMenuContent align="start" side="right" className="min-w-44">
        <ContextMenuItem
          disabled={!props.onPinToggle}
          onClick={props.onPinToggle}
        >
          {props.isPinned ? (
            <PinOffIcon aria-hidden="true" />
          ) : (
            <PinIcon aria-hidden="true" />
          )}
          <span>{props.isPinned ? 'Unpin' : 'Pin'}</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={props.onOpen}>
          <SquareTerminalIcon aria-hidden="true" />
          <span>Open terminal</span>
        </ContextMenuItem>
        {props.onMarkDone ? (
          <ContextMenuItem onClick={props.onMarkDone}>
            <CheckIcon aria-hidden="true" />
            <span>Mark done</span>
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem disabled={!props.onRename} onClick={props.onRename}>
          <PencilIcon aria-hidden="true" />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuItem disabled={!props.onHide} onClick={props.onHide}>
          <EyeOffIcon aria-hidden="true" />
          <span>Hide from sidebar</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={!props.onDelete}
          onClick={props.onDelete}
        >
          <Trash2Icon aria-hidden="true" />
          <span>Stop session</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
