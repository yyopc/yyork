import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

import { cn } from '@/lib/tailwind/utils';

import { CanvasPanel } from '@/features/home/components/organisms/canvas-panel';
import {
  homeWorkspaceCanvasMaxPercent,
  homeWorkspaceCanvasMinPercent,
} from '@/features/home/data/workspace-preferences';
import { useWorkspaceContext } from '@/features/home/pages/workspace-context';

const CANVAS_MIN_PX = '17.5rem';
const CANVAS_PANE_WIDTH_VAR = '--canvas-pane-width';

export function TerminalLayout(props: { children: ReactNode }) {
  const context = useWorkspaceContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasPaneRef = useRef<HTMLDivElement>(null);

  const canvasResizing = context.canvasResizing;
  const setCanvasResizing = context.onCanvasResizingChange;
  const canvasWidthPercent = context.canvasLayout?.canvas ?? 28;
  const showCanvas = context.canvasOpen && !context.terminalDetached;

  useEffect(() => {
    if (!showCanvas) {
      document.documentElement.style.removeProperty(CANVAS_PANE_WIDTH_VAR);
      return;
    }

    const el = canvasPaneRef.current;
    if (!el) {
      return;
    }

    const sync = (width: number) => {
      document.documentElement.style.setProperty(
        CANVAS_PANE_WIDTH_VAR,
        `${width}px`
      );
    };

    sync(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        sync(entry.contentRect.width);
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(CANVAS_PANE_WIDTH_VAR);
    };
  }, [showCanvas]);

  const handleResize = (percent: number) => {
    context.onCanvasLayoutChange({
      canvas: percent,
      main: 100 - percent,
    });
  };

  if (context.terminalDetached) {
    return (
      <div className="relative flex h-full min-h-0 w-full flex-1">
        <div className="flex min-h-0 min-w-0 flex-1">{props.children}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-state={showCanvas ? 'expanded' : 'collapsed'}
      data-canvas-resizing={canvasResizing}
      className="group/canvas-layout relative flex h-full min-h-0 w-full flex-1"
    >
      <div className="flex min-h-0 min-w-0 flex-1">{props.children}</div>
      {showCanvas ? (
        <CanvasResizeRail
          containerRef={containerRef}
          onResizeStart={() => setCanvasResizing(true)}
          onResizeEnd={() => setCanvasResizing(false)}
          onResize={handleResize}
        />
      ) : null}
      <div
        ref={canvasPaneRef}
        data-state={showCanvas ? 'expanded' : 'collapsed'}
        className={cn(
          'flex min-h-0 overflow-hidden transition-[width] duration-200 ease-linear',
          'group-data-[canvas-resizing=true]/canvas-layout:transition-none'
        )}
        style={{
          width: showCanvas ? `${canvasWidthPercent}%` : 0,
          minWidth: showCanvas ? CANVAS_MIN_PX : 0,
        }}
        aria-hidden={!showCanvas}
        inert={!showCanvas}
      >
        <div
          data-state={showCanvas ? 'expanded' : 'collapsed'}
          className={cn(
            'flex h-full w-full min-w-70 transition-[transform,opacity] duration-200 ease-linear',
            'data-[state=collapsed]:translate-x-full data-[state=collapsed]:opacity-0',
            'group-data-[canvas-resizing=true]/canvas-layout:transition-none'
          )}
        >
          <CanvasPanel
            activeTab={context.canvasTab}
            previewUrl={context.canvasPreviewUrl}
            reviewPreferences={context.canvasReviewPreferences}
            selectedFilePath={context.canvasSelectedFilePath}
            onPreviewUrlChange={context.onCanvasPreviewUrlChange}
            onReviewPreferencesChange={context.onCanvasReviewPreferencesChange}
            onSelectedFilePathChange={context.onCanvasSelectedFilePathChange}
            onTabChange={context.onCanvasTabChange}
            target={context.canvasTarget}
          />
        </div>
      </div>
    </div>
  );
}

function CanvasResizeRail(props: {
  containerRef: RefObject<HTMLDivElement | null>;
  onResize: (percent: number) => void;
  onResizeEnd: () => void;
  onResizeStart: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Resize Canvas pane"
      tabIndex={-1}
      title="Drag to resize Canvas panel"
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        const container = props.containerRef.current;
        if (!container) {
          return;
        }

        const ownerDocument = event.currentTarget.ownerDocument;
        const ownerWindow = ownerDocument.defaultView ?? window;
        const previousCursor = ownerDocument.body.style.cursor;
        const previousUserSelect = ownerDocument.body.style.userSelect;
        const rail = event.currentTarget;
        const containerRect = container.getBoundingClientRect();

        event.preventDefault();
        rail.setPointerCapture(event.pointerId);
        props.onResizeStart();
        ownerDocument.body.style.cursor = 'ew-resize';
        ownerDocument.body.style.userSelect = 'none';

        const onMove = (resizeEvent: PointerEvent) => {
          const total = containerRect.right - containerRect.left;
          if (total <= 0) {
            return;
          }
          const canvasPx = Math.max(
            0,
            containerRect.right - resizeEvent.clientX
          );
          const percent = Math.min(
            homeWorkspaceCanvasMaxPercent,
            Math.max(homeWorkspaceCanvasMinPercent, (canvasPx / total) * 100)
          );
          props.onResize(percent);
        };

        const onEnd = () => {
          ownerDocument.body.style.cursor = previousCursor;
          ownerDocument.body.style.userSelect = previousUserSelect;
          ownerWindow.removeEventListener('pointermove', onMove);
          ownerWindow.removeEventListener('pointerup', onEnd);
          ownerWindow.removeEventListener('pointercancel', onEnd);
          if (rail.hasPointerCapture(event.pointerId)) {
            rail.releasePointerCapture(event.pointerId);
          }
          props.onResizeEnd();
        };

        ownerWindow.addEventListener('pointermove', onMove);
        ownerWindow.addEventListener('pointerup', onEnd);
        ownerWindow.addEventListener('pointercancel', onEnd);
      }}
      className="relative flex w-px shrink-0 cursor-ew-resize items-center justify-center bg-border after:absolute after:inset-y-0 after:start-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
    </button>
  );
}
