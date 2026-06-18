import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/tailwind/utils';

const toggleVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:grayscale data-disabled:cursor-not-allowed data-disabled:opacity-40 data-disabled:grayscale [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-transparent hover:bg-accent hover:text-accent-foreground data-pressed:bg-accent data-pressed:text-accent-foreground',
        outline:
          'border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground data-pressed:bg-accent data-pressed:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2',
        icon: 'size-7 max-w-none',
        'icon-sm': 'size-8 max-w-none',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle };
