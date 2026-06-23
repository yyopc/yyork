import { cva } from 'class-variance-authority';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary:
          'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        negative:
          'bg-negative-100 text-negative-800 dark:bg-negative-500/25 dark:text-negative-100 [a]:hover:bg-negative-200 dark:[a]:hover:bg-negative-500/35',
        warning:
          'bg-warning-100 text-warning-800 dark:bg-warning-500/25 dark:text-warning-100 [a]:hover:bg-warning-200 dark:[a]:hover:bg-warning-500/35',
        positive:
          'bg-positive-100 text-positive-800 dark:bg-positive-500/25 dark:text-positive-100 [a]:hover:bg-positive-200 dark:[a]:hover:bg-positive-500/35',
        outline:
          'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost:
          'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-5 px-2 text-xs',
        xs: 'h-4 px-1.5 text-3xs [&>svg]:size-2!',
        sm: 'h-5 px-2 text-2xs',
        lg: 'h-7 px-3 text-sm [&>svg]:size-4!',
        icon: 'size-6 p-0',
        'icon-xs': 'size-4 p-0 [&>svg]:size-2!',
        'icon-sm': 'size-5 p-0',
        'icon-lg': 'size-7 p-0 [&>svg]:size-4!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export { badgeVariants };
