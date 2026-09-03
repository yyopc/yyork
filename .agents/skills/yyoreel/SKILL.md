---
name: yyoreel
description: Create and record scripted browser demo videos with yyoreel. Generates MP4, GIF, or WebM recordings with cursor animation, keystroke overlays, and sound effects from a JSON config. Use when the user wants to record a demo, create a browser video, edit a yyoreel config, generate a screen recording, preview a demo, or work with yyoreel in any way.
---

# yyoreel

yyoreel records scripted browser demos as MP4, GIF, or WebM with cursor animation, keystroke overlays, and sound effects. You define steps in a JSON config, and yyoreel drives headless Chrome, captures frames, and encodes with ffmpeg.

## Choose the recorder in yyork

- Use the vendored `yyoreel` CLI for standalone-URL recordings. It provides default-on autozoom and 2x physical output dimensions at quality 80 or higher.
- Use `pnpm browser:yyoreel -- <args>` for in-app recordings that must reuse yyork's shared Chrome. The wrapper discovers the active d3k/shared-browser endpoint and passes it through `YYOREEL_CDP_ENDPOINT`.

The shared-browser wrapper owns endpoint selection. Do not set
`YYOREEL_CDP_ENDPOINT` manually when using `pnpm browser:yyoreel`.

## Installation

Install yyoreel as a project dependency so the version is pinned in the lockfile. This ensures deterministic recordings across machines and CI.

```bash
npm install yyoreel
```

If the project already has yyoreel in its dependencies, skip this step.

## Prerequisites

yyoreel requires Chrome and ffmpeg, but you do NOT need to install them manually. Both are automatically downloaded to `~/.yyoreel` on first run if not already present. Do not install Chrome or Chromium via puppeteer, playwright, or any other tool. yyoreel manages its own browser.

To download dependencies explicitly, or to fix corrupted/broken binaries:

```bash
npx yyoreel install
npx yyoreel install --force   # delete cached binaries and re-download
```

To override the auto-downloaded binaries, set these environment variables:

- `CHROME_PATH` - path to a Chrome or Chromium binary (used for preview)
- `CHROME_HEADLESS_PATH` - path to a chrome-headless-shell binary (used for recording)
- `FFMPEG_PATH` - path to an ffmpeg binary
- `YYOREEL_CDP_ENDPOINT` - existing Chrome remote debugging HTTP(S) endpoint, WebSocket debugger URL, or port

When `YYOREEL_CDP_ENDPOINT` is set, yyoreel attaches to externally owned Chrome,
creates a dedicated page target, and closes only that target after the run. The
browser remains running.

If a recording fails with "No inspectable targets" or similar browser errors, the issue is almost certainly in the yyoreel config (wrong `waitFor`, missing element, timing), not a missing browser. Check the config and use `--verbose` to debug.

## .gitignore

The `.yyoreel` directory is created at the project root during recording (frames, intermediate files). Add it to `.gitignore`:

```
.yyoreel
```

## Quick start

```bash
# Scaffold a config
npx yyoreel init --name my-demo --url https://example.com

# Edit yyoreel.config.json with your steps

# Preview in a visible browser (no recording)
npx yyoreel preview my-demo

# Record the video
npx yyoreel record my-demo
```

`npx` resolves to the locally installed version when yyoreel is in `devDependencies`. Output lands in `videos/` by default (configurable via `outDir`).

## CLI commands

### init

Scaffold a new `yyoreel.config.json`.

```bash
yyoreel init
yyoreel init --name login-flow --url https://myapp.com
yyoreel init --name hero -o hero.config.json
```

Flags: `--name` (video name), `--url` (starting URL), `-o, --output` (output file path).

### record

Record one or more videos.

```bash
yyoreel record                        # all videos in config
yyoreel record hero login             # specific videos by name
yyoreel record -c custom.config.json  # custom config path
yyoreel record --watch                # re-record on config change
yyoreel record --verbose              # log each step
yyoreel record --dry-run              # print resolved config only
yyoreel record --frames               # save raw PNGs to .yyoreel/frames/
```

### preview

Run steps in a visible browser without recording.

```bash
yyoreel preview
yyoreel preview hero --verbose
```

### composite

Re-apply the recording background and overlays (cursor, HUD, sfx) to existing raw video without re-recording. Useful for tweaking theme settings.

```bash
yyoreel composite
yyoreel composite hero
```

### install

Download Chrome and ffmpeg to `~/.yyoreel`. Also use this to fix corrupted or broken binaries.

```bash
yyoreel install
yyoreel install --force  # delete cached binaries and re-download
```

### validate

Check config for errors without running anything.

```bash
yyoreel validate
yyoreel validate -c custom.config.json
```

## Config structure

Config files are auto-discovered as `yyoreel.config.json` (or `.ts`, `.mts`, `.js`, `.mjs`). Use `-c` to specify a custom path.

### Top-level fields

| Field          | Default      | Description                                             |
| -------------- | ------------ | ------------------------------------------------------- |
| `$schema`      | -            | `"https://yyoreel.dev/schema/v1.json"`                  |
| `outDir`       | `"videos/"`  | Output directory for rendered videos                    |
| `baseUrl`      | `""`         | Base URL prepended to relative video URLs               |
| `viewport`     | main display | Usable logical area on macOS, with a 1080x1080 fallback |
| `theme`        | -            | Recording background, cursor, and HUD theme             |
| `sfx`          | -            | Sound effect settings                                   |
| `include`      | -            | Array of step file paths prepended to all videos        |
| `defaultDelay` | -            | Default delay (ms) appended after each step             |
| `clickDwell`   | -            | Cursor dwell time (ms) before a click                   |

### Per-video fields

Each entry in the `videos` map supports:

| Field          | Default        | Description                                        |
| -------------- | -------------- | -------------------------------------------------- |
| `url`          | required       | URL to open (absolute or relative to `baseUrl`)    |
| `viewport`     | inherited      | Explicit dimensions or preset override             |
| `zoom`         | -              | CSS zoom factor                                    |
| `autoZoom`     | `true`         | Spring-zoom the card around related clicks         |
| `waitFor`      | -              | Selector or text to wait for before starting steps |
| `output`       | `"<name>.mp4"` | Output path (`.mp4`, `.gif`, `.webm`)              |
| `thumbnail`    | `{ time: 0 }`  | Thumbnail config, or `{ enabled: false }`          |
| `include`      | inherited      | Step files to prepend                              |
| `theme`        | inherited      | Override theme                                     |
| `sfx`          | inherited      | Override sound effects                             |
| `defaultDelay` | inherited      | Override default delay                             |
| `clickDwell`   | inherited      | Override click dwell                               |
| `fps`          | `60`           | Frame rate                                         |
| `quality`      | `80`           | Final quality and 1x or 2x physical pixel density  |
| `steps`        | required       | Array of step objects                              |

When `viewport` is omitted on macOS, yyoreel uses the main display's usable area in logical CSS pixels. Unsupported or display-less environments fall back to 1080x1080. An explicit object or named preset overrides automatic sizing.

Quality values from 80 through 100 keep the resolved CSS viewport and double the physical output width and height. Values from 1 through 79 use 1x output dimensions. If a 1x viewport has an odd dimension, yyoreel keeps its CSS layout and pads that output edge by one pixel for compatible 4:2:0 video. Automatic viewport discovery does not override this mapping. The default quality matches native density on a 2x Retina display, but density always comes from `quality`. Chrome supplies lossless PNG screencast frames. During capture, yyoreel remuxes those frames so video encoding cannot slow the output clock. Once capture stops, it compacts the retained raw with lossless ultrafast QP0 H.264 RGB while preserving the source RGB samples. A fixed output clock reuses the latest source frame when necessary to maintain the requested frame rate. For MP4 output, the final H.264 encode is the only lossy generation, using the quality-to-CRF mapping, the `veryfast` preset, and compatible 4:2:0 output. WebM and GIF exports apply their format-specific delivery encode after composition.

### Videos map

Videos are keyed by name in the config:

```json
{
  "videos": {
    "hero": { "url": "...", "steps": [...] },
    "login": { "url": "...", "steps": [...] }
  }
}
```

Record specific videos by name: `yyoreel record hero login`.

## Step types

Each step has an `action` field. Most steps accept optional `label`, `delay` (ms after step), and `description` fields.

| Action       | Key fields                                  | Purpose                            |
| ------------ | ------------------------------------------- | ---------------------------------- |
| `pause`      | `ms`                                        | Wait for a duration                |
| `click`      | `text` or `selector`, `within`, `modifiers` | Click an element                   |
| `type`       | `text`, `selector`, `within`, `charDelay`   | Type text into an input            |
| `key`        | `key`, `target`                             | Press a key combo (e.g. `"cmd+s"`) |
| `drag`       | `from`, `to` (element targets)              | Drag between two elements          |
| `scroll`     | `x`, `y`, `selector`                        | Scroll the page or an element      |
| `wait`       | `selector` or `text`, `timeout`             | Wait for an element to appear      |
| `moveTo`     | `text` or `selector`, `within`              | Move cursor to an element          |
| `navigate`   | `url`                                       | Navigate to a new URL              |
| `hover`      | `text` or `selector`, `within`              | Hover over an element              |
| `select`     | `selector`, `value`                         | Select a dropdown value            |
| `screenshot` | `output`                                    | Capture a PNG screenshot           |

For full field details on every step type, see [steps-reference.md](steps-reference.md).

## Element targeting

Many steps target elements using these fields:

- `text` - match by visible text content
- `selector` - match by CSS selector
- `within` - narrow the search to a parent matching this CSS selector

You can use `text` or `selector` (not both). `within` is optional and scopes the search.

```json
{ "action": "click", "text": "Submit" }
{ "action": "click", "selector": "#submit-btn" }
{ "action": "click", "text": "Submit", "within": ".modal" }
```

## Viewport presets

Use preset names as string values for `viewport`, or specify `{ width, height }`. Both forms override automatic display sizing:

`desktop` (1920x1080), `desktop-hd` (2560x1440), `laptop` (1366x768), `macbook-air` (1440x900), `macbook-pro` (1512x982), `ipad` (1024x1366), `ipad-pro` (834x1194), `ipad-mini` (768x1024), `iphone-15` (393x852), `iphone-15-pro-max` (430x932), `iphone-se` (375x667), `pixel-8` (412x915), `galaxy-s24` (360x780).

## Theme

Customize the recording background, cursor appearance, and keystroke HUD:

```json
{
  "theme": {
    "background": "#8b5cf6",
    "cursor": {
      "image": "./cursor.svg",
      "size": 32,
      "hotspot": "center",
      "animationStyle": "medium"
    },
    "hud": {
      "enabled": true,
      "background": "rgba(30, 41, 59, 0.85)",
      "color": "#e2e8f0",
      "fontSize": 48,
      "fontFamily": "\"SF Mono\", monospace",
      "borderRadius": 12,
      "position": "top"
    }
  }
}
```

- `background` - `"none"` (default), a hex color (`#rgb` or `#rrggbb`), or a readable local image path; colors and images create a centered rounded inset with a shadow, while the HUD remains at canvas level
- `cursor.image` - path to a custom cursor SVG or PNG; the contrast-safe built-in Icons8 arrow uses a white fill with a black outline and stays visible through hover and click press; custom cursor artwork also remains unchanged while clicking; press and release use a 100ms cubic ease-out scale transition that reaches `0.75` at full press
- `cursor.size` - cursor size in pixels
- `cursor.hotspot` - `"top-left"` (default) or `"center"` for custom images; the built-in arrow uses its calibrated intrinsic hotspot
- `cursor.animationStyle` - `"smooth"`, `"medium"` (default), `"rapid"`, or `"none"`; only these named presets are accepted
- `hud.enabled` - `true` (default) to show the keystroke and shortcut HUD; set to `false` to omit it from previews, timelines, and all recorded output formats
- `hud.position` - `"top"` or `"bottom"`

## Common patterns

### Shared steps via include

Factor out reusable step sequences (e.g. dismissing a cookie banner) into JSON files:

```json
// steps/dismiss-banner.json
{
  "steps": [
    { "action": "wait", "selector": ".cookie-banner", "timeout": 5000 },
    { "action": "click", "selector": ".accept-btn", "delay": 300 }
  ]
}
```

Reference them in the config:

```json
{
  "include": ["./steps/dismiss-banner.json"],
  "videos": { ... }
}
```

### Multiple videos in one config

Define several videos in the `videos` map. Shared settings (`viewport`, `theme`, `defaultDelay`) are inherited from the top level. If neither level sets `viewport`, each recording uses automatic display sizing.

### Environment variables

Config values support `$VAR` and `${VAR}` substitution from the environment.

### Output formats

Set the `output` extension to control format: `.mp4` (default), `.gif`, `.webm`.

```json
{ "output": "demo.gif" }
```

## Tips

- Always set `waitFor` on a video to ensure the page is ready before steps run.
- Use `delay` on individual steps to control pacing between actions.
- Use `--watch` during development for automatic re-recording on config changes.
- Use `composite` to iterate on theme/overlay settings without re-recording.
- Use `--verbose` to debug step execution.
- Use `--dry-run` to inspect the resolved viewport, configured values, includes, environment substitutions, and steps.
- Use `zoom` to scale up small UIs for readability in the recording.
- Cap-style autozoom is enabled by default for recordings. It runs after static `zoom`, transforms the complete recording card and cursor over a fixed background, merges related clicks, re-aims after meaningful cursor movement, and keeps the keystroke HUD screen-fixed. Use `autoZoom: false` to disable it.
- Use `theme.background` to present the recording as a polished inset on a solid color or local image. Image paths resolve relative to the config file.
- Start with `preview` to verify steps work before committing to a full recording.

## Reference files

- [steps-reference.md](steps-reference.md) - detailed docs for all 12 step types
- [examples.md](examples.md) - annotated config examples for common use cases
