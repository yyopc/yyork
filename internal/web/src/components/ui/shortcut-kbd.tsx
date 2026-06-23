import {
  formatForDisplay,
  type RegisterableHotkey,
} from '@tanstack/react-hotkeys';
import type { ComponentProps } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';

type ShortcutKbdKeysOptions = {
  hotkey: RegisterableHotkey;
  kbdClassName?: string;
  separatorClassName?: string;
};

function ShortcutKbdGroup({
  children: _children,
  className,
  hotkey,
  kbdClassName,
  separatorClassName,
  ...props
}: ComponentProps<typeof KbdGroup> & ShortcutKbdKeysOptions) {
  return (
    <KbdGroup className={className} {...props}>
      {getShortcutKbdKeys({
        hotkey,
        kbdClassName,
        separatorClassName,
      })}
    </KbdGroup>
  );
}

function getShortcutKbdKeys({
  hotkey,
  kbdClassName,
  separatorClassName,
}: ShortcutKbdKeysOptions) {
  const keys = getDisplayKeys(hotkey);
  const hotkeyKey =
    typeof hotkey === 'string' ? hotkey : JSON.stringify(hotkey);

  return keys.map((key, index) => (
    <span key={`${hotkeyKey}-${key}-${index}`} className="contents">
      {index > 0 ? (
        <span aria-hidden="true" className={separatorClassName}>
          +
        </span>
      ) : null}
      <Kbd className={kbdClassName}>{key}</Kbd>
    </span>
  ));
}

function getDisplayKeys(hotkey: RegisterableHotkey) {
  const display = formatForDisplay(hotkey);
  const separator = display.includes('+') ? '+' : /\s+/;

  return display.split(separator).flatMap((key) => {
    const trimmedKey = key.trim();
    return trimmedKey ? [trimmedKey] : [];
  });
}

export { ShortcutKbdGroup };
