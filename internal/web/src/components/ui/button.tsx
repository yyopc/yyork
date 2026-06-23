import { Button as ButtonPrimitive } from '@base-ui/react/button';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/tailwind/utils';

import { buttonVariants } from '@/components/ui/button-variants';
import { Spinner } from '@/components/ui/spinner';

function Button({
  className,
  children,
  disabled,
  loading,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <Spinner aria-hidden="true" /> : children}
    </ButtonPrimitive>
  );
}

export { Button };
