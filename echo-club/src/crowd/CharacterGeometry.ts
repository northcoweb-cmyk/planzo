import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterSpec } from './characters';

/** Rig part ids — the contract between geometry and the crowd vertex shader (and any imported model). */
export const PART = {
  PELVIS: 0,
  HEAD: 1,
  UPPER_A: 2,
  FORE_A: 3,
  UPPER_B: 4,
  FORE_B: 5,
  THIGH_A: 6,
  SHIN_A: 7,
  THIGH_B: 8,
  SHIN_B: 9,
  TORSO: 10,
} as const;

/** Material flag per vertex: drives per-instance tinting, phone/cup visibility and emissive screens. */
export const FLAG = { CLOTH: 0, SKIN: 1, HAIR: 2, PHONE: 3, SCREEN: 4, CUP: 5, ACCENT: 6, DARK: 7 } as const;

export const PELVIS_Y = 0.92;
const SHOULDER_Y = 1.42;
const UPPER_ARM = 0.29;
const FOREARM = 0.26;
const THIGH = 0.42;
const SHIN = 0.42;
const NECK_Y = 1.47;

type V3 = [number, number, number];
interface Opts {
  part: number;
  flag: number;
  color: string;
  pivotA?: V3;
  pivotB?: V3;
}

export type LodLevel = 0 | 1 | 2;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

class Builder {
  private geos: THREE.BufferGeometry[] = [];
  constructor(public readonly lod: LodLevel) {}

  add(geo: THREE.BufferGeometry, o: Opts, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]): void {
    _e.set(rot[0], rot[1], rot[2], 'XYZ');
    _q.setFromEuler(_e);
    _p.set(pos[0], pos[1], pos[2]);
    _s.set(scl[0], scl[1], scl[2]);
    _m.compose(_p, _q, _s);
    geo.applyMatrix4(_m);
    if (geo.index === null) geo = geo.toNonIndexed(); // keep merge happy for all-indexed sets below
    const n = geo.attributes.position.count;
    _c.set(o.color);
    const col = new Float32Array(n * 3);
    const pf = new Float32Array(n * 2);
    const pa = new Float32Array(n * 3);
    const pb = new Float32Array(n * 3);
    const A = o.pivotA ?? [0, PELVIS_Y, 0];
    const B = o.pivotB ?? A;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      pf[i * 2] = o.part; pf[i * 2 + 1] = o.flag;
      pa[i * 3] = A[0]; pa[i * 3 + 1] = A[1]; pa[i * 3 + 2] = A[2];
      pb[i * 3] = B[0]; pb[i * 3 + 1] = B[1]; pb[i * 3 + 2] = B[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPF', new THREE.BufferAttribute(pf, 2));
    geo.setAttribute('aPivotA', new THREE.BufferAttribute(pa, 3));
    geo.setAttribute('aPivotB', new THREE.BufferAttribute(pb, 3));
    geo.deleteAttribute('uv');
    this.geos.push(geo);
  }

  get segs(): number { return this.lod === 0 ? 14 : this.lod === 1 ? 8 : 5; }
  get sphereW(): number { return this.lod === 0 ? 14 : this.lod === 1 ? 8 : 6; }
  get sphereH(): number { return this.lod === 0 ? 10 : this.lod === 1 ? 6 : 4; }

  /** Surface of revolution; `profile` = [radius, y] ascending in y. Ends are closed. */
  lathe(profile: [number, number][], o: Opts, pos?: V3, rot?: V3, scl?: V3): void {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    pts.unshift(new THREE.Vector2(0.0001, profile[0][1]));
    pts.push(new THREE.Vector2(0.0001, profile[profile.length - 1][1]));
    this.add(new THREE.LatheGeometry(pts, this.segs), o, pos, rot, scl);
  }

  sphere(r: number, o: Opts, pos?: V3, scl?: V3, rot?: V3): void {
    this.add(new THREE.SphereGeometry(r, this.sphereW, this.sphereH), o, pos, rot, scl);
  }

  box(w: number, h: number, d: number, o: Opts, pos?: V3, rot?: V3): void {
    this.add(new THREE.BoxGeometry(w, h, d), o, pos, rot);
  }

  cap(r: number, thetaLen: number, o: Opts, pos: V3, tilt: number, scl: V3 = [1, 1, 1]): void {
    this.add(new THREE.SphereGeometry(r, this.sphereW, this.sphereH, 0, Math.PI * 2, 0, thetaLen), o, pos, [tilt, 0, 0], scl);
  }

  capsule(r: number, len: number, o: Opts, pos: V3, rot?: V3, scl?: V3): void {
    this.add(new THREE.CapsuleGeometry(r, len, Math.max(2, this.sphereH - 2), Math.max(6, this.sphereW - 2)), o, pos, rot, scl);
  }

  build(): THREE.BufferGeometry {
    const geos = this.geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(geos, false);
    if (!merged) throw new Error('character geometry merge failed');
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Linear interpolation across [y, r] control points. */
function profileFn(pts: [number, number][]): (y: number) => number {
  return (y) => {
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (y <= pts[i][0]) {
        const t = (y - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
        return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t * t * (3 - 2 * t);
      }
    }
    return pts[pts.length - 1][1];
  };
}

/** Tapered limb profile, ascending in y, local origin at the joint (top). */
function limb(length: number, rTop: number, rMid: number, rEnd: number, steps = 3): [number, number][] {
  const out: [number, number][] = [];
  for (let i = steps; i >= 0; i--) {
    const t = i / steps; // 1 = end (bottom), 0 = joint (top)
    const r = t < 0.35 ? rTop + (rMid - rTop) * (t / 0.35) : rMid + (rEnd - rMid) * ((t - 0.35) / 0.65);
    out.push([r, -length * t]);
  }
  return out;
}

export function buildCharacterGeometry(spec: CharacterSpec, lod: LodLevel): THREE.BufferGeometry {
  const b = new Builder(lod);
  const sx = spec.shoulder;
  const hipX = 0.092;
  const top = spec.top;
  const female = spec.gender === 'female';
  const dress = top.kind === 'dress';
  const sleeveType: 'none' | 'short' | 'long' =
    top.kind === 'hoodie' || top.kind === 'jacket' ? 'long'
      : top.kind === 'oversizedTee' || top.kind === 'tee' || top.kind === 'buttonUp' ? 'short' : 'none';
  const oversize = top.kind === 'oversizedTee' ? 0.034 : top.kind === 'hoodie' ? 0.036 : top.kind === 'jacket' ? 0.016 : top.kind === 'buttonUp' ? 0.018 : 0.006;

  const ax = sx - 0.01;
  const shoulderA: V3 = [ax, SHOULDER_Y, 0];
  const shoulderB: V3 = [-ax, SHOULDER_Y, 0];
  const elbowA: V3 = [ax, SHOULDER_Y - UPPER_ARM, 0];
  const elbowB: V3 = [-ax, SHOULDER_Y - UPPER_ARM, 0];
  const hipA: V3 = [hipX, PELVIS_Y, 0];
  const hipB: V3 = [-hipX, PELVIS_Y, 0];
  const kneeA: V3 = [hipX, PELVIS_Y - THIGH, 0];
  const kneeB: V3 = [-hipX, PELVIS_Y - THIGH, 0];
  const neck: V3 = [0, NECK_Y, 0];
  const pelvisPivot: V3 = [0, PELVIS_Y, 0];

  const skin = spec.skin;
  const cloth = (o: Partial<Opts>): Opts => ({ part: PART.TORSO, flag: FLAG.CLOTH, color: top.color, pivotA: pelvisPivot, ...o });
  const skinO = (o: Partial<Opts>): Opts => ({ part: PART.TORSO, flag: FLAG.SKIN, color: skin, pivotA: pelvisPivot, ...o });

  // ------------------------------------------------------------------ torso
  const rTorso = profileFn([
    [0.84, spec.hip * 0.98], [0.98, spec.waist * 1.06], [1.1, spec.waist], [1.22, spec.chest * 0.97],
    [1.33, spec.chest * 1.02], [1.4, spec.shoulder * 0.96], [1.445, 0.11], [1.485, 0.05],
  ]);
  const torsoYs = [0.86, 0.98, 1.1, 1.22, 1.33, 1.4, 1.45, 1.485];
  const dz = spec.torsoDepth;
  b.lathe(torsoYs.map((y) => [rTorso(y), y] as [number, number]), skinO({}), [0, 0, 0], [0, 0, 0], [1, 1, dz]);

  // clothing over the torso
  if (!dress || true) {
    const hem = Math.max(0.86, top.hem);
    const neckY = top.kind === 'tank' || top.kind === 'crop' || top.kind === 'fitted' || dress ? 1.4 : 1.445;
    const ys: number[] = [];
    const N = lod === 2 ? 4 : 7;
    for (let i = 0; i <= N; i++) ys.push(hem + ((neckY - hem) * i) / N);
    const boxy = top.kind === 'oversizedTee' || top.kind === 'hoodie';
    const prof = ys.map((y, i) => {
      let r = rTorso(y);
      if (boxy) r = r + (spec.chest * 0.98 - r) * 0.75 * (1 - i / N * 0.6);
      if (top.kind === 'tank' || dress) { /* snug */ }
      const neckTaper = y > 1.38 ? (y - 1.38) / 0.07 : 0;
      return [(r + oversize) * (1 - neckTaper * (top.kind === 'tank' || dress ? 0.35 : 0.05)), y] as [number, number];
    });
    b.lathe(prof, cloth({}), [0, 0, 0], [0, 0, 0], [1, 1, dz + (boxy ? 0.04 : 0.01)]);
    if (top.kind === 'hoodie' || top.kind === 'jacket') {
      // collar / hood bulge
      b.sphere(0.1, cloth({ color: top.color }), [0, 1.45, -0.055], [1.25, 0.55, 0.95]);
    }
    if (top.kind === 'jacket' && lod < 2) {
      b.box(0.075, 0.34, 0.012, cloth({ color: top.accent ?? '#ccc', flag: FLAG.ACCENT }), [0, 1.2, spec.chest * dz + 0.012]);
    }
    if (top.kind === 'buttonUp' && lod < 2) {
      b.box(0.012, 0.42, 0.006, cloth({ color: top.accent ?? '#555', flag: FLAG.ACCENT }), [0, 1.2, spec.chest * (dz + 0.01) + 0.02]);
      b.box(0.07, 0.04, 0.012, skinO({}), [0, 1.425, spec.chest * 0.5], [0.4, 0, 0]);
    }
  }

  // ------------------------------------------------------------------ pelvis + legs
  const bt = spec.bottom;
  const baggy = bt.baggy;
  const pantsC: Opts = { part: PART.PELVIS, flag: FLAG.CLOTH, color: bt.color, pivotA: pelvisPivot };
  if (bt.kind === 'dress' || bt.kind === 'skirt') {
    const skirtColor = dress ? top.color : bt.color;
    b.lathe(
      [[spec.hip * 1.35, top.hem], [spec.hip * 1.18, (top.hem + PELVIS_Y + 0.1) / 2], [spec.hip * 1.0, PELVIS_Y + 0.1]],
      { ...pantsC, color: skirtColor }, [0, 0, 0], [0, 0, 0], [1, 1, 0.78],
    );
  } else {
    b.lathe(
      [[spec.hip * 0.92, 0.78], [spec.hip * 1.04, 0.88], [spec.hip * 1.0, 0.96], [spec.waist * 1.08, 1.02]],
      pantsC, [0, 0, 0], [0, 0, 0], [1, 1, 0.68],
    );
  }
  const bare = bt.kind === 'dress' || bt.kind === 'skirt';
  const legColor = bare ? skin : bt.color;
  const legFlag = bare ? FLAG.SKIN : FLAG.CLOTH;
  for (const side of [1, -1] as const) {
    const hip = side === 1 ? hipA : hipB;
    const knee = side === 1 ? kneeA : kneeB;
    const thighPart = side === 1 ? PART.THIGH_A : PART.THIGH_B;
    const shinPart = side === 1 ? PART.SHIN_A : PART.SHIN_B;
    const k = bare ? 0.9 : baggy;
    b.lathe(limb(THIGH + 0.02, 0.088 * k, 0.082 * k, 0.07 * k), { part: thighPart, flag: legFlag, color: legColor, pivotA: hip, pivotB: knee }, [hip[0], hip[1], 0]);
    const bootsUp = spec.id === 'character10';
    b.lathe(
      limb(SHIN, 0.068 * k, bare ? 0.052 : 0.06 * k, bare ? 0.038 : 0.052 * k * (baggy > 1.2 ? 1.28 : 1.1)),
      { part: shinPart, flag: legFlag, color: legColor, pivotA: hip, pivotB: knee }, [knee[0], knee[1], 0],
    );
    if (bootsUp) {
      b.lathe(limb(0.3, 0.062, 0.05, 0.05), { part: shinPart, flag: FLAG.CLOTH, color: spec.shoes.color, pivotA: hip, pivotB: knee }, [knee[0], knee[1] - 0.1, 0]);
    }
    // shoe + sole
    b.sphere(1, { part: shinPart, flag: FLAG.ACCENT, color: spec.shoes.color, pivotA: hip, pivotB: knee }, [knee[0], 0.058, 0.05], [0.056, 0.05, 0.138]);
    if (lod < 2) b.box(0.1, 0.02, 0.27, { part: shinPart, flag: FLAG.ACCENT, color: spec.shoes.sole, pivotA: hip, pivotB: knee }, [knee[0], 0.012, 0.05]);
  }

  // ------------------------------------------------------------------ arms
  const sleeveR = top.kind === 'oversizedTee' ? 0.064 : top.kind === 'hoodie' ? 0.062 : top.kind === 'jacket' ? 0.054 : 0.054;
  for (const side of [1, -1] as const) {
    const sh = side === 1 ? shoulderA : shoulderB;
    const el = side === 1 ? elbowA : elbowB;
    const upPart = side === 1 ? PART.UPPER_A : PART.UPPER_B;
    const foPart = side === 1 ? PART.FORE_A : PART.FORE_B;
    const ua = { part: upPart, pivotA: sh, pivotB: el };
    const fa = { part: foPart, pivotA: sh, pivotB: el };
    const rs = female ? 0.044 : 0.05;
    // bare upper arm
    b.lathe(limb(UPPER_ARM + 0.01, rs, rs * 0.92, rs * 0.78), { ...ua, flag: FLAG.SKIN, color: skin }, [sh[0], sh[1], 0]);
    if (sleeveType === 'short') {
      const len = top.kind === 'oversizedTee' ? 0.18 : 0.14;
      b.lathe(limb(len, sleeveR, sleeveR * 1.04, sleeveR * 1.02, 2), { ...ua, flag: FLAG.CLOTH, color: top.color }, [sh[0], sh[1] + 0.012, 0]);
    } else if (sleeveType === 'long') {
      b.lathe(limb(UPPER_ARM + 0.01, sleeveR, sleeveR * 0.95, sleeveR * 0.85), { ...ua, flag: FLAG.CLOTH, color: top.color }, [sh[0], sh[1] + 0.012, 0]);
    }
    // shoulder cap on torso so the joint never gaps
    b.sphere(sleeveType === 'none' ? 0.05 : sleeveR * 1.02, { part: PART.TORSO, flag: sleeveType === 'none' ? FLAG.SKIN : FLAG.CLOTH, color: sleeveType === 'none' ? skin : top.color, pivotA: pelvisPivot }, [sh[0], sh[1] - 0.005, 0]);
    // forearm
    b.lathe(limb(FOREARM + 0.01, rs * 0.78, rs * 0.68, rs * 0.52), { ...fa, flag: FLAG.SKIN, color: skin }, [el[0], el[1] + 0.005, 0]);
    if (sleeveType === 'long') {
      b.lathe(limb(FOREARM * 0.82, sleeveR * 0.82, sleeveR * 0.72, sleeveR * 0.66, 2), { ...fa, flag: FLAG.CLOTH, color: top.color }, [el[0], el[1] + 0.008, 0]);
    }
    // hand
    b.sphere(0.036, { ...fa, flag: FLAG.SKIN, color: skin }, [el[0], el[1] - FOREARM - 0.03, 0.004], [1, 1.3, 0.75]);
    if (lod === 0) b.sphere(0.014, { ...fa, flag: FLAG.SKIN, color: skin }, [el[0] + side * -0.03, el[1] - FOREARM - 0.015, 0.018], [1, 1.5, 1]);
  }

  // ------------------------------------------------------------------ props that live on the "B" hand
  if (lod < 2) {
    const el = elbowB;
    const fa = { part: PART.FORE_B, pivotA: shoulderB, pivotB: elbowB };
    // Phone: oriented so that the screen faces +Z (towards the DJ) when the arm is raised and bent.
    // Rest pose normal is therefore (0,-0.33,-0.94); we rotate a thin box accordingly.
    const phoneRot: V3 = [Math.PI - 0.34, 0, 0];
    const hand: V3 = [el[0], el[1] - FOREARM - 0.045, 0.012];
    b.box(0.07, 0.145, 0.01, { ...fa, flag: FLAG.PHONE, color: '#101012' }, hand, phoneRot);
    // screen sits on the face the camera sees (local -Z of the rest box => offset along rotated normal)
    const sOff = new THREE.Vector3(0, 0, 0.0056).applyEuler(new THREE.Euler(phoneRot[0], 0, 0));
    b.box(0.062, 0.132, 0.002, { ...fa, flag: FLAG.SCREEN, color: '#cfe2ff' }, [hand[0] + sOff.x, hand[1] + sOff.y, hand[2] + sOff.z], phoneRot);
    // Drink cup
    b.add(new THREE.CylinderGeometry(0.034, 0.028, 0.1, 8), { ...fa, flag: FLAG.CUP, color: '#6f7f8c' }, [el[0], el[1] - FOREARM - 0.045, 0.03]);
  }

  // ------------------------------------------------------------------ head
  const headC: V3 = [0, 1.64, 0.003];
  const headO: Opts = { part: PART.HEAD, flag: FLAG.SKIN, color: skin, pivotA: neck };
  b.lathe(limb(0.16, 0.043, 0.042, 0.047, 2).map(([r, y]) => [r, y + 0.1] as [number, number]), headO, [0, NECK_Y + 0.07, 0]);
  b.sphere(0.1, headO, headC, [0.9, 1.14, 1.02]);
  // jaw
  if (lod < 2) b.sphere(0.07, headO, [0, 1.6, 0.012], [0.95, 0.9, 1]);
  if (lod === 0) {
    const dark: Opts = { part: PART.HEAD, flag: FLAG.DARK, color: '#150e0c', pivotA: neck };
    b.sphere(0.012, headO, [0, 1.632, 0.099], [1, 1.3, 1.2]); // nose
    for (const s of [-1, 1]) {
      b.sphere(0.011, dark, [s * 0.034, 1.655, 0.08], [1.3, 0.9, 0.5]); // eyes
      b.box(0.034, 0.005, 0.01, { ...dark, color: spec.hair.color }, [s * 0.034, 1.678, 0.083], [0, 0, s * -0.1]); // brows
      b.sphere(0.014, headO, [s * 0.084, 1.64, 0], [0.5, 1.2, 0.9]); // ears
    }
    b.box(0.03, 0.006, 0.01, { ...dark, color: '#5a2a2a' }, [0, 1.593, 0.081]); // mouth
  }

  // ------------------------------------------------------------------ hair
  const hairO: Opts = { part: PART.HEAD, flag: FLAG.HAIR, color: spec.hair.color, pivotA: neck };
  const hairStyle = spec.hair.style;
  if (hairStyle === 'short') b.cap(0.108, Math.PI * 0.47, hairO, [0, 1.658, -0.004], -0.3, [0.93, 1.1, 1.04]);
  if (hairStyle === 'buzz') b.cap(0.103, Math.PI * 0.43, hairO, [0, 1.658, -0.003], -0.28, [0.92, 1.12, 1.03]);
  if (hairStyle === 'long' || hairStyle === 'ponytail' || hairStyle === 'bun') b.cap(0.108, Math.PI * 0.5, hairO, [0, 1.658, -0.006], -0.32, [0.94, 1.1, 1.05]);
  if (hairStyle === 'long') {
    b.capsule(0.095, 0.3, hairO, [0, 1.5, -0.07], [0, 0, 0], [1.02, 1, 0.5]);
    if (lod < 2) for (const s of [-1, 1]) b.capsule(0.03, 0.26, hairO, [s * 0.09, 1.5, 0.0]);
  }
  if (hairStyle === 'ponytail') {
    b.capsule(0.03, 0.2, hairO, [0, 1.6, -0.15], [0.55, 0, 0]);
    b.sphere(0.034, hairO, [0, 1.69, -0.1]);
  }
  if (hairStyle === 'curly') {
    b.cap(0.11, Math.PI * 0.5, hairO, [0, 1.658, -0.006], -0.3, [1.0, 1.1, 1.04]);
    b.sphere(0.125, hairO, [0, 1.73, -0.012], [1.1, 0.78, 1.05]);
    if (lod < 2) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.sphere(0.036, hairO, [Math.sin(a) * 0.115, 1.68 + (i % 2) * 0.03, Math.cos(a) * 0.1 - 0.02]);
      }
    }
  }

  // ------------------------------------------------------------------ accessories
  const acc = spec.accessories;
  if (acc.includes('cap')) {
    const capO: Opts = { part: PART.HEAD, flag: FLAG.CLOTH, color: spec.capColor ?? '#111', pivotA: neck };
    b.cap(0.108, Math.PI * 0.48, capO, [0, 1.662, -0.004], -0.12, [0.94, 1.1, 1.06]);
    b.add(new THREE.CylinderGeometry(0.108, 0.108, 0.008, lod === 0 ? 14 : 8, 1, false, -Math.PI / 2, Math.PI), capO, [0, 1.686, 0.075], [0.18, 0, 0], [1, 1, 1.05]);
  }
  if (acc.includes('sunglasses') && lod < 2) {
    const g: Opts = { part: PART.HEAD, flag: FLAG.DARK, color: '#050506', pivotA: neck };
    for (const s of [-1, 1]) b.box(0.056, 0.036, 0.012, g, [s * 0.034, 1.655, 0.086]);
    b.box(0.02, 0.008, 0.01, g, [0, 1.662, 0.088]);
    if (lod === 0) for (const s of [-1, 1]) b.box(0.006, 0.008, 0.1, g, [s * 0.075, 1.66, 0.04]);
  }
  if (acc.includes('chain') && lod < 2) {
    b.add(new THREE.TorusGeometry(0.08, 0.0085, 6, 16), { part: PART.TORSO, flag: FLAG.ACCENT, color: '#d9b45a', pivotA: pelvisPivot }, [0, 1.4, 0.035], [Math.PI / 2 - 0.5, 0, 0], [1, 1.35, 1]);
  }
  if (acc.includes('bag') && lod < 2) {
    const bagO: Opts = { part: PART.PELVIS, flag: FLAG.ACCENT, color: '#3b2a1f', pivotA: pelvisPivot };
    b.box(0.13, 0.095, 0.055, bagO, [-0.19, 0.93, 0.045]);
    b.add(new THREE.BoxGeometry(0.014, 0.66, 0.01), { part: PART.TORSO, flag: FLAG.ACCENT, color: '#3b2a1f', pivotA: pelvisPivot }, [-0.02, 1.18, spec.chest * dz + 0.03], [0, 0, 0.5]);
  }

  return b.build();
}
