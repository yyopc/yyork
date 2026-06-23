import { accentChain } from 'glimm';
import type { Palette } from 'glimm/react';

/**
 * Figma "Green Gables" (sans #0F4D0F — the forest stop dipped too dark in
 * glimm's OKLCH chain and read as a jerky flash mid-sweep).
 * https://www.figma.com/color-palettes/green-gables/
 */
const GREEN_GABLES_HEXES = ['#CCFFCC', '#5CE65C', '#008000'] as const;

export const greenGablesPalette: Palette = accentChain([...GREEN_GABLES_HEXES]);
