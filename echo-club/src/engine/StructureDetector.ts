import { clamp, dampAR, Ring } from '../util/math';
import type { AudioFeatures } from '../core/types';

export interface StructureOutput {
  build: number; // 0..1 intensity
  buildActive: boolean;
  buildTime: number;
  breakdown: boolean;
  dropConfidence: number;
  drop: boolean;
  dropStrength: number;
  peak: boolean;
  buildStart: boolean;
  breakdownStart: boolean;
}

const HZ = 20; // structure analysis rate
const STEP = 1 / HZ;

/**
 * Looks at ~30 s of feature history to find musical *moments* — not just loudness.
 *
 *  Breakdown : kick/bass drops out for a sustained time after a groove.
 *  Build     : brightness / hat+snare density / high band rising while the low end is thin.
 *  Drop      : bass returns hard after a breakdown or build (bass ratio, transient, loudness jump),
 *              gated by cooldown + recent-drop memory so it can never spam.
 */
export class StructureDetector {
  /** 0..1 — higher fires drops more easily. */
  dropSensitivity = 0.55;
  minDropInterval = 22;

  private bass = new Ring(HZ * 30);
  private level = new Ring(HZ * 30);
  private high = new Ring(HZ * 30);
  private bright = new Ring(HZ * 30);
  private dens = new Ring(HZ * 30);
  private acc = 0;
  private lastDropT = -999;
  private dropTimes: number[] = [];
  private buildVal = 0;
  private buildSince = -1;
  private breakdownSince = -1;
  private inBreakdown = false;
  private lastBreakdownEnd = -999;
  private lastBuildEnd = -999;
  private peakTimer = 0;
  private wasBuild = false;
  private wasBreakdown = false;
  private maxTransient = 0;
  private bassPeakLong = 0.2;
  private silentTimer = 0;
  private out: StructureOutput = {
    build: 0, buildActive: false, buildTime: 0, breakdown: false, dropConfidence: 0, drop: false, dropStrength: 0, peak: false, buildStart: false, breakdownStart: false,
  };

  reset(): void {
    for (const r of [this.bass, this.level, this.high, this.bright, this.dens]) r.clear();
    this.buildVal = 0; this.buildSince = -1; this.breakdownSince = -1; this.inBreakdown = false;
    this.lastDropT = -999; this.dropTimes.length = 0; this.acc = 0;
  }

  /** Force-register a drop (manual trigger) so cooldown and memory stay consistent. */
  registerDrop(now: number): void {
    this.lastDropT = now;
    this.dropTimes.push(now);
    this.buildVal = 0;
    this.buildSince = -1;
    this.inBreakdown = false;
    this.breakdownSince = -1;
  }

  update(dt: number, now: number, a: AudioFeatures, energy: number): StructureOutput {
    const o = this.out;
    o.drop = false; o.peak = false; o.buildStart = false; o.breakdownStart = false; o.dropStrength = 0;

    this.maxTransient = Math.max(this.maxTransient, a.transient);
    this.acc += dt;
    if (!a.signal) this.silentTimer += dt; else this.silentTimer = 0;

    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.bass.push(a.signal ? a.bassEnv : 0);
      this.level.push(a.signal ? a.levelEnv : 0);
      this.high.push(a.signal ? a.highEnv : 0);
      this.bright.push(a.signal ? a.brightness : 0);
      this.dens.push(this.maxTransient);
      this.maxTransient *= 0.5;
      this.step(now, a, energy);
    }

    // Build intensity eases independently of the 20 Hz sampling.
    const target = this.buildSince >= 0 ? Math.max(this.buildVal, 0.35) : this.buildVal * 0.6;
    o.build = dampAR(o.build, target, 1.6, 1.2, dt);
    o.buildActive = o.build > 0.3;
    o.buildTime = this.buildSince >= 0 ? now - this.buildSince : 0;
    o.breakdown = this.inBreakdown;

    // Peak: sustained very high energy.
    if (energy > 88) this.peakTimer += dt; else this.peakTimer = Math.max(0, this.peakTimer - dt * 2);
    if (this.peakTimer > 4 && !this.wasPeak) { o.peak = true; this.wasPeak = true; }
    if (this.peakTimer < 1) this.wasPeak = false;
    return o;
  }
  private wasPeak = false;

  private step(now: number, a: AudioFeatures, energy: number): void {
    const o = this.out;
    if (this.bass.count < HZ * 3) { o.dropConfidence *= 0.9; return; }
    const bassNow = this.bass.mean(0, Math.round(HZ * 0.4));
    const bassPrev = this.bass.mean(Math.round(HZ * 1.0), Math.round(HZ * 4.5));
    const bassSlow = this.bass.mean(0, HZ * 3);
    const bassLong = this.bass.mean(0, HZ * 25);
    this.bassPeakLong = Math.max(bassLong, this.bassPeakLong * 0.9985);
    const loudNow = this.level.mean(0, Math.round(HZ * 0.4));
    const loudPrev = this.level.mean(Math.round(HZ * 1.0), Math.round(HZ * 4.0));

    // ---------- Breakdown: sustained loss of low end after a groove
    const bassGone = this.bass.mean(0, Math.round(HZ * 1.2)) < 0.3 * Math.max(0.35, this.bassPeakLong);
    if (!this.inBreakdown) {
      if (bassGone && a.signal && now - this.lastBreakdownEnd > 3 && this.bassPeakLong > 0.35) {
        if (this.breakdownSince < 0) this.breakdownSince = now;
        if (now - this.breakdownSince > 1.2) {
          this.inBreakdown = true;
          o.breakdownStart = true;
        }
      } else if (!bassGone) {
        this.breakdownSince = -1;
      }
    } else if (bassNow > 0.5 && bassSlow > 0.3) {
      this.inBreakdown = false;
      this.breakdownSince = -1;
      this.lastBreakdownEnd = now;
    }

    // ---------- Build: brightness / density / high rising, ideally with thin low end
    const brightSlope = this.bright.slope(HZ * 6) * HZ; // per second
    const highSlope = this.high.slope(HZ * 6) * HZ;
    const densSlope = this.dens.slope(HZ * 6) * HZ;
    const rising = clamp(brightSlope * 9) * 0.45 + clamp(highSlope * 5) * 0.3 + clamp(densSlope * 4) * 0.25;
    const lowEnd = bassSlow < 0.55 * Math.max(0.35, this.bassPeakLong) || this.inBreakdown;
    const buildCandidate = rising > 0.28 && lowEnd && a.signal;
    if (buildCandidate) {
      this.buildVal = clamp(this.buildVal + 0.04 + rising * 0.05);
      if (this.buildSince < 0 && this.buildVal > 0.35) {
        this.buildSince = now;
        o.buildStart = true;
      }
    } else {
      this.buildVal = Math.max(0, this.buildVal - (this.buildSince >= 0 ? 0.012 : 0.03));
      if (this.buildSince >= 0 && this.buildVal < 0.12) {
        this.buildSince = -1;
        this.lastBuildEnd = now;
      }
    }

    // ---------- Drop
    const bassRatio = bassNow / (bassPrev + 0.08);
    const tr = this.dens.max(0, Math.round(HZ * 0.5));
    const loudJump = loudNow - loudPrev;
    const context =
      this.inBreakdown || this.buildSince >= 0 || now - this.lastBreakdownEnd < 6 || now - this.lastBuildEnd < 8 ? 1 : 0;
    const gate = bassNow > 0.5 ? 1 : 0;
    const conf =
      gate *
      clamp(
        0.4 * clamp((bassRatio - 1.5) / 2.0) +
          0.18 * clamp(tr / 0.7) +
          0.17 * clamp(loudJump / 0.25) +
          0.25 * context,
      );
    o.dropConfidence = clamp(o.dropConfidence * 0.7 + conf * 0.3 + (conf > o.dropConfidence ? (conf - o.dropConfidence) * 0.3 : 0));

    const threshold = 0.74 - this.dropSensitivity * 0.28; // 0.74 .. 0.46
    const sinceDrop = now - this.lastDropT;
    const recent = this.dropTimes.filter((t) => now - t < 90).length;
    const need = threshold + recent * 0.05;
    if (conf >= need && sinceDrop > this.minDropInterval && energy >= 0) {
      o.drop = true;
      o.dropStrength = clamp(0.55 + conf * 0.5);
      this.lastDropT = now;
      this.dropTimes.push(now);
      if (this.dropTimes.length > 12) this.dropTimes.shift();
      this.buildVal = 0;
      this.buildSince = -1;
      this.inBreakdown = false;
      this.breakdownSince = -1;
      this.lastBuildEnd = now;
      this.lastBreakdownEnd = now;
    }
  }
}
