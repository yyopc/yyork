import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ProjectSetupAgentsCard } from '@/features/home/components/molecules/project-setup-agents-card';
import type { ProjectSetupHarnessSelection } from '@/features/home/domain/agent-harness';

export function ProjectSetupDialog(props: {
  agentSetup: ProjectSetupHarnessSelection;
  onAgentSetupChange: (selection: ProjectSetupHarnessSelection) => void;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
  onStartProject: (selection: ProjectSetupHarnessSelection) => void;
  open: boolean;
  projectPath: string;
  starting?: boolean;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-w-[440px] gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none sm:max-w-[440px]"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Agents</DialogTitle>
          <DialogDescription>
            Choose orchestrator and worker agents for this project.
          </DialogDescription>
        </DialogHeader>
        <ProjectSetupAgentsCard
          agentSetup={props.agentSetup}
          projectPath={props.projectPath}
          starting={props.starting}
          onAgentSetupChange={props.onAgentSetupChange}
          onCancel={props.onCancel}
          onStartProject={props.onStartProject}
        />
      </DialogContent>
    </Dialog>
  );
}
