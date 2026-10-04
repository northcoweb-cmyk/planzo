import { wrap01 } from '../util/math';

/**
 * A phase-locked beat clock. It free-runs at the current BPM so crowd motion stays smooth between
 * detections, and gets nudged toward real detected beats when audio is live.
 */
export class BeatClock {
  bpm = 124;
  phase = 0;
  count = 0;
  beatInBar = 0;
  /** True on the frame the clock wraps. */
  tick = false;
  /** Fast-decaying kick envelope, retriggered by beats. */
  kick = 0;

  private misaligned = 0;
  private taps: number[] = [];
  private tappedBpm = 0;

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
      // Snap phase to the tap.
      this.phase = 0;
      this.tick = true;
      this.kick = 1;
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

  /**
   * @param targetBpm tempo to follow (detected, tapped or manual)
   * @param beat       a real beat was detected this frame
   * @param audioLocked whether detected beats should correct the phase
   */
  update(dt: number, targetBpm: number, beat: boolean, audioLocked: boolean, audioBeatInBar: number): void {
    if (targetBpm > 40) this.bpm += (targetBpm - this.bpm) * Math.min(1, dt * 2.5);
    this.tick = false;
    this.phase += (dt * this.bpm) / 60;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.count++;
      this.beatInBar = (this.beatInBar + 1) % 4;
      this.tick = true;
    }
    if (beat && audioLocked) {
      let err = this.phase;
      if (err > 0.5) err -= 1;
      if (Math.abs(err) < 0.22) {
        this.phase = wrap01(this.phase - err * 0.35);
        this.misaligned = 0;
      } else if (++this.misaligned >= 3) {
        this.phase = 0;
        this.misaligned = 0;
        this.beatInBar = audioBeatInBar;
      }
      this.kick = 1;
    }
    this.kick *= Math.exp(-dt / 0.13);
  }
}
