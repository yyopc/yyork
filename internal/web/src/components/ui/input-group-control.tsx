import * as React from 'react';

import { cn } from '@/lib/tailwind/utils';

function InputGroupInput({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'>) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        'h-full w-full min-w-0 flex-1 border-0 bg-transparent px-2.5 py-1 text-base shadow-none transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-0 md:text-sm dark:bg-transparent',
        className
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        'field-sizing-content min-h-16 w-full flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-base shadow-none transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-0 md:text-sm dark:bg-transparent',
        className
      )}
      {...props}
    />
  );
}

export { InputGroupInput, InputGroupTextarea };
