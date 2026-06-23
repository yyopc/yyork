import { useGlimm } from 'glimm/react';
import GUI from 'lil-gui';
import { useEffect, useRef } from 'react';

import 'lil-gui/dist/lil-gui.css';

import {
  applyYorkThemeToLilGui,
  attachFloatableLilGui,
} from '@/lib/glimm/lil-gui-shell';
import {
  GLIMM_SHADER_MODES,
  type GlimmShaderMode,
} from '@/lib/glimm/shader-factories';
import {
  defaultGlimmSweepPreviewSettings,
  GLIMM_SWEEP_DIRECTIONS,
  GLIMM_SWEEP_EASING_NAMES,
  GLIMM_SWEEP_PALETTE_OPTIONS,
  type GlimmSweepPreviewSettings,
  loadGlimmShaderMode,
  loadGlimmSweepPreviewSettings,
  persistGlimmAddProjectSweepSettings,
  persistGlimmRemoveProjectSweepSettings,
  persistGlimmShaderMode,
  persistGlimmSweepPreviewSettings,
  toSweepOptions,
} from '@/lib/glimm/sweep-preview-settings';
import { useTheme } from '@/lib/theme/provider';

/**
 * Dev-only lil-gui panel for live-tuning glimm sweep options. "Play sweep"
 * previews the band over the current UI; "Use for add project" wires the same
 * settings into the add-project glimm transition.
 */
export function GlimmSweepDevtool() {
  const { sweep } = useGlimm();
  const { resolvedTheme } = useTheme();
  const settingsRef = useRef<GlimmSweepPreviewSettings | null>(null);
  if (settingsRef.current === null) {
    settingsRef.current = loadGlimmSweepPreviewSettings();
  }
  const guiRef = useRef<GUI | null>(null);

  useEffect(() => {
    let detachFloat: (() => void) | undefined;

    const settings = settingsRef.current;
    if (settings === null) {
      return undefined;
    }
    const shell = {
      shaderMode: loadGlimmShaderMode(),
    };
    const actions = {
      playSweep: () => {
        sweep(() => undefined, toSweepOptions(settings));
      },
      useCurrentForAddProject: () => {
        persistGlimmAddProjectSweepSettings(settings);
      },
      useCurrentForRemoveProject: () => {
        persistGlimmRemoveProjectSweepSettings(settings);
      },
    };

    const gui = new GUI({ title: 'Glimm sweep' });
    guiRef.current = gui;
    applyYorkThemeToLilGui(gui.domElement);
    detachFloat = attachFloatableLilGui(gui.domElement);

    const persist = () => {
      persistGlimmSweepPreviewSettings(settings);
    };

    gui
      .add(shell, 'shaderMode', [...GLIMM_SHADER_MODES])
      .name('shader')
      .onChange((mode: GlimmShaderMode) => {
        persistGlimmShaderMode(mode);
      });

    gui
      .add(settings, 'palette', GLIMM_SWEEP_PALETTE_OPTIONS)
      .name('palette')
      .onChange(persist);
    gui
      .add(settings, 'direction', [...GLIMM_SWEEP_DIRECTIONS])
      .name('direction')
      .onChange(persist);
    gui
      .add(settings, 'easing', [...GLIMM_SWEEP_EASING_NAMES])
      .name('easing')
      .onChange(persist);

    const timing = gui.addFolder('Timing');
    timing
      .add(settings, 'sweepMs', 200, 3000, 50)
      .name('sweepMs')
      .onChange(persist);
    timing
      .add(settings, 'outroMs', 0, 2000, 25)
      .name('outroMs')
      .onChange(persist);
    timing
      .add(settings, 'midpoint', 0, 1, 0.01)
      .name('midpoint')
      .onChange(persist);

    const band = gui.addFolder('Band');
    band
      .add(settings, 'bandTight', 1, 40, 1)
      .name('bandTight')
      .onChange(persist);
    band
      .add(settings, 'peakAlpha', 0, 1.5, 0.01)
      .name('peakAlpha')
      .onChange(persist);
    band
      .add(settings, 'brightness', 0.2, 1.5, 0.01)
      .name('brightness')
      .onChange(persist);
    band
      .add(settings, 'swellAmount', 0, 1, 0.01)
      .name('swellAmount')
      .onChange(persist);

    const motion = gui.addFolder('Motion');
    motion
      .add(settings, 'waveAmount', 0, 2, 0.01)
      .name('waveAmount')
      .onChange(persist);
    motion
      .add(settings, 'rippleAmount', 0, 2, 0.01)
      .name('rippleAmount')
      .onChange(persist);
    motion
      .add(settings, 'waveSpeed', 0, 3, 0.01)
      .name('waveSpeed')
      .onChange(persist);

    const wiring = gui.addFolder('Wiring');
    wiring
      .add(actions, 'useCurrentForAddProject')
      .name('Use current for add project');
    wiring
      .add(actions, 'useCurrentForRemoveProject')
      .name('Use current for remove project');

    gui.add(actions, 'playSweep').name('Play sweep');

    gui
      .add(
        {
          reset: () => {
            Object.assign(settings, defaultGlimmSweepPreviewSettings);
            persist();
            gui.controllersRecursive().forEach((controller) => {
              controller.updateDisplay();
            });
          },
        },
        'reset'
      )
      .name('Reset defaults');

    return () => {
      detachFloat?.();
      gui.destroy();
      if (guiRef.current === gui) {
        guiRef.current = null;
      }
    };
  }, [sweep]);

  useEffect(() => {
    if (!guiRef.current || !resolvedTheme) {
      return;
    }

    applyYorkThemeToLilGui(guiRef.current.domElement);
  }, [resolvedTheme]);

  return null;
}
