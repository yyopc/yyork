# yyork Launch Video

Local Hyperframe workspace for the yyork launch video.

Keep source files here when they need to be readable by local agents. This
directory is intentionally not ignored, so Codex-style file references can still
target the HTML, CSS, JS, and scene files.

Do not commit files from this directory. A local pre-commit guard blocks staged
paths under `launch-video/`.

## Local preview

Run the HyperFrames studio through the repo's named portless URL:

```bash
pnpm hf:dev
```

Open `https://hf.yyork.localhost`.

Use `pnpm --dir launch-video run dev:direct` only for explicit portless
debugging. Agents should not use the raw HyperFrames localhost preview URL for
normal review.
