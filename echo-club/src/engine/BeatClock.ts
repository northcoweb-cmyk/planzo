import { wrap01 } from '../util/math';

const BINS = 48;

/**
 * A phase-locked beat clock.
 *
 *  - Tempo comes from the detector (or tap / manual BPM).
 *  - Phase: every detected onset votes into a circular histogram of "where in the beat period did it
 *    land". The circular mean of that histogram is the beat grid; the clock steers to it with a PLL.
 *    One missed or extra kick therefore cannot knock the visuals off the beat.
 *  - It only runs while there is music (`active`), so a silent room never "dances".
 */
export class BeatClock {
  bpm = 124;
  phase = 0;
  count = 0;
  /** 0..3, aligned so 0 is the strongest accent (downbeat guess). */
  beatInBar = 0;
  /** True on the frame the clock wraps. */
  tick = false;
  /** Fast-decaying kick envelope, retriggered by beats. */
  kick = 0;
  /** 0..1 — how confident the grid is (circular concentration of onsets). */
  lockStrength = 0;
  /** Visual offset in seconds (+ = visuals later). */
  offset = 0;

  private taps: number[] = [];
  private tappedBpm = 0;
  private hist = new Float32Array(BINS);
  private histBpm = 0;
  private barEnergy = [0, 0, 0, 0];
  private rawCount = 0;
  private barShift = 0;
  private lastBarFix = 0;

  /** Register a tap-tempo press. Returns the new BPM once 2+ taps agree. */
  tap(now: number): number {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && now - last > 2.5) this.taps.length = 0;
    this.taps.push(now);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.taps.length; i++) intervals.push(this.taps[i] - this.taps[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      let bpm = 60 / avg;
      while (bpm < 70) bpm *= 2;
      while (bpm > 190) bpm /= 2;
      this.tappedBpm = bpm;
      this.phase = 0;
      this.tick = true;
      this.kick = 1;
      this.hist.fill(0);
      return bpm;
    }
    this.phase = 0;
    return this.bpm;
  }

  get tapped(): number {
    return this.tappedBpm;
  }

  clearTap(): void {
    this.tappedBpm = 0;
    this.taps.length = 0;
  }

  reset(): void {
    this.hist.fill(0);
    this.barEnergy.fill(0);
    this.lockStrength = 0;
    this.kick = 0;
  }

  /**
   * @param now         seconds (monotonic)
   * @param onset       strength 0..1 of an onset detected this frame (0 if none)
   * @param useGrid     audio-derived grid steering enabled (stable tempo + enough confidence)
   * @param active      music present — the clock freezes when false
   */
  update(dt: number, now: number, targetBpm: number, onset: number, useGrid: boolean, active: boolean): void {
    this.tick = false;
    if (!active) {
      this.kick *= Math.exp(-dt / 0.13);
      this.lockStrength *= Math.exp(-dt / 2);
      return;
    }
    if (targetBpm > 40) this.bpm += (targetBpm - this.bpm) * Math.min(1, dt * 2.5);
    const period = 60 / this.bpm;

    // Tempo changed noticeably: the old grid no longer applies.
    if (this.histBpm === 0 || Math.abs(this.bpm - this.histBpm) / this.histBpm > 0.006) {
      for (let i = 0; i < BINS; i++) this.hist[i] *= 0.4;
      this.histBpm = this.bpm;
    }
    // Vote
    const decay = Math.exp(-dt / 7);
    for (let i = 0; i < BINS; i++) this.hist[i] *= decay;
    const tMod = ((now % period) + period) % period / period; // position inside the beat period for this instant
    if (onset > 0) {
      // onsets are reported ~35 ms after they happened
      const tOn = ((((now - 0.035) % period) + period) % period) / period;
      const b = Math.floor(tOn * BINS) % BINS;
      const w = 0.4 + onset;
      this.hist[b] += w * 0.6;
      this.hist[(b + 1) % BINS] += w * 0.2;
      this.hist[(b + BINS - 1) % BINS] += w * 0.2;
    }
    // Circular mean → grid phase + concentration
    let cx = 0, cy = 0, tot = 0;
    for (let i = 0; i < BINS; i++) {
      const a = ((i + 0.5) / BINS) * Math.PI * 2;
      cx += this.hist[i] * Math.cos(a);
      cy += this.hist[i] * Math.sin(a);
      tot += this.hist[i];
    }
    const conc = tot > 0.5 ? Math.hypot(cx, cy) / tot : 0;
    this.lockStrength += (conc - this.lockStrength) * Math.min(1, dt * 1.5);
    const gridPhase = wrap01(Math.atan2(cy, cx) / (Math.PI * 2)); // beats land here within the period

    this.phase += (dt * this.bpm) / 60;
    if (useGrid && tot > 1.5 && conc > 0.3) {
      const desired = wrap01(tMod - gridPhase - this.offset / period);
      let err = desired - this.phase;
      err -= Math.round(err);
      if (Math.abs(err) > 0.4 && conc > 0.5) this.phase = desired;
      else this.phase += err * Math.min(1, dt * 4);
    }
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.rawCount++;
      this.count++;
      this.tick = true;
    }
    if (this.phase < 0) this.phase += 1;

    // Downbeat: which of the 4 counts carries the most onset energy?
    if (onset > 0 && this.phase > 0.75 || onset > 0 && this.phase < 0.25) {
      const slot = (this.phase > 0.75 ? this.rawCount + 1 : this.rawCount) % 4;
      this.barEnergy[slot] = this.barEnergy[slot] * 0.97 + onset;
    }
    if (now - this.lastBarFix > 1.5) {
      this.lastBarFix = now;
      let best = 0;
      for (let i = 1; i < 4; i++) if (this.barEnergy[i] > this.barEnergy[best]) best = i;
      if (this.barEnergy[best] > 1.2) this.barShift = best;
    }
    this.beatInBar = (((this.rawCount - this.barShift) % 4) + 4) % 4;
    this.kick *= Math.exp(-dt / 0.13);
  }
}
