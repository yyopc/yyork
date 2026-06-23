import { Input as InputPrimitive } from '@base-ui/react/input';
import type { ReactNode } from 'react';
import * as React from 'react';

import { cn } from '@/lib/tailwind/utils';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> &
  Pick<React.ComponentProps<typeof InputGroup>, 'size'> & {
    startAddon?: ReactNode;
    endAddon?: ReactNode;
  };

function Input({
  className,
  type,
  size,
  startAddon,
  endAddon,
  ...props
}: InputProps) {
  if (size || startAddon || endAddon) {
    return (
      <InputGroup size={size} className={className}>
        {startAddon && (
          <InputGroupAddon align="inline-start">{startAddon}</InputGroupAddon>
        )}
        <InputGroupInput type={type} {...props} />
        {endAddon && (
          <InputGroupAddon align="inline-end">{endAddon}</InputGroupAddon>
        )}
      </InputGroup>
    );
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    />
  );
}

export { Input };
