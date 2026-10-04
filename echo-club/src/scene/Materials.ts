import * as THREE from 'three';

/** Tiny value-noise toolbox for generating textures without shipping image files. */
function hash(x: number, y: number, s: number): number {
  let h = x * 374761393 + y * 668265263 + s * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 4): number {
  let amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 17);
    f *= 2; amp *= 0.5;
  }
  return sum;
}

type Painter = (x: number, y: number, u: number, v: number) => [number, number, number];

function paint(size: number, fn: Painter, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x, y, x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

/** Shared procedural materials. Everything is generated at startup — no external files required. */
export class MaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private tex = new Map<string, THREE.Texture>();
  constructor(private readonly size = 512) {}

  private t(key: string, make: () => THREE.Texture): THREE.Texture {
    let t = this.tex.get(key);
    if (!t) this.tex.set(key, (t = make()));
    return t;
  }
  private m<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key);
    if (!m) this.cache.set(key, (m = make()));
    return m as T;
  }

  get concreteMap(): THREE.Texture {
    return this.t('concrete', () => paint(this.size, (x, y, u, v) => {
      const n = fbm(u * 8, v * 8, 1, 5);
      const stain = fbm(u * 3 + 10, v * 3, 7, 3);
      const base = 38 + n * 46 - stain * 14;
      const speck = hash(x, y, 3) > 0.985 ? 20 : 0;
      const g = clamp255(base + speck);
      return [g, g * 1.01, g * 1.04];
    }));
  }
  get concreteRough(): THREE.Texture {
    return this.t('concreteRough', () => paint(this.size, (x, y, u, v) => {
      const n = fbm(u * 10, v * 10, 5, 4);
      const g = clamp255(170 + n * 80);
      return [g, g, g];
    }, false));
  }
  get woodMap(): THREE.Texture {
    return this.t('wood', () => paint(this.size, (x, y, u, v) => {
      const grain = fbm(u * 3, v * 40, 2, 4);
      const ring = Math.sin((v * 22 + fbm(u * 2, v * 6, 4, 3) * 3) * Math.PI * 2) * 0.5 + 0.5;
      const b = 26 + grain * 30 + ring * 12;
      return [clamp255(b * 1.15), clamp255(b * 0.78), clamp255(b * 0.55)];
    }));
  }
  get floorMap(): THREE.Texture {
    return this.t('floor', () => paint(this.size, (x, y, u, v) => {
      const tile = 4;
      const gx = Math.abs(((u * tile) % 1) - 0.5), gy = Math.abs(((v * tile) % 1) - 0.5);
      const edge = Math.max(gx, gy) > 0.488 ? 1 : 0;
      const n = fbm(u * 24, v * 24, 9, 3);
      const b = 10 + n * 10 + edge * 14;
      return [b, b * 1.02, b * 1.1];
    }));
  }
  get floorRough(): THREE.Texture {
    return this.t('floorRough', () => paint(this.size, (x, y, u, v) => {
      const tile = 4;
      const gx = Math.abs(((u * tile) % 1) - 0.5), gy = Math.abs(((v * tile) % 1) - 0.5);
      const edge = Math.max(gx, gy) > 0.488 ? 1 : 0;
      const n = fbm(u * 30, v * 30, 11, 4);
      const g = clamp255(60 + n * 90 + edge * 90);
      return [g, g, g];
    }, false));
  }
  get brickMap(): THREE.Texture {
    return this.t('brick', () => paint(this.size, (x, y, u, v) => {
      const rows = 16;
      const row = Math.floor(v * rows);
      const off = row % 2 ? 0.5 : 0;
      const cols = 8;
      const cu = (u * cols + off) % 1;
      const cv = (v * rows) % 1;
      const mortar = cu < 0.05 || cv < 0.08;
      const id = hash(Math.floor(u * cols + off), row, 4);
      const n = fbm(u * 30, v * 30, 8, 3);
      if (mortar) return [34 + n * 12, 32 + n * 12, 30 + n * 10];
      const b = 40 + id * 36 + n * 22;
      return [clamp255(b * 1.15), clamp255(b * 0.62), clamp255(b * 0.5)];
    }));
  }
  get brushedRough(): THREE.Texture {
    return this.t('brushed', () => paint(this.size, (x, y, u, v) => {
      const n = fbm(u * 2, v * 120, 12, 3);
      const g = clamp255(70 + n * 110);
      return [g, g, g];
    }, false));
  }
  get softGlow(): THREE.Texture {
    return this.t('glow', () => {
      const s = 128;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(c);
    });
  }
  get hazeTexture(): THREE.Texture {
    return this.t('haze', () => {
      const s = 128;
      const tex = paint(s, (x, y, u, v) => {
        const dx = u - 0.5, dy = v - 0.5;
        const r = Math.sqrt(dx * dx + dy * dy) * 2;
        const fall = Math.max(0, 1 - r);
        const n = fbm(u * 4, v * 4, 33, 4);
        const a = Math.pow(fall, 1.6) * (0.4 + n * 1.1);
        const g = clamp255(a * 255);
        return [g, g, g];
      }, false);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }

  // ---------------- materials ----------------
  concrete(tint = 1): THREE.MeshStandardMaterial {
    return this.m(`concrete${tint}`, () => new THREE.MeshStandardMaterial({ map: this.concreteMap, roughnessMap: this.concreteRough, roughness: 0.95, color: new THREE.Color(tint, tint, tint) }));
  }
  floor(): THREE.MeshStandardMaterial {
    return this.m('floorMat', () => new THREE.MeshStandardMaterial({ map: this.floorMap, roughnessMap: this.floorRough, roughness: 0.55, metalness: 0.25, color: 0xffffff }));
  }
  darkWood(): THREE.MeshStandardMaterial {
    return this.m('wood', () => new THREE.MeshStandardMaterial({ map: this.woodMap, roughness: 0.55, metalness: 0.0 }));
  }
  brick(): THREE.MeshStandardMaterial {
    return this.m('brick', () => new THREE.MeshStandardMaterial({ map: this.brickMap, roughness: 0.92 }));
  }
  blackMetal(): THREE.MeshStandardMaterial {
    return this.m('blackMetal', () => new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.36, metalness: 0.9, roughnessMap: this.brushedRough }));
  }
  steel(): THREE.MeshStandardMaterial {
    return this.m('steel', () => new THREE.MeshStandardMaterial({ color: 0x80858c, roughness: 0.42, metalness: 0.95, roughnessMap: this.brushedRough }));
  }
  rubber(): THREE.MeshStandardMaterial {
    return this.m('rubber', () => new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.85, metalness: 0.0 }));
  }
  plastic(color = 0x111216, roughness = 0.4): THREE.MeshStandardMaterial {
    return this.m(`plastic${color}${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1 }));
  }
  fabric(color: number): THREE.MeshStandardMaterial {
    return this.m(`fabric${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  }
  leather(color: number): THREE.MeshStandardMaterial {
    return this.m(`leather${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 }));
  }
  glass(): THREE.MeshStandardMaterial {
    return this.m('glass', () => new THREE.MeshStandardMaterial({ color: 0x9fb5c9, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false }));
  }
  marble(): THREE.MeshStandardMaterial {
    return this.m('marble', () => new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.12, metalness: 0.35 }));
  }
  /** Unlit bright material for LEDs / neon. Colour can exceed 1.0 to feed the bloom pass. */
  emissive(key: string, color: THREE.ColorRepresentation, intensity = 1): THREE.MeshBasicMaterial {
    const mat = this.m(`em_${key}`, () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mat.color.set(color).multiplyScalar(intensity);
    return mat;
  }
  /** A private (unshared) emissive material the lighting engine can animate. */
  ownEmissive(color: THREE.ColorRepresentation, intensity = 1): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mat.color.set(color).multiplyScalar(intensity);
    return mat;
  }
}
