'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { Circle } from 'lucide-react';
import { Fragment, useId } from 'react';

import { cn } from '@/lib/tailwind/utils';

const labelVariants = cva(
  'flex cursor-pointer items-start gap-2.5 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-40',
  {
    variants: {
      size: {
        default: 'text-sm',
        sm: 'gap-2 text-xs',
        lg: 'gap-3 text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

const radioVariants = cva(
  'group/radio-group-item peer relative flex aspect-square shrink-0 rounded-full border border-input outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary',
  {
    variants: {
      size: {
        default: 'size-4',
        sm: 'size-4',
        lg: 'size-5',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn('grid w-full gap-3', className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(radioVariants({}), className)}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export type RadioProps = Omit<RadioPrimitive.Root.Props, 'value'> &
  VariantProps<typeof radioVariants> & {
    noLabel?: boolean;
    labelProps?: React.ComponentProps<'label'>;
    value: RadioPrimitive.Root.Props['value'];
  };

function Radio({
  children,
  className,
  noLabel,
  labelProps,
  size,
  ...props
}: RadioProps) {
  const Comp = noLabel ? Fragment : 'label';
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
      <RadioPrimitive.Root
        data-slot="radio-group-item"
        className={cn(radioVariants({ size }), className)}
        aria-labelledby={id}
        {...props}
      >
        <RadioPrimitive.Indicator
          data-slot="radio-group-indicator"
          className="flex size-full items-center justify-center"
        >
          <Circle className="size-1/2 fill-current" />
        </RadioPrimitive.Indicator>
      </RadioPrimitive.Root>
      {children}
    </Comp>
  );
}

export { Radio, RadioGroup, RadioGroupItem };
