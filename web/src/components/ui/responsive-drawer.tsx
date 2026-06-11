import { type ComponentProps } from 'react';

import { useIsMobile } from '@/hooks/use-mobile';

import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

const BREAKPOINT = 640;

export const ResponsiveDrawer = ({
  ...props
}: Overwrite<ComponentProps<typeof Dialog>, ComponentProps<typeof Drawer>>) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? <Drawer {...props} /> : <Dialog {...props} />;
};

export const ResponsiveDrawerTrigger = ({
  ...props
}: ComponentProps<typeof DrawerTrigger | typeof DialogTrigger>) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? <DrawerTrigger {...props} /> : <DialogTrigger {...props} />;
};

export const ResponsiveDrawerClose = (
  props: ComponentProps<typeof DrawerClose | typeof DialogClose>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? <DrawerClose {...props} /> : <DialogClose {...props} />;
};

export const ResponsiveDrawerContent = ({
  hideCloseButton,
  ...props
}: Omit<
  ComponentProps<typeof DialogContent | typeof DrawerContent>,
  'render' | 'className'
> & {
  // `className` and `render` types are not compatible
  render?: React.ReactElement;
  className?: string;
  // Only for DialogContent
  hideCloseButton?: boolean;
}) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerContent {...props} />
  ) : (
    <DialogContent hideCloseButton={hideCloseButton} {...props} />
  );
};

export const ResponsiveDrawerHeader = (
  props: ComponentProps<typeof DrawerHeader | typeof DialogHeader>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? <DrawerHeader {...props} /> : <DialogHeader {...props} />;
};

export const ResponsiveDrawerBody = (
  props: ComponentProps<typeof DrawerBody | typeof DialogBody>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? <DrawerBody {...props} /> : <DialogBody {...props} />;
};

export const ResponsiveDrawerFooter = (
  props: ComponentProps<typeof DrawerFooter | typeof DialogFooter>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? <DrawerFooter {...props} /> : <DialogFooter {...props} />;
};

export const ResponsiveDrawerTitle = (
  props: ComponentProps<typeof DrawerTitle | typeof DialogTitle>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? <DrawerTitle {...props} /> : <DialogTitle {...props} />;
};

export const ResponsiveDrawerDescription = (
  props: ComponentProps<typeof DrawerDescription | typeof DialogDescription>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerDescription {...props} />
  ) : (
    <DialogDescription {...props} />
  );
};
