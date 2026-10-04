import * as THREE from 'three';
import { at, box, cyl, plane } from '../Primitives';
import { dancefloor, speakerStack } from '../architecture/parts';
import type { BuildContext } from '../architecture/BuildContext';

export interface ShellOptions {
  halfW: number;
  zFront: number;
  zBack: number;
  height: number;
  wall: 'concrete' | 'brick' | 'dark';
  /** Gaps in the side walls: side -1/+1, z range. */
  gaps?: { side: -1 | 1; z0: number; z1: number }[];
  ceiling?: boolean;
  floorTile?: number;
}

/** Floor, walls and ceiling of an indoor hall. */
export function hallShell(ctx: BuildContext, root: THREE.Group, o: ShellOptions): void {
  const m = ctx.mats;
  const depth = o.zFront - o.zBack;
  const cz = (o.zFront + o.zBack) / 2;
  const floor = dancefloor(ctx, o.halfW * 2, depth);
  floor.position.set(0, 0, cz);
  root.add(floor);
  const wallMat = o.wall === 'brick' ? m.brick() : o.wall === 'dark' ? m.blackMetal() : m.concrete(0.8);
  // back & front walls
  root.add(at(box(o.halfW * 2 + 1, o.height, 0.5, wallMat, 3), 0, o.height / 2, o.zBack - 0.25));
  root.add(at(box(o.halfW * 2 + 1, o.height, 0.5, wallMat, 3), 0, o.height / 2, o.zFront + 0.25));
  // side walls with optional gaps
  for (const side of [-1, 1] as const) {
    const gaps = (o.gaps ?? []).filter((g) => g.side === side).sort((a, b) => b.z0 - a.z0);
    let z = o.zFront;
    const segs: [number, number][] = [];
    for (const g of gaps) {
      if (z > g.z0) segs.push([z, g.z0]);
      z = g.z1;
    }
    segs.push([z, o.zBack]);
    for (const [a, b] of segs) {
      const len = Math.abs(a - b);
      if (len < 0.1) continue;
      root.add(at(box(0.5, o.height, len, wallMat, 3), side * (o.halfW + 0.25), o.height / 2, (a + b) / 2));
    }
    // lintel above gaps
    for (const g of gaps) root.add(at(box(0.5, o.height - 3.4, Math.abs(g.z0 - g.z1), wallMat, 3), side * (o.halfW + 0.25), 3.4 + (o.height - 3.4) / 2, (g.z0 + g.z1) / 2));
  }
  if (o.ceiling !== false) {
    const c = plane(o.halfW * 2 + 1, depth + 1, m.concrete(0.5), 4);
    c.rotation.x = Math.PI / 2;
    c.position.set(0, o.height, cz);
    root.add(c);
  }
}

/** Steel crowd barrier in front of the stage. */
export function crowdBarrier(ctx: BuildContext, root: THREE.Group, width: number, z: number): void {
  const m = ctx.mats;
  const n = Math.floor(width / 1.2);
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (width * i) / n;
    root.add(at(box(0.06, 1.1, 0.06, m.steel(), 1), x, 0.55, z));
  }
  root.add(at(box(width, 0.06, 0.08, m.steel(), 1), 0, 1.1, z));
  root.add(at(box(width, 0.05, 0.06, m.steel(), 1), 0, 0.65, z));
  root.add(at(box(width, 0.05, 0.06, m.steel(), 1), 0, 0.25, z));
}

/** Compact speakers flanking the DJ position (front-of-house tops). */
export function boothSpeakers(ctx: BuildContext, root: THREE.Group, x = 3.3, z = -2.9, y = 0.8): void {
  for (const s of [-1, 1]) {
    const sp = speakerStack(ctx, { subs: 1, tiers: 2, width: 0.7 });
    sp.position.set(s * x, y, z);
    sp.rotation.y = -s * 0.28;
    root.add(sp);
  }
}

/** Stage-edge LED trim, floor wash fixtures. */
export function frontOfStage(ctx: BuildContext, root: THREE.Group, zEdge = -2.5): void {
  root.add(ctx.strip('stage', [8.8, 0.04, 0.04], [0, 0.18, zEdge - 0.02], 0.5));
  root.add(at(cyl(0.02, 0.02, 0.02, ctx.mats.steel(), 6), 0, 0, 0));
}
