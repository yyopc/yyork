import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { CanvasMarkdownPreview } from '@/features/home/components/molecules/canvas-markdown-preview';

const sampleMarkdown = `# Project README

A short **rich preview** of a markdown file rendered inside the Canvas Files
tab. Toggle between this view and the raw source with the _Preview / Code_
control.

## Features

- Headings, lists, and \`inline code\`
- [GitHub-flavored](https://github.github.com/gfm/) tables and task lists
- Fenced code blocks

### Task list

- [x] Render markdown
- [ ] Add more renderers later

### Code

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

### Table

| Kind     | Supported |
| -------- | --------- |
| Markdown | Yes       |
| Image    | Later     |

> Raw HTML in source files is intentionally not rendered, so untrusted
> workspace files are safe to preview.
`;

const meta = {
  title: 'Home/Canvas Markdown Preview',
  component: CanvasMarkdownPreview,
  args: {
    content: sampleMarkdown,
  },
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-[32rem] bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CanvasMarkdownPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Project README' })
    ).toBeVisible();
  },
};
