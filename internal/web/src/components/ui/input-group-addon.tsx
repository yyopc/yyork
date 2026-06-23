import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/tailwind/utils';

import { inputGroupAddonVariants } from '@/components/ui/input-group-variants';

function InputGroupAddon({
  className,
  align = 'inline-start',
  onPointerDown,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (
          event.defaultPrevented ||
          (event.target as HTMLElement).closest('button')
        ) {
          return;
        }

        event.currentTarget.parentElement
          ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            'input, textarea'
          )
          ?.focus();
      }}
      {...props}
    />
  );
}

export { InputGroupAddon };
