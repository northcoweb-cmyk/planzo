/**
 * Built-in test set: a real, synthesised four-on-the-floor house track (124 BPM) with
 * grooves, breakdowns, risers and drops. It plays through Web Audio and is analysed by exactly
 * the same pipeline as any other input, which lets you verify the club without any DJ gear.
 */
export class DemoSynth {
  readonly bpm = 124;
  private timer: number | null = null;
  private nextStepTime = 0;
  private step = 0; // 16th notes
  private out!: GainNode;
  private noiseBuf!: AudioBuffer;
  private ctx!: AudioContext;
  /** Bars in one loop of the arrangement. */
  static readonly LOOP_BARS = 56;

  start(ctx: AudioContext, dest: AudioNode): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(dest);
    // Pre-render a noise buffer for hats/risers.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.step = 0;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    try { this.out?.disconnect(); } catch { /* already gone */ }
  }

  /** Arrangement section for a bar index within the loop. */
  static section(bar: number): 'groove' | 'breakdown' | 'build' | 'drop' | 'outro' {
    const b = bar % DemoSynth.LOOP_BARS;
    if (b < 16) return 'groove';
    if (b < 20) return 'breakdown';
    if (b < 24) return 'build';
    if (b < 40) return 'drop';
    if (b < 48) return 'outro';
    if (b < 52) return 'breakdown';
    return 'build';
  }

  private schedule(): void {
    const ahead = this.ctx.currentTime + 0.15;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextStepTime < ahead) {
      this.playStep(this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private playStep(step: number, t: number, stepDur: number): void {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const sec = DemoSynth.section(bar);
    const barInSec = bar % DemoSynth.LOOP_BARS;
    const kickOn = sec === 'groove' || sec === 'drop' || sec === 'outro' || (sec === 'build' && barInSec % 4 >= 2 && false);

    if (kickOn && s16 % 4 === 0) this.kick(t, sec === 'drop' ? 1 : 0.85);
    // Build: kick returns on the last bar's quarter notes as a snare-roll-like pulse
    if (sec === 'build') {
      const sectionStart = barInSec < 24 ? 20 : 52;
      const progress = (barInSec - sectionStart + s16 / 16) / 4; // 0..1 across the 4 bars
      const rollRate = progress < 0.5 ? 4 : progress < 0.75 ? 2 : 1; // 16ths between hits
      if (s16 % rollRate === 0) this.snare(t, 0.25 + progress * 0.6);
      if (s16 === 0 && barInSec === sectionStart) this.riser(t, stepDur * 64);
    }
    // Clap on 2 and 4
    if ((sec === 'groove' || sec === 'drop' || sec === 'outro') && (s16 === 4 || s16 === 12)) this.clap(t, sec === 'drop' ? 0.8 : 0.6);
    // Off-beat open hats and 16th hats
    if (sec !== 'breakdown') {
      if (s16 % 4 === 2) this.hat(t, 0.5, true);
      else if (sec === 'drop' && s16 % 2 === 1) this.hat(t, 0.18, false);
      else if (sec === 'groove' && s16 % 4 === 0) this.hat(t, 0.1, false);
    }
    // Bass: off-beat rolling bass in groove/drop
    if ((sec === 'drop' || sec === 'groove') && s16 % 4 === 2) {
      const notes = [43.65, 43.65, 51.91, 49.0]; // F1 F1 Ab1 G1
      this.bass(t, notes[bar % 4], stepDur * 2.4, sec === 'drop' ? 0.9 : 0.6);
    }
    // Pads / stabs
    const chords: number[][] = [[174.6, 207.7, 261.6], [174.6, 207.7, 261.6], [207.7, 261.6, 311.1], [196.0, 233.1, 293.7]];
    if (sec === 'breakdown' && s16 === 0 && bar % 2 === 0) this.pad(t, chords[(bar / 2) % 4 | 0], stepDur * 28);
    if (sec === 'drop' && (s16 === 3 || s16 === 6 || s16 === 11)) this.stab(t, chords[bar % 4], 0.5);
    if (sec === 'drop' && s16 === 0 && barInSec === 24) this.crash(t);
    if (sec === 'groove' && s16 === 0 && bar % 8 === 0) this.crash(t, 0.2);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    this.env(g, t, 0.002, 1.0 * vel, 0.32);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.4);
    // click
    const c = this.ctx.createBufferSource();
    const cg = this.ctx.createGain();
    c.buffer = this.noiseBuf;
    this.env(cg, t, 0.001, 0.25 * vel, 0.012);
    c.connect(cg).connect(this.out);
    c.start(t, Math.random());
    c.stop(t + 0.03);
  }

  private clap(t: number, vel: number): void {
    for (let i = 0; i < 3; i++) {
      const n = this.ctx.createBufferSource();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      n.buffer = this.noiseBuf;
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 0.8;
      this.env(g, t + i * 0.011, 0.001, 0.4 * vel, i === 2 ? 0.16 : 0.02);
      n.connect(f).connect(g).connect(this.out);
      n.start(t + i * 0.011, Math.random());
      n.stop(t + 0.25);
    }
  }

  private snare(t: number, vel: number): void {
    const n = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    n.buffer = this.noiseBuf;
    f.type = 'highpass';
    f.frequency.value = 1800;
    this.env(g, t, 0.001, 0.5 * vel, 0.09);
    n.connect(f).connect(g).connect(this.out);
    n.start(t, Math.random());
    n.stop(t + 0.14);
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 190;
    this.env(og, t, 0.001, 0.3 * vel, 0.07);
    o.connect(og).connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  private hat(t: number, vel: number, open: boolean): void {
    const n = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    n.buffer = this.noiseBuf;
    f.type = 'highpass';
    f.frequency.value = 7500;
    this.env(g, t, 0.001, 0.22 * vel, open ? 0.11 : 0.03);
    n.connect(f).connect(g).connect(this.out);
    n.start(t, Math.random());
    n.stop(t + (open ? 0.16 : 0.06));
  }

  private bass(t: number, freq: number, dur: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(140, t + dur);
    f.Q.value = 6;
    this.env(g, t, 0.004, 0.5 * vel, dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(t: number, freqs: number[], dur: number): void {
    for (const fr of freqs) {
      const o = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.detune.value = (Math.random() - 0.5) * 14;
      f.type = 'lowpass';
      f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private stab(t: number, freqs: number[], vel: number): void {
    for (const fr of freqs) {
      const o = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = fr * 2;
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.18);
      this.env(g, t, 0.002, 0.07 * vel, 0.2);
      o.connect(f).connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.26);
    }
  }

  private riser(t: number, dur: number): void {
    const n = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    n.buffer = this.noiseBuf;
    n.loop = true;
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    n.connect(f).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  private crash(t: number, vel = 0.5): void {
    const n = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    n.buffer = this.noiseBuf;
    f.type = 'highpass';
    f.frequency.value = 4000;
    this.env(g, t, 0.002, 0.35 * vel, 1.4);
    n.connect(f).connect(g).connect(this.out);
    n.start(t, Math.random());
    n.stop(t + 1.6);
  }
}
