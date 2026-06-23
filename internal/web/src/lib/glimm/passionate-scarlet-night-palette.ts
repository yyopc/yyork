import { accentChain } from 'glimm';
import type { Palette } from 'glimm/react';

/**
 * Passionate Scarlet Night. The source palette uses opaque #RRGGBBAA values;
 * these six-digit stops preserve the same colors for glimm's hex parser.
 */
const PASSIONATE_SCARLET_NIGHT_HEXES = [
  '#e40b0b',
  '#c30e0e',
  '#a21112',
  '#611618',
] as const;

export const passionateScarletNightPalette: Palette = accentChain([
  ...PASSIONATE_SCARLET_NIGHT_HEXES,
]);
