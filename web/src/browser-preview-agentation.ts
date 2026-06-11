import { Agentation, type AgentationProps, type Annotation } from 'agentation';
import React from 'react';
import { createRoot } from 'react-dom/client';

type PreviewConfig = {
  targetOrigin?: string;
};

type AnnotationPayload = {
  annotation: Annotation;
};

const config = readPreviewConfig();
const AgentationComponent = Agentation as React.ComponentType<AgentationProps>;

function readPreviewConfig(): PreviewConfig {
  const configElement = document.getElementById('__yyork-preview-config');
  if (!configElement) {
    return {};
  }

  try {
    return JSON.parse(configElement.textContent ?? '{}') as PreviewConfig;
  } catch {
    return {};
  }
}

function logicalURL() {
  if (!config.targetOrigin) {
    return window.location.href;
  }

  try {
    const current = new URL(window.location.href);
    return new URL(
      current.pathname + current.search + current.hash,
      config.targetOrigin
    ).href;
  } catch {
    return window.location.href;
  }
}

function post(type: string, payload: Record<string, unknown> = {}) {
  window.parent?.postMessage(
    {
      source: 'yyork-preview-agentation',
      version: 1,
      type,
      timestamp: new Date().toISOString(),
      url: logicalURL(),
      ...payload,
    },
    '*'
  );
}

function mountAgentation() {
  if (document.getElementById('__yyork-agentation-root')) {
    return;
  }

  const rootElement = document.createElement('div');
  rootElement.id = '__yyork-agentation-root';
  rootElement.setAttribute('data-yyork-browser-agentation', 'true');
  document.documentElement.appendChild(rootElement);

  const root = createRoot(rootElement);
  root.render(
    React.createElement(AgentationComponent, {
      copyToClipboard: true,
      onAnnotationAdd(annotation: Annotation) {
        post('yyork:annotation-added', {
          annotation,
        } satisfies AnnotationPayload);
      },
      onAnnotationDelete(annotation: Annotation) {
        post('yyork:annotation-deleted', {
          annotation,
        } satisfies AnnotationPayload);
      },
      onAnnotationUpdate(annotation: Annotation) {
        post('yyork:annotation-updated', {
          annotation,
        } satisfies AnnotationPayload);
      },
      onAnnotationsClear(annotations: Annotation[]) {
        post('yyork:annotations-cleared', { annotations });
      },
      onCopy(markdown: string) {
        post('yyork:annotations-copied', { markdown });
      },
      onSubmit(output: string, annotations: Annotation[]) {
        post('yyork:annotations-submitted', { annotations, output });
      },
    })
  );
  post('yyork:agentation-ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAgentation, {
    once: true,
  });
} else {
  mountAgentation();
}
