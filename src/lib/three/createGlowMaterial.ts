import {
  AdditiveBlending,
  BackSide,
  Color,
  type ColorRepresentation,
  ShaderMaterial,
} from 'three';

export interface CreateGlowMaterialOptions {
  color: ColorRepresentation;
  /** Inner falloff term subtracted from the Fresnel dot product. */
  falloff: number;
  /** Output alpha multiplier. */
  intensity: number;
}

const VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vPositionNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 glowColor;
  uniform float falloff;
  uniform float intensity;
  varying vec3 vNormal;
  varying vec3 vPositionNormal;
  void main() {
    float a = pow(falloff - dot(vNormal, vPositionNormal), 3.0);
    gl_FragColor = vec4(glowColor, a * intensity);
  }
`;

/**
 * Fresnel-style additive glow shell, used by both the sun and planet halos.
 * Sharing one shader source means the WebGL pipeline only compiles it once.
 */
export function createGlowMaterial(opts: CreateGlowMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: BackSide,
    uniforms: {
      glowColor: { value: new Color(opts.color) },
      falloff: { value: opts.falloff },
      intensity: { value: opts.intensity },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
}
