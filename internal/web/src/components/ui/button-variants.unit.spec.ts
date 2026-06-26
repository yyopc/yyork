import { describe, expect, test } from 'vitest';

import { cn } from '@/lib/tailwind/utils';

import { buttonVariants } from './button-variants';
import { toggleVariants } from './toggle-variants';

function classTokens(className: string) {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('icon control variants', () => {
  test.each(['ghost', 'outline', 'secondary'] as const)(
    'uses app accent hover tokens for global %s icon buttons',
    (variant) => {
      const classes = classTokens(buttonVariants({ variant, size: 'icon' }));

      expect(classes).toContain('hover:bg-accent');
      expect(classes).toContain('hover:text-accent-foreground');
      expect(classes).toContain('dark:hover:bg-accent');
    }
  );

  test('leaves non-icon ghost buttons on the text-button hover surface', () => {
    const className = buttonVariants({ variant: 'ghost', size: 'default' });

    const classes = classTokens(className);

    expect(classes).toContain('hover:bg-muted');
    expect(classes).not.toContain('hover:bg-accent');
  });

  test('allows sidebar icon buttons to override shared app accent tokens', () => {
    const classes = classTokens(
      cn(
        buttonVariants({
          variant: 'ghost',
          size: 'icon',
          className:
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent',
        })
      )
    );

    expect(classes).toContain('hover:bg-sidebar-accent');
    expect(classes).toContain('hover:text-sidebar-accent-foreground');
    expect(classes).toContain('aria-expanded:bg-sidebar-accent');
    expect(classes).toContain('aria-expanded:text-sidebar-accent-foreground');
    expect(classes).toContain('dark:hover:bg-sidebar-accent');
    expect(classes).not.toContain('hover:bg-accent');
    expect(classes).not.toContain('hover:text-accent-foreground');
    expect(classes).not.toContain('aria-expanded:bg-accent');
    expect(classes).not.toContain('aria-expanded:text-accent-foreground');
    expect(classes).not.toContain('dark:hover:bg-accent');
  });

  test.each(['default', 'outline'] as const)(
    'uses app accent hover tokens for global %s icon toggles',
    (variant) => {
      const classes = classTokens(toggleVariants({ variant, size: 'icon-sm' }));

      expect(classes).toContain('hover:bg-accent');
      expect(classes).toContain('hover:text-accent-foreground');
      expect(classes).toContain('aria-pressed:bg-accent');
    }
  );

  test('allows sidebar icon toggles to override shared app accent tokens', () => {
    const classes = classTokens(
      cn(
        toggleVariants({
          variant: 'default',
          size: 'icon-sm',
          className:
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-accent-foreground',
        })
      )
    );

    expect(classes).toContain('hover:bg-sidebar-accent');
    expect(classes).toContain('hover:text-sidebar-accent-foreground');
    expect(classes).toContain('aria-pressed:bg-sidebar-accent');
    expect(classes).toContain('aria-pressed:text-sidebar-accent-foreground');
    expect(classes).not.toContain('hover:bg-accent');
    expect(classes).not.toContain('hover:text-accent-foreground');
    expect(classes).not.toContain('aria-pressed:bg-accent');
    expect(classes).not.toContain('aria-pressed:text-accent-foreground');
  });
});
