import { clamp, damp } from '../util/math';

/** Per-frame spectral measurements. Pure DSP — no Web Audio dependencies, so it is unit-testable. */
export interface SpectralFrame {
  rms: number;
  bass: number; // normalised 0..1 (auto-gain)
  mid: number;
  high: number;
  level: number;
  brightness: number;
  fluxLow: number; // kick-band onset strength (normalised)
  fluxFull: number;
  signal: boolean;
  rawBass: number;
  /**
   * Slow envelopes (≈0.4 s) normalised against their own long-term peak. Unlike the instantaneous
   * band values these do not dip between kicks, so they are what the energy engine and the
   * structure detector (breakdown / build / drop) look at.
   */
  bassEnv: number;
  midEnv: number;
  highEnv: number;
  levelEnv: number;
}

const BANDS = {
  bass: [30, 150],
  mid: [150, 2000],
  high: [2000, 12000],
} as const;

/**
 * Converts FFT + time-domain data into smoothed, auto-gained band energies and onset strength.
 * Auto-gain keeps behaviour consistent whether the input is a hot line signal or quiet system audio.
 */
export class AudioAnalyzer {
  private prevDb: Float32Array | null = null;
  private peaks = { bass: 1e-3, mid: 1e-3, high: 1e-3, rms: 1e-3, fluxLow: 1e-3, fluxFull: 1e-3 };
  private sm = { bass: 0, mid: 0, high: 0, level: 0, brightness: 0.3 };
  private env = { bass: 0, mid: 0, high: 0, level: 0 };
  private envPeak = { bass: 1e-3, mid: 1e-3, high: 1e-3, level: 1e-3 };
  /** Gain applied upstream of the analyser (mic boost); gating is done on the *raw* level. */
  inputGain = 1;
  /** Noise gate (dBFS, raw level). Music must sit above this to count as a signal. */
  gateDb = -55;
  /** Raw input level in dBFS of the latest frame. */
  rawDb = -100;
  private gateOpen = false;
  private gateTimer = 0;
  private silentFor = 0;

  reset(): void {
    this.prevDb = null;
    this.peaks = { bass: 1e-3, mid: 1e-3, high: 1e-3, rms: 1e-3, fluxLow: 1e-3, fluxFull: 1e-3 };
    this.sm = { bass: 0, mid: 0, high: 0, level: 0, brightness: 0.3 };
    this.env = { bass: 0, mid: 0, high: 0, level: 0 };
    this.envPeak = { bass: 1e-3, mid: 1e-3, high: 1e-3, level: 1e-3 };
    this.silentFor = 0;
    this.gateOpen = false;
    this.gateTimer = 0;
  }

  analyse(freqDb: Float32Array, timeData: Float32Array, sampleRate: number, dt: number): SpectralFrame {
    const n = freqDb.length;
    const binHz = sampleRate / 2 / n;

    // --- RMS (time domain)
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
    const rms = Math.sqrt(sum / timeData.length);

    // --- Band energies (linear amplitude from dB)
    const e = { bass: 0, mid: 0, high: 0 };
    const cnt = { bass: 0, mid: 0, high: 0 };
    let wSum = 0, wTot = 0;
    let fluxLow = 0, fluxFull = 0;
    const prev = this.prevDb;
    const lowBin = Math.min(n, Math.ceil(220 / binHz));
    const hiBin = Math.min(n, Math.floor(12000 / binHz));
    for (let i = 1; i < n; i++) {
      const f = i * binHz;
      let db = freqDb[i];
      if (!Number.isFinite(db) || db < -120) db = -120;
      const lin = Math.pow(10, db / 20);
      if (f >= BANDS.bass[0] && f < BANDS.bass[1]) { e.bass += lin * lin; cnt.bass++; }
      else if (f >= BANDS.mid[0] && f < BANDS.mid[1]) { e.mid += lin * lin; cnt.mid++; }
      else if (f >= BANDS.high[0] && f < BANDS.high[1]) { e.high += lin * lin; cnt.high++; }
      if (f > 40 && f < 14000) { wSum += lin * f; wTot += lin; }
      if (prev && i < hiBin) {
        const d = db - Math.max(prev[i], -120);
        if (d > 0) {
          const dd = Math.min(d, 24); // clamp so one huge bin cannot dominate
          if (i < lowBin) fluxLow += dd; else fluxFull += dd;
        }
      }
    }
    if (!this.prevDb || this.prevDb.length !== n) this.prevDb = new Float32Array(n);
    for (let i = 0; i < n; i++) this.prevDb[i] = Number.isFinite(freqDb[i]) ? freqDb[i] : -120;

    const rawBass = Math.sqrt(e.bass / Math.max(1, cnt.bass));
    const rawMid = Math.sqrt(e.mid / Math.max(1, cnt.mid));
    const rawHigh = Math.sqrt(e.high / Math.max(1, cnt.high));
    const centroid = wTot > 0 ? wSum / wTot : 0;
    const brightnessRaw = clamp(Math.log2(Math.max(centroid, 80) / 80) / Math.log2(6000 / 80));

    // --- Noise gate with hysteresis: opens after 0.25 s above the gate, closes after 0.9 s below gate-4 dB.
    this.rawDb = 20 * Math.log10(Math.max(1e-6, rms / this.inputGain));
    if (this.gateOpen) {
      if (this.rawDb < this.gateDb - 4) this.gateTimer += dt; else this.gateTimer = 0;
      if (this.gateTimer > 0.9) { this.gateOpen = false; this.gateTimer = 0; }
    } else {
      if (this.rawDb > this.gateDb) this.gateTimer += dt; else this.gateTimer = 0;
      if (this.gateTimer > 0.25) { this.gateOpen = true; this.gateTimer = 0; }
    }
    const signal = this.gateOpen;

    // --- Auto-gain: peak followers with slow release (≈ 25 s)
    const rel = Math.exp(-dt / 25);
    const p = this.peaks;
    p.bass = Math.max(rawBass, p.bass * rel, 1e-4);
    p.mid = Math.max(rawMid, p.mid * rel, 1e-4);
    p.high = Math.max(rawHigh, p.high * rel, 1e-4);
    p.rms = Math.max(rms, p.rms * rel, 1e-4);
    p.fluxLow = Math.max(fluxLow, p.fluxLow * Math.exp(-dt / 12), 1);
    p.fluxFull = Math.max(fluxFull, p.fluxFull * Math.exp(-dt / 12), 1);

    const nb = signal ? clamp(rawBass / p.bass) : 0;
    const nm = signal ? clamp(rawMid / p.mid) : 0;
    const nh = signal ? clamp(rawHigh / p.high) : 0;
    const nl = signal ? clamp(rms / p.rms) : 0;

    // Fast attack / slower release so values read like meters but don't jitter.
    const s = this.sm;
    s.bass = nb > s.bass ? damp(s.bass, nb, 60, dt) : damp(s.bass, nb, 9, dt);
    s.mid = nm > s.mid ? damp(s.mid, nm, 40, dt) : damp(s.mid, nm, 7, dt);
    s.high = nh > s.high ? damp(s.high, nh, 40, dt) : damp(s.high, nh, 7, dt);
    s.level = nl > s.level ? damp(s.level, nl, 40, dt) : damp(s.level, nl, 6, dt);
    s.brightness = damp(s.brightness, signal ? brightnessRaw : 0.3, 3, dt);

    // Slow envelopes of the *raw* energies, each normalised by its own long-term peak.
    const e2 = this.env;
    const k = 1 - Math.exp(-dt / 0.4);
    e2.bass += ((signal ? rawBass : 0) - e2.bass) * k;
    e2.mid += ((signal ? rawMid : 0) - e2.mid) * k;
    e2.high += ((signal ? rawHigh : 0) - e2.high) * k;
    e2.level += ((signal ? rms : 0) - e2.level) * k;
    const pk = this.envPeak;
    const erel = Math.exp(-dt / 40);
    pk.bass = Math.max(e2.bass, pk.bass * erel, 1e-4);
    pk.mid = Math.max(e2.mid, pk.mid * erel, 1e-4);
    pk.high = Math.max(e2.high, pk.high * erel, 1e-4);
    pk.level = Math.max(e2.level, pk.level * erel, 1e-4);

    return {
      rms,
      bass: s.bass,
      mid: s.mid,
      high: s.high,
      level: s.level,
      brightness: s.brightness,
      fluxLow: signal ? clamp(fluxLow / p.fluxLow) : 0,
      fluxFull: signal ? clamp(fluxFull / p.fluxFull) : 0,
      signal,
      rawBass,
      bassEnv: clamp(e2.bass / pk.bass),
      midEnv: clamp(e2.mid / pk.mid),
      highEnv: clamp(e2.high / pk.high),
      levelEnv: clamp(e2.level / pk.level),
    };
  }
}
