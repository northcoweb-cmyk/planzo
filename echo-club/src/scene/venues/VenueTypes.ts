import type * as THREE from 'three';
import type { VenueId } from '../../core/types';
import type { BuildContext } from '../architecture/BuildContext';
import type { Bounds } from '../LightingManager';
import type { HazeVolume } from '../Haze';

export interface VenueBuild {
  /** Static scenery (will be batched). Do not put lights in here. */
  root: THREE.Group;
  bounds: Bounds;
  haze: HazeVolume;
  background: string;
  fogColor: string;
  fogDensity: number;
  exclusions: { x: number; z: number; r: number }[];
  crowdSeed: number;
  /** Things that must not be batched (sky domes, animated props) with an optional per-frame hook. */
  dynamic?: THREE.Object3D[];
  tick?: (time: number, energy01: number) => void;
  /** Camera look-at target (defaults provided by the environment). */
  lookAt?: [number, number, number];
  /** Cosmetic exposure tweak for outdoors. */
  exposure?: number;
  bloomBoost?: number;
  /** Glossy floor rectangle that can receive a planar reflection (HIGH/ULTRA). */
  floor?: { x0: number; x1: number; z0: number; z1: number };
  /** Multiplies the haze particle opacity (underground = thick). */
  hazeScale?: number;
}

export interface VenueDefinition {
  id: VenueId;
  name: string;
  location: string;
  tagline: string;
  /** Three swatch colours for the picker card. */
  swatch: [string, string, string];
  build(ctx: BuildContext): VenueBuild;
}
