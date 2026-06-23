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

  return isMobile ? (
    <Drawer {...(props as ComponentProps<typeof Drawer>)} />
  ) : (
    <Dialog {...(props as ComponentProps<typeof Dialog>)} />
  );
};

export const ResponsiveDrawerTrigger = ({
  ...props
}: ComponentProps<typeof DrawerTrigger | typeof DialogTrigger>) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerTrigger {...(props as ComponentProps<typeof DrawerTrigger>)} />
  ) : (
    <DialogTrigger {...(props as ComponentProps<typeof DialogTrigger>)} />
  );
};

export const ResponsiveDrawerClose = (
  props: ComponentProps<typeof DrawerClose | typeof DialogClose>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerClose {...(props as ComponentProps<typeof DrawerClose>)} />
  ) : (
    <DialogClose {...(props as ComponentProps<typeof DialogClose>)} />
  );
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
    <DrawerContent {...(props as ComponentProps<typeof DrawerContent>)} />
  ) : (
    <DialogContent
      hideCloseButton={hideCloseButton}
      {...(props as ComponentProps<typeof DialogContent>)}
    />
  );
};

export const ResponsiveDrawerHeader = (
  props: ComponentProps<typeof DrawerHeader | typeof DialogHeader>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerHeader {...(props as ComponentProps<typeof DrawerHeader>)} />
  ) : (
    <DialogHeader {...(props as ComponentProps<typeof DialogHeader>)} />
  );
};

export const ResponsiveDrawerBody = (
  props: ComponentProps<typeof DrawerBody | typeof DialogBody>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerBody {...(props as ComponentProps<typeof DrawerBody>)} />
  ) : (
    <DialogBody {...(props as ComponentProps<typeof DialogBody>)} />
  );
};

export const ResponsiveDrawerFooter = (
  props: ComponentProps<typeof DrawerFooter | typeof DialogFooter>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerFooter {...(props as ComponentProps<typeof DrawerFooter>)} />
  ) : (
    <DialogFooter {...(props as ComponentProps<typeof DialogFooter>)} />
  );
};

export const ResponsiveDrawerTitle = (
  props: ComponentProps<typeof DrawerTitle | typeof DialogTitle>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerTitle {...(props as ComponentProps<typeof DrawerTitle>)} />
  ) : (
    <DialogTitle {...(props as ComponentProps<typeof DialogTitle>)} />
  );
};

export const ResponsiveDrawerDescription = (
  props: ComponentProps<typeof DrawerDescription | typeof DialogDescription>
) => {
  const isMobile = useIsMobile(BREAKPOINT);

  return isMobile ? (
    <DrawerDescription
      {...(props as ComponentProps<typeof DrawerDescription>)}
    />
  ) : (
    <DialogDescription
      {...(props as ComponentProps<typeof DialogDescription>)}
    />
  );
};
