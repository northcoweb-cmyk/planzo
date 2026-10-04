import * as THREE from 'three';
import type { CrowdFrame, CrowdStateName } from '../core/types';
import type { Settings } from '../core/Settings';
import { clamp, damp, mulberry32, weightedIndex } from '../util/math';
import { CharacterLibrary } from './CharacterAssets';
import { CrowdRenderer, type Placement } from './CrowdRenderer';
import { generateLayout, type CrowdRegion, type PersonSpawn } from './CrowdLayout';
import { CS, CS_COUNT, CS_NAMES, REACTIONS, STATE_HOLD, STATE_WEIGHTS } from './reactions';

const MOD_JUMP = 1;
const MOD_PHONE = 2;
const TWO_PI = Math.PI * 2;

// pose slots
const DY = 0, LEAN = 1, SWAY = 2, TWIST = 3;
const A_PITCH = 4, A_ABD = 5, A_ELB = 6, NOD = 7;
const B_PITCH = 8, B_ABD = 9, B_ELB = 10, YAW = 11;
const STEP_A = 12, STEP_B = 13, SPAWN = 14, PROP = 15;
const RATE = [32, 12, 12, 12, 9, 9, 9, 10, 9, 9, 9, 10, 14, 14, 0, 0];

interface Person {
  spawn: PersonSpawn;
  place: Placement;
  // traits
  style: number;
  intensity: number;
  delaySec: number;
  reactive: number;
  handsP: number;
  jumpP: number;
  phoneP: number;
  clapP: number;
  pointP: number;
  phi: number;
  phi2: number;
  /** small per-person arm timing jitter (rad) — keeps arms ON the beat but not robotic */
  armJit: number;
  drink: boolean;
  // dynamic
  state: number;
  mods: number;
  tNext: number;
  kickAt: number;
  kickAmp: number;
  impulse: number;
  flashUntil: number;
  lastT: number;
  spawnScale: number;
  pose: Float32Array;
  strideOffset: number;
}

export interface CrowdStats {
  total: number;
  visible: number;
  handsUp: number;
  phones: number;
  jumping: number;
  drawCalls: number;
  byState: number[];
}

/**
 * Crowd simulation: owns every person's behaviour (state, traits, timing) and writes poses into the
 * GPU buffers. It knows nothing about meshes — only about the Placement it was handed.
 */
export class CrowdManager {
  readonly library = new CharacterLibrary();
  readonly renderer: CrowdRenderer;
  private people: Person[] = [];
  private tgt = new Float32Array(16);
  private rnd = mulberry32(Date.now() & 0xffffffff);
  private lastMacro: CrowdStateName = 'CALM';
  private handsSens = 1;
  private phoneFreq = 1;
  private phoneCap = 0.12;
  private frameNo = 0;
  private hadMusic = true;
  private visibleCache = 0;
  private lastVisibleT = 0;
  stats: CrowdStats = { total: 0, visible: 0, handsUp: 0, phones: 0, jumping: 0, drawCalls: 0, byState: new Array(CS_COUNT).fill(0) };
  private regions: CrowdRegion[] = [];
  private exclusions: { x: number; z: number; r: number }[] = [];
  private cameraPos = new THREE.Vector3();
  private seed = 1;

  constructor() {
    this.renderer = new CrowdRenderer(this.library);
  }

  get group(): THREE.Group { return this.renderer.group; }
  get count(): number { return this.people.length; }

  /** (Re)build the crowd for a venue. Cheap enough to call on setting changes. */
  layout(regions: CrowdRegion[], seed: number, settings: Readonly<Settings>, maxCount: number, camera: THREE.Vector3, exclusions: { x: number; z: number; r: number }[] = []): void {
    this.regions = regions;
    this.exclusions = exclusions;
    this.seed = seed;
    this.cameraPos.copy(camera);
    const spawns = generateLayout(regions, {
      seed,
      fill: settings.crowdDensity / 100,
      maxCount,
      characterCount: this.library.count,
      camera,
      detailBias: settings.characterDensity / 100,
      exclusions,
    });
    const placements = this.renderer.rebuild(spawns);
    const r = this.rnd;
    this.people = spawns.map((spawn, i): Person => {
      const phoneRoll = r();
      const p: Person = {
        spawn,
        place: placements[i],
        style: Math.floor(r() * 4),
        intensity: 0.55 + r() * 0.85,
        delaySec: Math.pow(r(), 1.6) * 0.09,
        reactive: 0.2 + r() * 0.8,
        handsP: 0.35 + r() * 0.9,
        jumpP: r() < 0.3 ? 0.1 : 0.4 + r() * 0.9,
        phoneP: phoneRoll < 0.3 ? 0 : 0.4 + r() * 1.1,
        clapP: 0.3 + r(),
        pointP: r() < 0.5 ? 0.2 : 0.8 + r() * 0.6,
        phi: r() * TWO_PI,
        phi2: r() * TWO_PI,
        armJit: (r() - 0.5) * 0.5,
        drink: r() < 0.28,
        state: CS.IDLE,
        mods: 0,
        tNext: 0,
        kickAt: 0,
        kickAmp: 0,
        impulse: 0,
        flashUntil: 0,
        lastT: 0,
        spawnScale: 1,
        pose: new Float32Array(16),
        strideOffset: Math.floor(r() * 3),
      };
      p.pose[SPAWN] = 1;
      p.pose[A_PITCH] = 0.05; p.pose[B_PITCH] = 0.05;
      p.pose[A_ABD] = 0.09; p.pose[B_ABD] = 0.09;
      return p;
    });
    this.applySettings(settings);
    const t0 = performance.now() / 1000;
    for (const p of this.people) {
      p.tNext = t0 + this.rnd() * 2;
      p.spawnScale = 1;
    }
    this.stats.total = this.people.length;
    this.stats.drawCalls = this.renderer.drawCalls;
  }

  applySettings(s: Readonly<Settings>): void {
    this.handsSens = 0.3 + (s.handsUpSensitivity / 100) * 1.4;
    this.phoneFreq = s.phoneFrequency / 50;
  }

  /** Re-layout when the density-related settings change, keeping the venue. */
  relayout(settings: Readonly<Settings>, maxCount: number): void {
    if (this.regions.length) this.layout(this.regions, this.seed, settings, maxCount, this.cameraPos, this.exclusions);
  }

  // -------------------------------------------------------------------------------------------
  update(f: CrowdFrame, dt: number, now: number): void {
    if (!this.people.length) return;
    const r = this.rnd;
    const E = f.crowdEnergy / 100;
    const mus = f.musicActive;
    // music started / stopped: everybody reconsiders within a second or two (nobody keeps dancing in silence)
    if ((mus < 0.2 && this.hadMusic) || (mus > 0.5 && !this.hadMusic)) {
      this.hadMusic = mus > 0.5;
      for (const p of this.people) p.tNext = Math.min(p.tNext, now + p.delaySec * 3 + r() * (this.hadMusic ? 1.2 : 0.9));
    }
    const bpm = f.bpm;
    const bps = bpm / 60;
    const beatPos = f.beatCount + f.beatPhase;
    this.frameNo++;

    // ---- macro transitions & big events: stagger reactions per person -----------------------
    const macroChanged = f.state !== this.lastMacro;
    if (macroChanged) this.lastMacro = f.state;

    if (f.events.drop) {
      const prof = REACTIONS.bigDrop;
      const phoneBudget = Math.floor(this.people.length * this.phoneCap);
      let dropPhones = 0;
      for (const p of this.people) {
        p.mods = 0;
        const delay = Math.pow(r(), 1.3) * 0.7 + p.delaySec;
        let st: number = CS.BIG_DROP;
        const roll = r();
        if (roll < prof.handsUp * p.handsP * this.handsSens * 0.75) st = CS.BIG_DROP;
        else if (r() < prof.clap * p.clapP) st = CS.CLAPPING;
        else if (r() < prof.point * p.pointP) st = CS.POINTING;
        else st = r() < 0.5 ? CS.HYPE : CS.CHEERING;
        if (st === CS.BIG_DROP || st === CS.HYPE || st === CS.CHEERING) {
          if (r() < prof.jump * p.jumpP) p.mods |= MOD_JUMP;
          if (dropPhones < phoneBudget && r() < prof.phone * p.phoneP * this.phoneFreq) { p.mods |= MOD_PHONE; dropPhones++; }
        }
        p.state = st;
        p.tNext = now + delay + 4.5 + r() * 4.5;
        // hold the previous pose for `delay` by deferring via a pending state
        p.kickAt = now + delay; // reuse as "react from" time
        p.kickAmp = -1; // marker: drop reaction pending
      }
    } else if (macroChanged) {
      const spread = f.state === 'ENERGY_BUILD' ? 3.5 : 2.2;
      for (const p of this.people) p.tNext = Math.min(p.tNext, now + p.delaySec + r() * spread);
    }

    // ---- beat impulses: probabilistic per person -------------------------------------------
    if (f.events.beat) {
      const strength = f.events.strongBeat ? 1 : 0.7;
      const prob = f.reactionProbability;
      for (const p of this.people) {
        if (p.kickAmp === -1) continue;
        if (r() < prob * p.reactive) {
          p.kickAt = now + p.delaySec;
          p.kickAmp = strength * (0.5 + r() * 0.9) * p.intensity;
        }
      }
    }

    // ---- headline stats (cheap, every ~0.5s) -------------------------------------------------
    const doStats = now - this.lastVisibleT > 0.5;
    const byState = this.stats.byState;
    if (doStats) byState.fill(0);

    const visFrac = f.crowdDensity;
    let phones = 0;
    if (doStats) for (const p of this.people) if (p.state === CS.PHONE_RECORDING || (p.mods & MOD_PHONE)) phones++;
    const phoneCapNow = Math.floor(this.people.length * this.phoneCap);
    const phonesAllowed = phones < phoneCapNow;
    this.phonesNow = phones;

    // ---- per-person update ------------------------------------------------------------------
    const T = this.tgt;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      const lod = p.spawn.lod;
      const stride = lod === 0 ? 1 : lod === 1 ? 2 : 3;
      const arrivalVisible = p.spawn.arrival <= visFrac;
      if (stride > 1 && (this.frameNo + p.strideOffset) % stride !== 0) continue;
      const pdt = Math.min(0.1, now - p.lastT || dt);
      p.lastT = now;

      // spawn scale (people drift in as the venue fills)
      const target = arrivalVisible ? 1 : 0;
      p.spawnScale = damp(p.spawnScale, target, 1.4, pdt);
      if (p.spawnScale < 0.01) {
        p.pose[SPAWN] = 0;
        this.writePose(p);
        continue;
      }

      // pending drop reaction start
      if (p.kickAmp === -1 && now >= p.kickAt) {
        p.kickAmp = 0;
        p.kickAt = 0;
      }
      const reacting = p.kickAmp !== -1;
      // state re-roll
      if (now >= p.tNext) this.pickState(p, f, E, phonesAllowed);
      if (doStats) byState[p.state]++;

      // beat impulse
      if (reacting && p.kickAt > 0 && now >= p.kickAt) {
        p.impulse = p.kickAmp;
        p.kickAt = 0;
      }
      p.impulse *= Math.exp(-pdt / 0.11);

      // ---- targets ----
      T.fill(0);
      const bp = beatPos - p.delaySec * bps;
      const ph = bp - Math.floor(bp);
      const dip = Math.pow(0.5 + 0.5 * Math.cos(TWO_PI * ph), 1.4);
      const A = p.intensity * (0.5 + 0.8 * E) * (0.55 + 0.45 * p.reactive) * Math.min(1, mus * 1.3);
      const t = now;
      const phi = p.phi;
      const aj = p.armJit;
      const s1 = Math.sin(Math.PI * bp + aj);
      const calmMacro = f.state === 'CALM' || f.state === 'BREAKDOWN';
      // rest arms
      T[A_PITCH] = 0.05; T[B_PITCH] = 0.05; T[A_ABD] = 0.09; T[B_ABD] = 0.09; T[A_ELB] = 0.14; T[B_ELB] = 0.14;
      T[SPAWN] = p.spawnScale;
      let prop = 0;
      const stt = reacting ? p.state : (p.state === CS.BIG_DROP || p.state === CS.HYPE || p.state === CS.CHEERING ? CS.DANCING : p.state);
      const doBp = p.style === 1 ? bp * 0.5 : bp; // half-time movers
      const phB = doBp - Math.floor(doBp);
      const dipB = Math.pow(0.5 + 0.5 * Math.cos(TWO_PI * phB), 1.4);

      switch (stt) {
        case CS.IDLE:
          T[DY] = 0.004 * Math.sin(t * 1.4 + phi) - 0.006 * (0.5 + 0.5 * Math.sin(t * 0.5 + phi));
          T[SWAY] = 0.05 * Math.sin(t * 0.45 + phi * 3);
          T[TWIST] = 0.12 * Math.sin(t * 0.31 + p.phi2);
          T[YAW] = 0.35 * Math.sin(t * 0.27 + p.phi2) + 0.12;
          T[LEAN] = 0.02 + 0.015 * Math.sin(t * 0.7 + phi);
          T[A_PITCH] = 0.1 + 0.08 * Math.sin(t * 0.6 + phi); T[A_ELB] = 0.2 + 0.15 * Math.sin(t * 0.4 + p.phi2);
          T[B_PITCH] = 0.1 + 0.08 * Math.sin(t * 0.5 + p.phi2);
          break;
        case CS.LOW_ENERGY:
          T[DY] = -0.014 * A * dipB;
          T[SWAY] = 0.07 * A * Math.sin(Math.PI * bp * 0.5 + aj);
          T[TWIST] = 0.1 * A * Math.sin(Math.PI * bp * 0.5 + aj + 1);
          T[NOD] = 0.05 * dipB;
          T[A_PITCH] = 0.22 + 0.12 * Math.sin(Math.PI * bp * 0.5 + aj); T[A_ELB] = 0.5;
          T[B_PITCH] = 0.22 - 0.12 * Math.sin(Math.PI * bp * 0.5 + aj); T[B_ELB] = 0.5;
          T[YAW] = 0.16 * Math.sin(t * 0.3 + p.phi2);
          break;
        case CS.DANCING:
          T[DY] = -0.06 * A * dipB;
          T[SWAY] = 0.1 * A * s1;
          T[TWIST] = 0.22 * A * Math.sin(Math.PI * bp + aj + 0.7);
          T[LEAN] = 0.04 * A * dipB;
          T[A_PITCH] = 0.4 + 0.7 * A * (0.5 + 0.5 * s1); T[A_ELB] = 0.9 + 0.3 * s1; T[A_ABD] = 0.15 + 0.1 * A;
          T[B_PITCH] = 0.4 + 0.7 * A * (0.5 - 0.5 * s1); T[B_ELB] = 0.9 - 0.3 * s1; T[B_ABD] = 0.15 + 0.1 * A;
          T[STEP_A] = Math.max(0, s1) * 0.4 * A;
          T[STEP_B] = Math.max(0, -s1) * 0.4 * A;
          T[NOD] = 0.1 * A * dipB;
          T[YAW] = 0.12 * Math.sin(Math.PI * bp * 0.5 + p.phi2);
          break;
        case CS.BOUNCING:
          T[DY] = -0.1 * A * dipB;
          T[LEAN] = 0.07 * A * dipB;
          T[SWAY] = 0.04 * A * s1;
          T[A_PITCH] = 0.5 + 0.55 * A * dipB; T[A_ELB] = 1.4; T[A_ABD] = 0.2;
          T[B_PITCH] = 0.5 + 0.55 * A * dipB; T[B_ELB] = 1.4; T[B_ABD] = 0.2;
          T[NOD] = 0.16 * A * dipB;
          T[STEP_A] = 0.12 * A * (1 - dipB); T[STEP_B] = 0.12 * A * (1 - dipB);
          break;
        case CS.HANDS_UP: {
          const w = Math.sin(Math.PI * bp * 0.5 + p.phi2);
          T[A_PITCH] = 2.62 + 0.22 * A * s1; T[A_ABD] = 0.24 + 0.14 * w; T[A_ELB] = 0.16 + 0.26 * (0.5 + 0.5 * w);
          T[B_PITCH] = 2.62 + 0.22 * A * Math.sin(Math.PI * bp + aj + 1.7); T[B_ABD] = 0.24 - 0.14 * w; T[B_ELB] = 0.16 + 0.26 * (0.5 - 0.5 * w);
          T[DY] = -0.055 * A * dipB; T[LEAN] = -0.07; T[NOD] = -0.16 + 0.08 * dipB;
          T[SWAY] = 0.05 * s1;
          break;
        }
        case CS.JUMPING: {
          const lift = 4 * phB * (1 - phB);
          T[DY] = (0.09 + 0.1 * A) * Math.pow(lift, 0.9) - 0.045 * A * Math.exp(-phB * 9);
          T[A_PITCH] = 2.1 + 0.5 * lift; T[A_ABD] = 0.3; T[A_ELB] = 0.4;
          T[B_PITCH] = 2.1 + 0.5 * lift; T[B_ABD] = 0.3; T[B_ELB] = 0.4;
          T[NOD] = -0.1; T[LEAN] = -0.04;
          break;
        }
        case CS.PHONE_RECORDING: {
          const low = calmMacro;
          if (low) {
            // looking at the phone near the chest
            T[B_PITCH] = 0.95; T[B_ELB] = 1.5; T[B_ABD] = 0.0; T[NOD] = 0.26;
            prop = 3;
            T[DY] = -0.01 * A * dipB; T[SWAY] = 0.03 * Math.sin(t * 0.5 + phi);
          } else {
            T[B_PITCH] = 2.1 + 0.03 * Math.sin(t * 1.3 + phi); T[B_ELB] = 0.7; T[B_ABD] = 0.04;
            prop = t < p.flashUntil ? 2 : 1;
            T[A_PITCH] = 0.25 + 0.2 * s1; T[A_ELB] = 0.6; T[A_ABD] = 0.12;
            T[DY] = -0.03 * A * dipB; T[SWAY] = 0.05 * A * s1; T[NOD] = -0.02;
          }
          break;
        }
        case CS.CHEERING: {
          const fast = Math.sin(TWO_PI * bp * 2 + aj);
          T[A_PITCH] = 2.78 + 0.18 * fast; T[A_ABD] = 0.45 + 0.2 * fast; T[A_ELB] = 0.2;
          T[B_PITCH] = 2.78 - 0.18 * fast; T[B_ABD] = 0.45 - 0.2 * fast; T[B_ELB] = 0.2;
          const lift = 4 * phB * (1 - phB);
          T[DY] = 0.05 * A * lift - 0.04 * A * dipB;
          T[NOD] = -0.2 + 0.12 * dipB; T[YAW] = 0.18 * Math.sin(TWO_PI * bp + aj);
          break;
        }
        case CS.LOOKING_AROUND: {
          T[YAW] = 0.75 * Math.sin(t * 0.8 + p.phi2) * (1 + 0.3 * Math.sin(t * 0.33 + phi));
          T[SWAY] = 0.035 * Math.sin(t * 0.5 + phi); T[DY] = -0.012 * A * dipB;
          T[NOD] = 0.03 * Math.sin(t * 0.6 + phi);
          T[TWIST] = 0.1 * Math.sin(t * 0.8 + p.phi2);
          break;
        }
        case CS.CLAPPING: {
          const c = Math.pow(0.5 + 0.5 * Math.cos(TWO_PI * ph), 3);
          T[A_PITCH] = 1.15; T[A_ELB] = 1.6; T[A_ABD] = 0.34 - 0.58 * c;
          T[B_PITCH] = 1.15; T[B_ELB] = 1.6; T[B_ABD] = 0.34 - 0.58 * c;
          T[DY] = -0.025 * A * dip; T[NOD] = 0.08 * c; T[YAW] = 0.0;
          break;
        }
        case CS.POINTING: {
          T[B_PITCH] = 1.5 + 0.13 * dip; T[B_ELB] = 0.1; T[B_ABD] = -0.02;
          T[A_PITCH] = 0.15; T[A_ELB] = 0.5;
          T[DY] = -0.03 * A * dip; T[LEAN] = 0.05; T[YAW] = 0;
          break;
        }
        case CS.HYPE: {
          const alt = Math.sin(Math.PI * bp + aj);
          T[A_PITCH] = 2.35 + 0.42 * alt; T[A_ABD] = 0.3; T[A_ELB] = 0.5 - 0.3 * alt;
          T[B_PITCH] = 2.35 - 0.42 * alt; T[B_ABD] = 0.3; T[B_ELB] = 0.5 + 0.3 * alt;
          T[DY] = -0.09 * A * dip; T[LEAN] = 0.06 * dip - 0.05; T[NOD] = -0.1 + 0.22 * dip;
          T[SWAY] = 0.05 * alt;
          break;
        }
        case CS.BIG_DROP: {
          const sh = Math.sin(TWO_PI * bp * 2 + aj);
          T[A_PITCH] = 2.88 + 0.12 * sh; T[A_ABD] = 0.55 + 0.18 * sh; T[A_ELB] = 0.1;
          T[B_PITCH] = 2.88 - 0.12 * sh; T[B_ABD] = 0.55 - 0.18 * sh; T[B_ELB] = 0.1;
          if (p.mods & MOD_JUMP) {
            const lift = 4 * phB * (1 - phB);
            T[DY] = (0.12 + 0.12 * A) * Math.pow(lift, 0.85) - 0.05 * A * Math.exp(-phB * 9);
          } else T[DY] = -0.07 * A * dipB;
          T[LEAN] = -0.1; T[NOD] = -0.2 + 0.25 * dipB; T[SWAY] = 0.06 * s1;
          if (p.mods & MOD_PHONE) {
            T[B_PITCH] = 2.1; T[B_ELB] = 0.7; T[B_ABD] = 0.04;
            prop = t < p.flashUntil ? 2 : 1;
          }
          break;
        }
      }
      // drinks in idle-ish states
      if (p.drink && prop === 0 && (stt === CS.IDLE || stt === CS.LOW_ENERGY || stt === CS.LOOKING_AROUND || stt === CS.DANCING)) {
        T[B_PITCH] = 0.48 + 0.04 * Math.sin(t * 0.4 + phi); T[B_ELB] = 1.62; T[B_ABD] = 0.1;
        prop = 4;
      }
      // beat impulse flavour
      T[DY] -= 0.022 * p.impulse;
      T[NOD] += 0.1 * p.impulse;
      T[LEAN] += 0.025 * p.impulse;
      if (stt === CS.PHONE_RECORDING || (p.mods & MOD_PHONE && stt === CS.BIG_DROP)) {
        // occasional camera flash on strong beats at high energy
        if (f.events.strongBeat && E > 0.7 && r() < 0.05 * this.phoneFreq) p.flashUntil = now + 0.11;
      }
      T[PROP] = prop;

      // ---- smoothing into the person's live pose ----
      const pose = p.pose;
      for (let k = 0; k < 14; k++) {
        const rate = RATE[k];
        pose[k] = damp(pose[k], T[k], rate, pdt);
      }
      pose[SPAWN] = p.spawnScale;
      pose[PROP] = prop;
      this.writePose(p);
    }

    if (doStats) {
      this.lastVisibleT = now;
      let hands = 0, jump = 0, vis = 0;
      for (const p of this.people) {
        if (p.spawnScale <= 0.5) continue;
        vis++;
        if (p.state === CS.HANDS_UP || p.state === CS.BIG_DROP || p.state === CS.CHEERING || p.state === CS.HYPE) hands++;
        if (p.state === CS.JUMPING || (p.mods & MOD_JUMP && p.state === CS.BIG_DROP)) jump++;
      }
      this.stats.handsUp = hands;
      this.stats.jumping = jump;
      this.stats.phones = phones;
      this.stats.visible = vis;
      this.visibleCache = vis;
    }
    this.renderer.flush();
  }

  private phonesNow = 0;

  private writePose(p: Person): void {
    const { bucket, slot } = p.place;
    const o = slot * 4;
    const s = p.pose;
    for (let q = 0; q < 4; q++) {
      const arr = bucket.pose[q];
      arr[o] = s[q * 4];
      arr[o + 1] = s[q * 4 + 1];
      arr[o + 2] = s[q * 4 + 2];
      arr[o + 3] = s[q * 4 + 3];
    }
  }

  private w = new Float32Array(CS_COUNT);

  private pickState(p: Person, f: CrowdFrame, E: number, phonesAllowed: boolean): void {
    const base = STATE_WEIGHTS[f.state] ?? STATE_WEIGHTS.GROOVE;
    const w = this.w;
    for (let i = 0; i < CS_COUNT; i++) w[i] = base[i];
    w[CS.HANDS_UP] *= p.handsP * this.handsSens * (f.state === 'ENERGY_BUILD' ? 0.4 + 2.2 * f.buildIntensity : 0.6 + E);
    w[CS.JUMPING] *= p.jumpP * (0.5 + E);
    w[CS.PHONE_RECORDING] *= p.phoneP * this.phoneFreq * (f.state === 'CALM' ? 1 : 0.5 + E);
    if (!phonesAllowed) w[CS.PHONE_RECORDING] = 0;
    w[CS.CLAPPING] *= p.clapP;
    w[CS.POINTING] *= p.pointP;
    w[CS.HYPE] *= 0.5 + E;
    if (f.musicActive < 0.3) {
      // no music: no rhythmic states at all
      for (const k of [CS.LOW_ENERGY, CS.DANCING, CS.BOUNCING, CS.HANDS_UP, CS.JUMPING, CS.CHEERING, CS.CLAPPING, CS.HYPE, CS.BIG_DROP]) w[k] = 0;
      w[CS.IDLE] += 0.3; w[CS.LOOKING_AROUND] += 0.15;
    }
    w[CS.IDLE] *= 1.7 - p.reactive;
    w[CS.LOW_ENERGY] *= 1.5 - p.reactive * 0.5;
    w[CS.BOUNCING] *= 0.5 + p.reactive;
    w[CS.DANCING] *= 0.7 + p.reactive * 0.6;
    const next = weightedIndex(w, this.rnd());
    p.state = next;
    p.mods = 0;
    if (f.state === 'PEAK' || f.state === 'HYPE') {
      const prof = REACTIONS.peak;
      if (next === CS.HANDS_UP || next === CS.HYPE || next === CS.CHEERING) {
        if (this.rnd() < prof.jump * p.jumpP) p.mods |= MOD_JUMP;
        if (this.rnd() < prof.phone * p.phoneP * this.phoneFreq && phonesAllowed) p.mods |= MOD_PHONE;
      }
    }
    const [lo, hi] = STATE_HOLD[next];
    const energyShorten = 1 - 0.3 * E;
    p.tNext = f.time + (lo + this.rnd() * (hi - lo)) * energyShorten;
  }

  /** Test/debug helper: put everyone into one state for `seconds`. */
  forceState(state: number, now: number, seconds = 60, mods = 0): void {
    for (const p of this.people) {
      p.state = state;
      p.mods = mods;
      p.tNext = now + seconds;
      p.kickAmp = 0;
    }
  }

  /** Forces everyone to reconsider their behaviour (used on venue change / session start). */
  scramble(now: number): void {
    for (const p of this.people) {
      p.tNext = now + this.rnd() * 1.5;
      p.kickAmp = 0;
      p.mods = 0;
    }
  }

  /** Visible (on-screen) estimation: persons whose spawn scale is up. Cheap proxy for debug. */
  get visibleCount(): number {
    return this.visibleCache;
  }

  get phoneCount(): number { return this.phonesNow; }
  get stateNames(): string[] { return CS_NAMES; }

  /** Used by lighting: normalised crowd "arms up" ratio. */
  get handsRatio(): number {
    return this.people.length ? clamp(this.stats.handsUp / Math.max(1, this.stats.visible)) : 0;
  }
}
