import type { RegisterableHotkey } from '@tanstack/react-hotkeys';

export const appHotkeys = {
  addProject: 'Mod+O',
  commandPalette: 'Mod+K',
  deleteProject: 'Mod+Backspace',
  deleteProjectForward: 'Mod+Delete',
  toggleCanvas: 'Mod+Shift+B',
  toggleSidebar: 'Mod+B',
  viewShortcuts: { key: '/', shift: true },
} as const satisfies Record<string, RegisterableHotkey>;

export type AppHotkeyId = keyof typeof appHotkeys;

type AppShortcutDefinition = {
  id: AppHotkeyId;
  label: string;
  hotkeys: readonly RegisterableHotkey[];
};

export const appShortcutCatalog = [
  {
    id: 'commandPalette',
    label: 'Open command palette',
    hotkeys: [appHotkeys.commandPalette],
  },
  {
    id: 'addProject',
    label: 'Add project',
    hotkeys: [appHotkeys.addProject],
  },
  {
    id: 'deleteProject',
    label: 'Remove project',
    hotkeys: [appHotkeys.deleteProject],
  },
  {
    id: 'toggleSidebar',
    label: 'Toggle sidebar',
    hotkeys: [appHotkeys.toggleSidebar],
  },
  {
    id: 'toggleCanvas',
    label: 'Toggle canvas',
    hotkeys: [appHotkeys.toggleCanvas],
  },
  {
    id: 'viewShortcuts',
    label: 'View shortcuts',
    hotkeys: [appHotkeys.viewShortcuts],
  },
] as const satisfies readonly AppShortcutDefinition[];

export const sidebarShortcutPreviewIds = [
  'toggleSidebar',
  'toggleCanvas',
  'viewShortcuts',
] as const satisfies readonly AppHotkeyId[];
