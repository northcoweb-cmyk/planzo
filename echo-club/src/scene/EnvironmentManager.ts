import * as THREE from 'three';
import type { CrowdFrame, VenueId } from '../core/types';
import type { QualityProfile } from '../core/Quality';
import type { Settings } from '../core/Settings';
import { MaterialLibrary } from './Materials';
import { createContext, type BuildContext } from './architecture/BuildContext';
import { DJBooth } from './DJBooth';
import { Haze } from './Haze';
import { LightingManager } from './LightingManager';
import { batchStatic } from './StaticBatch';
import { VENUES } from './venues/venues';
import type { VenueBuild } from './venues/VenueTypes';
import type { SceneManager } from './SceneManager';
import type { CrowdRegion } from '../crowd/CrowdLayout';
import { FloorReflection } from './FloorReflection';

/** Builds, owns and animates the physical venue: architecture, booth, lighting rig, haze. */
export class EnvironmentManager {
  readonly group = new THREE.Group();
  readonly lighting: LightingManager;
  readonly haze: Haze;
  venueId: VenueId = 'DC_NIGHT';
  venue: VenueBuild | null = null;
  ctx: BuildContext | null = null;
  booth: DJBooth | null = null;
  mats: MaterialLibrary;
  private quality!: QualityProfile;
  private lastTextureSize = 0;
  private built = new THREE.Group();
  private reflection: FloorReflection | null = null;

  constructor(private readonly sceneMgr: SceneManager) {
    this.mats = new MaterialLibrary(512);
    this.lighting = new LightingManager(this.mats);
    this.haze = new Haze(this.mats);
    this.group.name = 'environment';
    this.sceneMgr.scene.add(this.group);
  }

  get crowdRegions(): CrowdRegion[] { return this.ctx?.crowdRegions ?? []; }
  get exclusions(): { x: number; z: number; r: number }[] { return this.venue?.exclusions ?? []; }
  get crowdSeed(): number { return this.venue?.crowdSeed ?? 1; }
  get accent(): THREE.Color { return this.ctx?.accent ?? new THREE.Color('#4f7dff'); }

  /** (Re)build the venue. Safe to call repeatedly (venue/quality change). */
  load(id: VenueId, quality: QualityProfile): void {
    this.venueId = id;
    this.quality = quality;
    this.disposeCurrent();
    if (quality.textureSize !== this.lastTextureSize) {
      this.mats = new MaterialLibrary(quality.textureSize);
      this.lastTextureSize = quality.textureSize;
    }
    (this.lighting as unknown as { mats: MaterialLibrary }).mats = this.mats;
    (this.haze as unknown as { mats: MaterialLibrary }).mats = this.mats;
    const ctx = createContext(this.mats, quality);
    this.ctx = ctx;
    const def = VENUES[id];
    const venue = def.build(ctx);
    this.venue = venue;

    const booth = new DJBooth(ctx);
    this.booth = booth;

    this.built = new THREE.Group();
    this.built.name = `venue-${id}`;
    this.built.add(batchStatic(venue.root));
    const staticBooth = batchStatic(booth.object);
    this.built.add(staticBooth);
    this.built.add(booth.controllerLight);
    for (const d of venue.dynamic ?? []) this.built.add(d);
    this.group.add(this.built);

    this.lighting.build(ctx, quality, venue.bounds);
    this.group.add(this.lighting.group);
    this.haze.build(venue.haze, quality.hazeParticles);
    this.group.add(this.haze.object);

    if (quality.reflections && venue.floor) {
      const size = this.sceneMgr.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.reflection = new FloorReflection(venue.floor, size.x, size.y, quality.reflectionScale);
      this.built.add(this.reflection.reflector);
    }

    this.sceneMgr.setFog(venue.fogColor, venue.fogDensity);
    this.sceneMgr.setBackground(venue.background);
    this.sceneMgr.setExposure(venue.exposure ?? 0.95);
  }

  /** Keep the reflection buffer matched to the drawing buffer. */
  resize(): void {
    if (!this.reflection) return;
    const size = this.sceneMgr.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.reflection.setSize(size.x, size.y);
  }

  private disposeCurrent(): void {
    if (!this.built) return;
    this.reflection?.dispose();
    this.reflection = null;
    this.group.remove(this.built);
    this.group.remove(this.lighting.group);
    this.group.remove(this.haze.object);
    const geos = new Set<THREE.BufferGeometry>();
    this.built.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) geos.add(m.geometry);
    });
    geos.forEach((g) => g.dispose());
    this.lighting.dispose();
    this.ctx?.strips.forEach((s) => s.material.dispose());
    this.ctx?.ledWalls.forEach((w) => w.material.dispose());
  }

  update(f: CrowdFrame, s: Readonly<Settings>, dt: number, time: number, playing: boolean): void {
    if (!this.venue || !this.booth) return;
    this.lighting.update(f, s, dt, time);
    this.booth.update({
      time, dt, bpm: f.bpm, energy: f.crowdEnergy / 100, kick: f.kick, bass: f.bassEnergy, beatPhase: f.beatPhase,
      beatInBar: f.beatInBar, playing, drop: f.dropIntensity, build: f.buildIntensity, accent: this.lighting.avgColor,
    });
    this.haze.update(time, this.lighting.avgColor, s.fogAmount / 100 * (this.venue.hazeScale ?? 1), f.crowdEnergy / 100, f.dropIntensity);
    this.venue.tick?.(time, f.crowdEnergy / 100);
    this.reflection?.setStrength(0.42 + 0.35 * (f.crowdEnergy / 100) + 0.3 * f.dropIntensity);
    // atmospheric fog thickens a little with fog amount + energy
    const fog = this.sceneMgr.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      const base = this.venue.fogDensity;
      fog.density = base * (0.5 + (s.fogAmount / 100) * 1.0) * (1 + f.dropIntensity * 0.5 + (f.state === 'BREAKDOWN' ? 0.35 : 0));
    }
  }

  get venueName(): string { return VENUES[this.venueId].name; }
  get venueLocation(): string { return VENUES[this.venueId].location; }
}
