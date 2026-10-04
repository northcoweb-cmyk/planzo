import * as THREE from 'three';
import type { VenueId } from '../../core/types';
import { at, box, cyl, group, plane, rotated, seeded } from '../Primitives';
import {
  balcony, bar, ceilingPlane, entrance, hallway, loungeArea, neonSign, pillar, plant, stairs, tablesAndStools, truss, wallSection, windowWall,
} from '../architecture/parts';
import type { BuildContext } from '../architecture/BuildContext';
import { LedWall } from '../LedWall';
import { boothSpeakers, crowdBarrier, frontOfStage, hallShell } from './common';
import type { VenueBuild, VenueDefinition } from './VenueTypes';

/* ------------------------------------------------------------------------------------------ */
/* helpers                                                                                     */
/* ------------------------------------------------------------------------------------------ */
function addRig(
  ctx: BuildContext, root: THREE.Group,
  o: { z: number; y: number; halfLen: number; heads: number; group: string; strobes?: number; trussSize?: number },
): void {
  const t = truss(ctx, o.halfLen * 2, o.trussSize ?? 0.5);
  t.position.set(0, o.y, o.z);
  root.add(t);
  for (const s of [-1, 1]) {
    // suspension cables
    root.add(at(cyl(0.015, 0.015, 30, ctx.mats.steel(), 4), s * (o.halfLen - 0.5), o.y + 15, o.z));
  }
  for (let i = 0; i < o.heads; i++) {
    const u = o.heads > 1 ? i / (o.heads - 1) : 0.5;
    const x = -o.halfLen * 0.92 + u * o.halfLen * 1.84;
    ctx.fixtures.push({ kind: 'moving', pos: [x, o.y - 0.38, o.z], group: o.group, side: x < 0 ? -1 : 1 });
  }
  const sc = o.strobes ?? 0;
  for (let i = 0; i < sc; i++) {
    const x = -o.halfLen * 0.7 + (i / Math.max(1, sc - 1)) * o.halfLen * 1.4;
    ctx.fixtures.push({ kind: 'strobe', pos: [x, o.y - 0.45, o.z + 0.5] });
  }
}

function ledWall(ctx: BuildContext, root: THREE.Group, w: number, h: number, x: number, y: number, z: number): LedWall {
  const wall = new LedWall(w, h, ctx.mats.blackMetal());
  wall.object.position.set(x, y, z);
  root.add(wall.object);
  ctx.ledWalls.push(wall);
  return wall;
}

function pendants(ctx: BuildContext, root: THREE.Group, positions: [number, number, number][]): void {
  for (const p of positions) {
    root.add(at(cyl(0.008, 0.008, 3, ctx.mats.steel(), 4), p[0], p[1] + 1.6, p[2]));
    root.add(at(cyl(0.05, 0.4, 0.3, ctx.mats.blackMetal(), 16), p[0], p[1] + 0.12, p[2]));
    ctx.fixtures.push({ kind: 'ceiling', pos: [p[0], p[1] - 0.05, p[2]], size: 0.8 });
  }
}

/* ------------------------------------------------------------------------------------------ */
/* DC NIGHT — upscale underground club, dark luxury                                            */
/* ------------------------------------------------------------------------------------------ */
function buildDcNight(ctx: BuildContext): VenueBuild {
  const root = new THREE.Group();
  const m = ctx.mats;
  const halfW = 18, zF = 4, zB = -37, H = 15;
  ctx.accent.set('#4f7dff');
  hallShell(ctx, root, { halfW, zFront: zF, zBack: zB, height: H, wall: 'concrete', gaps: [{ side: -1, z0: -27.5, z1: -30.5 }] });

  // balconies on both sides with glass railings
  for (const s of [-1, 1] as const) {
    const b = balcony(ctx, { length: 29, depth: 4.2, y: 4.6, open: s < 0 ? 'x+' : 'x-', supports: false });
    b.position.set(s * (halfW - 2.1), 0, -19.5);
    root.add(b);
    // stairs up to the balcony from the front
    const st = stairs(ctx, { width: 1.6, rise: 4.6, steps: 20, run: 0.27 });
    st.position.set(s * (halfW - 2.2), 0, 1.2);
    root.add(st);
    // columns in front of the balcony edge, floor to ceiling
    for (const z of [-9, -18, -27]) {
      const p = pillar(ctx, H, 1.0, true);
      p.position.set(s * (halfW - 5.0), 0, z);
      root.add(p);
      ctx.fixtures.push({ kind: 'back', pos: [s * (halfW - 5.0), 0.25, z + 0.9], side: s });
    }
  }
  // bar under the left balcony, lounge under the right
  const barG = bar(ctx, 13);
  barG.rotation.y = Math.PI / 2;
  barG.position.set(-halfW + 1.9, 0, -21);
  root.add(barG);
  const lounge = loungeArea(ctx);
  lounge.rotation.y = -Math.PI / 2;
  lounge.position.set(halfW - 3.2, 0, -22);
  root.add(lounge);
  const tbl = tablesAndStools(ctx, 3);
  tbl.rotation.y = Math.PI / 2;
  tbl.position.set(halfW - 1.8, 0, -8);
  root.add(tbl);

  // entrance corridor (left rear wall)
  const ent = entrance(ctx);
  ent.rotation.y = Math.PI / 2;
  ent.position.set(-halfW - 7.2, 0, -29);
  const hall = hallway(ctx, 7);
  hall.rotation.y = Math.PI / 2;
  hall.position.set(-halfW, 0, -29);
  root.add(hall, ent);

  // windows high on the walls
  for (const s of [-1, 1] as const) {
    const w = windowWall(ctx, 36, 6, '#8fb2ff');
    w.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    w.position.set(s * (halfW - 0.1), 8.5, -19);
    root.add(w);
  }

  // stage dressing & back wall
  const slats = wallSection(ctx, halfW * 2, H, 'slats');
  slats.position.set(0, 0, zB + 0.35);
  root.add(slats);
  ledWall(ctx, root, 21, 8.8, 0, 7.4, zB + 0.62);
  for (const s of [-1, 1]) ledWall(ctx, root, 2.2, 9.4, s * 13.2, 6.2, zB + 0.62);
  root.add(at(plane(halfW * 2, 6, m.floor(), 3), 0, 0.01, zB + 3));
  root.children[root.children.length - 1].visible = false;

  // lighting rigs
  addRig(ctx, root, { z: -10, y: 9.6, halfLen: 12, heads: 6, group: 'rigA', strobes: 4 });
  addRig(ctx, root, { z: -19, y: 10.0, halfLen: 12, heads: 6, group: 'rigB' });
  addRig(ctx, root, { z: -28, y: 10.4, halfLen: 12, heads: 6, group: 'rigC' });
  for (const s of [-1, 1]) {
    for (const z of [-12, -22, -31]) ctx.fixtures.push({ kind: 'moving', pos: [s * (halfW - 3.6), 5.1, z], group: `balcony${s}`, side: s });
    ctx.fixtures.push({ kind: 'laser', pos: [s * 9.5, 8.6, -6.5], side: s });
    ctx.fixtures.push({ kind: 'par', pos: [s * 4.8, 1.0, -2.4], side: s });
  }
  for (const x of [-9, -3, 3, 9]) ctx.fixtures.push({ kind: 'back', pos: [x, 0.4, zB + 1.2] });
  pendants(ctx, root, [[-14, 8.6, -6], [14, 8.6, -6], [-14, 8.6, -30], [14, 8.6, -30], [0, 8.8, -33]]);

  crowdBarrier(ctx, root, 12, -3.1);
  boothSpeakers(ctx, root);
  frontOfStage(ctx, root, -2.5);
  neonSignOnWall(ctx, root, 'ECHO', '#5f8bff', -halfW + 0.3, 6.1, -8, Math.PI / 2);

  // crowd
  ctx.crowdRegions.push(
    { id: 'floor-front', kind: 'floor', x0: -12.5, x1: 12.5, z0: -20, z1: -4.2, y: 0, density: 1.3 },
    { id: 'floor-back', kind: 'floor', x0: -12.5, x1: 12.5, z0: -34, z1: -20, y: 0, density: 0.85, arrivalBias: 0.06 },
    { id: 'bar-L', kind: 'bar', x0: -17, x1: -13.8, z0: -27.5, z1: -14.5, y: 0, density: 0.55, arrivalBias: 0.2, facing: 0.4 },
    { id: 'balcony-L', kind: 'balcony', x0: -17.3, x1: -14.3, z0: -33, z1: -6.5, y: 4.6, density: 0.6, minLod: 1, arrivalBias: 0.25 },
    { id: 'balcony-R', kind: 'balcony', x0: 14.3, x1: 17.3, z0: -33, z1: -6.5, y: 4.6, density: 0.6, minLod: 1, arrivalBias: 0.25 },
    { id: 'lounge-R', kind: 'lounge', x0: 12.8, x1: 15.6, z0: -26, z1: -17, y: 0, density: 0.3, minLod: 1, arrivalBias: 0.3, facing: 0.3 },
  );
  return {
    root,
    bounds: { x0: -11, x1: 11, z0: -7, z1: -31, wallZ: zB + 0.5, wallY: 6, ceilY: H },
    haze: { x0: -16, x1: 16, z0: -34, z1: -2, y0: 1.5, y1: 12 },
    background: '#04050a', fogColor: '#070a14', fogDensity: 0.011,
    exclusions: [], crowdSeed: 7,
    floor: { x0: -halfW, x1: halfW, z0: zB, z1: zF },
    lookAt: [0, 1.2, -16],
  };
}

function neonSignOnWall(ctx: BuildContext, root: THREE.Group, text: string, color: string, x: number, y: number, z: number, ry: number, w = 3.4): void {
  const s = neonSign(ctx, text, color, w);
  s.position.set(x, y, z);
  s.rotation.y = ry;
  root.add(s);
}

/* ------------------------------------------------------------------------------------------ */
/* WAREHOUSE — dark industrial house club                                                      */
/* ------------------------------------------------------------------------------------------ */
function buildWarehouse(ctx: BuildContext): VenueBuild {
  const root = new THREE.Group();
  const m = ctx.mats;
  const halfW = 24, zF = 4, zB = -46, H = 22;
  ctx.accent.set('#7fa6ff');
  hallShell(ctx, root, { halfW, zFront: zF, zBack: zB, height: H, wall: 'concrete' });
  // exposed roof trusses + columns
  for (let z = -4; z > zB; z -= 9) {
    const t = truss(ctx, halfW * 2, 0.9);
    t.position.set(0, H - 1.2, z);
    root.add(t);
  }
  const ex: { x: number; z: number; r: number }[] = [];
  for (const s of [-1, 1]) {
    for (let z = -6; z > zB + 3; z -= 11) {
      const p = pillar(ctx, H, 1.3, false);
      p.position.set(s * 14, 0, z);
      root.add(p);
      ex.push({ x: s * 14, z, r: 1.4 });
      ctx.fixtures.push({ kind: 'back', pos: [s * 14, 0.3, z + 1.1], side: s });
    }
  }
  // mezzanine on one side
  const mez = balcony(ctx, { length: 34, depth: 4.5, y: 5.2, open: 'x+', supports: false });
  mez.position.set(-halfW + 2.25, 0, -22);
  root.add(mez);
  for (const z of [-8, -24, -38]) {
    const p = pillar(ctx, 5.2, 0.7, false);
    p.position.set(-halfW + 4.4, 0, z);
    root.add(p);
  }
  const st = stairs(ctx, { width: 1.6, rise: 5.2, steps: 22, run: 0.27 });
  st.position.set(-halfW + 2.2, 0, 1.4);
  root.add(st);
  for (const s of [-1, 1] as const) {
    const w = windowWall(ctx, 40, 9, '#7aa0ff');
    w.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    w.position.set(s * (halfW - 0.1), 15.5, -20);
    root.add(w);
  }
  ledWall(ctx, root, 24, 9.5, 0, 8.2, zB + 0.6);
  const bg = bar(ctx, 11);
  bg.rotation.y = -Math.PI / 2;
  bg.position.set(halfW - 2, 0, -14);
  root.add(bg);
  addRig(ctx, root, { z: -12, y: 12.5, halfLen: 16, heads: 8, group: 'rigA', strobes: 4 });
  addRig(ctx, root, { z: -24, y: 13.5, halfLen: 16, heads: 8, group: 'rigB' });
  addRig(ctx, root, { z: -36, y: 14.5, halfLen: 16, heads: 8, group: 'rigC' });
  for (const s of [-1, 1]) {
    ctx.fixtures.push({ kind: 'laser', pos: [s * 12, 11.5, -8], side: s });
    ctx.fixtures.push({ kind: 'par', pos: [s * 4.8, 1.0, -2.4], side: s });
  }
  for (const x of [-12, -4, 4, 12]) ctx.fixtures.push({ kind: 'back', pos: [x, 0.4, zB + 1.2] });
  pendants(ctx, root, [[-10, 11, -8], [10, 11, -8], [-10, 12, -26], [10, 12, -26]]);
  crowdBarrier(ctx, root, 12, -3.1);
  boothSpeakers(ctx, root, 3.4, -2.9);
  frontOfStage(ctx, root, -2.5);
  ctx.crowdRegions.push(
    { id: 'floor-front', kind: 'floor', x0: -19, x1: 19, z0: -24, z1: -4.2, y: 0, density: 0.95 },
    { id: 'floor-back', kind: 'floor', x0: -19, x1: 19, z0: -42, z1: -24, y: 0, density: 0.55, arrivalBias: 0.06 },
    { id: 'mezz', kind: 'balcony', x0: -23, x1: -20.2, z0: -38, z1: -6.5, y: 5.2, density: 0.55, minLod: 1, arrivalBias: 0.25 },
  );
  void m;
  return {
    root, bounds: { x0: -16, x1: 16, z0: -7, z1: -40, wallZ: zB + 0.5, wallY: 7, ceilY: H },
    haze: { x0: -22, x1: 22, z0: -43, z1: -2, y0: 1.5, y1: 17 },
    background: '#03040a', fogColor: '#060912', fogDensity: 0.0095, exclusions: ex, crowdSeed: 21, floor: { x0: -halfW, x1: halfW, z0: zB, z1: zF }, lookAt: [0, 1.2, -18],
  };
}

/* ------------------------------------------------------------------------------------------ */
/* UNDERGROUND — small packed club, low ceiling, heavy haze                                    */
/* ------------------------------------------------------------------------------------------ */
function buildUnderground(ctx: BuildContext): VenueBuild {
  const root = new THREE.Group();
  const m = ctx.mats;
  const halfW = 10, zF = 4, zB = -27, H = 5.6;
  ctx.accent.set('#ff3050');
  hallShell(ctx, root, { halfW, zFront: zF, zBack: zB, height: H, wall: 'brick', ceiling: true });
  // brick arches along the ceiling
  for (let z = -2; z > zB; z -= 4.2) {
    root.add(at(box(halfW * 2, 0.6, 0.5, m.brick(), 2), 0, H - 0.5, z));
    for (const s of [-1, 1]) root.add(at(box(0.8, H - 1, 0.7, m.brick(), 2), s * (halfW - 0.45), (H - 1) / 2, z));
    root.add(ctx.strip('ceiling', [halfW * 1.6, 0.05, 0.05], [0, H - 0.82, z + 0.28], (z / zB)));
  }
  neonSignOnWall(ctx, root, 'ECHO', '#ff2f58', 0, 4.95, zB + 0.5, 0, 3.0);
  neonSignOnWall(ctx, root, 'HOUSE', '#4f7dff', -halfW + 0.3, 3.4, -7, Math.PI / 2, 2.4);
  ledWall(ctx, root, 10, 3.6, 0, 2.35, zB + 0.45);
  const slat = wallSection(ctx, halfW * 2, H, 'dark');
  slat.position.set(0, 0, zB + 0.3);
  slat.visible = false;
  addRig(ctx, root, { z: -9, y: 4.6, halfLen: 7, heads: 4, group: 'rigA', strobes: 2, trussSize: 0.36 });
  addRig(ctx, root, { z: -17, y: 4.6, halfLen: 7, heads: 4, group: 'rigB', trussSize: 0.36 });
  ctx.fixtures.push({ kind: 'laser', pos: [-6, 4.4, -5], side: -1 }, { kind: 'laser', pos: [6, 4.4, -5], side: 1 });
  for (const x of [-6, -2, 2, 6]) ctx.fixtures.push({ kind: 'back', pos: [x, 0.4, zB + 1.0] });
  for (const s of [-1, 1]) ctx.fixtures.push({ kind: 'par', pos: [s * 4.8, 1.0, -2.4], side: s });
  const bg = bar(ctx, 7);
  bg.rotation.y = Math.PI / 2;
  bg.position.set(-halfW + 1.9, 0, -16);
  root.add(bg);
  root.add(at(plant(ctx, 1), halfW - 1.2, 0, -6));
  crowdBarrier(ctx, root, 10, -3.1);
  boothSpeakers(ctx, root, 3.0, -2.8);
  frontOfStage(ctx, root, -2.5);
  ctx.crowdRegions.push(
    { id: 'floor', kind: 'floor', x0: -8.6, x1: 8.6, z0: -24, z1: -4.1, y: 0, density: 2.0 },
    { id: 'bar', kind: 'bar', x0: -9.2, x1: -7.2, z0: -19, z1: -12, y: 0, density: 0.6, minLod: 1, arrivalBias: 0.2, facing: 0.4 },
  );
  return {
    root, bounds: { x0: -7, x1: 7, z0: -6, z1: -22, wallZ: zB + 0.5, wallY: 2.5, ceilY: H },
    haze: { x0: -9, x1: 9, z0: -25, z1: -2, y0: 0.8, y1: 4.5 },
    background: '#030306', fogColor: '#0c0508', fogDensity: 0.03, exclusions: [], crowdSeed: 33, floor: { x0: -halfW, x1: halfW, z0: zB, z1: zF }, lookAt: [0, 1.2, -14], hazeScale: 2.6,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* ROOFTOP — open-air terrace with a Washington skyline                                        */
/* ------------------------------------------------------------------------------------------ */
function buildRooftop(ctx: BuildContext): VenueBuild {
  const root = new THREE.Group();
  const m = ctx.mats;
  ctx.accent.set('#7a8cff');
  const halfW = 15, zF = 4, zB = -38;
  // deck
  const deck = plane(halfW * 2, zF - zB, m.darkWood(), 3);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0, (zF + zB) / 2);
  root.add(deck);
  // parapet + glass railing
  for (const s of [-1, 1]) {
    root.add(at(box(0.4, 1.1, zF - zB, m.concrete(0.8), 2), s * (halfW + 0.2), 0.55, (zF + zB) / 2));
    root.add(at(box(0.04, 1.0, zF - zB, m.glass(), 1), s * (halfW + 0.2), 1.6, (zF + zB) / 2));
  }
  root.add(at(box(halfW * 2 + 0.8, 1.1, 0.4, m.concrete(0.8), 2), 0, 0.55, zB));
  root.add(at(box(halfW * 2 + 0.8, 1.0, 0.04, m.glass(), 1), 0, 1.6, zB));
  root.add(at(box(halfW * 2 + 0.8, 2.5, 0.4, m.concrete(0.7), 2), 0, 1.25, zF + 0.3));
  // stage structure: LED backdrop on tubular frame
  ledWall(ctx, root, 16, 6.5, 0, 5.2, zB + 2.6);
  addRig(ctx, root, { z: -9, y: 7.2, halfLen: 10, heads: 5, group: 'rigA', strobes: 2 });
  addRig(ctx, root, { z: -20, y: 7.8, halfLen: 10, heads: 5, group: 'rigB' });
  addRig(ctx, root, { z: -30, y: 8.4, halfLen: 10, heads: 5, group: 'rigC' });
  for (const s of [-1, 1]) {
    for (const z of [-9, -20, -30]) {
      root.add(at(box(0.3, 7.6, 0.3, m.blackMetal(), 1), s * 10.5, 3.8, z));
    }
    ctx.fixtures.push({ kind: 'laser', pos: [s * 10.2, 7.0, -9], side: s });
    ctx.fixtures.push({ kind: 'par', pos: [s * 4.8, 1.0, -2.4], side: s });
  }
  for (const x of [-7, -2, 2, 7]) ctx.fixtures.push({ kind: 'back', pos: [x, 0.4, zB + 3.4] });
  // lounge sets along the sides
  for (const s of [-1, 1] as const) {
    const l = loungeArea(ctx);
    l.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    l.position.set(s * (halfW - 3.4), 0, -26);
    root.add(l);
    root.add(at(plant(ctx, 1.4), s * (halfW - 0.9), 0, -9));
  }
  // string lights
  const rnd = seeded(8);
  for (let row = 0; row < 5; row++) {
    const z = -6 - row * 6;
    const bulbs = 34;
    for (let i = 0; i < bulbs; i++) {
      const u = i / (bulbs - 1);
      const x = -halfW + u * halfW * 2;
      const y = 5.4 - Math.sin(u * Math.PI) * 0.9 + rnd() * 0.02;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), m.emissive('bulb', '#ffcf8a', 2.2));
      b.position.set(x, y, z);
      root.add(b);
    }
  }
  // skyline backdrop (not batched: includes a blinking aviation light)
  const sky = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 horizon = vec3(0.16,0.12,0.28); vec3 top = vec3(0.01,0.015,0.05); vec3 c = mix(horizon, top, pow(clamp(h*1.6,0.,1.),0.55)); c += vec3(0.1,0.05,0.12)*smoothstep(0.18,0.0,abs(h)); gl_FragColor = vec4(c,1.0);} ',
    }),
  );
  dome.userData.dynamic = true;
  sky.add(dome);
  const bMat = new THREE.MeshBasicMaterial({ color: 0x07080f });
  const winMat = m.emissive('city', '#ffcf80', 0.9);
  const r2 = seeded(31);
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const wGeo = new THREE.PlaneGeometry(0.3, 0.3);
  const buildings = new THREE.InstancedMesh(bGeo, bMat, 140);
  const windows = new THREE.InstancedMesh(wGeo, winMat, 1400);
  const mt = new THREE.Matrix4();
  let wi = 0;
  for (let i = 0; i < 140; i++) {
    const w = 8 + r2() * 14, d = 8 + r2() * 12, h = 14 + Math.pow(r2(), 2.2) * 70;
    const x = -230 + (i / 140) * 460 + (r2() - 0.5) * 10;
    const z = -120 - r2() * 90;
    mt.compose(new THREE.Vector3(x, h / 2 - 6, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    buildings.setMatrixAt(i, mt);
    for (let k = 0; k < 10 && wi < 1400; k++) {
      if (r2() < 0.45) continue;
      mt.compose(new THREE.Vector3(x - w / 2 + r2() * w, r2() * h - 4, z + d / 2 + 0.05), new THREE.Quaternion(), new THREE.Vector3(1, 1.3, 1));
      windows.setMatrixAt(wi++, mt);
    }
  }
  windows.count = wi;
  sky.add(buildings, windows);
  // Washington Monument stand-in: tall obelisk with a red aviation light
  const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.2, 170, 4), new THREE.MeshBasicMaterial({ color: 0x0b0c14 }));
  obelisk.position.set(70, 70, -190);
  obelisk.rotation.y = Math.PI / 4;
  sky.add(obelisk);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a2a').multiplyScalar(4) }));
  tip.position.set(70, 156, -190);
  sky.add(tip);
  sky.traverse((o) => { o.userData.dynamic = true; });

  ctx.crowdRegions.push(
    { id: 'deck-front', kind: 'floor', x0: -11.5, x1: 11.5, z0: -17, z1: -4.2, y: 0, density: 1.15 },
    { id: 'deck-back', kind: 'floor', x0: -11.5, x1: 11.5, z0: -33, z1: -17, y: 0, density: 0.7, arrivalBias: 0.05 },
    { id: 'lounge', kind: 'lounge', x0: -14, x1: -11.8, z0: -30, z1: -22, y: 0, density: 0.3, minLod: 1, arrivalBias: 0.3, facing: 0.3 },
  );
  crowdBarrier(ctx, root, 12, -3.1);
  boothSpeakers(ctx, root, 3.3, -2.9);
  frontOfStage(ctx, root, -2.5);
  return {
    root, bounds: { x0: -10, x1: 10, z0: -7, z1: -31, wallZ: zB + 1, wallY: 5, ceilY: 20 },
    haze: { x0: -14, x1: 14, z0: -34, z1: -2, y0: 1.5, y1: 9 },
    background: '#05060f', fogColor: '#10101f', fogDensity: 0.0055, exclusions: [], crowdSeed: 45,
    dynamic: [sky],
    tick: (time) => { tip.visible = Math.sin(time * 2.2) > -0.2; },
    lookAt: [0, 1.2, -20],
  };
}

/* ------------------------------------------------------------------------------------------ */
/* FESTIVAL — big outdoor main stage                                                           */
/* ------------------------------------------------------------------------------------------ */
function buildFestival(ctx: BuildContext): VenueBuild {
  const root = new THREE.Group();
  const m = ctx.mats;
  ctx.accent.set('#3d7bff');
  const halfW = 45, zF = 4, zB = -90;
  const field = plane(halfW * 2, zF - zB, m.concrete(0.55), 6);
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, 0, (zF + zB) / 2);
  root.add(field);
  // stage: giant LED wall, side screens, roof truss
  const sz = -74;
  root.add(at(box(70, 2.2, 14, m.blackMetal(), 2), 0, 1.1, sz + 2));
  ledWall(ctx, root, 36, 15, 0, 11.5, sz - 4.5);
  for (const s of [-1, 1]) ledWall(ctx, root, 9, 16, s * 26, 11.5, sz - 4.5);
  for (const s of [-1, 1]) {
    root.add(at(box(2, 24, 2, m.blackMetal(), 2), s * 33, 12, sz));
    root.add(at(box(2, 24, 2, m.blackMetal(), 2), s * 14, 12, sz));
  }
  const roof = truss(ctx, 68, 1.4);
  roof.position.set(0, 24, sz);
  root.add(roof);
  const roof2 = truss(ctx, 68, 1.2);
  roof2.position.set(0, 20.5, sz + 5);
  root.add(roof2);
  // heads on stage roof
  for (let i = 0; i < 14; i++) {
    const x = -30 + i * (60 / 13);
    ctx.fixtures.push({ kind: 'moving', pos: [x, 19.7, sz + 5], group: 'stageRoof', side: x < 0 ? -1 : 1 });
  }
  addRig(ctx, root, { z: -28, y: 14, halfLen: 22, heads: 8, group: 'fohA' });
  addRig(ctx, root, { z: -48, y: 16, halfLen: 26, heads: 8, group: 'fohB', strobes: 4 });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.fixtures.push({ kind: 'moving', pos: [s * (34 + k * 2), 3.0, sz + 6 - k * 2], group: `stage${s}`, side: s });
    }
    ctx.fixtures.push({ kind: 'laser', pos: [s * 30, 18, sz + 6], side: s });
    ctx.fixtures.push({ kind: 'laser', pos: [s * 12, 16, -10], side: s });
    ctx.fixtures.push({ kind: 'par', pos: [s * 4.8, 1.0, -2.4], side: s });
  }
  for (const x of [-18, -8, 8, 18]) ctx.fixtures.push({ kind: 'back', pos: [x, 0.5, sz - 0.5] });
  // light towers + sound towers
  for (const s of [-1, 1]) {
    for (const z of [-30, -55]) {
      root.add(at(box(0.8, 12, 0.8, m.blackMetal(), 2), s * 36, 6, z));
      root.add(at(speakerStack(ctx), s * 36, 12, z));
    }
  }
  // distant tents / lights
  const r = seeded(77);
  for (let i = 0; i < 40; i++) {
    const x = (r() - 0.5) * 220, z = -60 - r() * 60;
    if (Math.abs(x) < 50 && z > -95) continue;
    root.add(at(cyl(0.2, 0.2, 6, m.blackMetal(), 5), x, 3, z));
    root.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), m.emissive('towerlamp', '#ffd7a0', 2)), x, 6.2, z));
  }
  crowdBarrier(ctx, root, 14, -3.1);
  boothSpeakers(ctx, root, 3.6, -3.0);
  frontOfStage(ctx, root, -2.5);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'varying vec3 vP; float h21(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);} void main(){ vec3 d = normalize(vP); float h = d.y; vec3 c = mix(vec3(0.04,0.05,0.12), vec3(0.003,0.005,0.02), pow(clamp(h*1.5,0.,1.),0.5)); vec2 g = floor(vec2(atan(d.x,d.z)*90., h*180.)); float st = step(0.9965, h21(g)) * smoothstep(0.05,0.3,h); c += vec3(st)*0.9; gl_FragColor = vec4(c,1.0);} ',
    }),
  );
  sky.userData.dynamic = true;
  ctx.crowdRegions.push(
    { id: 'field-front', kind: 'floor', x0: -26, x1: 26, z0: -26, z1: -4.2, y: 0, density: 1.1 },
    { id: 'field-mid', kind: 'floor', x0: -34, x1: 34, z0: -52, z1: -26, y: 0, density: 0.7, arrivalBias: 0.05 },
    { id: 'field-back', kind: 'floor', x0: -36, x1: 36, z0: -66, z1: -52, y: 0, density: 0.5, arrivalBias: 0.1 },
  );
  return {
    root, bounds: { x0: -28, x1: 28, z0: -8, z1: -60, wallZ: sz - 3, wallY: 10, ceilY: 30 },
    haze: { x0: -36, x1: 36, z0: -70, z1: -2, y0: 1.5, y1: 22 },
    background: '#02030a', fogColor: '#05070f', fogDensity: 0.006, exclusions: [], crowdSeed: 58,
    dynamic: [sky], lookAt: [0, 1.0, -30], bloomBoost: 1.15, hazeScale: 1.4,
  };
}

import { speakerStack } from '../architecture/parts';

export const VENUES: Record<VenueId, VenueDefinition> = {
  DC_NIGHT: { id: 'DC_NIGHT', name: 'DC Night', location: 'WASHINGTON DC', tagline: 'Upscale underground · dark luxury', swatch: ['#0b1020', '#2d4fb8', '#8a62ff'], build: buildDcNight },
  WAREHOUSE: { id: 'WAREHOUSE', name: 'Warehouse', location: 'BROOKLYN NY', tagline: 'Concrete, steel and a huge dance floor', swatch: ['#0a0c10', '#3b4666', '#c8d6ff'], build: buildWarehouse },
  UNDERGROUND: { id: 'UNDERGROUND', name: 'Underground', location: 'NEW YORK CITY', tagline: 'Small, packed, low ceiling, heavy haze', swatch: ['#0c0506', '#a3203a', '#3f66ff'], build: buildUnderground },
  ROOFTOP: { id: 'ROOFTOP', name: 'Rooftop', location: 'WASHINGTON DC', tagline: 'Open air under the city lights', swatch: ['#0a0a1c', '#3a2d6b', '#ffb36b'], build: buildRooftop },
  FESTIVAL: { id: 'FESTIVAL', name: 'Festival', location: 'MAIN STAGE', tagline: 'Massive rig, massive crowd', swatch: ['#02030a', '#1f3fa0', '#6fe0ff'], build: buildFestival },
};

export const VENUE_ORDER: VenueId[] = ['DC_NIGHT', 'WAREHOUSE', 'UNDERGROUND', 'ROOFTOP', 'FESTIVAL'];
void group; void rotated; void ceilingPlane;
