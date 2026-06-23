'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckIcon, MinusIcon } from 'lucide-react';
import React, { useId } from 'react';

import { cn } from '@/lib/tailwind/utils';

const labelVariants = cva(
  'flex cursor-pointer has-data-disabled:cursor-not-allowed has-data-disabled:opacity-40',
  {
    variants: {
      size: {
        default: 'items-start gap-2.5 text-sm',
        sm: 'items-center gap-2 text-xs',
        lg: 'items-start gap-3 text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

const checkboxVariants = cva(
  'peer relative flex shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary',
  {
    variants: {
      size: {
        default: 'size-4 [&_svg]:size-3.5',
        sm: 'size-3.5 rounded-[4px] [&_svg]:size-2 [&_svg]:[stroke-width:2.5]',
        lg: 'size-5 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

export type CheckboxProps = Omit<CheckboxPrimitive.Root.Props, 'type'> &
  VariantProps<typeof checkboxVariants> & {
    noLabel?: boolean;
    labelProps?: React.ComponentProps<'label'>;
  };

function Checkbox({
  children,
  className,
  noLabel,
  labelProps,
  size,
  ...props
}: CheckboxProps) {
  const Comp = noLabel ? React.Fragment : 'label';
  const generatedId = useId();
  const id = labelProps?.id ?? generatedId;
  const compProps = noLabel
    ? {}
    : {
        ...labelProps,
        id,
        className: cn(labelVariants({ size }), labelProps?.className),
      };

  return (
    <Comp {...compProps}>
      <CheckboxPrimitive.Root
        data-slot="checkbox"
        className={cn(checkboxVariants({ size }), className)}
        aria-labelledby={id}
        {...props}
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          keepMounted
          className="grid place-content-center text-current transition-none data-unchecked:invisible"
          render={(indicatorProps, state) => (
            <span {...indicatorProps}>
              {state.indeterminate ? <MinusIcon /> : <CheckIcon />}
            </span>
          )}
        />
      </CheckboxPrimitive.Root>
      {children}
    </Comp>
  );
}

export { Checkbox };
