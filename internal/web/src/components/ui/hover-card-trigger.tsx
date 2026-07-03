'use client';

import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card';

export function HoverCardTrigger({
  ...props
}: PreviewCardPrimitive.Trigger.Props) {
  return (
    <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  );
}
