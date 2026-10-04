import { clamp, Ring } from '../util/math';

export interface BeatResult {
  beat: boolean;
  strong: boolean;
  /** Smoothed onset-strength 0..1 */
  onset: number;
  bpm: number;
  confidence: number;
  beatInBar: number;
  threshold: number;
}

/**
 * Adaptive-threshold onset detector with inter-onset-interval tempo estimation
 * and a downbeat guess (the bar position that accumulates the most kick energy).
 */
export class BeatDetector {
  /** 0..1, higher = more beats accepted. */
  sensitivity = 0.55;

  private flux = new Ring(90); // ~1.5 s at 60 fps
  private lastBeatT = -10;
  private prevOnset = 0;
  private prevPrevOnset = 0;
  private onsetTimes: number[] = [];
  private onsetStrengths: number[] = [];
  private bpm = 0;
  private confidence = 0;
  private lastTempoT = 0;
  private pendingBpm = 0;
  private pendingCount = 0;
  private barCounter = 0;
  private barEnergy = [0, 0, 0, 0];
  private downbeatSlot = 0;
  private smoothedOnset = 0;
  threshold = 0;

  reset(): void {
    this.flux.clear();
    this.onsetTimes.length = 0;
    this.onsetStrengths.length = 0;
    this.bpm = 0;
    this.confidence = 0;
    this.barCounter = 0;
    this.barEnergy.fill(0);
    this.lastBeatT = -10;
  }

  get currentBpm(): number {
    return this.bpm;
  }

  process(fluxLow: number, fluxFull: number, bass: number, now: number, signal: boolean): BeatResult {
    // Kick-weighted onset function.
    const onset = signal ? clamp(fluxLow * 0.65 + fluxFull * 0.2 + bass * 0.15 * fluxLow) : 0;
    this.flux.push(onset);
    this.smoothedOnset += (onset - this.smoothedOnset) * 0.35;

    // Adaptive threshold: mean + k·std of the last ~1.5 s.
    const n = this.flux.count;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += this.flux.at(i);
    mean /= Math.max(1, n);
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const d = this.flux.at(i) - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / Math.max(1, n));
    const k = 2.1 - this.sensitivity * 1.5; // 2.1 .. 0.6
    const floor = 0.12 + (1 - this.sensitivity) * 0.16;
    this.threshold = Math.max(floor, mean + k * std);

    // Peak picking: previous frame was a local max above threshold.
    let beat = false;
    let strong = false;
    const minInterval = this.bpm > 0 ? Math.max(0.26, (60 / this.bpm) * 0.55) : 0.3;
    if (
      signal &&
      this.prevOnset > this.threshold &&
      this.prevOnset >= this.prevPrevOnset &&
      this.prevOnset >= onset &&
      now - this.lastBeatT > minInterval
    ) {
      beat = true;
      strong = this.prevOnset > Math.max(this.threshold * 1.45, 0.55) && bass > 0.45;
      this.lastBeatT = now;
      this.onsetTimes.push(now);
      this.onsetStrengths.push(this.prevOnset);
      while (this.onsetTimes.length > 64 || (this.onsetTimes.length && now - this.onsetTimes[0] > 14)) {
        this.onsetTimes.shift();
        this.onsetStrengths.shift();
      }
      this.barEnergy[this.barCounter] = this.barEnergy[this.barCounter] * 0.9 + this.prevOnset;
      this.barCounter = (this.barCounter + 1) % 4;
      // The slot with most accumulated energy is treated as the downbeat.
      let best = 0;
      for (let i = 1; i < 4; i++) if (this.barEnergy[i] > this.barEnergy[best]) best = i;
      this.downbeatSlot = best;
    }
    this.prevPrevOnset = this.prevOnset;
    this.prevOnset = onset;

    if (now - this.lastTempoT > 0.5) {
      this.lastTempoT = now;
      this.estimateTempo(now);
    }
    if (!signal) {
      this.confidence *= 0.97;
    }

    const beatInBar = (this.barCounter - 1 - this.downbeatSlot + 8) % 4;
    return { beat, strong, onset: this.smoothedOnset, bpm: this.bpm, confidence: this.confidence, beatInBar, threshold: this.threshold };
  }

  /** Histogram of inter-onset intervals (and their multiples) folded into the 85–175 BPM range. */
  private estimateTempo(now: number): void {
    const t = this.onsetTimes;
    if (t.length < 6) {
      this.confidence *= 0.9;
      return;
    }
    const BINS = 180; // 1 BPM resolution from 60..240
    const hist = new Float32Array(BINS);
    let total = 0;
    for (let i = 0; i < t.length; i++) {
      const w0 = this.onsetStrengths[i];
      for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
        const dtv = t[i] - t[j];
        if (dtv < 0.25 || dtv > 3.2) continue;
        let bpm = 60 / dtv;
        while (bpm < 85) bpm *= 2;
        while (bpm >= 175) bpm /= 2;
        const age = Math.exp(-(now - t[i]) / 9);
        const weight = w0 * this.onsetStrengths[j] * age;
        const centre = bpm - 60;
        for (let b = Math.floor(centre - 2); b <= Math.ceil(centre + 2); b++) {
          if (b < 0 || b >= BINS) continue;
          const d = (b - centre) / 1.2;
          hist[b] += weight * Math.exp(-d * d);
        }
        total += weight;
      }
    }
    if (total <= 0) return;
    let best = 0;
    for (let b = 1; b < BINS; b++) if (hist[b] > hist[best]) best = b;
    // Parabolic refinement.
    let est = best + 60;
    if (best > 0 && best < BINS - 1) {
      const a = hist[best - 1], c = hist[best + 1], m = hist[best];
      const denom = a - 2 * m + c;
      if (denom !== 0) est += (0.5 * (a - c)) / denom;
    }
    let mass = 0;
    for (let b = Math.max(0, best - 3); b <= Math.min(BINS - 1, best + 3); b++) mass += hist[b];
    const conf = clamp((mass / Math.max(1e-6, total)) * 1.6 - 0.15);
    // Prefer the house range: if a half/double is within it, choose that.
    if (est > 150 && est / 2 >= 85) est = est > 160 ? est / 2 : est;
    if (this.bpm === 0) {
      this.bpm = est;
    } else if (Math.abs(est - this.bpm) > 6) {
      // A different tempo must be seen for ~2 s in a row before we believe it (snare rolls and
      // breakdowns produce brief bogus estimates).
      if (Math.abs(est - this.pendingBpm) < 4) this.pendingCount++;
      else { this.pendingBpm = est; this.pendingCount = 1; }
      if (this.pendingCount >= 4 && conf > 0.4) {
        this.bpm = est;
        this.pendingCount = 0;
      }
    } else {
      this.pendingCount = 0;
      this.bpm += (est - this.bpm) * 0.25;
    }
    this.confidence += (conf - this.confidence) * 0.35;
  }
}
