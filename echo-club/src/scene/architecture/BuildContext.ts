import * as THREE from 'three';
import type { MaterialLibrary } from '../Materials';
import type { QualityProfile } from '../../core/Quality';
import type { CrowdRegion } from '../../crowd/CrowdLayout';
import type { LedWall } from '../LedWall';

export type V3 = [number, number, number];

export type FixtureKind =
  | 'moving'
  | 'spot'
  | 'laser'
  | 'strobe'
  | 'par'
  | 'back'
  | 'wash'
  | 'ceiling'
  | 'wash';

export interface FixtureSpec {
  kind: FixtureKind;
  pos: V3;
  /** Rest aim point (for static fixtures). */
  aim?: V3;
  /** Logical group for patterns: 'rigA' | 'rigB' | 'balconyL' ... */
  group?: string;
  /** -1 left, 0 centre, 1 right (used for mirrored patterns). */
  side?: number;
  size?: number;
}

export type StripGroup = 'floor' | 'ceiling' | 'balcony' | 'wall' | 'booth' | 'pillar' | 'stage' | 'bar';

export interface LedStrip {
  material: THREE.MeshBasicMaterial;
  group: StripGroup;
  /** Position along the chase (0..1) */
  order: number;
}

/** Everything a venue builder needs, and the registry it reports animated things to. */
export interface BuildContext {
  mats: MaterialLibrary;
  quality: QualityProfile;
  strips: LedStrip[];
  ledWalls: LedWall[];
  fixtures: FixtureSpec[];
  crowdRegions: CrowdRegion[];
  /** Accent colours specific to the venue */
  accent: THREE.Color;
  /** Create an animated LED strip mesh (own material, not batched). */
  strip(group: StripGroup, size: V3, pos: V3, order?: number, rot?: V3): THREE.Mesh;
}

export function createContext(mats: MaterialLibrary, quality: QualityProfile): BuildContext {
  const ctx: BuildContext = {
    mats,
    quality,
    strips: [],
    ledWalls: [],
    fixtures: [],
    crowdRegions: [],
    accent: new THREE.Color('#4f7dff'),
    strip(group, size, pos, order = 0, rot = [0, 0, 0]) {
      const material = mats.ownEmissive('#3a5cff', 1.2);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      mesh.userData.dynamic = true;
      ctx.strips.push({ material, group, order });
      return mesh;
    },
  };
  return ctx;
}
