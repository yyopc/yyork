import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/tailwind/utils';

import { inputGroupVariants } from '@/components/ui/input-group-variants';

function InputGroup({
  className,
  size,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupVariants>) {
  return (
    <div
      data-slot="input-group"
      data-size={size}
      className={cn(inputGroupVariants({ size }), className)}
      {...props}
    />
  );
}

export { InputGroup };
