#!/usr/bin/env node
/**
 * Design ↔ code parity check.
 *
 * Pixel-diffs a design export against a screenshot of the rendered component
 * using pixelmatch, and reports a parity score plus a diff heatmap.
 *
 * Usage:
 *   node scripts/design-parity.mjs <design.png> <code.png> [diff.png]
 *
 * Both images must have identical pixel dimensions. Export the Paper node and
 * capture the rendered element at the same scale (e.g. both at 2x).
 *
 * Note: across renderers (Paper vs Chrome) text anti-aliasing differs, so we
 * pass `includeAA: false` and a tolerance to focus on real layout/color drift
 * rather than sub-pixel font hinting. Treat the score as a guide, not a gate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const [, , designArg, codeArg, diffArg] = process.argv;

if (!designArg || !codeArg) {
  console.error(
    'Usage: node scripts/design-parity.mjs <design.png> <code.png> [diff.png]'
  );
  process.exit(1);
}

const designPath = resolve(designArg);
const codePath = resolve(codeArg);
const diffPath = resolve(diffArg ?? 'design-parity-diff.png');

const design = PNG.sync.read(readFileSync(designPath));
const code = PNG.sync.read(readFileSync(codePath));

if (design.width !== code.width || design.height !== code.height) {
  console.error(
    `Dimension mismatch: design ${design.width}x${design.height} vs code ${code.width}x${code.height}.\n` +
      'Re-export both at the same scale so the pixel dimensions match.'
  );
  process.exit(1);
}

const { width, height } = design;
const diff = new PNG({ width, height });

const mismatched = pixelmatch(
  design.data,
  code.data,
  diff.data,
  width,
  height,
  {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.4,
    diffColor: [255, 49, 49],
  }
);

writeFileSync(diffPath, PNG.sync.write(diff));

const total = width * height;
const parity = ((1 - mismatched / total) * 100).toFixed(2);

console.log('Design ↔ code parity');
console.log('────────────────────');
console.log(`size:      ${width}×${height} (${total.toLocaleString()} px)`);
console.log(`mismatched: ${mismatched.toLocaleString()} px`);
console.log(`parity:     ${parity}%`);
console.log(`diff image: ${diffPath}`);
