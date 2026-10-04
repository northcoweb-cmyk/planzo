import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * Planar floor reflection (HIGH / ULTRA). Rendered at reduced resolution, lightly blurred and added on
 * top of the dark glossy floor, so the LED wall, beams and crowd mirror in the floor like a real club.
 */
const FloorShader = {
  name: 'EchoFloorReflection',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    uStrength: { value: 0.5 },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform vec2 uTexel;
    varying vec4 vUv;
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      vec3 c = texture2D(tDiffuse, uv).rgb * 0.36;
      vec2 o = uTexel * 2.5;
      c += texture2D(tDiffuse, uv + vec2(o.x, 0.0)).rgb * 0.16;
      c += texture2D(tDiffuse, uv - vec2(o.x, 0.0)).rgb * 0.16;
      c += texture2D(tDiffuse, uv + vec2(0.0, o.y * 1.8)).rgb * 0.16;
      c += texture2D(tDiffuse, uv - vec2(0.0, o.y * 1.8)).rgb * 0.16;
      gl_FragColor = vec4(c * uStrength, 1.0);
    }`,
};

export class FloorReflection {
  readonly reflector: Reflector;
  private readonly scale: number;

  constructor(rect: { x0: number; x1: number; z0: number; z1: number }, viewW: number, viewH: number, scale: number) {
    this.scale = scale;
    const w = rect.x1 - rect.x0;
    const d = rect.z1 - rect.z0;
    this.reflector = new Reflector(new THREE.PlaneGeometry(w, d), {
      textureWidth: Math.max(64, Math.floor(viewW * scale)),
      textureHeight: Math.max(64, Math.floor(viewH * scale)),
      clipBias: 0.003,
      color: 0xffffff,
      shader: FloorShader,
    });
    const m = this.reflector.material as THREE.ShaderMaterial;
    m.transparent = true;
    m.blending = THREE.AdditiveBlending;
    m.depthWrite = false;
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.set((rect.x0 + rect.x1) / 2, 0.012, (rect.z0 + rect.z1) / 2);
    this.reflector.renderOrder = 1;
    this.setSize(viewW, viewH);
  }

  setSize(viewW: number, viewH: number): void {
    const rt = this.reflector.getRenderTarget();
    const w = Math.max(64, Math.floor(viewW * this.scale));
    const h = Math.max(64, Math.floor(viewH * this.scale));
    rt.setSize(w, h);
    (this.reflector.material as THREE.ShaderMaterial).uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  setStrength(v: number): void {
    (this.reflector.material as THREE.ShaderMaterial).uniforms.uStrength.value = v;
  }

  dispose(): void {
    this.reflector.dispose();
  }
}
