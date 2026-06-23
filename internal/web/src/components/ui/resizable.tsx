import * as ResizablePrimitive from 'react-resizable-panels';

import { cn } from '@/lib/tailwind/utils';

import { ResizableHandle } from '@/components/ui/resizable-handle';
import { ResizablePanel } from '@/components/ui/resizable-panel';

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full aria-[orientation=vertical]:flex-col',
        className
      )}
      {...props}
    />
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
