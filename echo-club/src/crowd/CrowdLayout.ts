import { mulberry32 } from '../util/math';

/** A rectangular area people can stand in. Venues describe these; the layout fills them. */
export interface CrowdRegion {
  id: string;
  kind: 'floor' | 'balcony' | 'stage' | 'lounge' | 'bar';
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
  /** People per square metre when completely full. */
  density: number;
  /** Minimum LOD to use (balconies / background never need LOD0). */
  minLod?: 0 | 1 | 2;
  /** Chance a person here faces the DJ (rest look around). */
  facing?: number;
  /** Arrival priority bias: positive = fills later. */
  arrivalBias?: number;
}

export interface PersonSpawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
  height: number; // scale multiplier on the character's own height
  width: number;
  char: number;
  lod: 0 | 1 | 2;
  layer: 1 | 2 | 3 | 4 | 5;
  region: CrowdRegion['kind'];
  /** 0..1 — people with a lower value are present first. */
  arrival: number;
}

export interface LayoutOptions {
  seed: number;
  /** 0..1 fraction of the venue that is filled. */
  fill: number;
  maxCount: number;
  characterCount: number;
  camera: { x: number; y: number; z: number };
  /** >1 pushes high-detail further out (setting "Character Density"). */
  detailBias: number;
  /** Circles people must not stand in (pillars, furniture). */
  exclusions?: { x: number; z: number; r: number }[];
}

export function generateLayout(regions: CrowdRegion[], o: LayoutOptions): PersonSpawn[] {
  const rnd = mulberry32(o.seed);
  const raw: PersonSpawn[] = [];
  for (const r of regions) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cell = Math.sqrt(1 / r.density);
    const nx = Math.max(1, Math.round(w / cell));
    const nz = Math.max(1, Math.round(d / cell));
    const cw = w / nx;
    const cd = d / nz;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        // Skip a few cells so the crowd has gaps and clusters rather than a perfect grid.
        if (rnd() < 0.06) continue;
        const x = r.x0 + (ix + 0.5 + (rnd() - 0.5) * 0.85) * cw;
        const z = r.z0 + (iz + 0.5 + (rnd() - 0.5) * 0.85) * cd;
        if (o.exclusions?.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue;
        const dx = x - o.camera.x;
        const dz = z - o.camera.z;
        const dist = Math.hypot(dx, dz);
        const facing = r.facing ?? 0.88;
        // Models face +Z and the DJ/camera is at +Z, so yaw ≈ 0 means "facing the DJ".
        const yaw = rnd() < facing ? (rnd() - 0.5) * 0.7 : (rnd() - 0.5) * Math.PI * 1.4;
        // Arrival: front rows first (dance floor fills from the stage), balconies later.
        const arrival = Math.min(1, Math.max(0, (dist / 40) * 0.75 + rnd() * 0.3 + (r.arrivalBias ?? 0)));
        let lod: 0 | 1 | 2 = dist / o.detailBias < 11 ? 0 : dist / o.detailBias < 26 ? 1 : 2;
        if (r.minLod !== undefined && lod < r.minLod) lod = r.minLod;
        const layer: PersonSpawn['layer'] = r.kind === 'balcony' ? 4 : dist < 7 ? 1 : dist < 18 ? 2 : dist < 32 ? 3 : 5;
        raw.push({
          x, y: r.y, z, yaw,
          height: 0.95 + rnd() * 0.1,
          width: 0.94 + rnd() * 0.12,
          char: 0,
          lod, layer, region: r.kind, arrival,
        });
      }
    }
  }

  // Fill fraction: keep people with the lowest arrival rank (front of the room first).
  raw.sort((a, b) => a.arrival - b.arrival);
  const keepFill = Math.max(1, Math.round(raw.length * o.fill));
  let people = raw.slice(0, keepFill);

  // Hard cap by quality: the front of the room stays packed, the far crowd is thinned evenly.
  if (people.length > o.maxCount) {
    const dense = Math.floor(o.maxCount * 0.55);
    const rest = o.maxCount - dense;
    const tail = people.slice(dense);
    const stride = tail.length / rest;
    const kept = people.slice(0, dense);
    for (let i = 0; i < rest; i++) kept.push(tail[Math.floor(i * stride)]);
    people = kept;
  }
  // Re-normalise arrival to [0,1] within the kept set.
  people.forEach((p, i) => (p.arrival = people.length > 1 ? i / (people.length - 1) : 0));
  // Shuffle assignment order, then give every person a character different from nearby neighbours.
  const order = people.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const grid = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.floor(x / 1.3)},${Math.floor(z / 1.3)}`;
  const usage = new Array(o.characterCount).fill(0);
  for (const idx of order) {
    const p = people[idx];
    const near = new Set<number>();
    const cx = Math.floor(p.x / 1.3), cz = Math.floor(p.z / 1.3);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${cx + dx},${cz + dz}`);
        if (list) for (const c of list) near.add(c);
      }
    }
    const candidates: number[] = [];
    for (let c = 0; c < o.characterCount; c++) if (!near.has(c)) candidates.push(c);
    const pool = candidates.length ? candidates : [...Array(o.characterCount).keys()];
    // among the allowed, favour the least-used so the mix stays even
    pool.sort((a, b) => usage[a] - usage[b] + (rnd() - 0.5) * 3);
    const c = pool[0];
    p.char = c;
    usage[c]++;
    const k = key(p.x, p.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(c);
  }
  return people;
}
