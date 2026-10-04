import * as THREE from 'three';
import { mulberry32 } from '../util/math';
import type { MaterialLibrary } from './Materials';

const VERT = /* glsl */ `
attribute vec4 aData;
attribute vec2 aVar;
uniform float uTime;
varying vec2 vUv;
varying float vA;
void main(){
  float ph = aVar.x * 6.2831;
  vec3 c = aData.xyz + vec3(sin(uTime*0.05 + ph)*1.6, sin(uTime*0.03 + ph*1.7)*0.35, cos(uTime*0.04 + ph*0.6)*1.6);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float ca = cos(ph + uTime*0.02), sa = sin(ph + uTime*0.02);
  vec2 q = vec2(position.x*ca - position.y*sa, position.x*sa + position.y*ca);
  mv.xy += q * aData.w;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vA = aVar.y;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv; varying float vA;
void main(){
  float t = texture2D(uMap, vUv).r;
  gl_FragColor = vec4(uColor * t * vA * uOpacity, t * vA * uOpacity);
}`;

export interface HazeVolume { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }

/** Slow-drifting haze billboards. They are tinted by the lighting colour and only matter where light hits them. */
export class Haze {
  readonly object = new THREE.Object3D();
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.ShaderMaterial;
  private opacity = 0.04;

  constructor(private readonly mats: MaterialLibrary) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: mats.hazeTexture }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#4f7dff') }, uOpacity: { value: 0.04 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
  }

  build(vol: HazeVolume, count: number): void {
    if (this.mesh) { this.object.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.dispose(); this.mesh = null; }
    if (count <= 0) return;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.instanceCount = count;
    const data = new Float32Array(count * 4);
    const vars = new Float32Array(count * 2);
    const r = mulberry32(2024);
    for (let i = 0; i < count; i++) {
      data[i * 4] = vol.x0 + r() * (vol.x1 - vol.x0);
      data[i * 4 + 1] = vol.y0 + Math.pow(r(), 1.4) * (vol.y1 - vol.y0);
      data[i * 4 + 2] = vol.z0 + r() * (vol.z1 - vol.z0);
      data[i * 4 + 3] = 4 + r() * 6;
      vars[i * 2] = r();
      vars[i * 2 + 1] = 0.5 + r() * 0.5;
    }
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
    geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(vars, 2));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.mesh = mesh as unknown as THREE.InstancedMesh;
    this.object.add(mesh);
  }

  update(time: number, color: THREE.Color, amount: number, energy01: number, drop: number): void {
    const u = this.material.uniforms;
    u.uTime.value = time;
    (u.uColor.value as THREE.Color).copy(color).multiplyScalar(0.8);
    // subtle in calm moments, more visible in peaks / drops
    const target = amount * (0.0035 + 0.0075 * energy01 + 0.012 * drop);
    this.opacity += (target - this.opacity) * 0.04;
    u.uOpacity.value = this.opacity;
  }
}
