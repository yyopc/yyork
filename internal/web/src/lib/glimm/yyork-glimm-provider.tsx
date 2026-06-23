'use client';

import { GlimmProvider } from 'glimm/react';
import { type ReactNode, useSyncExternalStore } from 'react';

import { emeraldSunbeamMorningPalette } from '@/lib/glimm/emerald-sunbeam-morning-palette';
import { registerGlimmShaderController } from '@/lib/glimm/glimm-namedrop-anchor';
import { getGlimmShaderFactory } from '@/lib/glimm/shader-factories';
import {
  GLIMM_SHADER_MODE_CHANGED,
  GLIMM_SHADER_MODE_KEY,
  loadGlimmShaderMode,
} from '@/lib/glimm/sweep-preview-settings';

export function YyorkGlimmProvider(props: { children: ReactNode }) {
  const shaderMode = useSyncExternalStore(
    subscribeToGlimmShaderMode,
    loadGlimmShaderMode,
    loadGlimmShaderMode
  );

  return (
    <GlimmProvider
      key={shaderMode}
      palette={emeraldSunbeamMorningPalette}
      shaderFactory={getGlimmShaderFactory(shaderMode)}
      onController={(controller) => {
        registerGlimmShaderController(controller);
      }}
    >
      {props.children}
    </GlimmProvider>
  );
}

function subscribeToGlimmShaderMode(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === GLIMM_SHADER_MODE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener(GLIMM_SHADER_MODE_CHANGED, onStoreChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(GLIMM_SHADER_MODE_CHANGED, onStoreChange);
    window.removeEventListener('storage', handleStorage);
    registerGlimmShaderController(null);
  };
}
