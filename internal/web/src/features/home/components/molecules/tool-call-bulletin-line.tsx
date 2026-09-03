import './tool-call-bulletin-line.css';

import { usePrefersReducedMotion } from '@/lib/tailwind/dotmatrix-hooks';
import { cn } from '@/lib/tailwind/utils';

import { DotmCircular5 } from '@/components/ui/dotm-circular-5';

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
        <span className="tool-call-bulletin-shimmer inline-block max-w-full truncate">
          {props.text}
        </span>
      </p>
    </div>
  );
}
