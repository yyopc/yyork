import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

import { CollapsibleContent } from '@/components/ui/collapsible-content';
import { CollapsibleTrigger } from '@/components/ui/collapsible-trigger';

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
