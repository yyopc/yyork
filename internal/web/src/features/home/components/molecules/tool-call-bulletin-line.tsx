import { SlotText } from 'slot-text/react';

import { usePrefersReducedMotion } from '@/lib/tailwind/dotmatrix-hooks';
import { cn } from '@/lib/tailwind/utils';

import { DotmCircular5 } from '@/components/ui/dotm-circular-5';

const slotTextOptions = {
  direction: 'up' as const,
  duration: 280,
  exitOffset: 45,
  skipUnchanged: false,
  stagger: 32,
};

export function ToolCallBulletinLine(props: {
  className?: string;
  text: string;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-sm bg-muted/50 px-1 py-0.5',
        props.className
      )}
    >
      <span className="flex shrink-0">
        <DotmCircular5
          animated={!reducedMotion}
          ariaLabel="Working"
          className="size-3 shrink-0 text-foreground"
          dotSize={2}
          size={12}
        />
      </span>
      <p className="h-4 min-w-0 flex-1 overflow-hidden font-mono text-[11px] leading-4 text-ellipsis whitespace-nowrap text-foreground">
        {reducedMotion ? (
          <span className="inline-block truncate">{props.text}</span>
        ) : (
          <SlotText
            className="max-w-full truncate"
            options={slotTextOptions}
            text={props.text}
          />
        )}
      </p>
    </div>
  );
}
