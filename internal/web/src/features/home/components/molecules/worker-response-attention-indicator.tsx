import { DotIcon } from 'lucide-react';

import { cn } from '@/lib/tailwind/utils';

import type { WorkerResponseAttention } from '@/features/home/domain/worker-response-attention';

export function WorkerResponseAttentionIndicator(props: {
  attention?: WorkerResponseAttention;
  className?: string;
  size?: 'card' | 'sidebar';
}) {
  if (!props.attention || props.attention.status !== 'delivered') {
    return null;
  }

  return (
    <span
      aria-label={props.attention.label}
      className={cn(
        'pointer-events-none inline-flex shrink-0 items-center',
        'text-primary',
        props.className
      )}
      role="img"
    >
      <DotIcon
        aria-hidden="true"
        className={props.size === 'card' ? 'size-4' : 'size-8'}
      />
    </span>
  );
}
