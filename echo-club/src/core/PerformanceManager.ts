import type { QualityId } from './types';
import { QUALITY_ORDER } from './Quality';

export interface GpuInfo {
  renderer: string;
  vendor: string;
  tier: 'software' | 'integrated' | 'discrete' | 'unknown';
}

export function detectGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuInfo {
  let renderer = 'unknown';
  let vendor = 'unknown';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
    }
  } catch { /* privacy settings can hide it */ }
  const r = renderer.toLowerCase();
  let tier: GpuInfo['tier'] = 'unknown';
  if (/swiftshader|llvmpipe|software|softpipe|basic render/.test(r)) tier = 'software';
  else if (/intel|uhd|iris|hd graphics|mali|adreno|powervr/.test(r) && !/arc/.test(r)) tier = 'integrated';
  else if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m|apple gpu|arc/.test(r)) tier = 'discrete';
  return { renderer, vendor, tier };
}

export function recommendFromGpu(g: GpuInfo): QualityId {
  switch (g.tier) {
    case 'software': return 'LOW';
    case 'integrated': return 'MEDIUM';
    case 'discrete': return 'HIGH';
    default: return 'MEDIUM';
  }
}

/**
 * Frame-time tracking + automatic quality management:
 *  1. dynamic resolution scaling reacts within a second,
 *  2. if the floor is reached and the frame rate is still poor, the preset is stepped down.
 */
export class PerformanceManager {
  fps = 60;
  frameMs = 16.7;
  worstMs = 0;
  /** Which preset we'd suggest right now. */
  recommended: QualityId = 'HIGH';
  private acc = 0;
  private frames = 0;
  private worstAcc = 0;
  private slowSeconds = 0;
  private fastSeconds = 0;
  private warmup = 3;
  scale = 1;
  autoEnabled = true;
  onScale: ((s: number) => void) | null = null;
  onStepDown: ((to: QualityId) => void) | null = null;
  current: QualityId = 'HIGH';

  setCurrent(q: QualityId): void {
    this.current = q;
    this.recommended = q;
    this.slowSeconds = 0;
    this.fastSeconds = 0;
    this.warmup = 3;
    this.scale = 1;
    this.onScale?.(1);
  }

  update(rawDt: number): void {
    const ms = rawDt * 1000;
    this.acc += rawDt;
    this.frames++;
    this.worstAcc = Math.max(this.worstAcc, ms);
    if (this.acc < 0.5) return;
    this.fps = this.frames / this.acc;
    this.frameMs = (this.acc / this.frames) * 1000;
    this.worstMs = this.worstAcc;
    const interval = this.acc;
    this.acc = 0; this.frames = 0; this.worstAcc = 0;
    if (this.warmup > 0) { this.warmup -= interval; return; }
    if (!this.autoEnabled) return;

    if (this.fps < 50) { this.slowSeconds += interval; this.fastSeconds = 0; }
    else if (this.fps > 57) { this.fastSeconds += interval; this.slowSeconds = Math.max(0, this.slowSeconds - interval); }
    else { this.slowSeconds = Math.max(0, this.slowSeconds - interval * 0.5); this.fastSeconds = 0; }

    if (this.slowSeconds > 1.5) {
      this.slowSeconds = 0;
      if (this.scale > 0.6) {
        this.scale = Math.max(0.6, this.scale - 0.1);
        this.onScale?.(this.scale);
      } else {
        const idx = QUALITY_ORDER.indexOf(this.current);
        if (idx > 0) {
          this.recommended = QUALITY_ORDER[idx - 1];
          this.onStepDown?.(this.recommended);
        }
      }
    } else if (this.fastSeconds > 8 && this.scale < 1) {
      this.fastSeconds = 0;
      this.scale = Math.min(1, this.scale + 0.05);
      this.onScale?.(this.scale);
    } else if (this.fastSeconds > 25 && this.scale >= 1) {
      const idx = QUALITY_ORDER.indexOf(this.current);
      if (idx < QUALITY_ORDER.length - 1) this.recommended = QUALITY_ORDER[idx + 1];
    }
  }
}
