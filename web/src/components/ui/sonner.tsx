import { useTheme } from 'next-themes';
import type { CSSProperties } from 'react';
import { Toaster, ToasterProps } from 'sonner';

const toastBorderRadius = 'var(--radius-sm)';
const toastCloseButtonInset = '12px';

const toasterStyle = {
  '--border-radius': toastBorderRadius,
  '--normal-bg': 'var(--background)',
  '--normal-border': 'var(--border)',
  '--normal-text': 'var(--foreground)',
  '--description-color': 'var(--muted-foreground)',
  '--toast-close-button-end': toastCloseButtonInset,
  '--toast-close-button-start': 'auto',
  '--toast-close-button-transform': 'none',
} as CSSProperties;

const toastStyle = {
  borderRadius: toastBorderRadius,
  boxShadow: 'none',
  fontFamily: 'var(--font-mono)',
} satisfies CSSProperties;

const toastButtonStyle = {
  borderRadius: toastBorderRadius,
} satisfies CSSProperties;

export const Sonner = ({ ...props }: ToasterProps) => {
  const { resolvedTheme, theme } = useTheme();
  const sonnerTheme = (resolvedTheme ?? theme) === 'dark' ? 'dark' : 'light';

  return (
    <Toaster
      theme={sonnerTheme}
      className="toaster group mt-safe-top font-mono"
      closeButton
      position="top-center"
      style={toasterStyle}
      offset={{
        top: 'calc(16px + env(safe-area-inset-top))',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        left: 'calc(16px + env(safe-area-inset-left))',
        right: 'calc(16px + env(safe-area-inset-right))',
      }}
      mobileOffset={{
        top: 'calc(8px + env(safe-area-inset-top))',
        bottom: 'calc(8px + env(safe-area-inset-bottom))',
        left: 'calc(8px + env(safe-area-inset-left))',
        right: 'calc(8px + env(safe-area-inset-right))',
      }}
      toastOptions={{
        actionButtonStyle: toastButtonStyle,
        cancelButtonStyle: toastButtonStyle,
        closeButtonAriaLabel: 'Dismiss notification',
        style: toastStyle,
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-sm group-[.toaster]:border-border group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:shadow-none',
          title:
            'group-[.toast]:text-sm group-[.toast]:leading-5 group-[.toast]:font-medium group-[.toast]:text-foreground',
          description:
            'group-[.toast]:text-xs group-[.toast]:leading-5 group-[.toast]:font-normal group-[.toast]:!text-muted-foreground',
          icon: 'group-[.toast]:text-foreground',
          actionButton:
            'group-[.toast]:rounded-sm group-[.toast]:bg-primary group-[.toast]:font-medium group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:rounded-sm group-[.toast]:bg-muted group-[.toast]:font-medium group-[.toast]:text-muted-foreground',
          closeButton:
            '!left-auto !right-3 !top-3 ![transform:none] group-[.toast]:!rounded-sm group-[.toast]:!border-border group-[.toast]:!bg-background group-[.toast]:!text-muted-foreground group-[.toast]:hover:!bg-accent group-[.toast]:hover:!text-foreground',
        },
      }}
      {...props}
    />
  );
};
