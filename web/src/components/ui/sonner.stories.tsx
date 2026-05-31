import { Meta } from '@storybook/tanstack-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sonner } from '@/components/ui/sonner';

export default {
  title: 'Sonner',
  parameters: {
    docs: {
      description: {
        component:
          'Find everything about sonner in [Sonner docs](https://sonner.emilkowal.ski/toast)',
      },
    },
  },
} satisfies Meta<typeof Sonner>;

export const Default = () => {
  return (
    <Button
      onClick={() =>
        toast.success('Hey there, thanks for checking out Start UI! [web]')
      }
    >
      Show toast
    </Button>
  );
};

function useAutoToast(
  id: string,
  show: (toastId: string) => void | string | number
) {
  useEffect(() => {
    show(id);
    return () => {
      toast.dismiss(id);
    };
  }, [id, show]);
}

function ToastStoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 items-start justify-center pt-2 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export const TitleAndDescription = () => {
  useAutoToast('sonner-story-warning', (id) =>
    toast.warning('Terminal unavailable', {
      id,
      description: '[ORCHESTRATOR] does not expose an attachable runtime.',
      duration: Number.POSITIVE_INFINITY,
    })
  );

  return (
    <ToastStoryFrame>
      Static preview of the warning toast with a title and description.
    </ToastStoryFrame>
  );
};

export const Success = () => {
  useAutoToast('sonner-story-success', (id) =>
    toast.success('Opened project', {
      id,
      description: '/Users/you/Projects/better-ao',
      duration: Number.POSITIVE_INFINITY,
    })
  );

  return <ToastStoryFrame>Success toast preview.</ToastStoryFrame>;
};

export const ErrorToast = () => {
  useAutoToast('sonner-story-error', (id) =>
    toast.error('Could not open project', {
      id,
      description: 'The local IDE could not be opened.',
      duration: Number.POSITIVE_INFINITY,
    })
  );

  return <ToastStoryFrame>Error toast preview.</ToastStoryFrame>;
};

export const Info = () => {
  useAutoToast('sonner-story-info', (id) =>
    toast.info('Session restored', {
      id,
      description: 'Re-attached to the existing orchestrator session.',
      duration: Number.POSITIVE_INFINITY,
    })
  );

  return <ToastStoryFrame>Info toast preview.</ToastStoryFrame>;
};

export const TitleOnly = () => {
  useAutoToast('sonner-story-title-only', (id) =>
    toast.warning('Terminal unavailable', {
      id,
      duration: Number.POSITIVE_INFINITY,
    })
  );

  return <ToastStoryFrame>Title-only toast preview.</ToastStoryFrame>;
};

export const AllVariants = () => {
  useEffect(() => {
    const ids = [
      toast.success('Opened project', {
        id: 'sonner-story-all-success',
        description: '/Users/you/Projects/better-ao',
        duration: Number.POSITIVE_INFINITY,
      }),
      toast.info('Session restored', {
        id: 'sonner-story-all-info',
        description: 'Re-attached to the existing orchestrator session.',
        duration: Number.POSITIVE_INFINITY,
      }),
      toast.warning('Terminal unavailable', {
        id: 'sonner-story-all-warning',
        description: '[ORCHESTRATOR] does not expose an attachable runtime.',
        duration: Number.POSITIVE_INFINITY,
      }),
      toast.error('Could not open project', {
        id: 'sonner-story-all-error',
        description: 'The local IDE could not be opened.',
        duration: Number.POSITIVE_INFINITY,
      }),
    ];

    return () => {
      ids.forEach((id) => toast.dismiss(id));
    };
  }, []);

  return (
    <ToastStoryFrame>
      Side-by-side preview of every toast variant.
    </ToastStoryFrame>
  );
};
