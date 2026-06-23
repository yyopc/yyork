import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/tailwind/utils';

import { badgeVariants } from '@/components/ui/badge-variants';

function Badge({
  className,
  variant = 'default',
  size = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: 'badge',
      variant,
      size,
    },
  });
}

export { Badge };
