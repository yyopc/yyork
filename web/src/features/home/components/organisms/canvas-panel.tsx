import { Tabs, TabsContent } from '@/components/ui/tabs';

import { CanvasWebPreview } from '@/features/home/components/molecules/canvas-web-preview';

export type CanvasTab = 'files' | 'review' | 'browser';

export interface CanvasTargetSummary {
  cwd?: string;
  projectId?: string;
  sessionId?: string;
}

export function CanvasPanel(props: {
  activeTab: CanvasTab;
  previewUrl?: string;
  onPreviewUrlChange: (url: string) => void;
  onTabChange: (tab: CanvasTab) => void;
  target: CanvasTargetSummary;
}) {
  return (
    <aside
      aria-label="Canvas inspector"
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background"
    >
      <Tabs
        value={props.activeTab}
        onValueChange={(value) => {
          if (isCanvasTab(value)) {
            props.onTabChange(value);
          }
        }}
        className="min-h-0 w-full flex-1 flex-col gap-0"
      >
        <TabsContent value="files" className="min-h-0 w-full overflow-auto p-3">
          <CanvasPlaceholder
            title="File tree not wired yet"
            detail={
              props.target.cwd ?? 'No workspace path for this target yet.'
            }
          />
        </TabsContent>
        <TabsContent
          value="review"
          className="min-h-0 w-full overflow-auto p-3"
        >
          <CanvasPlaceholder
            title="Diff view not wired yet"
            detail="This panel will show the selected target's current changes."
          />
        </TabsContent>
        <TabsContent value="browser" className="min-h-0 w-full overflow-hidden">
          <CanvasWebPreview
            defaultUrl={props.previewUrl}
            onUrlChange={props.onPreviewUrlChange}
            projectId={props.target.projectId}
            sessionId={props.target.sessionId}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function CanvasPlaceholder(props: { detail: string; title: string }) {
  return (
    <div className="flex h-full min-h-0 max-w-full flex-col gap-2 text-sm leading-5">
      <h3 className="font-medium">{props.title}</h3>
      <p className="break-all text-muted-foreground">{props.detail}</p>
    </div>
  );
}

export function isCanvasTab(value: unknown): value is CanvasTab {
  return value === 'files' || value === 'review' || value === 'browser';
}
