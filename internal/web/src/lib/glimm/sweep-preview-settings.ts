import type { Palette, SweepOptions } from 'glimm/react';
import { type EasingName, EASINGS, type PaletteName } from 'glimm/react';

import { emeraldSunbeamMorningPalette } from '@/lib/glimm/emerald-sunbeam-morning-palette';
import { greenGablesPalette } from '@/lib/glimm/green-gables-palette';
import { passionateScarletNightPalette } from '@/lib/glimm/passionate-scarlet-night-palette';
import {
  GLIMM_SHADER_MODES,
  type GlimmShaderMode,
} from '@/lib/glimm/shader-factories';

const GLIMM_SWEEP_OPTIONS_KEY = 'yyork:glimm:add-project-sweep';
export const GLIMM_SHADER_MODE_KEY = 'yyork:glimm:shader-mode';

export const GLIMM_SHADER_MODE_CHANGED = 'yyork:glimm-shader-mode-changed';

const GLIMM_SWEEP_PALETTE_NAMES = [
  'prism',
  'berry',
  'lagoon',
  'citrus',
  'azure',
  'ember',
] as const satisfies readonly PaletteName[];

const GLIMM_FIGMA_PALETTE_IDS = [
  'emeraldSunbeamMorning',
  'greenGables',
  'passionateScarletNight',
] as const;

export type GlimmFigmaPaletteId = (typeof GLIMM_FIGMA_PALETTE_IDS)[number];

/** @deprecated Use `GlimmFigmaPaletteId` — kept for the default yyork palette id. */
const GLIMM_YYORK_PALETTE_ID =
  'emeraldSunbeamMorning' as const satisfies GlimmFigmaPaletteId;

export type GlimmSweepPreviewPaletteId =
  | GlimmFigmaPaletteId
  | (typeof GLIMM_SWEEP_PALETTE_NAMES)[number];

/** Palette ids shown in the devtool dropdown (Figma palettes first). */
export const GLIMM_SWEEP_PALETTE_IDS = [
  ...GLIMM_FIGMA_PALETTE_IDS,
  ...GLIMM_SWEEP_PALETTE_NAMES,
] as const satisfies readonly GlimmSweepPreviewPaletteId[];

const GLIMM_FIGMA_PALETTES: Record<GlimmFigmaPaletteId, Palette> = {
  emeraldSunbeamMorning: emeraldSunbeamMorningPalette,
  greenGables: greenGablesPalette,
  passionateScarletNight: passionateScarletNightPalette,
};

const GLIMM_SWEEP_PALETTE_LABELS: Record<GlimmSweepPreviewPaletteId, string> = {
  emeraldSunbeamMorning: 'Emerald Sunbeam Morning',
  greenGables: 'Green Gables',
  passionateScarletNight: 'Passionate Scarlet Night',
  prism: 'prism',
  berry: 'berry',
  lagoon: 'lagoon',
  citrus: 'citrus',
  azure: 'azure',
  ember: 'ember',
};

export const GLIMM_SWEEP_PALETTE_OPTIONS = Object.fromEntries(
  GLIMM_SWEEP_PALETTE_IDS.map((paletteId) => [
    GLIMM_SWEEP_PALETTE_LABELS[paletteId],
    paletteId,
  ])
) as Record<string, GlimmSweepPreviewPaletteId>;

export const GLIMM_SWEEP_DIRECTIONS = ['ltr', 'rtl', 'ttb', 'btt'] as const;

export const GLIMM_SWEEP_EASING_NAMES = Object.keys(EASINGS) as EasingName[];

export type GlimmSweepPreviewSettings = Required<
  Pick<
    SweepOptions,
    | 'direction'
    | 'easing'
    | 'sweepMs'
    | 'outroMs'
    | 'midpoint'
    | 'bandTight'
    | 'peakAlpha'
    | 'brightness'
    | 'waveAmount'
    | 'rippleAmount'
    | 'waveSpeed'
    | 'swellAmount'
  >
> & {
  palette: GlimmSweepPreviewPaletteId;
  useForAddProject: boolean;
  useForRemoveProject: boolean;
};

export const defaultGlimmSweepPreviewSettings: GlimmSweepPreviewSettings = {
  palette: GLIMM_YYORK_PALETTE_ID,
  direction: 'ltr',
  easing: 'easeOutQuart',
  sweepMs: 1100,
  outroMs: 700,
  midpoint: 0.5,
  bandTight: 14,
  peakAlpha: 1,
  brightness: 1,
  waveAmount: 1,
  rippleAmount: 1,
  waveSpeed: 1,
  swellAmount: 0.8,
  useForAddProject: false,
  useForRemoveProject: false,
};

const defaultGlimmAddProjectSweepSettings: GlimmSweepPreviewSettings = {
  ...defaultGlimmSweepPreviewSettings,
  palette: 'greenGables',
  direction: 'ltr',
  useForAddProject: true,
};

const defaultGlimmRemoveProjectSweepSettings: GlimmSweepPreviewSettings = {
  ...defaultGlimmSweepPreviewSettings,
  palette: 'passionateScarletNight',
  direction: 'ltr',
  useForRemoveProject: true,
};

type StoredSweepPreviewPayload = {
  addProjectSettings?: Partial<GlimmSweepPreviewSettings>;
  enabled?: boolean;
  removeProjectSettings?: Partial<GlimmSweepPreviewSettings>;
  settings?: Partial<GlimmSweepPreviewSettings>;
};

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function pickPalette(
  value: unknown,
  fallback: GlimmSweepPreviewPaletteId
): GlimmSweepPreviewPaletteId {
  return typeof value === 'string' &&
    (GLIMM_SWEEP_PALETTE_IDS as readonly string[]).includes(value)
    ? (value as GlimmSweepPreviewPaletteId)
    : fallback;
}

function resolveSweepPreviewPalette(
  paletteId: GlimmSweepPreviewPaletteId
): PaletteName | Palette {
  if (paletteId in GLIMM_FIGMA_PALETTES) {
    return GLIMM_FIGMA_PALETTES[paletteId as GlimmFigmaPaletteId];
  }

  return paletteId as PaletteName;
}

function pickDirection(
  value: unknown,
  fallback: GlimmSweepPreviewSettings['direction']
): GlimmSweepPreviewSettings['direction'] {
  return typeof value === 'string' &&
    (GLIMM_SWEEP_DIRECTIONS as readonly string[]).includes(value)
    ? (value as GlimmSweepPreviewSettings['direction'])
    : fallback;
}

function pickEasing(
  value: unknown,
  fallback: GlimmSweepPreviewSettings['easing']
): GlimmSweepPreviewSettings['easing'] {
  return typeof value === 'string' &&
    (GLIMM_SWEEP_EASING_NAMES as readonly string[]).includes(value)
    ? (value as GlimmSweepPreviewSettings['easing'])
    : fallback;
}

function normalizeGlimmSweepPreviewSettings(
  partial: Partial<GlimmSweepPreviewSettings> | undefined,
  useForAddProjectFallback = defaultGlimmSweepPreviewSettings.useForAddProject,
  useForRemoveProjectFallback = defaultGlimmSweepPreviewSettings.useForRemoveProject,
  defaults = defaultGlimmSweepPreviewSettings
): GlimmSweepPreviewSettings {
  return {
    palette: pickPalette(partial?.palette, defaults.palette),
    direction: pickDirection(partial?.direction, defaults.direction),
    easing: pickEasing(partial?.easing, defaults.easing),
    sweepMs: clampNumber(partial?.sweepMs, 200, 3000, defaults.sweepMs),
    outroMs: clampNumber(partial?.outroMs, 0, 2000, defaults.outroMs),
    midpoint: clampNumber(partial?.midpoint, 0, 1, defaults.midpoint),
    bandTight: clampNumber(partial?.bandTight, 1, 40, defaults.bandTight),
    peakAlpha: clampNumber(partial?.peakAlpha, 0, 1.5, defaults.peakAlpha),
    brightness: clampNumber(partial?.brightness, 0.2, 1.5, defaults.brightness),
    waveAmount: clampNumber(partial?.waveAmount, 0, 2, defaults.waveAmount),
    rippleAmount: clampNumber(
      partial?.rippleAmount,
      0,
      2,
      defaults.rippleAmount
    ),
    waveSpeed: clampNumber(partial?.waveSpeed, 0, 3, defaults.waveSpeed),
    swellAmount: clampNumber(partial?.swellAmount, 0, 1, defaults.swellAmount),
    useForAddProject:
      typeof partial?.useForAddProject === 'boolean'
        ? partial.useForAddProject
        : useForAddProjectFallback,
    useForRemoveProject:
      typeof partial?.useForRemoveProject === 'boolean'
        ? partial.useForRemoveProject
        : useForRemoveProjectFallback,
  };
}

function readStoredSweepPreviewPayload():
  | { payload: StoredSweepPreviewPayload; source: 'local' | 'session' }
  | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(GLIMM_SWEEP_OPTIONS_KEY);
    if (!raw) {
      const legacyRaw = window.sessionStorage.getItem(GLIMM_SWEEP_OPTIONS_KEY);
      if (!legacyRaw) {
        return undefined;
      }

      return {
        payload: JSON.parse(legacyRaw) as StoredSweepPreviewPayload,
        source: 'session',
      };
    }

    return {
      payload: JSON.parse(raw) as StoredSweepPreviewPayload,
      source: 'local',
    };
  } catch {
    return undefined;
  }
}

function readSweepPreviewPayload(): StoredSweepPreviewPayload | undefined {
  const stored = readStoredSweepPreviewPayload();
  if (!stored) {
    return undefined;
  }

  if (stored.source === 'session') {
    writeSweepPreviewPayload(stored.payload);
  }

  return stored.payload;
}

function writeSweepPreviewPayload(payload: StoredSweepPreviewPayload) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      GLIMM_SWEEP_OPTIONS_KEY,
      JSON.stringify(payload)
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function resolveLegacySettings(
  payload: StoredSweepPreviewPayload | undefined,
  action: 'add' | 'remove'
) {
  if (!payload?.settings) {
    return undefined;
  }

  if (action === 'add') {
    const useForAddProject =
      typeof payload.settings.useForAddProject === 'boolean'
        ? payload.settings.useForAddProject
        : typeof payload.enabled === 'boolean'
          ? payload.enabled
          : false;

    return useForAddProject ? payload.settings : undefined;
  }

  return payload.settings.useForRemoveProject ? payload.settings : undefined;
}

export function toSweepOptions(
  settings: GlimmSweepPreviewSettings
): SweepOptions {
  const {
    useForAddProject: _useForAddProject,
    useForRemoveProject: _useForRemoveProject,
    palette,
    ...options
  } = settings;
  return {
    ...options,
    palette: resolveSweepPreviewPalette(palette),
  };
}

export function getGlimmAddProjectSweepOptions(): SweepOptions | undefined {
  if (!import.meta.env.DEV) {
    return undefined;
  }

  return toSweepOptions(loadGlimmAddProjectSweepSettings());
}

export function getGlimmRemoveProjectSweepOptions(): SweepOptions | undefined {
  if (!import.meta.env.DEV) {
    return undefined;
  }

  return toSweepOptions(loadGlimmRemoveProjectSweepSettings());
}

export function persistGlimmSweepPreviewSettings(
  settings: GlimmSweepPreviewSettings
) {
  const payload = readSweepPreviewPayload() ?? {};
  writeSweepPreviewPayload({
    ...payload,
    settings: normalizeGlimmSweepPreviewSettings(settings),
  });
}

export function loadGlimmSweepPreviewSettings(): GlimmSweepPreviewSettings {
  const payload = readSweepPreviewPayload();

  return normalizeGlimmSweepPreviewSettings(payload?.settings);
}

function loadGlimmAddProjectSweepSettings(): GlimmSweepPreviewSettings {
  const payload = readSweepPreviewPayload();
  const settings =
    payload?.addProjectSettings ?? resolveLegacySettings(payload, 'add');

  return normalizeGlimmSweepPreviewSettings(
    settings,
    true,
    false,
    defaultGlimmAddProjectSweepSettings
  );
}

function loadGlimmRemoveProjectSweepSettings(): GlimmSweepPreviewSettings {
  const payload = readSweepPreviewPayload();
  const settings =
    payload?.removeProjectSettings ?? resolveLegacySettings(payload, 'remove');

  return normalizeGlimmSweepPreviewSettings(
    settings,
    false,
    true,
    defaultGlimmRemoveProjectSweepSettings
  );
}

export function persistGlimmAddProjectSweepSettings(
  settings: GlimmSweepPreviewSettings
) {
  const payload = readSweepPreviewPayload() ?? {};
  writeSweepPreviewPayload({
    ...payload,
    addProjectSettings: normalizeGlimmSweepPreviewSettings(
      settings,
      true,
      false,
      defaultGlimmAddProjectSweepSettings
    ),
  });
}

export function persistGlimmRemoveProjectSweepSettings(
  settings: GlimmSweepPreviewSettings
) {
  const payload = readSweepPreviewPayload() ?? {};
  writeSweepPreviewPayload({
    ...payload,
    removeProjectSettings: normalizeGlimmSweepPreviewSettings(
      settings,
      false,
      true,
      defaultGlimmRemoveProjectSweepSettings
    ),
  });
}

export function loadGlimmShaderMode(): GlimmShaderMode {
  if (typeof window === 'undefined') {
    return 'sweep';
  }

  try {
    const raw =
      window.localStorage.getItem(GLIMM_SHADER_MODE_KEY) ??
      window.sessionStorage.getItem(GLIMM_SHADER_MODE_KEY);
    if (
      typeof raw === 'string' &&
      (GLIMM_SHADER_MODES as readonly string[]).includes(raw)
    ) {
      return raw as GlimmShaderMode;
    }
  } catch {
    // ignore malformed storage
  }

  return 'sweep';
}

export function persistGlimmShaderMode(mode: GlimmShaderMode) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(GLIMM_SHADER_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent(GLIMM_SHADER_MODE_CHANGED));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}
