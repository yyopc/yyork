import { accentChain } from 'glimm';
import type { Palette } from 'glimm/react';

/**
 * Figma "Emerald Sunbeam Morning"
 * https://www.figma.com/color-palettes/emerald-sunbeam-morning/
 */
const EMERALD_SUNBEAM_MORNING_HEXES = [
  '#422168',
  '#E8FC8C',
  '#CAF204',
  '#00F3B5',
  '#0D7D4C',
] as const;

export const emeraldSunbeamMorningPalette: Palette = accentChain([
  ...EMERALD_SUNBEAM_MORNING_HEXES,
]);
