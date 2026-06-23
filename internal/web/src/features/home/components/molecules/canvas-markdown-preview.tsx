import {
  type DiffsThemeNames,
  getSharedHighlighter,
  type SupportedLanguages,
} from '@pierre/diffs';
import { type ReactNode, useEffect, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/tailwind/utils';
import { useTheme } from '@/lib/theme/provider';

const PIERRE_THEMES: DiffsThemeNames[] = ['pierre-dark', 'pierre-light'];

/**
 * Highlights a fenced code block with Pierre's shared Shiki highlighter — the
 * same highlighter instance and `pierre-dark`/`pierre-light` themes used by the
 * file Code view — so token colors match across the Preview and Code views.
 *
 * Highlighting is async (Shiki loads languages on demand), so the raw code is
 * shown first and swapped for the highlighted markup once it resolves. Unknown
 * languages fall back to the plain rendering.
 */
function MarkdownCodeBlock(props: { code: string; lang: string }) {
  const { resolvedTheme } = useTheme();
  const themeName = resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light';
  const highlightKey = JSON.stringify([themeName, props.lang, props.code]);
  const [highlighted, setHighlighted] = useState<{
    highlightedHtml: string | null;
    key: string;
  } | null>(null);
  const highlightedHtml =
    highlighted?.key === highlightKey ? highlighted.highlightedHtml : null;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const highlighter = await getSharedHighlighter({
          langs: [props.lang as SupportedLanguages],
          themes: PIERRE_THEMES,
        });
        if (cancelled) {
          return;
        }
        const highlightedHtml = highlighter.codeToHtml(props.code, {
          lang: props.lang,
          theme: themeName,
        });
        if (!cancelled) {
          setHighlighted({ highlightedHtml, key: highlightKey });
        }
      } catch {
        // Unknown/unsupported language: keep the plain fallback rendering.
        if (!cancelled) {
          setHighlighted({ highlightedHtml: null, key: highlightKey });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [highlightKey, props.code, props.lang, themeName]);

  if (highlightedHtml) {
    return (
      <div
        className="yyork-markdown-codeblock"
        // Shiki escapes the source into styled spans, so this markup is safe.
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    );
  }

  return (
    <pre className="yyork-markdown-codeblock yyork-markdown-codeblock--plain">
      <code>{props.code}</code>
    </pre>
  );
}

const markdownComponents: Components = {
  a: ({ children, href, title }) => (
    <a href={href} rel="noreferrer noopener" target="_blank" title={title}>
      {children}
    </a>
  ),
  // Replace the wrapping <pre> with a fragment; MarkdownCodeBlock renders its
  // own <pre> for highlighted blocks.
  pre: ({ children }) => <>{children}</>,
  code: ({ children, className }) => {
    const text = getNodeText(children);
    const lang = /language-(\w+)/.exec(className ?? '')?.[1];
    const isBlock = lang !== undefined || text.includes('\n');

    if (!isBlock) {
      return <code className={className}>{children}</code>;
    }

    return (
      <MarkdownCodeBlock code={text.replace(/\n$/, '')} lang={lang ?? 'text'} />
    );
  },
};

/**
 * Renders markdown source as a formatted rich preview with syntax-highlighted
 * fenced code blocks. Raw HTML in the source is not rendered (react-markdown's
 * safe default), so this is safe for untrusted workspace files.
 */
export function CanvasMarkdownPreview(props: {
  className?: string;
  content: string;
}) {
  return (
    <div className={cn('yyork-markdown-scroll', props.className)}>
      <div className="yyork-markdown">
        <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
          {props.content}
        </Markdown>
      </div>
    </div>
  );
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).join('');
  }
  return '';
}
