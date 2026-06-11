import { useRender } from '@base-ui/react/use-render';
import { useRouter } from '@tanstack/react-router';
import { cva, VariantProps } from 'class-variance-authority';
import { PanelLeftIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/tailwind/utils';
import { useIsMobile } from '@/hooks/use-mobile';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const SIDEBAR_BREAKPOINT = 768;
const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_WIDTH_DEFAULT_PX = 256;
const SIDEBAR_WIDTH_MIN_PX = 208;
const SIDEBAR_WIDTH_MAX_PX = 420;
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type SidebarProviderStyle = React.CSSProperties & {
  '--sidebar-width'?: string;
  '--sidebar-width-icon'?: string;
};

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  sidebarWidthResizing: boolean;
  setSidebarWidthResizing: (resizing: boolean) => void;
  setSidebarWidth: (width: number) => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.use(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  defaultWidth,
  width: widthProp,
  onWidthChange: setWidthProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultWidth?: number;
  width?: number;
  onWidthChange?: (width: number) => void;
}) {
  const isMobile = useIsMobile(SIDEBAR_BREAKPOINT);
  const [openMobile, setOpenMobile] = React.useState(false);

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        setUncontrolledOpen(openState);
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  const [uncontrolledWidth, setUncontrolledWidth] = React.useState<
    number | undefined
  >(defaultWidth !== undefined ? clampSidebarWidth(defaultWidth) : undefined);
  const sidebarWidthPx = widthProp ?? uncontrolledWidth;
  const [sidebarWidthResizing, setSidebarWidthResizing] = React.useState(false);
  const setSidebarWidth = React.useCallback(
    (width: number) => {
      const clamped = Math.round(clampSidebarWidth(width));
      if (setWidthProp) {
        setWidthProp(clamped);
      } else {
        setUncontrolledWidth(clamped);
      }
    },
    [setWidthProp]
  );

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        !event.shiftKey &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? 'expanded' : 'collapsed';

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      sidebarWidthResizing,
      setSidebarWidthResizing,
      setSidebarWidth,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      sidebarWidthResizing,
      setSidebarWidthResizing,
      setSidebarWidth,
    ]
  );
  const sidebarStyle = style as SidebarProviderStyle | undefined;

  return (
    <SidebarContext value={contextValue}>
      <TooltipProvider delay={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              ...sidebarStyle,
              '--sidebar-width':
                sidebarWidthPx !== undefined
                  ? `${sidebarWidthPx}px`
                  : (sidebarStyle?.['--sidebar-width'] ?? SIDEBAR_WIDTH),
              '--sidebar-width-icon':
                sidebarStyle?.['--sidebar-width-icon'] ?? SIDEBAR_WIDTH_ICON,
            } as SidebarProviderStyle
          }
          className={cn(
            'group/sidebar-wrapper flex w-full flex-1 flex-row has-data-[variant=inset]:bg-sidebar',
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext>
  );
}

function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  desktopOpen,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right';
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
  desktopOpen?: boolean;
}) {
  const { t } = useTranslation(['components']);
  const { isMobile, sidebarWidthResizing, state, openMobile, setOpenMobile } =
    useSidebar();
  const router = useRouter();
  const desktopState =
    desktopOpen === undefined ? state : desktopOpen ? 'expanded' : 'collapsed';

  React.useEffect(() => {
    const unsub = router?.subscribe('onBeforeRouteMount', () => {
      setOpenMobile(false);
    });

    return () => unsub?.();
  });

  React.useEffect(() => {
    return () => {
      //@ts-expect-error Remove the 'pointer-events: none' from the sidebar
      document.body.style.pointerEvents = null;
    };
  }, []);

  if (collapsible === 'none') {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 pt-safe-top pb-safe-bottom text-sidebar-foreground [&>button]:hidden"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('components:sidebar.title')}</SheetTitle>
            <SheetDescription></SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={desktopState}
      data-collapsible={desktopState === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
      data-width-resizing={sidebarWidthResizing}
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[width-resizing=true]:transition-none',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[side=right]:rotate-180',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          'fixed inset-y-0 z-10 hidden h-full w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
          'group-data-[width-resizing=true]:transition-none',
          side === 'left'
            ? 'start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]'
            : 'end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]',
          // Adjust the padding for floating and inset variants.
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-e group-data-[side=right]:border-s',
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-none group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarTrigger({
  className,
  onClick,
  icon,
  ...props
}: React.ComponentProps<typeof Button> & {
  icon?: React.ReactNode;
}) {
  const { t } = useTranslation(['components']);
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      {icon ?? <PanelLeftIcon className="rtl:rotate-180" />}
      <span className="sr-only">{t('components:sidebar.toggle')}</span>
    </Button>
  );
}

function SidebarRail({
  className,
  onClick,
  onPointerDown,
  ...props
}: React.ComponentProps<'button'>) {
  const {
    isMobile,
    setOpen,
    setSidebarWidth,
    setSidebarWidthResizing,
    state,
    toggleSidebar,
  } = useSidebar();
  const cleanupResizeRef = React.useRef<(() => void) | null>(null);
  const skipClickRef = React.useRef(false);

  React.useEffect(() => {
    return () => cleanupResizeRef.current?.();
  }, []);

  return (
    <button
      type="button"
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Resize sidebar"
      tabIndex={-1}
      onPointerDown={(event) => {
        onPointerDown?.(event);

        if (event.defaultPrevented || event.button !== 0 || isMobile) {
          return;
        }

        const sidebar = event.currentTarget.closest(
          '[data-slot="sidebar"]'
        ) as HTMLElement | null;
        const sidebarContainer = event.currentTarget.closest(
          '[data-slot="sidebar-container"]'
        ) as HTMLElement | null;
        const side = sidebar?.dataset.side === 'right' ? 'right' : 'left';
        const ownerDocument = event.currentTarget.ownerDocument;
        const ownerWindow = ownerDocument.defaultView ?? window;
        const startX = event.clientX;
        const startWidth = getSidebarWidth(sidebar, sidebarContainer);
        const previousCursor = ownerDocument.body.style.cursor;
        const previousUserSelect = ownerDocument.body.style.userSelect;
        const rail = event.currentTarget;

        event.preventDefault();
        rail.setPointerCapture(event.pointerId);
        cleanupResizeRef.current?.();
        setSidebarWidthResizing(true);

        ownerDocument.body.style.cursor = 'ew-resize';
        ownerDocument.body.style.userSelect = 'none';

        const finishResize = () => {
          cleanupResizeRef.current = null;
          setSidebarWidthResizing(false);
          ownerDocument.body.style.cursor = previousCursor;
          ownerDocument.body.style.userSelect = previousUserSelect;
          ownerWindow.removeEventListener('pointermove', resize);
          ownerWindow.removeEventListener('pointerup', finishResize);
          ownerWindow.removeEventListener('pointercancel', finishResize);

          if (rail.hasPointerCapture(event.pointerId)) {
            rail.releasePointerCapture(event.pointerId);
          }
        };

        const resize = (resizeEvent: PointerEvent) => {
          const delta =
            side === 'left'
              ? resizeEvent.clientX - startX
              : startX - resizeEvent.clientX;

          if (Math.abs(delta) > 2) {
            skipClickRef.current = true;
          }

          if (state === 'collapsed') {
            setOpen(true);
          }

          setSidebarWidth(startWidth + delta);
        };

        cleanupResizeRef.current = finishResize;
        ownerWindow.addEventListener('pointermove', resize);
        ownerWindow.addEventListener('pointerup', finishResize);
        ownerWindow.addEventListener('pointercancel', finishResize);
      }}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (skipClickRef.current) {
          skipClickRef.current = false;
          return;
        }

        toggleSidebar();
      }}
      title="Drag to resize sidebar"
      className={cn(
        'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 hover:after:bg-sidebar-border sm:flex',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
        className
      )}
      {...props}
    />
  );
}

function clampSidebarWidth(width: number) {
  if (!Number.isFinite(width)) {
    return SIDEBAR_WIDTH_DEFAULT_PX;
  }

  return Math.min(SIDEBAR_WIDTH_MAX_PX, Math.max(SIDEBAR_WIDTH_MIN_PX, width));
}

function getSidebarWidth(
  sidebar: HTMLElement | null,
  sidebarContainer: HTMLElement | null
) {
  const visibleWidth = sidebarContainer?.getBoundingClientRect().width ?? 0;

  if (visibleWidth >= SIDEBAR_WIDTH_MIN_PX) {
    return visibleWidth;
  }

  const wrapper = sidebar?.closest(
    '[data-slot="sidebar-wrapper"]'
  ) as HTMLElement | null;
  const cssWidth = wrapper
    ? getCssLengthInPx(
        getComputedStyle(wrapper).getPropertyValue('--sidebar-width'),
        wrapper.ownerDocument
      )
    : undefined;

  return cssWidth ?? SIDEBAR_WIDTH_DEFAULT_PX;
}

function getCssLengthInPx(value: string, ownerDocument: Document) {
  const trimmedValue = value.trim();
  const parsedValue = Number.parseFloat(trimmedValue);

  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  if (trimmedValue.endsWith('rem')) {
    const rootFontSize = Number.parseFloat(
      getComputedStyle(ownerDocument.documentElement).fontSize
    );

    return parsedValue * rootFontSize;
  }

  return parsedValue;
}

function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        'relative flex w-full flex-1 flex-col',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
        className
      )}
      {...props}
    />
  );
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn('h-8 w-full bg-background shadow-none', className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn('mx-2 w-auto bg-sidebar-border', className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
        className
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col px-2', className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<'div'>) {
  return useRender({
    render,
    props: {
      ...props,
      'data-slot': 'sidebar-group-label',
      'data-sidebar': 'group-label',
      className: cn(
        'flex h-8 shrink-0 items-center rounded-none px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className
      ),
    },
    state: {},
    defaultTagName: 'div',
  });
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<'button'>) {
  return useRender({
    render,
    props: {
      ...props,
      'data-slot': 'sidebar-group-action',
      'data-sidebar': 'group-action',
      className: cn(
        'absolute top-3.5 right-3 flex aspect-square w-5 cursor-pointer items-center justify-center rounded-sm p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 md:after:hidden',
        'group-data-[collapsible=icon]:hidden',
        className
      ),
    },
    state: {},
    defaultTagName: 'button',
  });
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-sm px-4 py-2 text-left text-sm font-normal text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pe-4 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:opacity-100 data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:min-w-0 [&>span:last-child]:truncate group-has-data-[sidebar=menu-action]/menu-item:[&>span:last-child]:flex-1 group-has-data-[sidebar=menu-action]/menu-item:[&>span:last-child]:pe-5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-60 data-[active=true]:[&>svg]:opacity-100',
  {
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline:
          'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]',
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function SidebarMenuButton({
  render,
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<'button'> & {
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar();

  const button = useRender({
    render,
    props: {
      ...props,
      'data-slot': 'sidebar-menu-button',
      'data-sidebar': 'menu-button',
      'data-size': size,
      'data-active': isActive,
      className: cn(sidebarMenuButtonVariants({ variant, size }), className),
    },
    state: {},
    defaultTagName: 'button',
  });

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === 'string') {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== 'collapsed' || isMobile}
        {...tooltip}
      />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<'button'> & {
  showOnHover?: boolean;
}) {
  return useRender({
    render,
    props: {
      ...props,
      'data-slot': 'sidebar-menu-action',
      'data-sidebar': 'menu-action',
      className: cn(
        'absolute top-1.5 right-4 flex aspect-square w-5 cursor-pointer items-center justify-center rounded-sm p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 md:after:hidden',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0',
        className
      ),
    },
    state: {},
    defaultTagName: 'button',
  });
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-none px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none',
        'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<'div'> & {
  showIcon?: boolean;
}) {
  const width = showIcon ? '72%' : '84%';

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn('flex h-8 items-center gap-2 rounded-none px-2', className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-none"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            '--skeleton-width': width,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  render,
  size = 'md',
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<'a'> & {
  size?: 'sm' | 'md';
  isActive?: boolean;
}) {
  return useRender({
    render,
    props: {
      ...props,
      'data-slot': 'sidebar-menu-sub-button',
      'data-sidebar': 'menu-sub-button',
      'data-size': size,
      'data-active': isActive,
      className: cn(
        'flex h-7 min-w-0 -translate-x-px cursor-pointer items-center gap-2 overflow-hidden rounded-sm px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className
      ),
    },
    state: {},
    defaultTagName: 'a',
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
