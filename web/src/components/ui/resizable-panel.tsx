import type { ComponentProps } from 'react';
import * as ResizablePrimitive from 'react-resizable-panels';

function ResizablePanel(
  props: ComponentProps<typeof ResizablePrimitive.Panel>
) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

export { ResizablePanel };
