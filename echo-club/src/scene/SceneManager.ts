import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { QualityProfile } from '../core/Quality';
import { clamp } from '../util/math';

/** Final grade: vignette + fine film grain + a little chromatic fringe on big moments. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uAberration; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime)*43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float d = dot(c,c);
      vec2 off = c * d * uAberration;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - uVignette * smoothstep(0.12, 0.62, d*1.6);
      col += (h(vUv*vec2(1920.,1080.)) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private quality!: QualityProfile;
  private width = 1;
  private height = 1;
  private pixelRatioScale = 1;
  readonly canvas: HTMLCanvasElement;
  private camera!: THREE.PerspectiveCamera;
  exposure = 0.95;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'club-canvas';
    host.appendChild(this.canvas);
    this.scene.background = new THREE.Color('#03040a');
  }

  get gl(): WebGLRenderingContext | WebGL2RenderingContext {
    return this.renderer.getContext();
  }

  bindCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
  }

  applyQuality(q: QualityProfile): void {
    this.quality = q;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.buildComposer();
    this.resize(this.width, this.height);
  }

  private buildComposer(): void {
    this.composer?.dispose();
    const q = this.quality;
    const size = this.renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x || 2, size.y || 2, {
      type: THREE.HalfFloatType,
      samples: q.msaa,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x || 2, size.y || 2), 0.55, 0.7, 0.82);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  /** CSS pixels. */
  resize(w: number, h: number): void {
    this.width = Math.max(2, w);
    this.height = Math.max(2, h);
    const ratio = Math.min(window.devicePixelRatio || 1, this.quality?.maxPixelRatio ?? 1.5) * this.pixelRatioScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(this.width, this.height);
    if (this.bloom) {
      const bw = Math.floor(this.width * ratio * (this.quality?.bloomScale ?? 0.5));
      const bh = Math.floor(this.height * ratio * (this.quality?.bloomScale ?? 0.5));
      this.bloom.setSize(Math.max(2, bw * 2), Math.max(2, bh * 2));
    }
  }

  /** Dynamic resolution (0.6–1). Used by PerformanceManager. */
  setResolutionScale(s: number): void {
    const v = clamp(s, 0.55, 1);
    if (Math.abs(v - this.pixelRatioScale) < 0.01) return;
    this.pixelRatioScale = v;
    this.resize(this.width, this.height);
  }
  get resolutionScale(): number { return this.pixelRatioScale; }

  setFog(color: string, density: number): void {
    this.scene.fog = new THREE.FogExp2(new THREE.Color(color), density);
  }

  setBackground(color: string): void {
    (this.scene.background as THREE.Color).set(color);
  }

  setBloom(strength: number, threshold = 0.82, radius = 0.7): void {
    if (!this.bloom) return;
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = radius;
  }

  setGrade(time: number, aberration: number, vignette = 0.55): void {
    if (!this.grade) return;
    this.grade.uniforms.uTime.value = time % 10;
    this.grade.uniforms.uAberration.value = aberration;
    this.grade.uniforms.uVignette.value = vignette;
  }

  setExposure(e: number): void {
    this.exposure = e;
    this.renderer.toneMappingExposure = e;
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  get info(): THREE.WebGLInfo {
    return this.renderer.info;
  }
}
