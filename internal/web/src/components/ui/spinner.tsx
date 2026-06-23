import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/tailwind/utils';

function Spinner({
  className,
  full,
  ...props
}: React.ComponentProps<'svg'> & {
  full?: boolean;
}) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', full && 'm-auto', className)}
      {...props}
    />
  );
}

export { Spinner };
