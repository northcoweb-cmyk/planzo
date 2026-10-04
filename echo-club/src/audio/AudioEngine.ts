import { AudioAnalyzer } from './AudioAnalyzer';
import { BeatDetector } from './BeatDetector';
import { DemoSynth } from './DemoSynth';
import type { AudioFeatures, AudioInputKind } from '../core/types';

export type AudioStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface ConnectResult {
  ok: boolean;
  message: string;
  /** Machine-readable reason for UI decisions. */
  reason?: 'unsupported' | 'denied' | 'no-audio-track' | 'no-device' | 'cancelled' | 'error';
}

export interface DeviceInfo {
  id: string;
  label: string;
}

export interface AudioDebug {
  spectrum: Uint8Array; // 64 bars
  onsetHistory: Float32Array;
  threshold: number;
  rms: number;
  inputLevelDb: number;
}

const EMPTY: AudioFeatures = {
  signal: false, level: 0, rms: 0, bass: 0, mid: 0, high: 0, bassEnv: 0, midEnv: 0, highEnv: 0, levelEnv: 0, brightness: 0.3, transient: 0,
  beat: false, strongBeat: false, beatInBar: 0, bpm: 0, bpmConfidence: 0,
};

/**
 * Owns every audio input path and turns it into AudioFeatures.
 *
 * Honest capabilities:
 *  - 'system'  : getDisplayMedia + "share system audio" (Chrome/Edge on Windows; tab audio elsewhere).
 *  - 'mic'     : default microphone.
 *  - 'line'    : any chosen input device (line-in, interface, virtual audio cable such as VB-Cable / BlackHole).
 *  - 'demo'    : built-in synthesised track — real audio through the real pipeline.
 *  - 'file'    : a local audio file played through the browser.
 *  - 'manual'  : no audio capture; the energy engine runs from taps / sliders.
 */
export class AudioEngine {
  status: AudioStatus = 'idle';
  kind: AudioInputKind | null = null;
  label = '';
  message = '';
  features: AudioFeatures = { ...EMPTY };

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private demo: DemoSynth | null = null;
  private fileEl: HTMLAudioElement | null = null;
  private monitorGain: GainNode | null = null;

  private readonly analyzer = new AudioAnalyzer();
  readonly beats = new BeatDetector();
  private freq = new Float32Array(0);
  private time = new Float32Array(0);
  private byteFreq = new Uint8Array(0);
  private onsetHist = new Float32Array(128);
  private onsetHead = 0;
  private lastNow = 0;
  private onEnded: (() => void) | null = null;

  /** Fired when a live stream dies (e.g. user stops sharing). */
  set endedHandler(fn: (() => void) | null) { this.onEnded = fn; }

  get contextState(): string { return this.ctx?.state ?? 'none'; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 0; }
  get isLive(): boolean { return this.status === 'live'; }
  get demoSection(): string { return this.demo ? 'demo' : ''; }

  static supportsSystemAudio(): boolean {
    return !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
  }

  static platformHint(): string {
    const ua = navigator.userAgent;
    const isChromium = /Chrome|Edg\//.test(ua) && !/OPR\//.test(ua) || /OPR\//.test(ua);
    const isWin = /Windows/.test(ua);
    const isMac = /Mac OS X/.test(ua);
    if (!AudioEngine.supportsSystemAudio()) {
      return 'This browser cannot capture system audio. Use Chrome or Edge, or choose Line In / Microphone.';
    }
    if (!isChromium) {
      return 'Firefox and Safari do not share system audio. Use Chrome or Edge, or pick Line In with a virtual audio cable.';
    }
    if (isWin) {
      return 'Choose "Entire screen" in the share dialog and tick "Also share system audio". It captures what Windows is playing — set your output to the device Serato uses, or route Serato through a virtual cable.';
    }
    if (isMac) {
      return 'macOS only shares browser-tab audio, not system audio. Install a loopback device (BlackHole / Loopback) and pick it under Line In.';
    }
    return 'System audio capture depends on your OS. If no audio track is offered, pick Line In with a loopback device.';
  }

  async listDevices(): Promise<DeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Audio input ${i + 1}` }));
    } catch {
      return [];
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.25;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;
      this.freq = new Float32Array(this.analyser.frequencyBinCount);
      this.byteFreq = new Uint8Array(this.analyser.frequencyBinCount);
      this.time = new Float32Array(this.analyser.fftSize);
    }
    return this.ctx;
  }

  async connect(kind: AudioInputKind, opts: { deviceId?: string; file?: File; monitor?: boolean } = {}): Promise<ConnectResult> {
    this.disconnect();
    this.kind = kind;
    this.beats.reset();
    this.analyzer.reset();
    if (kind === 'midi') {
      this.status = 'idle';
      this.label = 'Controller (MIDI)';
      this.message = 'Controller mode — connected by the app.';
      return { ok: true, message: this.message };
    }
    if (kind === 'manual') {
      this.status = 'idle';
      this.label = 'Manual performance mode';
      this.message = 'No audio capture. Tap the beat, set the BPM and trigger builds and drops yourself.';
      return { ok: true, message: this.message };
    }
    this.status = 'connecting';
    try {
      const ctx = this.ensureContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const analyser = this.analyser!;

      if (kind === 'demo') {
        this.demo = new DemoSynth();
        const g = ctx.createGain();
        g.gain.value = 1;
        this.demo.start(ctx, g);
        g.connect(analyser);
        g.connect(ctx.destination);
        this.source = g;
        this.label = 'Built-in demo set (124 BPM)';
      } else if (kind === 'file') {
        if (!opts.file) return this.fail('cancelled', 'No file chosen.');
        const el = new Audio();
        el.src = URL.createObjectURL(opts.file);
        el.loop = true;
        el.crossOrigin = 'anonymous';
        await el.play();
        const src = ctx.createMediaElementSource(el);
        src.connect(analyser);
        src.connect(ctx.destination);
        this.fileEl = el;
        this.source = src;
        this.label = opts.file.name;
      } else if (kind === 'system') {
        if (!AudioEngine.supportsSystemAudio()) return this.fail('unsupported', AudioEngine.platformHint());
        const constraints = {
          video: { frameRate: 1, width: 320, height: 180 },
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'exclude',
        } as unknown as DisplayMediaStreamOptions;
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getDisplayMedia(constraints);
        } catch (e) {
          const err = e as DOMException;
          if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
            return this.fail('cancelled', 'Screen/audio sharing was cancelled. Choose "Entire screen" and tick "Share system audio", or pick another input.');
          }
          return this.fail('error', `System audio capture failed (${err.name}). ${AudioEngine.platformHint()}`);
        }
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          return this.fail('no-audio-track', `The share had no audio. ${AudioEngine.platformHint()}`);
        }
        // We only want the audio — drop the video track immediately to save CPU.
        stream.getVideoTracks().forEach((t) => t.stop());
        this.attachStream(stream, ctx, analyser);
        this.label = 'System audio';
      } else {
        // mic / line: raw, unprocessed capture from the chosen device
        if (!navigator.mediaDevices?.getUserMedia) return this.fail('unsupported', 'This browser has no audio input access.');
        const raw: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 };
        if (opts.deviceId) raw.deviceId = { exact: opts.deviceId };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: raw });
        } catch (e) {
          const err = e as DOMException;
          if (err.name === 'NotAllowedError') return this.fail('denied', 'Microphone / line-in permission was denied. Allow it in the browser address bar and try again.');
          if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return this.fail('no-device', 'That audio input is not available. Pick another device.');
          return this.fail('error', `Could not open the audio input (${err.name}).`);
        }
        this.attachStream(stream, ctx, analyser);
        this.label = stream.getAudioTracks()[0]?.label || (kind === 'mic' ? 'Microphone' : 'Line In');
      }

      if (opts.monitor && (kind === 'mic' || kind === 'line' || kind === 'system') && this.source) {
        this.monitorGain = ctx.createGain();
        this.monitorGain.gain.value = 0.8;
        this.source.connect(this.monitorGain).connect(ctx.destination);
      }
      this.status = 'live';
      this.message = `Listening to ${this.label}.`;
      return { ok: true, message: this.message };
    } catch (e) {
      const err = e as Error;
      return this.fail('error', `Audio failed to start: ${err.message}`);
    }
  }

  private attachStream(stream: MediaStream, ctx: AudioContext, analyser: AnalyserNode): void {
    this.stream = stream;
    const src = ctx.createMediaStreamSource(stream);
    if (this.kind === 'mic') {
      // A mic hearing speakers across a room is quiet: boost it for analysis. Gating uses the RAW level
      // (analyzer.inputGain) so room noise is never mistaken for music.
      const boost = ctx.createGain();
      boost.gain.value = 4;
      src.connect(boost).connect(analyser);
      this.analyzer.inputGain = 4;
    } else {
      src.connect(analyser); // NOT connected to destination — avoids feedback loops
      this.analyzer.inputGain = 1;
    }
    this.source = src;
    const track = stream.getAudioTracks()[0];
    track.addEventListener('ended', () => {
      if (this.stream !== stream) return;
      this.status = 'error';
      this.message = 'The audio source stopped (sharing ended or the device was unplugged).';
      this.onEnded?.();
    });
  }

  private fail(reason: ConnectResult['reason'], message: string): ConnectResult {
    this.status = 'error';
    this.message = message;
    this.label = '';
    return { ok: false, message, reason };
  }

  disconnect(): void {
    this.demo?.stop();
    this.demo = null;
    if (this.fileEl) {
      this.fileEl.pause();
      URL.revokeObjectURL(this.fileEl.src);
      this.fileEl = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.source?.disconnect(); } catch { /* ok */ }
    try { this.monitorGain?.disconnect(); } catch { /* ok */ }
    this.source = null;
    this.monitorGain = null;
    this.status = 'idle';
    this.features = { ...EMPTY };
  }

  /** Noise gate in dBFS (raw input level). */
  setGate(db: number): void {
    this.analyzer.gateDb = db;
  }
  get rawDb(): number { return this.analyzer.rawDb; }

  private calib: number[] | null = null;

  /** Measure the room for `ms` and set the gate just above it. Call with the music paused. */
  async calibrate(ms = 2500): Promise<{ ambientDb: number; gateDb: number } | null> {
    if (this.status !== 'live') return null;
    this.calib = [];
    await new Promise((r) => window.setTimeout(r, ms));
    const v = this.calib;
    this.calib = null;
    if (!v.length) return null;
    const peak = Math.max(...v);
    const gate = Math.min(-20, Math.max(-75, peak + 7));
    this.analyzer.gateDb = gate;
    return { ambientDb: peak, gateDb: gate };
  }

  setBeatSensitivity(v01: number): void {
    this.beats.sensitivity = v01;
  }

  /** Call once per rendered frame. `now` is in seconds. */
  update(now: number): AudioFeatures {
    const dt = Math.min(0.1, Math.max(0.001, now - this.lastNow));
    this.lastNow = now;
    if (this.status !== 'live' || !this.analyser || !this.ctx) {
      this.features = { ...EMPTY, bpm: this.features.bpm, bpmConfidence: 0 };
      return this.features;
    }
    this.analyser.getFloatFrequencyData(this.freq);
    this.analyser.getFloatTimeDomainData(this.time);
    const f = this.analyzer.analyse(this.freq, this.time, this.ctx.sampleRate, dt);
    this.calib?.push(this.analyzer.rawDb);
    const b = this.beats.process(f.fluxLow, f.fluxFull, f.bass, now, f.signal);
    this.onsetHist[this.onsetHead] = b.onset;
    this.onsetHead = (this.onsetHead + 1) % this.onsetHist.length;
    this.features = {
      signal: f.signal,
      level: f.level,
      rms: f.rms,
      bass: f.bass,
      mid: f.mid,
      high: f.high,
      bassEnv: f.bassEnv,
      midEnv: f.midEnv,
      highEnv: f.highEnv,
      levelEnv: f.levelEnv,
      brightness: f.brightness,
      transient: b.onset,
      beat: b.beat,
      strongBeat: b.strong,
      beatInBar: b.beatInBar,
      bpm: b.bpm,
      bpmConfidence: b.confidence,
    };
    return this.features;
  }

  /** Data for the audio debug panel. */
  getDebug(): AudioDebug {
    const spectrum = new Uint8Array(64);
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.byteFreq);
      const n = this.byteFreq.length;
      for (let i = 0; i < 64; i++) {
        // log-ish spacing so bass gets room
        const a = Math.floor(Math.pow(i / 64, 2.2) * n * 0.6);
        const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / 64, 2.2) * n * 0.6));
        let m = 0;
        for (let k = a; k < b; k++) m = Math.max(m, this.byteFreq[k]);
        spectrum[i] = m;
      }
    }
    const hist = new Float32Array(this.onsetHist.length);
    for (let i = 0; i < hist.length; i++) hist[i] = this.onsetHist[(this.onsetHead + i) % hist.length];
    return {
      spectrum,
      onsetHistory: hist,
      threshold: this.beats.threshold,
      rms: this.features.rms,
      inputLevelDb: 20 * Math.log10(Math.max(1e-5, this.features.rms)),
    };
  }
}
