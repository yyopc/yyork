import { createMeshShader, createNamedropShader, createShader } from 'glimm';
import type { GlimmDefaults } from 'glimm/react';

export type GlimmShaderMode = 'sweep' | 'namedrop' | 'mesh';

export const GLIMM_SHADER_MODES = [
  'sweep',
  'namedrop',
  'mesh',
] as const satisfies readonly GlimmShaderMode[];

type ShaderFactory = NonNullable<GlimmDefaults['shaderFactory']>;

/** Default flat band sweep. */
function createSweepShaderFactory(): ShaderFactory {
  return (opts) => createShader(opts);
}

/** iOS-style traveling bulge reveal (AirDrop / NameDrop feel). */
function createNamedropShaderFactory(): ShaderFactory {
  return (opts) =>
    createNamedropShader({
      canvas: opts.canvas,
      palette: opts.palette,
      direction: opts.direction,
      bandTight: opts.bandTight,
      travelMode: 1,
      iridescence: 1,
      elevation: 0.32,
      bulgeRadius: 0.55,
      refractStrength: 0.04,
    });
}

/** Vertex-displaced mesh band. */
function createMeshShaderFactory(): ShaderFactory {
  return (opts) => createMeshShader(opts);
}

export function getGlimmShaderFactory(mode: GlimmShaderMode): ShaderFactory {
  switch (mode) {
    case 'namedrop':
      return createNamedropShaderFactory();
    case 'mesh':
      return createMeshShaderFactory();
    default:
      return createSweepShaderFactory();
  }
}
