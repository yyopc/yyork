import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export { CollapsibleContent } from './collapsible-content';
export { CollapsibleTrigger } from './collapsible-trigger';
export { Collapsible };
