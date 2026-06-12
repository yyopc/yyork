import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';

export function StopSessionConfirmDialog(props: {
  onConfirm: (dontShowAgain: boolean) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sessionLabel: string;
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDontShowAgain(false);
    }

    props.onOpenChange(open);
  };

  return (
    <AlertDialog open={props.open} onOpenChange={handleOpenChange}>
      <AlertDialogContent size="default" className="sm:max-w-md">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Stop {props.sessionLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will terminate the agent process and remove its worktree.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Checkbox
          checked={dontShowAgain}
          onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          size="sm"
        >
          <span>Don&apos;t show this again</span>
        </Checkbox>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => props.onConfirm(dontShowAgain)}
          >
            Stop session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
