import * as THREE from 'three';
import type { CrowdFrame, LightingModeId } from '../core/types';
import type { QualityProfile } from '../core/Quality';
import type { Settings } from '../core/Settings';
import { clamp, damp, lerp, mulberry32 } from '../util/math';
import { assets } from '../assets/AssetRegistry';
import type { BuildContext, FixtureSpec, LedStrip } from './architecture/BuildContext';
import type { MaterialLibrary } from './Materials';
import { C, COLOR_SETS, type ColorSet } from './Palette';
import type { LedWall } from './LedWall';

/* ----------------------------------------------------------------------------------------------
 * Lighting engine. Behaviour is expressed as *modes* (profiles) + *patterns* (motion programs).
 * Everything is phrase-aware (bars / 16-beat phrases) so changes land on musical boundaries, and
 * all values are smoothed so lights never flicker randomly.
 * -------------------------------------------------------------------------------------------- */

interface Profile {
  head: number; // beam intensity
  speed: number; // pattern speed
  pulse: number; // beat pulse depth
  strips: number;
  wall: number;
  ceiling: number;
  lasers: number; // 0..1
  haze: number; // beam density multiplier
  rim: number;
  ambient: number;
}

const PROFILES: Record<LightingModeId, Profile> = {
  CALM: { head: 0.5, speed: 0.15, pulse: 0.2, strips: 0.45, wall: 0.4, ceiling: 1.0, lasers: 0, haze: 0.55, rim: 0.35, ambient: 1.0 },
  HOUSE: { head: 0.8, speed: 0.5, pulse: 0.85, strips: 0.8, wall: 0.75, ceiling: 0.55, lasers: 0, haze: 0.9, rim: 0.7, ambient: 0.85 },
  PEAK: { head: 1.0, speed: 0.9, pulse: 0.95, strips: 1.1, wall: 1.0, ceiling: 0.25, lasers: 0.7, haze: 1.2, rim: 1.0, ambient: 0.7 },
  DROP: { head: 1.2, speed: 1.35, pulse: 0.9, strips: 1.4, wall: 1.2, ceiling: 0.08, lasers: 1, haze: 1.25, rim: 1.4, ambient: 0.6 },
  BREAKDOWN: { head: 0.3, speed: 0.1, pulse: 0.08, strips: 0.35, wall: 0.35, ceiling: 0.9, lasers: 0, haze: 1.4, rim: 0.3, ambient: 1.1 },
  AFTERHOURS: { head: 0.46, speed: 0.22, pulse: 0.22, strips: 0.6, wall: 0.5, ceiling: 0.6, lasers: 0, haze: 1.0, rim: 0.5, ambient: 0.9 },
};

type Pattern = (i: number, n: number, t: number, s: number, side: number, beat: number, out: THREE.Vector3, pos: THREE.Vector3, b: Bounds) => void;

export interface Bounds {
  x0: number; x1: number; z0: number; z1: number; wallZ: number; wallY: number; ceilY: number;
}

const PATTERNS: Record<string, Pattern> = {
  pool: (i, n, t, s, side, beat, out, pos, b) => {
    const u = n > 1 ? i / (n - 1) : 0.5;
    out.set(lerp(b.x0, b.x1, u) * 0.8, 0, lerp(b.z0, b.z1, 0.5 + 0.2 * Math.sin(t * s * 0.4 + i)));
  },
  sweep: (i, n, t, s, side, beat, out, pos, b) => {
    const cx = (b.x0 + b.x1) / 2, ax = (b.x1 - b.x0) * 0.42;
    out.set(cx + ax * Math.sin(t * s * 0.8 + i * 0.7), 0.4, lerp(b.z0, b.z1, 0.5 + 0.45 * Math.sin(t * s * 0.5 + i * 1.3)));
  },
  fan: (i, n, t, s, side, beat, out, pos) => {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    const sweep = Math.sin(t * s * 0.9 + i * 0.35);
    out.set(pos.x + u * 26 + side * 3 * sweep, pos.y + 18, pos.z - 6 + sweep * 14);
  },
  cross: (i, n, t, s, side, beat, out, pos, b) => {
    const cx = (b.x0 + b.x1) / 2, ax = (b.x1 - b.x0) * 0.4;
    const mir = i % 2 ? 1 : -1;
    out.set(cx + mir * ax * Math.sin(t * s * 0.9 + Math.floor(i / 2) * 0.5), 0.8, lerp(b.z0, b.z1, 0.5 + 0.3 * Math.sin(t * s * 0.6 + i)));
  },
  scan: (i, n, t, s, side, beat, out, pos, b) => {
    const x = lerp(b.x0, b.x1, n > 1 ? i / (n - 1) : 0.5) * 0.85;
    out.set(x, 1.0, lerp(b.z0, b.z1, 0.5 + 0.5 * Math.sin(t * s * 0.7 + i * 0.25)));
  },
  wall: (i, n, t, s, side, beat, out, pos, b) => {
    const x = lerp(b.x0, b.x1, n > 1 ? i / (n - 1) : 0.5) * 0.8;
    out.set(x + Math.sin(t * s + i) * 2, b.wallY * (0.6 + 0.4 * Math.sin(t * s * 0.7 + i)), b.wallZ);
  },
  sync: (i, n, t, s, side, beat, out, pos, b) => {
    // phase-locked to the bar: every head sweeps in unison, one full pass per 8 beats
    const cx = (b.x0 + b.x1) / 2, ax = (b.x1 - b.x0) * 0.42;
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    out.set(cx + ax * Math.sin((beat / 8) * Math.PI * 2 + u * 2.4), 0.6, b.z0 + (b.z1 - b.z0) * (0.5 + 0.5 * Math.sin((beat / 4) * Math.PI * 2 + i * 0.5)));
  },
  snap: (i, n, t, s, side, beat, out, pos, b) => {
    const k = (Math.floor(beat) + i) % Math.max(2, n);
    const x = lerp(b.x0, b.x1, k / Math.max(1, n - 1)) * 0.85;
    out.set(x, 0.8, lerp(b.z0, b.z1, ((Math.floor(beat / 2) + i * 3) % 5) / 4));
  },
};

const MODE_PATTERNS: Record<LightingModeId, string[]> = {
  CALM: ['pool', 'sweep'],
  HOUSE: ['sync', 'cross', 'scan', 'snap', 'sync'],
  PEAK: ['fan', 'sync', 'snap', 'scan', 'cross'],
  DROP: ['fan', 'wall', 'cross'],
  BREAKDOWN: ['pool', 'wall'],
  AFTERHOURS: ['pool', 'sweep'],
};

const MODE_COLORS: Record<LightingModeId, string[]> = {
  CALM: ['breakdown', 'coolWhite'],
  HOUSE: ['coolWhite', 'blueWhite', 'bluePurple', 'cyanBlue'],
  PEAK: ['blueWhite', 'bluePurple', 'violet', 'cyanBlue', 'coolWhite'],
  DROP: ['whiteOnly', 'blueWhite', 'coolWhite'],
  BREAKDOWN: ['breakdown', 'warm'],
  AFTERHOURS: ['afterhours', 'warm'],
};

/* ---------------- beam shader ---------------- */
const BEAM_VERT = /* glsl */ `
uniform float uLength;
varying vec3 vN; varying vec3 vV; varying float vT;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vT = clamp(-position.y, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity;
varying vec3 vN; varying vec3 vV; varying float vT;
void main(){
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(facing, 1.35);
  float along = smoothstep(0.0, 0.05, vT) * pow(1.0 - vT, 0.65);
  float a = uIntensity * edge * along;
  gl_FragColor = vec4(uColor * a, a);
}`;

const beamGeo = (() => {
  const g = new THREE.CylinderGeometry(0.02, 1, 1, 28, 1, true); // unit cone: apex at top, base radius = tan(angle) after scale
  g.translate(0, -0.5, 0);
  return g;
})();

class Beam {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0 }, uLength: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(beamGeo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
  set(color: THREE.Color, intensity: number, length: number, halfAngle: number): void {
    (this.material.uniforms.uColor.value as THREE.Color).copy(color);
    this.material.uniforms.uIntensity.value = intensity;
    this.mesh.scale.set(Math.tan(halfAngle) * length, length, Math.tan(halfAngle) * length);
    this.mesh.visible = intensity > 0.004;
  }
}

function glowSprite(map: THREE.Texture, color: THREE.ColorRepresentation, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  return s;
}

interface Head {
  spec: FixtureSpec;
  root: THREE.Group;
  head: THREE.Group;
  beam: Beam;
  lens: THREE.Sprite;
  floorSpot: THREE.Mesh;
  dir: THREE.Vector3;
  target: THREE.Vector3;
  color: THREE.Color;
  halfAngle: number;
  index: number;
  count: number;
  light: THREE.SpotLight | null;
  active: boolean;
}

function buildMovingHeadModel(mats: MaterialLibrary, scale: number): { base: THREE.Group; head: THREE.Group } {
  const base = new THREE.Group();
  const head = new THREE.Group();
  const body = mats.blackMetal();
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  base.add(mk(new THREE.CylinderGeometry(0.13, 0.15, 0.1, 14), body, 0, -0.05, 0));
  base.add(mk(new THREE.BoxGeometry(0.36, 0.05, 0.14), body, 0, 0.02, 0));
  // yoke arms + head casing live in `head` (aimed along local -Y)
  head.add(mk(new THREE.BoxGeometry(0.05, 0.34, 0.12), body, 0.2, -0.3, 0));
  head.add(mk(new THREE.BoxGeometry(0.05, 0.34, 0.12), body, -0.2, -0.3, 0));
  head.add(mk(new THREE.BoxGeometry(0.4, 0.05, 0.12), body, 0, -0.12, 0));
  head.add(mk(new THREE.CylinderGeometry(0.15, 0.13, 0.34, 16), body, 0, -0.34, 0));
  head.add(mk(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), mats.emissive('lens', '#cfe0ff', 3), 0, -0.515, 0));
  base.scale.setScalar(scale);
  head.scale.setScalar(scale);
  return { base, head };
}

interface StrobeUnit {
  mat: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
}

interface LaserUnit {
  spec: FixtureSpec;
  mesh: THREE.InstancedMesh;
  count: number;
  body: THREE.Group;
}

interface ParUnit {
  spec: FixtureSpec;
  glow: THREE.Sprite;
  light: THREE.SpotLight | null;
}

export class LightingManager {
  readonly group = new THREE.Group();
  readonly hemi = new THREE.HemisphereLight('#1a2440', '#05060a', 0.5);
  readonly flashLight = new THREE.AmbientLight('#cfe0ff', 0);
  private heads: Head[] = [];
  private lasers: LaserUnit[] = [];
  private strobes: StrobeUnit[] = [];
  private pars: ParUnit[] = [];
  private washes: { quad: THREE.Mesh; glow: THREE.Sprite; order: number }[] = [];
  private blinders: THREE.Sprite[] = [];
  private blinder = 0;
  private ceilingLamps: { mat: THREE.MeshBasicMaterial; glow: THREE.Sprite; base: number }[] = [];
  private strips: LedStrip[] = [];
  private walls: LedWall[] = [];
  private rim: THREE.SpotLight | null = null;
  private fill: THREE.SpotLight | null = null;
  private bounds: Bounds = { x0: -12, x1: 12, z0: -6, z1: -28, wallZ: -34, wallY: 6, ceilY: 12 };
  private realLights: THREE.SpotLight[] = [];

  mode: LightingModeId = 'CALM';
  private prof: Profile = { ...PROFILES.CALM };
  private patternName = 'pool';
  private paletteName = 'breakdown';
  private palette: ColorSet = COLOR_SETS.breakdown;
  private lastPhrase = -1;
  private strobeUntil = 0;
  private strobeNext = 0;
  private strobeBurst = 0;
  private flash = 0;
  private time = 0;
  private rnd = mulberry32(((Date.now() & 0xffff) | 1) + 7);
  private quality!: QualityProfile;
  private hazeLevel = 0.5;
  /** Average light colour — used by haze + LED walls. */
  readonly avgColor = new THREE.Color('#4f7dff');
  readonly secondColor = new THREE.Color('#7b4dff');
  activeCount = 0;
  private lastDropT = -99;
  private lastBlinderT = -9;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpC = new THREE.Color();
  private glowTex: THREE.Texture;

  constructor(private readonly mats: MaterialLibrary) {
    this.group.name = 'lighting';
    this.glowTex = mats.softGlow;
  }

  /** Build runtime fixtures from the venue's specs. */
  build(ctx: BuildContext, quality: QualityProfile, bounds: Bounds): void {
    this.dispose();
    this.quality = quality;
    this.bounds = bounds;
    this.strips = ctx.strips;
    this.walls = ctx.ledWalls;
    const mats = this.mats;

    const movers = ctx.fixtures.filter((f) => f.kind === 'moving');
    const maxBeams = quality.maxBeams;
    const strideBeam = Math.max(1, Math.ceil(movers.length / Math.max(1, maxBeams)));
    const realMovers = Math.max(1, quality.realLights - 2);
    const realStride = Math.max(1, Math.floor(movers.length / realMovers));

    movers.forEach((spec, idx) => {
      const holder = new THREE.Group();
      holder.position.set(...spec.pos);
      const aim = new THREE.Group();
      const procedural = buildMovingHeadModel(mats, 1.5);
      if (assets.has('lighting/moving-head')) {
        aim.add(assets.model('lighting/moving-head', () => procedural.head));
      } else {
        holder.add(procedural.base);
        aim.add(procedural.head);
      }
      holder.add(aim);
      const beam = new Beam();
      aim.add(beam.mesh);
      const lens = glowSprite(this.glowTex, '#ffffff', 0.9);
      lens.position.set(0, -0.8, 0);
      aim.add(lens);
      const floorSpot = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xffffff }));
      floorSpot.rotation.x = -Math.PI / 2;
      floorSpot.renderOrder = 2;
      this.group.add(floorSpot);
      const active = idx % strideBeam === 0;
      let light: THREE.SpotLight | null = null;
      if (active && idx % realStride === 0 && this.realLights.length < realMovers) {
        light = new THREE.SpotLight('#ffffff', 0, 0, 0.32, 0.55, 2);
        light.castShadow = quality.shadows && this.realLights.length < 2;
        if (light.castShadow) {
          light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
          light.shadow.bias = -0.0004;
          light.shadow.camera.near = 1;
          light.shadow.camera.far = 60;
        }
        this.group.add(light, light.target);
        this.realLights.push(light);
      }
      holder.visible = true;
      this.group.add(holder);
      this.heads.push({
        spec, root: aim, head: aim, beam, lens, floorSpot,
        dir: new THREE.Vector3(0, -1, 0), target: new THREE.Vector3(spec.pos[0], 0, spec.pos[2]),
        color: new THREE.Color('#ffffff'), halfAngle: 0.11 + (idx % 3) * 0.025,
        index: 0, count: 0, light, active,
      });
      if (!active) { beam.mesh.visible = false; floorSpot.visible = false; }
    });
    // per-group indexing for patterns
    const groups = new Map<string, Head[]>();
    for (const h of this.heads) {
      const k = h.spec.group ?? 'rig';
      const list = groups.get(k) ?? [];
      list.push(h);
      groups.set(k, list);
    }
    for (const list of groups.values()) list.forEach((h, i) => { h.index = i; h.count = list.length; });
    this.activeCount = this.heads.filter((h) => h.active).length;

    // lasers
    const laserSpecs = ctx.fixtures.filter((f) => f.kind === 'laser').slice(0, quality.maxLasers);
    for (const spec of laserSpecs) {
      const count = 5;
      const geo = new THREE.CylinderGeometry(0.011, 0.011, 1, 4, 1, true);
      geo.translate(0, -0.5, 0);
      const mat = new THREE.MeshBasicMaterial({ color: C.laser.clone().multiplyScalar(3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.frustumCulled = false;
      mesh.position.set(...spec.pos);
      mesh.visible = false;
      const body = new THREE.Group();
      body.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.3), mats.blackMetal()));
      body.position.set(...spec.pos);
      this.group.add(mesh, body);
      this.lasers.push({ spec, mesh, count, body });
    }

    // strobes
    for (const spec of ctx.fixtures.filter((f) => f.kind === 'strobe')) {
      const mat = mats.ownEmissive('#ffffff', 0.15);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.18), mat);
      mesh.position.set(...spec.pos);
      this.group.add(mesh);
      this.strobes.push({ mat, mesh });
    }

    // blinders: warm glow at each strobe position, flashed on accents (rate-limited, never constant)
    for (const st of this.strobes) {
      const sp = glowSprite(this.glowTex, '#ffe2b0', 3.2);
      sp.position.copy(st.mesh.position).add(new THREE.Vector3(0, -0.2, 0.3));
      (sp.material as THREE.SpriteMaterial).opacity = 0;
      this.group.add(sp);
      this.blinders.push(sp);
    }

    // wall washers: coloured light spilling up the side walls
    const washSpecs = ctx.fixtures.filter((f) => f.kind === 'wash');
    washSpecs.forEach((spec, i) => {
      const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(6, spec.size ?? 8),
        new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.4 }),
      );
      quad.position.set(spec.pos[0], spec.pos[1] + (spec.size ?? 8) * 0.35, spec.pos[2]);
      quad.rotation.y = spec.side && spec.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      quad.renderOrder = 2;
      this.group.add(quad);
      const glow = glowSprite(this.glowTex, '#ffffff', 1.6);
      glow.position.set(spec.pos[0] + (spec.side && spec.side < 0 ? 0.25 : -0.25), spec.pos[1] + 0.1, spec.pos[2]);
      this.group.add(glow);
      this.washes.push({ quad, glow, order: i / Math.max(1, washSpecs.length - 1) });
    });

    // par / back lights
    for (const spec of ctx.fixtures.filter((f) => f.kind === 'par' || f.kind === 'back')) {
      const glow = glowSprite(this.glowTex, '#ffffff', spec.kind === 'back' ? 1.8 : 1.1);
      glow.position.set(...spec.pos);
      this.group.add(glow);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 14), mats.blackMetal());
      body.position.set(...spec.pos);
      body.rotation.x = Math.PI / 2;
      this.group.add(body);
      this.pars.push({ spec, glow, light: null });
    }

    // ceiling lamps
    for (const spec of ctx.fixtures.filter((f) => f.kind === 'ceiling' || f.kind === 'spot')) {
      const mat = mats.ownEmissive('#ffc88a', 1);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14), mat);
      lamp.position.set(...spec.pos);
      this.group.add(lamp);
      const glow = glowSprite(this.glowTex, '#ffb870', 1.4);
      glow.position.set(spec.pos[0], spec.pos[1] - 0.2, spec.pos[2]);
      this.group.add(glow);
      this.ceilingLamps.push({ mat, glow, base: spec.size ?? 1 });
    }

    // rim light (from the LED wall toward the DJ) — gives the crowd cinematic back-light
    const rimSpot = new THREE.SpotLight('#5a7dff', 0, 0, 0.9, 0.9, 1.6);
    rimSpot.position.set(0, bounds.wallY, bounds.wallZ + 1);
    rimSpot.target.position.set(0, 1.5, bounds.z0 + 4);
    this.group.add(rimSpot, rimSpot.target);
    this.rim = rimSpot;

    // soft cool fill from the DJ position so faces and raised hands read in the dark
    const fill = new THREE.SpotLight('#8fb0ff', 0, 0, 0.62, 0.9, 1.7);
    fill.position.set(0, 4.4, 1.6);
    fill.target.position.set(0, 1.4, bounds.z0 - 8);
    this.group.add(fill, fill.target);
    this.fill = fill;

    this.group.add(this.hemi, this.flashLight);
    this.realLights.forEach((l) => { l.intensity = 0; });
  }

  dispose(): void {
    for (const h of this.heads) { h.beam.material.dispose(); }
    this.group.clear();
    this.washes = []; this.blinders = []; this.heads = []; this.lasers = []; this.strobes = []; this.pars = []; this.ceilingLamps = [];
    this.realLights = [];
    this.rim = null;
    this.fill = null;
  }

  get lightCount(): number {
    return this.activeCount + this.lasers.length + this.strobes.length + this.pars.length + this.ceilingLamps.length;
  }

  setBounds(b: Bounds): void { this.bounds = b; }

  /** Resolve the visual mode from the crowd state (or an override). */
  private pickMode(f: CrowdFrame, s: Readonly<Settings>): LightingModeId {
    if (s.lightingMode !== 'AUTO') return s.lightingMode;
    if (f.musicActive < 0.25) return 'CALM'; // no music: the room idles
    switch (f.state) {
      case 'CALM': return new Date().getHours() >= 3 && new Date().getHours() < 7 ? 'AFTERHOURS' : 'CALM';
      case 'GROOVE': case 'RECOVERY': case 'ENERGY_BUILD': return 'HOUSE';
      case 'HYPE': return 'HOUSE';
      case 'PEAK': return 'PEAK';
      case 'DROP': return 'DROP';
      case 'BREAKDOWN': return 'BREAKDOWN';
    }
  }

  private choosePhrase(mode: LightingModeId, phrase: number): void {
    const pats = MODE_PATTERNS[mode];
    this.patternName = pats[Math.floor(this.rnd() * pats.length)];
    const sets = MODE_COLORS[mode];
    let name = sets[Math.floor(this.rnd() * sets.length)];
    // occasional accent phrase: mostly warm amber, rarely red
    if ((mode === 'HOUSE' || mode === 'PEAK') && this.rnd() < 0.08) name = this.rnd() < 0.75 ? 'warm' : 'redAccent';
    this.paletteName = name;
    this.palette = COLOR_SETS[name];
    void phrase;
  }

  update(f: CrowdFrame, s: Readonly<Settings>, dt: number, time: number): void {
    if (!this.heads.length && !this.strips.length) return;
    this.time = time;
    const mode = this.pickMode(f, s);
    const modeChanged = mode !== this.mode;
    if (modeChanged) {
      this.mode = mode;
      this.choosePhrase(mode, this.lastPhrase);
      if (mode === 'DROP') { this.strobeBurst = s.reduceFlashing ? 0 : 4; this.strobeNext = time + 0.15; this.lastDropT = time; this.flash = 0.35; }
    }
    const target = PROFILES[mode];
    const rate = mode === 'DROP' ? 9 : 1.4;
    const p = this.prof;
    for (const k of Object.keys(target) as (keyof Profile)[]) p[k] = damp(p[k], target[k], rate, dt);

    // phrase boundary: new pattern / palette every 16 beats (8 in DROP)
    const phraseLen = mode === 'DROP' ? 8 : 16;
    const phrase = Math.floor(f.beatCount / phraseLen);
    if (phrase !== this.lastPhrase) {
      this.lastPhrase = phrase;
      if (!modeChanged) this.choosePhrase(mode, phrase);
    }

    const intensityScale = (s.lightingIntensity / 100) * clamp(0.7 + f.lightingIntensity * 0.5, 0.5, 1.3);
    const mus = clamp(f.musicActive * 1.4);
    const pulse = Math.pow(clamp(1 - f.beatPhase), 2.5) * mus;
    const kick = f.kick;
    const bassLift = 1 + p.pulse * kick * 0.6 * mus;
    this.flash = damp(this.flash, 0, 7, dt);
    const buildBoost = 1 + f.buildIntensity * 0.5;

    // ---------------- colours
    const pal = this.palette;
    this.avgColor.set(0, 0, 0);
    for (const c of pal) this.avgColor.add(c);
    this.avgColor.multiplyScalar(1 / pal.length);
    this.secondColor.copy(pal[Math.min(1, pal.length - 1)]);

    // ---------------- moving heads
    const speed = p.speed * (0.65 + f.crowdEnergy / 180) * (1 + f.buildIntensity * 0.7);
    const pat = PATTERNS[this.patternName];
    const followRate = this.patternName === 'snap' ? 12 : 1.8 + p.speed * 4;
    const beatPos = f.beatCount + f.beatPhase;
    for (let hi = 0; hi < this.heads.length; hi++) {
      const h = this.heads[hi];
      if (!h.active) continue;
      pat(h.index, h.count, time, speed, h.spec.side ?? 0, beatPos, h.target, this.tmpV.set(...h.spec.pos), this.bounds);
      const hp = h.spec.pos;
      this.tmpV.set(h.target.x - hp[0], h.target.y - hp[1], h.target.z - hp[2]).normalize();
      h.dir.lerp(this.tmpV, 1 - Math.exp(-followRate * dt)).normalize();
      // orientation: local -Y -> dir
      h.root.quaternion.setFromUnitVectors(this.tmpV2.set(0, -1, 0), h.dir);

      // colour
      const cIdx = (h.index + Math.floor(this.lastPhrase) + (h.spec.side && h.spec.side > 0 ? 1 : 0)) % pal.length;
      this.tmpC.copy(pal[cIdx]);
      h.color.lerp(this.tmpC, 1 - Math.exp(-6 * dt));

      // intensity: base * beat pulse, plus accent on strong beats
      const stagger = 0.65 + 0.35 * Math.sin(time * 0.7 + h.index * 1.7);
      const inten = clamp(p.head * intensityScale * bassLift * buildBoost * (1 - p.pulse * 0.55 * (1 - pulse)) * (mode === 'CALM' || mode === 'BREAKDOWN' ? stagger : 1) + this.flash * 0.6, 0, 3);

      // length: distance to the floor along the beam (or far)
      let len = 38;
      if (h.dir.y < -0.02) len = Math.min(len, -hp[1] / h.dir.y);
      h.beam.set(h.color, inten * 0.5 * (0.5 + 0.9 * this.hazeLevel) * p.haze, len, h.halfAngle);
      // lens glow
      (h.lens.material as THREE.SpriteMaterial).color.copy(h.color).multiplyScalar(0.5 + inten * 0.7);
      // floor spot
      if (h.dir.y < -0.05 && len < 38) {
        h.floorSpot.visible = true;
        h.floorSpot.position.set(hp[0] + h.dir.x * len, 0.03, hp[2] + h.dir.z * len);
        const r = Math.tan(h.halfAngle) * len * 1.6;
        h.floorSpot.scale.set(r, r, r);
        (h.floorSpot.material as THREE.MeshBasicMaterial).color.copy(h.color).multiplyScalar(inten * 0.55);
      } else h.floorSpot.visible = false;

      if (h.light) {
        h.light.position.set(...hp);
        const hitLen = Math.min(len, 40);
        h.light.target.position.set(hp[0] + h.dir.x * hitLen, hp[1] + h.dir.y * hitLen, hp[2] + h.dir.z * hitLen);
        h.light.color.copy(h.color);
        h.light.intensity = inten * 420;
        h.light.angle = Math.max(0.14, h.halfAngle * 2.6);
      }
    }

    // ---------------- lasers
    const laserOn = p.lasers > 0.12 && !s.reduceFlashing ? p.lasers : 0;
    for (const L of this.lasers) {
      L.mesh.visible = laserOn > 0.05;
      if (!L.mesh.visible) continue;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const dir = new THREE.Vector3();
      const sc = new THREE.Vector3();
      const lp = L.spec.pos;
      const spin = time * (0.6 + speed * 0.8);
      const style = Math.floor(this.lastPhrase / 2) % 3;
      for (let i = 0; i < L.count; i++) {
        const u = i / (L.count - 1) - 0.5;
        if (style === 0) {
          // flat fan sweeping over the crowd
          dir.set(u * 1.8 * Math.cos(spin * 0.5), -0.28 + 0.12 * Math.sin(spin + i * 0.4), -1);
        } else if (style === 1) {
          // cone
          const a = spin + (i / L.count) * Math.PI * 2;
          dir.set(Math.cos(a) * 0.42, -0.25 + Math.sin(a) * 0.3, -1);
        } else {
          dir.set(u * 2.6, -0.1 - 0.25 * (0.5 + 0.5 * Math.sin(spin * 2 + i)), -1);
        }
        dir.normalize();
        q.setFromUnitVectors(this.tmpV.set(0, -1, 0), dir);
        sc.set(1, 55, 1);
        m.compose(this.tmpV2.set(0, 0, 0), q, sc);
        L.mesh.setMatrixAt(i, m);
      }
      L.mesh.instanceMatrix.needsUpdate = true;
      const col = laserOn > 0.8 && (this.paletteName === 'violet' || this.paletteName === 'bluePurple') ? C.laserBlue : C.laser;
      (L.mesh.material as THREE.MeshBasicMaterial).color.copy(col).multiplyScalar(2.2 * laserOn);
      (L.mesh.material as THREE.MeshBasicMaterial).opacity = clamp(0.35 + laserOn * 0.55);
      L.mesh.position.set(lp[0], lp[1], lp[2]);
    }

    // ---------------- strobes (rate-limited; never constant)
    let strobeLevel = 0.12 * p.ambient * (mode === 'CALM' || mode === 'BREAKDOWN' ? 0.3 : 1);
    if (!s.reduceFlashing) {
      if (this.strobeBurst > 0 && time >= this.strobeNext) {
        this.strobeUntil = time + 0.06;
        this.strobeNext = time + 0.42; // ≈ 2.4 Hz — below the 3 Hz photosensitivity guideline
        this.strobeBurst--;
        this.flash = Math.max(this.flash, 0.22);
      }
      // occasional accent on phrase starts in PEAK
      if (mode === 'PEAK' && f.events.strongBeat && f.beatInBar === 0 && this.rnd() < 0.12 && this.strobeBurst === 0) this.strobeBurst = 2;
      if (time < this.strobeUntil) strobeLevel = 3.2;
    }
    for (const st of this.strobes) st.mat.color.set('#eaf2ff').multiplyScalar(strobeLevel);

    // ---------------- blinders: accent on every other beat in PEAK / DROP
    if (!s.reduceFlashing && (mode === 'PEAK' || mode === 'DROP') && f.events.beat && f.beatInBar % 2 === 0 && time - this.lastBlinderT > 0.45) {
      this.blinder = mode === 'DROP' ? 1 : 0.7;
      this.lastBlinderT = time;
    }
    this.blinder *= Math.exp(-dt / 0.1);
    for (const b of this.blinders) (b.material as THREE.SpriteMaterial).opacity = clamp(this.blinder);

    // ---------------- wall washers (colour follows the palette, pulse follows the beat)
    this.washes.forEach((w, i) => {
      const c = pal[(i + this.lastPhrase) % pal.length];
      const v = (0.1 + p.rim * 0.35 + pulse * p.pulse * 0.5 + f.dropIntensity * 0.5) * intensityScale * (0.6 + 0.4 * mus);
      const m = w.quad.material as THREE.MeshBasicMaterial;
      m.color.copy(c);
      m.opacity = clamp(v, 0, 0.9);
      (w.glow.material as THREE.SpriteMaterial).color.copy(c).multiplyScalar(0.8 + v);
    });

    // ---------------- ceiling / warm lamps
    for (const cl of this.ceilingLamps) {
      const v = p.ceiling * cl.base * (mode === 'PEAK' || mode === 'DROP' ? 0.4 : 1);
      cl.mat.color.set('#ffc88a').multiplyScalar(0.15 + v * 1.6);
      (cl.glow.material as THREE.SpriteMaterial).opacity = clamp(v * 0.8);
    }

    // ---------------- back / par
    this.pars.forEach((pr, i) => {
      const c = pal[(i + this.lastPhrase) % pal.length];
      const v = (p.rim * 0.9 + pulse * p.pulse * 0.6) * intensityScale;
      (pr.glow.material as THREE.SpriteMaterial).color.copy(c).multiplyScalar(0.5 + v * 1.4);
      (pr.glow.material as THREE.SpriteMaterial).opacity = clamp(0.4 + v * 0.5);
    });

    // ---------------- rim light
    if (this.rim) {
      this.rim.color.copy(this.avgColor).lerp(C.white, 0.2);
      this.rim.intensity = (p.rim * 300 + f.dropIntensity * 350) * intensityScale * (0.8 + 0.2 * pulse);
    }

    if (this.fill) {
      this.fill.color.set('#8fb0ff').lerp(this.avgColor, 0.25);
      this.fill.intensity = (150 + 330 * (f.crowdEnergy / 100) + f.dropIntensity * 300) * intensityScale * (mode === 'BREAKDOWN' ? 0.7 : 1);
    }

    // ---------------- LED strips (chases)
    const chase = (beatPos * 0.25) % 1;
    const stripGain: Record<string, number> = { floor: 0.3, pillar: 0.45, balcony: 0.7, wall: 0.8, booth: 1, stage: 0.9, bar: 0.8, ceiling: 0.7 };
    for (const st of this.strips) {
      const ci = Math.floor(st.order * pal.length + this.lastPhrase) % pal.length;
      let v = p.strips * 0.5;
      const wave = 0.5 + 0.5 * Math.sin((st.order - chase) * Math.PI * 4);
      v *= 0.55 + 0.45 * wave;
      v *= 0.7 + 0.5 * pulse * p.pulse + f.dropIntensity;
      if (mode === 'BREAKDOWN' || mode === 'CALM') v = p.strips * (0.35 + 0.3 * (0.5 + 0.5 * Math.sin(time * 0.5 + st.order * 6)));
      st.material.color.copy(pal[ci]).multiplyScalar((0.05 + v * 1.6 * intensityScale) * (stripGain[st.group] ?? 1));
    }

    // ---------------- hemisphere ambient + flash
    this.hemi.intensity = (0.26 + 0.22 * (f.crowdEnergy / 100)) * p.ambient * (0.4 + 0.6 * intensityScale);
    this.hemi.color.copy(this.avgColor).multiplyScalar(0.28).add(new THREE.Color('#0c1224'));
    this.flashLight.intensity = this.flash * 0.9;

    // ---------------- LED walls
    for (const w of this.walls) {
      w.update({
        time,
        bass: f.bassEnergy,
        energy: f.crowdEnergy / 100,
        kick,
        drop: f.dropIntensity,
        build: f.buildIntensity,
        breakdown: mode === 'BREAKDOWN' ? 1 : 0,
        high: f.highFrequencyEnergy,
        brightness: p.wall * (0.55 + 0.45 * intensityScale),
        colA: pal[0],
        colB: pal[Math.min(1, pal.length - 1)],
      });
    }
    this.hazeLevel = damp(this.hazeLevel, clamp(s.fogAmount / 100 * p.haze), 2, dt);
    void this.lastDropT;
  }

  /** Strength of the haze the beams should punch through (0..1.6). */
  get hazeDensity(): number { return this.prof.haze; }
  get currentPattern(): string { return this.patternName; }
  get currentPalette(): string { return this.paletteName; }
  get lightingMode(): LightingModeId { return this.mode; }
  get avgLightColor(): THREE.Color { return this.avgColor; }
  get flashAmount(): number { return this.flash; }
  get realLightCount(): number { return this.realLights.length + 2; }
}
