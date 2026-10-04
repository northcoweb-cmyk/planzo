import * as THREE from 'three';
import { at, box, cyl, group, plane, rotated, seeded } from '../Primitives';
import type { BuildContext, V3 } from './BuildContext';

/* ------------------------------------------------------------------------------------------
 * Modular architecture parts. Each returns a Group in local space (floor = y 0, front = +Z).
 * All are plain functions so a venue can mix and match; any can be replaced by a GLB through the
 * AssetRegistry using the same slot name.
 * ---------------------------------------------------------------------------------------- */

export function speakerStack(ctx: BuildContext, o: { width?: number; tiers?: number; subs?: number } = {}): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'speakers';
  const w = o.width ?? 0.7;
  const subs = o.subs ?? 2;
  let y = 0;
  for (let i = 0; i < subs; i++) {
    const cab = box(w * 1.25, 0.62, 0.9, m.rubber());
    at(cab, 0, y + 0.31, 0);
    g.add(cab);
    const cone = cyl(0.27, 0.2, 0.08, m.plastic(0x050506, 0.7), 20);
    rotated(cone, Math.PI / 2);
    at(cone, 0, y + 0.31, 0.45);
    g.add(cone);
    const rim = cyl(0.3, 0.3, 0.02, m.steel(), 24);
    rotated(rim, Math.PI / 2);
    at(rim, 0, y + 0.31, 0.455);
    g.add(rim);
    y += 0.62;
  }
  const tiers = o.tiers ?? 3;
  for (let i = 0; i < tiers; i++) {
    const cab = box(w, 0.42, 0.55, m.rubber());
    at(cab, 0, y + 0.21, -0.05);
    g.add(cab);
    const grille = box(w * 0.9, 0.34, 0.01, m.plastic(0x1a1b20, 0.9));
    at(grille, 0, y + 0.21, 0.23);
    g.add(grille);
    const hf = cyl(0.05, 0.04, 0.04, m.steel(), 12);
    rotated(hf, Math.PI / 2);
    at(hf, 0.2, y + 0.21, 0.235);
    g.add(hf);
    y += 0.42;
  }
  return g;
}

export function pillar(ctx: BuildContext, h: number, size = 0.9, withStrip = true): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'pillar';
  g.add(at(box(size, h, size, m.concrete(), 3), 0, h / 2, 0));
  g.add(at(box(size * 1.15, 0.35, size * 1.15, m.blackMetal(), 2), 0, 0.175, 0));
  g.add(at(box(size * 1.1, 0.25, size * 1.1, m.blackMetal(), 2), 0, h - 0.125, 0));
  if (withStrip) {
    for (const [sx, sz] of [[0.5, 0.5], [-0.5, 0.5]] as const) {
      g.add(ctx.strip('pillar', [0.035, Math.min(3.2, h * 0.3), 0.035], [sx * size, Math.min(3.2, h * 0.3) / 2 + 0.4, sz * size + 0.01], 0));
    }
  }
  return g;
}

export function wallSection(ctx: BuildContext, w: number, h: number, style: 'concrete' | 'slats' | 'brick' | 'dark' = 'concrete'): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'wall';
  const mat = style === 'brick' ? m.brick() : style === 'dark' ? m.blackMetal() : m.concrete(0.9);
  g.add(at(box(w, h, 0.3, mat, 3), 0, h / 2, 0));
  if (style === 'slats') {
    const n = Math.floor(w / 0.22);
    for (let i = 0; i < n; i++) g.add(at(box(0.12, h * 0.8, 0.06, m.darkWood(), 1), -w / 2 + 0.11 + i * 0.22, h * 0.5, 0.18));
  }
  return g;
}

export function door(ctx: BuildContext, glow = '#2f5bff'): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'door';
  g.add(at(box(2.2, 2.6, 0.2, m.blackMetal()), 0, 1.3, 0));
  g.add(at(box(1.8, 2.3, 0.05, m.emissive(`door${glow}`, glow, 0.9)), 0, 1.2, 0.09));
  g.add(at(box(0.04, 2.3, 0.07, m.steel()), 0, 1.2, 0.1));
  g.add(at(box(0.5, 0.14, 0.03, m.emissive('exit', '#27d36b', 1.4)), 0, 2.75, 0.1));
  return g;
}

export function entrance(ctx: BuildContext): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'entrance';
  g.add(at(box(6, 3.4, 0.4, m.concrete(0.8), 3), 0, 1.7, 0));
  const d = door(ctx, '#3b64ff');
  d.position.set(0, 0, 0.22);
  g.add(d);
  for (const s of [-1, 1]) {
    g.add(at(box(0.15, 2.8, 0.12, m.steel()), s * 2.2, 1.4, 0.24));
    g.add(ctx.strip('wall', [0.05, 2.6, 0.04], [s * 1.4, 1.3, 0.24], 0));
  }
  const rope1 = cyl(0.025, 0.025, 0.06, m.steel(), 8);
  g.add(at(rope1, 0, 0.03, 1));
  return g;
}

export function hallway(ctx: BuildContext, len: number): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'hallway';
  g.add(at(box(3, 0.1, len, m.floor(), 3), 0, 0.05, -len / 2));
  g.add(at(box(0.2, 3.2, len, m.concrete(0.7), 3), -1.6, 1.6, -len / 2));
  g.add(at(box(0.2, 3.2, len, m.concrete(0.7), 3), 1.6, 1.6, -len / 2));
  g.add(at(box(3.4, 0.2, len, m.concrete(0.6), 3), 0, 3.2, -len / 2));
  g.add(ctx.strip('wall', [0.05, 0.05, len], [0, 3.05, -len / 2], 0.5));
  g.add(ctx.strip('wall', [0.04, 0.04, len], [-1.48, 0.3, -len / 2], 0.2));
  g.add(ctx.strip('wall', [0.04, 0.04, len], [1.48, 0.3, -len / 2], 0.8));
  return g;
}

export function stairs(ctx: BuildContext, o: { width: number; rise: number; steps: number; run?: number }): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'stairs';
  const run = o.run ?? 0.28;
  const stepH = o.rise / o.steps;
  for (let i = 0; i < o.steps; i++) {
    g.add(at(box(o.width, stepH, run, m.blackMetal(), 1), 0, stepH * (i + 0.5), -run * (i + 0.5)));
    g.add(ctx.strip('stage', [o.width * 0.95, 0.02, 0.02], [0, stepH * (i + 1) + 0.002, -run * i + 0.01], i / o.steps));
  }
  for (const s of [-1, 1]) {
    const len = Math.hypot(o.steps * run, o.rise);
    const rail = cyl(0.025, 0.025, len, m.steel(), 8);
    rotated(rail, Math.PI / 2 + Math.atan2(o.rise, o.steps * run), 0, 0);
    rail.rotation.set(0, 0, 0);
    rail.rotation.x = Math.PI / 2 - Math.atan2(o.rise, o.steps * run);
    at(rail, s * (o.width / 2 + 0.02), o.rise / 2 + 0.95, -(o.steps * run) / 2);
    g.add(rail);
    for (let i = 0; i <= 3; i++) g.add(at(cyl(0.02, 0.02, 0.95, m.steel(), 6), s * (o.width / 2 + 0.02), (o.rise * i) / 3 + 0.475, -(o.steps * run * i) / 3));
  }
  return g;
}

export function platform(ctx: BuildContext, w: number, d: number, h: number, withStrip = true): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'platform';
  g.add(at(box(w, h, d, m.blackMetal(), 2), 0, h / 2, 0));
  g.add(at(box(w + 0.06, 0.05, d + 0.06, m.steel(), 2), 0, h + 0.01, 0));
  if (withStrip) g.add(ctx.strip('stage', [w, 0.04, 0.03], [0, h * 0.35, d / 2 + 0.02], 0.5));
  return g;
}

export function balcony(
  ctx: BuildContext,
  o: { length: number; depth: number; y: number; open: 'x+' | 'x-' | 'z+' | 'z-'; supports?: boolean; ceilingH?: number },
): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'balcony';
  // Authored as running along Z with the open edge facing +X; rotated into place by `open`.
  const L = o.length, D = o.depth, y = o.y;
  g.add(at(box(D, 0.3, L, m.darkWood(), 2), 0, y - 0.15, 0));
  g.add(at(box(0.15, 0.7, L, m.blackMetal(), 2), D / 2 - 0.07, y - 0.55, 0)); // fascia
  g.add(ctx.strip('balcony', [0.04, 0.05, L], [D / 2 + 0.01, y - 0.7, 0], 0.5));
  // glass railing
  const posts = Math.floor(L / 2.2);
  for (let i = 0; i <= posts; i++) {
    const z = -L / 2 + (L * i) / posts;
    g.add(at(box(0.05, 1.0, 0.05, m.steel(), 1), D / 2 - 0.04, y + 0.5, z));
  }
  g.add(at(box(0.07, 0.06, L, m.steel(), 1), D / 2 - 0.04, y + 1.02, 0));
  const glass = box(0.02, 0.9, L, m.glass(), 1);
  glass.userData.dynamic = true;
  at(glass, D / 2 - 0.04, y + 0.5, 0);
  glass.renderOrder = 2;
  g.add(glass);
  // back wall
  g.add(at(box(0.3, 4, L, m.concrete(0.75), 3), -D / 2 - 0.15, y + 1.7, 0));
  // underside ceiling lights
  const lamps = Math.floor(L / 3);
  for (let i = 0; i < lamps; i++) {
    g.add(at(cyl(0.11, 0.11, 0.03, m.emissive('amberLamp', '#ffb869', 1.1), 12), 0, y - 0.32, -L / 2 + (L * (i + 0.5)) / lamps));
  }
  if (o.supports !== false) {
    const sup = Math.max(2, Math.floor(L / 7));
    for (let i = 0; i <= sup; i++) {
      g.add(at(box(0.5, y - 0.3, 0.5, m.concrete(0.9), 3), D / 2 - 0.4, (y - 0.3) / 2, -L / 2 + (L * i) / sup));
    }
  }
  const wrap = new THREE.Group();
  wrap.add(g);
  const rot = { 'x+': 0, 'x-': Math.PI, 'z+': -Math.PI / 2, 'z-': Math.PI / 2 }[o.open];
  wrap.rotation.y = rot;
  return wrap;
}

export function bar(ctx: BuildContext, length: number): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'bar';
  g.add(at(box(length, 1.05, 0.7, m.darkWood(), 2), 0, 0.525, 0));
  g.add(at(box(length + 0.1, 0.06, 0.85, m.marble(), 2), 0, 1.08, 0));
  g.add(ctx.strip('bar', [length, 0.04, 0.03], [0, 0.12, 0.36], 0.4));
  // back bar: shelves with bottles
  const back = new THREE.Group();
  back.position.set(0, 0, -1.4);
  back.add(at(box(length, 2.6, 0.3, m.blackMetal(), 2), 0, 1.3, -0.15));
  back.add(at(box(length - 0.3, 2.0, 0.02, m.emissive('mirror', '#3a4260', 0.5)), 0, 1.45, 0.01));
  const rnd = seeded(77);
  for (let s = 0; s < 4; s++) {
    const y = 0.95 + s * 0.42;
    back.add(at(box(length - 0.3, 0.03, 0.28, m.steel(), 1), 0, y, 0.12));
    back.add(ctx.strip('bar', [length - 0.3, 0.03, 0.03], [0, y - 0.04, 0.2], s * 0.2));
    const n = Math.floor((length - 0.5) / 0.14);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.18) continue;
      const hgt = 0.24 + rnd() * 0.12;
      const col = [0x2a5c3a, 0x8a5a24, 0x7ca3c9, 0x4a1e1e, 0xc8c3a0][Math.floor(rnd() * 5)];
      const b = cyl(0.03, 0.035, hgt, m.plastic(col, 0.2), 8);
      b.userData.dynamic = false;
      back.add(at(b, -length / 2 + 0.25 + i * 0.14, y + hgt / 2 + 0.02, 0.12));
    }
  }
  g.add(back);
  // stools
  const n = Math.floor(length / 0.9);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + 0.6 + i * 0.9;
    g.add(at(cyl(0.2, 0.2, 0.06, m.leather(0x1a1a1d), 14), x, 0.78, 0.9));
    g.add(at(cyl(0.025, 0.025, 0.74, m.steel(), 8), x, 0.4, 0.9));
    g.add(at(cyl(0.18, 0.18, 0.03, m.steel(), 14), x, 0.02, 0.9));
  }
  return g;
}

export function couch(ctx: BuildContext, w = 2.2, color = 0x1a1b20): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'couch';
  const mat = m.leather(color);
  g.add(at(box(w, 0.4, 0.9, mat, 1), 0, 0.3, 0));
  g.add(at(box(w, 0.55, 0.25, mat, 1), 0, 0.7, -0.35));
  for (const s of [-1, 1]) g.add(at(box(0.22, 0.55, 0.9, mat, 1), s * (w / 2 - 0.11), 0.55, 0));
  const n = Math.max(2, Math.round(w / 0.75));
  for (let i = 0; i < n; i++) g.add(at(box(w / n - 0.3 / n - 0.05, 0.14, 0.7, mat, 1), -w / 2 + 0.22 + (i + 0.5) * ((w - 0.44) / n), 0.55, 0.07));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(cyl(0.03, 0.03, 0.12, m.steel(), 6), sx * (w / 2 - 0.1), 0.06, sz * 0.35));
  return g;
}

export function loungeArea(ctx: BuildContext): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'lounge';
  g.add(at(box(7, 0.08, 5, m.fabric(0x14161c), 2), 0, 0.04, 0));
  g.add(at(couch(ctx, 2.6), 0, 0.08, -1.9));
  g.add(at(rotated(couch(ctx, 2.0), 0, Math.PI / 2), -2.9, 0.08, 0));
  g.add(at(rotated(couch(ctx, 2.0), 0, -Math.PI / 2), 2.9, 0.08, 0));
  g.add(at(box(1.3, 0.04, 0.7, m.marble(), 1), 0, 0.46, -0.1));
  g.add(at(box(0.1, 0.38, 0.1, m.steel(), 1), 0, 0.27, -0.1));
  for (const x of [-1.9, 1.9]) {
    g.add(at(cyl(0.22, 0.22, 0.04, m.marble(), 14), x, 0.5, -1.7));
    g.add(at(cyl(0.02, 0.02, 0.42, m.steel(), 6), x, 0.3, -1.7));
    g.add(at(cyl(0.09, 0.07, 0.17, m.emissive('lampWarm', '#ffb25a', 1.4), 10), x, 0.62, -1.7));
  }
  return g;
}

export function tablesAndStools(ctx: BuildContext, count: number, rows = 1): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'tables';
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 2.4;
      const z = -r * 2.2;
      g.add(at(cyl(0.38, 0.38, 0.04, m.darkWood(), 16), x, 1.05, z));
      g.add(at(cyl(0.03, 0.03, 1.0, m.steel(), 8), x, 0.52, z));
      g.add(at(cyl(0.25, 0.25, 0.03, m.steel(), 14), x, 0.015, z));
      for (const a of [0.6, 2.7, 4.8]) {
        const sx = x + Math.cos(a) * 0.62, sz = z + Math.sin(a) * 0.62;
        g.add(at(cyl(0.17, 0.17, 0.05, m.leather(0x1a1a1d), 12), sx, 0.7, sz));
        g.add(at(cyl(0.02, 0.02, 0.68, m.steel(), 6), sx, 0.35, sz));
        g.add(at(cyl(0.15, 0.15, 0.02, m.steel(), 12), sx, 0.01, sz));
      }
      g.add(at(cyl(0.03, 0.03, 0.08, m.emissive('candle', '#ffad5c', 1.8), 6), x, 1.1, z));
    }
  }
  return g;
}

export function truss(ctx: BuildContext, length: number, size = 0.42): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'truss';
  const mat = m.blackMetal();
  const h = size / 2;
  for (const [cy, cz] of [[h, h], [h, -h], [-h, h], [-h, -h]] as const) g.add(at(box(length, 0.04, 0.04, mat, 1), 0, cy, cz));
  const bays = Math.floor(length / size);
  for (let i = 0; i <= bays; i++) {
    const x = -length / 2 + (length * i) / bays;
    g.add(at(box(0.025, size, 0.025, mat, 1), x, 0, h));
    g.add(at(box(0.025, size, 0.025, mat, 1), x, 0, -h));
    g.add(at(box(0.025, 0.025, size, mat, 1), x, h, 0));
    g.add(at(box(0.025, 0.025, size, mat, 1), x, -h, 0));
    if (i < bays) {
      const dx = length / bays;
      const diag = Math.hypot(dx, size);
      const a = Math.atan2(size, dx);
      const sign = i % 2 ? 1 : -1;
      g.add(at(rotated(box(diag, 0.02, 0.02, mat, 1), 0, 0, sign * a), x + dx / 2, 0, h));
      g.add(at(rotated(box(diag, 0.02, 0.02, mat, 1), 0, 0, sign * a), x + dx / 2, 0, -h));
    }
  }
  return g;
}

export function plant(ctx: BuildContext, scale = 1): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'plant';
  g.add(at(cyl(0.22, 0.17, 0.45, m.plastic(0x15161a, 0.5), 12), 0, 0.225, 0));
  const leaf = m.plastic(0x14301c, 0.7);
  const rnd = seeded(5);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), leaf);
    l.scale.set(0.35, 1.8 + rnd() * 1.4, 0.12);
    l.position.set(Math.cos(a) * 0.14, 0.9 + rnd() * 0.4, Math.sin(a) * 0.14);
    l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(l);
  }
  g.scale.setScalar(scale);
  return g;
}

export function neonSign(ctx: BuildContext, text: string, color = '#ff3b6b', w = 3.2): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 320;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, c.width, c.height);
  x.font = '700 190px "Helvetica Neue", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = color;
  x.shadowBlur = 40;
  x.fillStyle = color;
  x.fillText(text, 512, 170);
  x.shadowBlur = 12;
  x.fillStyle = '#ffffff';
  x.globalAlpha = 0.8;
  x.fillText(text, 512, 170);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3125), mat);
  mesh.userData.dynamic = true;
  return mesh;
}

export function windowWall(ctx: BuildContext, w: number, h: number, glow: string): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'windows';
  const n = Math.floor(w / 1.6);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n;
    g.add(at(box(1.1, h * 0.55, 0.06, m.emissive(`win${glow}`, glow, 0.55)), x, h * 0.7, 0.18));
    g.add(at(box(0.05, h * 0.55, 0.1, m.blackMetal(), 1), x, h * 0.7, 0.2));
    g.add(at(box(1.18, 0.05, 0.1, m.blackMetal(), 1), x, h * 0.7, 0.2));
    g.add(at(box(1.18, 0.06, 0.1, m.blackMetal(), 1), x, h * 0.7 + h * 0.275, 0.2));
    g.add(at(box(1.18, 0.06, 0.1, m.blackMetal(), 1), x, h * 0.7 - h * 0.275, 0.2));
  }
  return g;
}

export function ceilingPlane(ctx: BuildContext, w: number, d: number, y: number, ribs = true): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'ceiling';
  g.add(at(plane(w, d, m.concrete(0.55), 4), 0, y, 0));
  g.children[0].rotation.x = Math.PI / 2;
  if (ribs) {
    const n = Math.floor(d / 4);
    for (let i = 0; i < n; i++) g.add(at(box(w, 0.5, 0.35, m.blackMetal(), 2), 0, y - 0.25, -d / 2 + (d * (i + 0.5)) / n));
  }
  return g;
}

export function dancefloor(ctx: BuildContext, w: number, d: number): THREE.Group {
  const m = ctx.mats;
  const g = new THREE.Group();
  g.name = 'dancefloor';
  const p = plane(w, d, m.floor(), 3);
  p.rotation.x = -Math.PI / 2;
  g.add(p);
  // inlaid LED guide lines running toward the stage
  for (const x of [-12, -6, 6, 12]) {
    if (Math.abs(x) < w / 2) g.add(ctx.strip('floor', [0.04, 0.01, d], [x, 0.006, 0], Math.abs(x) / 12));
  }
  return g;
}

export type { V3 };
export { group };
