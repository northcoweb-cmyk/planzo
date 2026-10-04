import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterSpec } from './characters';
import type { CharacterAsset } from './CharacterAssets';
import { FLAG, PART, PELVIS_Y, type LodLevel } from './CharacterGeometry';

/**
 * Turns a "rigged-by-name" GLB into the crowd's instanced-mesh format, so a real character can
 * replace a procedural placeholder without touching the crowd engine.
 *
 * Authoring convention (metres, feet on y = 0, character facing +Z, pelvis ≈ y 0.92):
 *   Meshes, named (case/underscores ignored): pelvis · torso · head · hair · upperArmL · foreArmL ·
 *   upperArmR · foreArmR · thighL · shinL · thighR · shinR.  Optional props: phone, phoneScreen, cup
 *   (modelled attached to the R hand, rest pose with the arm hanging down).
 *   "L" is the character's left hand side (+X in the file). Mesh names may carry suffixes (torso_jacket).
 *   Optional Empty nodes to place joints exactly: pivot_neck, pivot_shoulderL/R, pivot_elbowL/R,
 *   pivot_hipL/R, pivot_kneeL/R. Missing pivots are derived from each mesh's bounding box.
 *   Colour comes from vertex colours if present, otherwise the material's base colour.
 *   Material names containing "skin" / "hair" opt into skin / hair tinting rules.
 */
type V3 = [number, number, number];

interface PartInfo { part: number; side?: 'L' | 'R'; kind: string }

const norm = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '');

function classify(name: string): PartInfo | null {
  const n = norm(name);
  const side = /l$|left$/.test(n) ? 'L' : /r$|right$/.test(n) ? 'R' : undefined;
  const has = (s: string) => n.startsWith(s);
  if (has('phonescreen')) return { part: PART.FORE_B, kind: 'screen' };
  if (has('phone')) return { part: PART.FORE_B, kind: 'phone' };
  if (has('cup')) return { part: PART.FORE_B, kind: 'cup' };
  if (has('pelvis') || has('hips')) return { part: PART.PELVIS, kind: 'pelvis' };
  if (has('torso') || has('chest') || has('spine')) return { part: PART.TORSO, kind: 'torso' };
  if (has('head') || has('hair')) return { part: PART.HEAD, kind: has('hair') ? 'hair' : 'head' };
  if (has('upperarm')) return { part: side === 'R' ? PART.UPPER_B : PART.UPPER_A, side, kind: 'upperArm' };
  if (has('forearm') || has('lowerarm')) return { part: side === 'R' ? PART.FORE_B : PART.FORE_A, side, kind: 'foreArm' };
  if (has('thigh') || has('upperleg')) return { part: side === 'R' ? PART.THIGH_B : PART.THIGH_A, side, kind: 'thigh' };
  if (has('shin') || has('lowerleg') || has('calf')) return { part: side === 'R' ? PART.SHIN_B : PART.SHIN_A, side, kind: 'shin' };
  return null;
}

function findPivot(root: THREE.Object3D, key: string): THREE.Vector3 | null {
  let found: THREE.Vector3 | null = null;
  root.traverse((o) => {
    if (!found && norm(o.name) === norm('pivot' + key)) found = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  });
  return found;
}

export function convertRiggedScene(scene: THREE.Object3D): THREE.BufferGeometry {
  scene.updateMatrixWorld(true);
  const bbox = new THREE.Box3();
  const tmp = new THREE.Box3();
  const meshes: { mesh: THREE.Mesh; info: PartInfo; box: THREE.Box3 }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const info = classify(mesh.name);
    if (!info) return;
    tmp.setFromObject(mesh);
    meshes.push({ mesh, info, box: tmp.clone() });
    bbox.union(tmp);
  });
  if (!meshes.length) throw new Error('GLB has no recognisable rig-part meshes (see crowd/GlbCharacter.ts for naming)');

  const boxOf = (p: number) => {
    const b = new THREE.Box3();
    for (const m of meshes) if (m.info.part === p && m.info.kind !== 'phone' && m.info.kind !== 'screen' && m.info.kind !== 'cup') b.union(m.box);
    return b.isEmpty() ? null : b;
  };
  const top = (p: number): V3 => { const b = boxOf(p); return b ? [(b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2] : [0, PELVIS_Y, 0]; };
  const bottom = (p: number): V3 => { const b = boxOf(p); return b ? [(b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2] : [0, PELVIS_Y - 0.4, 0]; };
  const pv = (key: string, fallback: V3): V3 => { const v = findPivot(scene, key); return v ? [v.x, v.y, v.z] : fallback; };

  const pivots: Record<number, { a: V3; b: V3 }> = {};
  const shA = pv('shoulderL', top(PART.UPPER_A)), shB = pv('shoulderR', top(PART.UPPER_B));
  const elA = pv('elbowL', bottom(PART.UPPER_A)), elB = pv('elbowR', bottom(PART.UPPER_B));
  const hipA = pv('hipL', top(PART.THIGH_A)), hipB = pv('hipR', top(PART.THIGH_B));
  const knA = pv('kneeL', bottom(PART.THIGH_A)), knB = pv('kneeR', bottom(PART.THIGH_B));
  const neck = pv('neck', (() => { const b = boxOf(PART.HEAD); return b ? [0, b.min.y + 0.02, 0] as V3 : [0, 1.47, 0] as V3; })());
  pivots[PART.UPPER_A] = { a: shA, b: elA }; pivots[PART.FORE_A] = { a: shA, b: elA };
  pivots[PART.UPPER_B] = { a: shB, b: elB }; pivots[PART.FORE_B] = { a: shB, b: elB };
  pivots[PART.THIGH_A] = { a: hipA, b: knA }; pivots[PART.SHIN_A] = { a: hipA, b: knA };
  pivots[PART.THIGH_B] = { a: hipB, b: knB }; pivots[PART.SHIN_B] = { a: hipB, b: knB };
  pivots[PART.HEAD] = { a: neck, b: neck };
  pivots[PART.TORSO] = { a: [0, PELVIS_Y, 0], b: [0, PELVIS_Y, 0] };
  pivots[PART.PELVIS] = { a: [0, PELVIS_Y, 0], b: [0, PELVIS_Y, 0] };

  const geos: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const { mesh, info } of meshes) {
    let g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    // Colour: vertex colours win, else flat material colour.
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const hasVC = !!g.attributes.color;
    const col = new Float32Array(n * 3);
    c.copy(mat?.color ?? new THREE.Color(0x888888));
    const matName = (mat?.name ?? '').toLowerCase();
    let flag: number = FLAG.CLOTH;
    if (info.kind === 'screen') { flag = FLAG.SCREEN; c.set('#cfe2ff'); }
    else if (info.kind === 'phone') { flag = FLAG.PHONE; c.set('#101012'); }
    else if (info.kind === 'cup') flag = FLAG.CUP;
    else if (info.kind === 'hair' || matName.includes('hair')) flag = FLAG.HAIR;
    else if (info.kind === 'head' || matName.includes('skin')) flag = FLAG.SKIN;
    for (let i = 0; i < n; i++) {
      if (hasVC) {
        col[i * 3] = g.attributes.color.getX(i); col[i * 3 + 1] = g.attributes.color.getY(i); col[i * 3 + 2] = g.attributes.color.getZ(i);
      } else { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    }
    const pf = new Float32Array(n * 2);
    const pa = new Float32Array(n * 3);
    const pb = new Float32Array(n * 3);
    const pr = pivots[info.part];
    for (let i = 0; i < n; i++) {
      pf[i * 2] = info.part; pf[i * 2 + 1] = flag;
      pa.set(pr.a, i * 3); pb.set(pr.b, i * 3);
    }
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPF', new THREE.BufferAttribute(pf, 2));
    g.setAttribute('aPivotA', new THREE.BufferAttribute(pa, 3));
    g.setAttribute('aPivotB', new THREE.BufferAttribute(pb, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  if (!merged) throw new Error('GLB geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

export class GlbCharacterAsset implements CharacterAsset {
  readonly isPlaceholder = false;
  constructor(readonly spec: CharacterSpec, private readonly geometry: THREE.BufferGeometry) {}
  get id(): string { return this.spec.id; }
  getGeometry(_lod: LodLevel): THREE.BufferGeometry {
    return this.geometry;
  }
}

export async function loadGlbCharacter(spec: CharacterSpec, url: string): Promise<GlbCharacterAsset> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return new GlbCharacterAsset(spec, convertRiggedScene(gltf.scene));
}
