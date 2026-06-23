import { cva, type VariantProps } from 'class-variance-authority';
import { OTPInput, OTPInputContext } from 'input-otp';
import { MinusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import * as React from 'react';

import { cn } from '@/lib/tailwind/utils';

const InputOTPSizeContext = React.createContext<
  (VariantProps<typeof inputOTPVariants> & { invalid: boolean }) | null
>(null);

const inputOTPVariants = cva(
  'relative flex items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40',
  {
    variants: {
      size: {
        default: 'size-9',
        sm: 'size-8',
        lg: 'h-10 w-11 md:text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

function InputOTP({
  className,
  containerClassName,
  size,
  ...props
}: Omit<React.ComponentProps<typeof OTPInput>, 'size' | 'render'> &
  VariantProps<typeof inputOTPVariants> & {
    children: ReactNode;
    containerClassName?: string;
  }) {
  const invalid = !!props['aria-invalid'];

  return (
    <InputOTPSizeContext value={{ size, invalid }}>
      <OTPInput
        data-slot="input-otp"
        containerClassName={cn(
          'cn-input-otp flex items-center has-disabled:opacity-50',
          containerClassName
        )}
        spellCheck={false}
        className={cn('disabled:cursor-not-allowed', className)}
        {...props}
      />
    </InputOTPSizeContext>
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn(
        'flex items-center rounded-md has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  index: number;
}) {
  const inputOTPContext = React.use(OTPInputContext);
  const sizeContext = React.use(InputOTPSizeContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(inputOTPVariants({ size: sizeContext?.size }), className)}
      aria-invalid={sizeContext?.invalid ? true : undefined}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
}

function InputOTPSeparator({ ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-separator"
      aria-hidden="true"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      {...props}
    >
      <MinusIcon />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot };
