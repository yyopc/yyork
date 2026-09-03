import { useState } from 'react';

import { cn } from '@/lib/tailwind/utils';

/**
 * Renders a workspace media file inline from its raw-bytes URL. Native
 * `<video>`/`<audio>` controls are used deliberately — playback needs no
 * shared player state, and the raw endpoint supplies Range support for
 * scrubbing.
 */
export function CanvasMediaPreview(props: {
  className?: string;
  kind: 'image' | 'video' | 'audio';
  path: string;
  src: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === props.src;
  const handleError = () => {
    setFailedSrc(props.src);
  };

  if (failed) {
    return (
      <div
        className={cn(
          'flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 p-3 text-center text-sm leading-5',
          props.className
        )}
      >
        <h3 className="font-medium">Unable to display media</h3>
        <p className="break-all text-muted-foreground">{props.path}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-4',
        props.className
      )}
    >
      {props.kind === 'image' ? (
        <img
          key={props.src}
          alt={props.path}
          className="max-h-full max-w-full object-contain"
          src={props.src}
          onError={handleError}
        />
      ) : props.kind === 'video' ? (
        <video
          key={props.src}
          aria-label={props.path}
          className="max-h-full max-w-full"
          controls
          preload="metadata"
          src={props.src}
          onError={handleError}
        />
      ) : (
        <>
          <p className="max-w-full truncate text-xs text-muted-foreground">
            {props.path}
          </p>
          {/* Audio needs no visual track; captions are not applicable here. */}
          <audio
            key={props.src}
            aria-label={props.path}
            controls
            preload="metadata"
            src={props.src}
            onError={handleError}
          />
        </>
      )}
    </div>
  );
}
