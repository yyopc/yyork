import { expect, test } from 'vitest';

import { page, render } from '@/tests/utils';

import {
  CommandDialog,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';

test('renders dialog command inputs inside a command provider', async () => {
  render(
    <CommandDialog open onOpenChange={() => {}}>
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandItem value="open-board">Open board</CommandItem>
      </CommandList>
    </CommandDialog>
  );

  await expect
    .element(page.getByPlaceholder('Search commands...'))
    .toBeVisible();
});
