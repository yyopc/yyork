import { createPlayer } from '@videojs/react';
import { MinimalVideoSkin, Video, videoFeatures } from '@videojs/react/video';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Maximize2Icon,
  Minimize2Icon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/tailwind/utils';

import settingsRecordingUrl from '../../../artifacts/settings-route/videos/settings-route-e2e.mp4?url';
import settingsRecordingPosterUrl from '../../../artifacts/settings-route/videos/settings-route-e2e.png?url';
import recordingUrl from '../../../artifacts/webreel-kanban-from-orchestrator/videos/kanban-from-orchestrator.mp4?url';
import recordingPosterUrl from '../../../artifacts/webreel-kanban-from-orchestrator/videos/kanban-from-orchestrator-final-frame.png?url';

type MockTurn = {
  id: string;
  prompt: string;
  recap: {
    concise: string;
    long: string;
  };
  recording?: {
    label: string;
    poster: string;
    src: string;
  };
};

const mockTurns: MockTurn[] = [
  {
    id: 'turn-a41d',
    prompt:
      'Bind each visual recap artifact to the exact agent turn that produced it.',
    recap: {
      concise:
        'Added turn-scoped artifact metadata to the hook payload and covered the session and turn identity paths.',
      long: 'Added turn-scoped artifact metadata to the hook payload, preserved the existing session identifier, and covered both Codex and Claude turn identity paths. Kept the notification contract independent from yyoreel storage so yyork only needs the final artifact reference.',
    },
  },
  {
    id: 'turn-9c03',
    prompt:
      'Restore the Settings controls and verify that theme selection still works.',
    recap: {
      concise:
        'Restored the Settings dropdown and reusable ThemeSelect, then updated the page and tests. Browser checks, TypeScript, lint, and the live d3k smoke all passed.',
      long: 'Restored the Settings dropdown and reusable ThemeSelect, then updated the page and tests. Kept theme choice synchronized across the Settings route and existing toolbar without changing the session workflow. Removed the obsolete menu trigger, preserved the keyboard path, and kept the change contained to the Settings feature. Browser checks, TypeScript, lint, and the live d3k smoke all passed. No backend or session-state changes were needed.',
    },
    recording: {
      label: 'Replay of the Settings controls implemented by the agent',
      poster: settingsRecordingPosterUrl,
      src: settingsRecordingUrl,
    },
  },
  {
    id: 'turn-6b71',
    prompt:
      'Add a minimal video replay to the recap hover card without making it feel cluttered.',
    recap: {
      concise:
        'Integrated the Video.js minimal skin with muted playback, picture-in-picture, and a focused maximize control. Verified concise and long recap states in the live mock.',
      long: 'Integrated the Video.js minimal skin with muted playback, picture-in-picture, and a focused maximize control. Kept the player visually flush with the hover-card surface, removed the redundant native fullscreen action, and preserved the existing scroll-faded recap region. Verified concise and long recap states, light and dark themes, viewport edges, keyboard focus, and the live mock route.',
    },
    recording: {
      label: "Replay of the agent's Kanban board changes in yyork",
      poster: recordingPosterUrl,
      src: recordingUrl,
    },
  },
];

const ReplayPlayer = createPlayer({
  displayName: 'LastTurnReplay',
  features: videoFeatures,
});

function LastTurnReplay(props: {
  recording: NonNullable<MockTurn['recording']>;
  turnId: string;
}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isMaximized) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMaximized(false);
      }
    }

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMaximized]);

  useEffect(() => {
    const autoplayTimer = window.setTimeout(() => {
      const video = videoRef.current;

      if (!video) {
        return;
      }

      video.currentTime = 0;
      video.muted = true;
      void video.play().catch(() => {
        // The poster and native play control remain available if autoplay is
        // blocked by the browser.
      });
    }, 1500);

    return () => {
      window.clearTimeout(autoplayTimer);
    };
  }, [props.turnId]);

  const maximizeLabel = isMaximized ? 'Restore replay' : 'Maximize replay';

  return (
    <>
      {isMaximized ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs"
          onClick={() => setIsMaximized(false)}
        />
      ) : null}

      <div
        aria-label={isMaximized ? 'Maximized agent replay' : undefined}
        aria-modal={isMaximized || undefined}
        className="recap-video-player"
        data-maximized={isMaximized || undefined}
        role={isMaximized ? 'dialog' : undefined}
      >
        <ReplayPlayer.Provider>
          <MinimalVideoSkin poster={props.recording.poster}>
            <Video
              ref={videoRef}
              aria-label={props.recording.label}
              loop
              muted
              playsInline
              preload="auto"
              src={props.recording.src}
            />
            <button
              type="button"
              aria-label={maximizeLabel}
              className="recap-maximize-button media-button media-button--subtle media-button--icon"
              title={maximizeLabel}
              onClick={() => setIsMaximized((maximized) => !maximized)}
            >
              {isMaximized ? (
                <Minimize2Icon className="media-icon" />
              ) : (
                <Maximize2Icon className="media-icon" />
              )}
            </button>
          </MinimalVideoSkin>
        </ReplayPlayer.Provider>
      </div>
    </>
  );
}

function TurnPager(props: {
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  turnCount: number;
}) {
  const isFirstTurn = props.currentIndex === 0;
  const isLastTurn = props.currentIndex === props.turnCount - 1;

  return (
    <nav
      aria-label="Agent turn recaps"
      className="flex h-9 items-center justify-between border-t border-border px-2"
    >
      <button
        type="button"
        aria-label="Previous turn"
        className="flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-30"
        disabled={isFirstTurn}
        title="Previous turn"
        onClick={props.onPrevious}
      >
        <ChevronLeftIcon aria-hidden="true" className="size-4" />
      </button>

      <span
        aria-live="polite"
        className="font-mono text-[10px] text-muted-foreground tabular-nums"
      >
        {props.currentIndex + 1} / {props.turnCount}
      </span>

      <button
        type="button"
        aria-label="Next turn"
        className="flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-30"
        disabled={isLastTurn}
        title="Next turn"
        onClick={props.onNext}
      >
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </button>
    </nav>
  );
}

function RecapCard(props: {
  contentLength: 'concise' | 'long';
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  turn: MockTurn;
}) {
  const recap = props.turn.recap[props.contentLength];

  return (
    <article
      aria-label="Agent turn recap"
      className="w-[27rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      {props.turn.recording ? (
        <LastTurnReplay
          key={props.turn.id}
          recording={props.turn.recording}
          turnId={props.turn.id}
        />
      ) : null}

      <div className={cn(props.turn.recording && 'border-t border-border')}>
        <div
          key={`${props.turn.id}-${props.contentLength}`}
          className="max-h-32 scroll-fade-y overflow-y-auto overscroll-contain px-3 py-3"
        >
          <div className="flex flex-col gap-1.5 text-xs leading-5 break-words whitespace-normal">
            <p className="text-sm font-medium text-foreground">
              {props.turn.prompt}
            </p>
            <p className="text-muted-foreground">{recap}</p>
          </div>
        </div>
      </div>

      <TurnPager
        currentIndex={props.currentIndex}
        turnCount={mockTurns.length}
        onNext={props.onNext}
        onPrevious={props.onPrevious}
      />
    </article>
  );
}

export function RecapHoverCardMockPage() {
  const [contentLength, setContentLength] = useState<'concise' | 'long'>(
    'concise'
  );
  const [currentIndex, setCurrentIndex] = useState(mockTurns.length - 1);
  const turn = mockTurns[currentIndex]!;

  function showPreviousTurn() {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  function showNextTurn() {
    setCurrentIndex((index) => Math.min(mockTurns.length - 1, index + 1));
  }

  return (
    <main className="flex min-h-dvh min-w-0 items-end justify-center bg-sidebar/45 px-8 pt-20 pb-[18vh]">
      <div className="fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-background p-0.5 shadow-sm">
        <button
          type="button"
          aria-pressed={contentLength === 'concise'}
          className={cn(
            'cursor-pointer rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
            contentLength === 'concise' && 'bg-muted text-foreground'
          )}
          onClick={() => setContentLength('concise')}
        >
          Concise
        </button>
        <button
          type="button"
          aria-pressed={contentLength === 'long'}
          className={cn(
            'cursor-pointer rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
            contentLength === 'long' && 'bg-muted text-foreground'
          )}
          onClick={() => setContentLength('long')}
        >
          Long recap
        </button>
      </div>

      <RecapCard
        contentLength={contentLength}
        currentIndex={currentIndex}
        turn={turn}
        onNext={showNextTurn}
        onPrevious={showPreviousTurn}
      />
    </main>
  );
}
