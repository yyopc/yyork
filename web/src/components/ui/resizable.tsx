import type { ComponentProps } from 'react';
import * as ResizablePrimitive from 'react-resizable-panels';

import { cn } from '@/lib/tailwind/utils';

function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full data-[orientation=vertical]:flex-col',
        className
      )}
      {...props}
    />
  );
}

export { ResizableHandle } from './resizable-handle';
export { ResizablePanel } from './resizable-panel';
export { ResizablePanelGroup };
