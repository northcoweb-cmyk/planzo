export const TAU = Math.PI * 2;

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : clamp((v - a) / (b - a)));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing toward a target. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  target + (current - target) * Math.exp(-rate * dt);
/** Asymmetric smoothing: different time constants (seconds) for rising / falling. */
export const dampAR = (current: number, target: number, attack: number, release: number, dt: number): number => {
  const tau = target > current ? attack : release;
  return tau <= 0 ? target : target + (current - target) * Math.exp(-dt / tau);
};
export const wrap01 = (v: number): number => v - Math.floor(v);
export const mapRange = (v: number, a: number, b: number, c: number, d: number): number => lerp(c, d, invLerp(a, b, v));

/** Deterministic PRNG so crowd layouts are stable per venue. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (r: () => number, a: number, b: number): number => a + (b - a) * r();
export const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];

/** Weighted pick; weights need not be normalised. Returns the index. */
export function weightedIndex(weights: ArrayLike<number>, rnd: number): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return 0;
  let t = rnd * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t <= 0) return i;
  }
  return weights.length - 1;
}

/** Fixed-size ring buffer of numbers with cheap window statistics. */
export class Ring {
  readonly data: Float32Array;
  private head = 0;
  count = 0;
  constructor(readonly size: number) {
    this.data = new Float32Array(size);
  }
  push(v: number): void {
    this.data[this.head] = v;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }
  /** i = 0 is the newest sample. */
  at(i: number): number {
    return this.data[(this.head - 1 - i + this.size * 2) % this.size];
  }
  /** Mean over samples [from, to) counted back from newest. */
  mean(from: number, to: number): number {
    const hi = Math.min(to, this.count);
    if (hi <= from) return 0;
    let s = 0;
    for (let i = from; i < hi; i++) s += this.at(i);
    return s / (hi - from);
  }
  max(from: number, to: number): number {
    const hi = Math.min(to, this.count);
    let m = 0;
    for (let i = from; i < hi; i++) m = Math.max(m, this.at(i));
    return m;
  }
  /** Least-squares slope (units per sample, positive = rising towards the newest sample). */
  slope(window: number): number {
    const n = Math.min(window, this.count);
    if (n < 4) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
      const x = -i; // oldest has most negative x
      const y = this.at(i);
      sx += x; sy += y; sxy += x * y; sxx += x * x;
    }
    const d = n * sxx - sx * sx;
    return d === 0 ? 0 : (n * sxy - sx * sy) / d;
  }
  clear(): void {
    this.data.fill(0);
    this.head = 0;
    this.count = 0;
  }
}
