import type { AudioFeatures, CrowdFrame, MusicEvents } from '../core/types';
import type { Settings } from '../core/Settings';
import { BeatClock } from './BeatClock';
import { CrowdStateMachine } from './CrowdStateMachine';
import { StructureDetector } from './StructureDetector';
import { clamp, damp, dampAR, lerp, smoothstep } from '../util/math';

const MANUAL_BUILD_SECONDS = 14;
const MOOD_SECONDS = 25;

/**
 * The Crowd Energy Engine: turns audio features (or manual input) into the normalised crowd model
 * that every visual system reads. Energy never jumps — it is slew-limited with attack/release.
 */
export class EnergyEngine {
  readonly clock = new BeatClock();
  readonly structure = new StructureDetector();
  readonly machine = new CrowdStateMachine();

  energy = 10;
  private musicIntensity = 0;
  private densityOnsets = 0;
  private dropEnv = 0;
  private buildManual = -1; // start time or -1
  private pendingDrop = false;
  private mood: 'calm' | 'hype' | null = null;
  private moodUntil = 0;
  private attendance01 = 0;
  private lastDropStrength = 0;
  private buildBoost = 0;
  private bassSmooth = 0;
  private highSmooth = 0;
  private impulse = 0;
  private presence = 0;
  private lastFrame!: CrowdFrame;
  /** Reset-friendly session clock for deterministic tests. */
  private t0 = 0;

  constructor() {
    this.lastFrame = this.blank();
  }

  reset(): void {
    this.energy = 10;
    this.presence = 0;
    this.clock.reset();
    this.musicIntensity = 0;
    this.dropEnv = 0;
    this.buildManual = -1;
    this.pendingDrop = false;
    this.mood = null;
    this.attendance01 = 0;
    this.structure.reset();
    this.machine.reset();
  }

  // ---- manual controls ----------------------------------------------------------------------
  triggerBuild(now: number): void {
    this.buildManual = now;
  }
  triggerDrop(): void {
    this.pendingDrop = true;
  }
  crowdCalm(now: number): void {
    this.mood = 'calm';
    this.moodUntil = now + MOOD_SECONDS;
  }
  crowdHype(now: number): void {
    this.mood = 'hype';
    this.moodUntil = now + MOOD_SECONDS;
  }
  /** A pad / button hit on the controller: the crowd reacts immediately and briefly. */
  bump(n = 1): void {
    this.impulse = Math.min(30, this.impulse + 9 * n);
    this.clock.kick = 1;
  }
  tap(now: number): number {
    return this.clock.tap(now);
  }

  get frame(): CrowdFrame {
    return this.lastFrame;
  }

  private blank(): CrowdFrame {
    const ev: MusicEvents = { beat: false, strongBeat: false, drop: false, dropStrength: 0, dropManual: false, buildStart: false, breakdownStart: false, peakStart: false };
    return {
      time: 0, dt: 0, state: 'CALM', stateAge: 0, crowdEnergy: 10, beatStrength: 0, bassEnergy: 0, highFrequencyEnergy: 0, buildIntensity: 0,
      dropIntensity: 0, rhythmIntensity: 0, crowdDensity: 0.75, reactionProbability: 0.2, lightingIntensity: 0.4, bpm: 124, bpmConfidence: 0,
      beatPhase: 0, beatInBar: 0, beatCount: 0, musicActive: 0, events: ev, kick: 0, signal: false, dropConfidence: 0, breakdown: false, buildTime: 0,
    };
  }

  update(dt: number, now: number, audio: AudioFeatures, audioLive: boolean, s: Readonly<Settings>): CrowdFrame {
    if (this.t0 === 0) this.t0 = now;
    const sens = s.sensitivity / 100;
    const manualMode = !audioLive;
    this.structure.dropSensitivity = s.dropSensitivity / 100;

    // ---- presence: is there actually music? (a silent room must not dance) -------------
    const sigNow = audioLive ? audio.signal : true;
    this.presence = damp(this.presence, sigNow ? 1 : 0, sigNow ? 6 : 2.5, dt);
    const active = this.presence > 0.2;

    // ---- tempo & beats ---------------------------------------------------------------
    const detected = audioLive && audio.bpm > 0 && audio.bpmConfidence > 0.25;
    const tempo = detected ? audio.bpm : this.clock.tapped || s.bpm || 124;
    const useGrid = audioLive && detected && audio.bpmConfidence > 0.3;
    const onsetStrength = audioLive && audio.beat ? clamp(0.45 + audio.transient * 0.4 + (audio.strongBeat ? 0.3 : 0)) : 0;
    this.clock.offset = s.beatOffsetMs / 1000;
    this.clock.update(dt, now, tempo, onsetStrength, useGrid, active);
    const gridMode = useGrid && this.clock.lockStrength > 0.35 && audio.bassEnv > 0.15;
    const ev: MusicEvents = { beat: false, strongBeat: false, drop: false, dropStrength: 0, dropManual: false, buildStart: false, breakdownStart: false, peakStart: false };
    if (audioLive && !gridMode) {
      ev.beat = active && audio.beat;
      ev.strongBeat = active && audio.strongBeat;
    } else {
      // stable beat grid (or free-running manual clock): beats land exactly on the grid
      ev.beat = this.clock.tick && active;
      ev.strongBeat = ev.beat && this.clock.beatInBar === 0;
    }
    if (ev.beat) this.clock.kick = 1;

    // ---- musical structure -----------------------------------------------------------
    let build = 0;
    let breakdown = false;
    let dropConfidence = 0;
    const st = this.structure.update(dt, now, audio, this.energy);
    if (audioLive && audio.signal) {
      build = st.build;
      breakdown = st.breakdown;
      dropConfidence = st.dropConfidence;
      if (st.drop) { ev.drop = true; ev.dropStrength = st.dropStrength; }
      ev.buildStart = st.buildStart;
      ev.breakdownStart = st.breakdownStart;
      ev.peakStart = st.peak;
    }

    // ---- manual overrides -----------------------------------------------------------
    let manualBuild = 0;
    if (this.buildManual >= 0) {
      const p = (now - this.buildManual) / MANUAL_BUILD_SECONDS;
      if (p > 1.3) this.buildManual = -1;
      else {
        manualBuild = smoothstep(0, 1, Math.min(1, p));
        if (p < dt / MANUAL_BUILD_SECONDS * 1.5) ev.buildStart = true;
      }
    }
    if (this.pendingDrop) {
      this.pendingDrop = false;
      ev.drop = true;
      ev.dropManual = true;
      ev.dropStrength = 1;
      this.structure.registerDrop(now);
      this.buildManual = -1;
      manualBuild = 0;
    }
    build = Math.max(build, manualBuild);
    if (this.mood && now > this.moodUntil) this.mood = null;

    // ---- music intensity -> target energy ---------------------------------------------
    const bassE = audioLive ? audio.bass : this.clock.kick * 0.9;
    const highE = audioLive ? audio.high : 0.35 + 0.1 * Math.sin(now * 0.7);
    this.bassSmooth = damp(this.bassSmooth, bassE, 14, dt);
    this.highSmooth = damp(this.highSmooth, highE, 10, dt);
    this.densityOnsets = damp(this.densityOnsets, audioLive ? audio.transient : this.clock.kick, 1.6, dt);

    let target: number;
    const bias = s.crowdEnergy;
    if (audioLive) {
      if (!audio.signal) {
        this.musicIntensity = damp(this.musicIntensity, 0, 3, dt);
        target = 3;
      } else {
        const m = clamp(
          (0.44 * audio.bassEnv + 0.22 * audio.levelEnv + 0.12 * Math.min(1, this.densityOnsets * 2) + 0.12 * audio.highEnv + 0.1 * audio.midEnv) * (0.72 + sens * 0.6),
        );
        this.musicIntensity = damp(this.musicIntensity, m, 2.2, dt);
        target = 100 * Math.pow(smoothstep(0.16, 0.9, this.musicIntensity), 1.9);
        target += bias;
      }
    } else {
      target = 46 + bias;
    }
    this.impulse *= Math.exp(-dt / 2.2);
    target += build * 20 + this.impulse;
    if (breakdown && !manualBuild) target = Math.min(target, 34);
    if (this.mood === 'calm') target = Math.min(target, 22);
    if (this.mood === 'hype') target = Math.max(target, 72) + 8;

    // Drop envelope: fast rise (~0.5 s) and long (~9 s) decay.
    if (ev.drop) {
      this.dropEnv = 1;
      this.lastDropStrength = ev.dropStrength;
    } else {
      this.dropEnv *= Math.exp(-dt / 4.2);
    }
    const dropBoost = this.dropEnv * (35 + 20 * this.lastDropStrength);
    target = clamp(target + dropBoost, 0, 100);

    // Slew-limited energy: it climbs by points-per-second caps, faster during a drop.
    const maxRise = this.dropEnv > 0.45 ? 55 : (this.energy < 30 ? 16 : 11) + build * 6;
    const maxFall = audioLive && !audio.signal ? 30 : this.dropEnv > 0.2 ? 6 : 9;
    // A drop makes the room explode within ~1 s (still slew-limited); otherwise energy builds slowly.
    const silent = audioLive && !audio.signal;
    let next = dampAR(this.energy, target, this.dropEnv > 0.35 ? 0.7 : 3.2, silent ? 1.2 : 5.5, dt);
    next = clamp(next, this.energy - maxFall * dt, this.energy + maxRise * dt);
    this.energy = clamp(next, 0, 100);

    // ---- state machine -----------------------------------------------------------------
    const state = this.machine.update(dt, {
      energy: this.energy, build, breakdown, drop: ev.drop, peak: ev.peakStart,
    });

    // ---- attendance (slow, used for density + fake headcount) ---------------------------
    this.attendance01 = clamp(this.attendance01 + dt * ((this.energy / 100 - 0.32) * 0.006), 0, 1);

    const kick = this.clock.kick;
    const frame: CrowdFrame = {
      time: now,
      dt,
      state,
      stateAge: this.machine.age,
      crowdEnergy: this.energy,
      beatStrength: ev.beat ? (ev.strongBeat ? 1 : 0.7) : kick * 0.6,
      bassEnergy: this.bassSmooth,
      highFrequencyEnergy: this.highSmooth,
      buildIntensity: build,
      dropIntensity: this.dropEnv,
      rhythmIntensity: clamp(this.densityOnsets * 1.6),
      crowdDensity: lerp(0.75, 1, this.attendance01),
      reactionProbability: clamp(lerp(0.22, 0.97, this.energy / 100) * (0.6 + sens * 0.8)),
      lightingIntensity: clamp(
        (0.34 + 0.5 * (this.energy / 100) + 0.14 * build + 0.3 * this.dropEnv) * (state === 'BREAKDOWN' ? 0.75 : 1), 0, 1.4),
      bpm: this.clock.bpm,
      bpmConfidence: audioLive ? audio.bpmConfidence : 1,
      beatPhase: this.clock.phase,
      beatInBar: audioLive && !gridMode && audio.bpmConfidence > 0.3 ? audio.beatInBar : this.clock.beatInBar,
      musicActive: this.presence,
      beatCount: this.clock.count,
      events: ev,
      kick,
      signal: audioLive ? audio.signal : true,
      dropConfidence,
      breakdown,
      buildTime: manualMode && this.buildManual >= 0 ? now - this.buildManual : st.buildTime,
    };
    if (ev.buildStart || ev.drop || ev.breakdownStart) { /* events are consumed by listeners via frame.events */ }
    this.lastFrame = frame;
    return frame;
  }

  /** Attendance progress 0..1 for the session headcount. */
  get attendanceProgress(): number {
    return this.attendance01;
  }
}
