import type { AudioFeatures } from '../core/types';
import { clamp, damp } from '../util/math';

/**
 * Reads the DJ controller (e.g. Numark Party Mix 2) over Web MIDI — READ ONLY, nothing is ever sent.
 *
 * A controller sends *control* data, not audio, so ECHO derives the crowd's mood from what your hands do:
 * channel faders + crossfader = how much music is in the room, bass EQ kill = breakdown, bass back = drop,
 * pad / button hits = crowd reactions. Tempo comes from Tap / the BPM setting (controllers don't send BPM).
 *
 * MIDI note/CC numbers differ per model and mode, so controls are *learned*: press "Learn", move the control.
 */
export type MidiTarget =
  | 'playA' | 'playB' | 'faderA' | 'faderB' | 'bassA' | 'bassB' | 'highA' | 'highB' | 'crossfader';

export const MIDI_TARGETS: { id: MidiTarget; label: string; hint: string }[] = [
  { id: 'faderA', label: 'Deck A channel fader', hint: 'Move the left channel fader' },
  { id: 'faderB', label: 'Deck B channel fader', hint: 'Move the right channel fader' },
  { id: 'crossfader', label: 'Crossfader', hint: 'Move the crossfader' },
  { id: 'bassA', label: 'Deck A bass EQ', hint: 'Turn the left LOW knob' },
  { id: 'bassB', label: 'Deck B bass EQ', hint: 'Turn the right LOW knob' },
  { id: 'highA', label: 'Deck A treble EQ (optional)', hint: 'Turn the left HIGH knob' },
  { id: 'highB', label: 'Deck B treble EQ (optional)', hint: 'Turn the right HIGH knob' },
  { id: 'playA', label: 'Deck A play (optional)', hint: 'Press the left PLAY button' },
  { id: 'playB', label: 'Deck B play (optional)', hint: 'Press the right PLAY button' },
];

export interface MidiBinding { kind: 'cc' | 'note'; ch: number; num: number }
export type MidiMap = Partial<Record<MidiTarget, MidiBinding>>;

export interface MidiDevice { id: string; name: string }

const MAP_KEY = 'echo.virtualclub.midimap.v1';

export class MidiEngine {
  connected = false;
  deviceName = '';
  message = '';
  map: MidiMap = {};
  /** Most recent raw message, for the on-screen monitor. */
  lastMessage = '';
  messageCount = 0;
  learning: MidiTarget | null = null;
  onLearned: ((t: MidiTarget, b: MidiBinding) => void) | null = null;

  private access: MIDIAccess | null = null;
  private inputs: MIDIInput[] = [];
  private values: Record<string, number> = {};
  private playing = { A: false, B: false };
  private env = { bass: 0, mid: 0, high: 0, level: 0 };
  private hits = 0;
  private transient = 0;
  private lastActivity = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(MAP_KEY);
      if (raw) this.map = JSON.parse(raw) as MidiMap;
    } catch { /* ignore */ }
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async listDevices(): Promise<MidiDevice[]> {
    if (!MidiEngine.supported()) return [];
    try {
      const access = this.access ?? (await navigator.requestMIDIAccess({ sysex: false }));
      this.access = access;
      return [...access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? 'MIDI input' }));
    } catch {
      return [];
    }
  }

  async connect(deviceId?: string): Promise<{ ok: boolean; message: string }> {
    this.disconnect();
    if (!MidiEngine.supported()) {
      return { ok: false, message: 'This browser has no Web MIDI. Use Chrome or Edge, or pick an audio input instead.' };
    }
    try {
      this.access = this.access ?? (await navigator.requestMIDIAccess({ sysex: false }));
    } catch (e) {
      return { ok: false, message: `MIDI access was blocked (${(e as Error).name}). Allow it in the address bar and try again.` };
    }
    const all = [...this.access.inputs.values()];
    if (!all.length) return { ok: false, message: 'No MIDI controller found. Plug in the Party Mix 2 (and make sure it is not claimed by another app), then press Refresh.' };
    // Prefer the chosen device; otherwise anything that looks like the Numark, otherwise all inputs.
    let chosen = all.filter((i) => i.id === deviceId);
    if (!chosen.length) chosen = all.filter((i) => /numark|party ?mix/i.test(i.name ?? ''));
    if (!chosen.length) chosen = all;
    for (const input of chosen) {
      input.onmidimessage = (e) => this.handle(e);
      this.inputs.push(input);
      try { void input.open(); } catch { /* some browsers open lazily */ }
    }
    this.connected = true;
    this.deviceName = chosen.map((i) => i.name).join(' + ');
    this.lastActivity = performance.now();
    this.message = `Reading ${this.deviceName}. Move a fader — if nothing registers below, another app (Serato) probably owns the controller.`;
    this.access.onstatechange = () => { if (!this.connected) return; /* hot-plug: user can press Connect again */ };
    return { ok: true, message: this.message };
  }

  disconnect(): void {
    for (const i of this.inputs) i.onmidimessage = null;
    this.inputs = [];
    this.connected = false;
    this.learning = null;
  }

  get hasActivity(): boolean { return this.messageCount > 0; }

  startLearn(t: MidiTarget): void { this.learning = t; }
  cancelLearn(): void { this.learning = null; }

  clearMap(): void {
    this.map = {};
    this.persist();
  }

  private persist(): void {
    try { localStorage.setItem(MAP_KEY, JSON.stringify(this.map)); } catch { /* ignore */ }
  }

  private key(b: MidiBinding): string { return `${b.kind}:${b.ch}:${b.num}`; }

  private handle(e: MIDIMessageEvent): void {
    const d = e.data;
    if (!d || d.length < 2) return;
    const status = d[0] & 0xf0;
    if (status === 0xf0 || status === 0xc0 || status === 0xd0) return; // system / program / pressure
    const ch = d[0] & 0x0f;
    const num = d[1];
    const val = d.length > 2 ? d[2] : 0;
    let b: MidiBinding | null = null;
    if (status === 0xb0) b = { kind: 'cc', ch, num };
    else if (status === 0x90 && val > 0) b = { kind: 'note', ch, num };
    else if (status === 0x80 || (status === 0x90 && val === 0)) return; // note off
    else if (status === 0xe0) b = { kind: 'cc', ch, num: 128 + num }; // pitch bend -> pseudo CC
    if (!b) return;
    this.messageCount++;
    this.lastActivity = performance.now();
    this.lastMessage = `${b.kind === 'cc' ? 'CC' : 'Note'} ${b.num} · ch ${b.ch + 1} · value ${val}`;

    if (this.learning) {
      const t = this.learning;
      // a fader/knob must be a CC; play buttons must be notes
      const wantNote = t === 'playA' || t === 'playB';
      if ((wantNote && b.kind === 'note') || (!wantNote && b.kind === 'cc')) {
        // ignore jitter from the jog wheels etc. only if already bound elsewhere
        this.map[t] = b;
        this.learning = null;
        this.persist();
        this.onLearned?.(t, b);
      }
      return;
    }

    const k = this.key(b);
    this.values[k] = val / 127;
    let handled = false;
    for (const t of Object.keys(this.map) as MidiTarget[]) {
      const bind = this.map[t]!;
      if (this.key(bind) !== k) continue;
      handled = true;
      if (t === 'playA' && b.kind === 'note') this.playing.A = !this.playing.A;
      if (t === 'playB' && b.kind === 'note') this.playing.B = !this.playing.B;
    }
    // unmapped note-on = pad / button hit → crowd reaction
    if (!handled && b.kind === 'note') this.hits++;
  }

  private val(t: MidiTarget, fallback: number): number {
    const b = this.map[t];
    if (!b) return fallback;
    const v = this.values[this.key(b)];
    return v === undefined ? fallback : v;
  }

  /** Pads/buttons pressed since the last call. */
  consumeHits(): number {
    const h = this.hits;
    this.hits = 0;
    return h;
  }

  /** EQ knobs centre at 64: below = cut (kill at 0), above = flat. */
  private eq(v: number): number {
    return v < 0.5 ? v * 2 : 1;
  }

  /** Synthesise per-frame features from the controller state (same shape the audio chain produces). */
  features(dt: number, bpm: number, beat: boolean, beatInBar: number): AudioFeatures {
    const m = this.map;
    const xf = this.val('crossfader', 0.5);
    // Serato-style crossfader: both decks full in the middle, one side fades out at the ends
    const gA = m.crossfader ? clamp((1 - xf) * 2.2) : 1;
    const gB = m.crossfader ? clamp(xf * 2.2) : 1;
    const mapped = (side: 'A' | 'B') => (['fader', 'bass', 'high', 'play'] as const).some((k) => m[`${k}${side}` as MidiTarget]);
    const anyMapped = mapped('A') || mapped('B');
    const deck = (side: 'A' | 'B') => {
      // Once any deck is mapped, an unmapped deck is treated as silent (not a phantom full-volume deck).
      if (anyMapped && !mapped(side)) return { w: 0, bass: 0, high: 0 };
      const fader = this.val(side === 'A' ? 'faderA' : 'faderB', m[side === 'A' ? 'faderA' : 'faderB'] ? 0 : 0.8);
      const play = m[side === 'A' ? 'playA' : 'playB'] ? (this.playing[side] ? 1 : 0) : 1;
      const w = fader * (side === 'A' ? gA : gB) * play;
      return {
        w,
        bass: w * this.eq(this.val(side === 'A' ? 'bassA' : 'bassB', 0.5)),
        high: w * this.eq(this.val(side === 'A' ? 'highA' : 'highB', 0.5)),
      };
    };
    const a = deck('A'), b = deck('B');
    const level = Math.max(a.w, b.w);
    const bass = Math.min(1, a.bass + b.bass * 0.9);
    const high = Math.max(a.high, b.high);
    const rate = (t: number, cur: number, up: number, down: number) => damp(cur, t, t > cur ? up : down, dt);
    this.env.level = rate(level, this.env.level, 6, 3);
    this.env.bass = rate(bass, this.env.bass, 6, 3);
    this.env.high = rate(high, this.env.high, 6, 3);
    this.env.mid = rate(level * 0.8, this.env.mid, 6, 3);
    this.transient = damp(this.transient, 0, 8, dt);
    const pads = this.hits;
    if (pads > 0) this.transient = Math.min(1, this.transient + 0.4 * pads);
    const signal = level > 0.04;
    return {
      signal,
      level: this.env.level, rms: this.env.level * 0.1,
      bass: this.env.bass, mid: this.env.mid, high: this.env.high,
      bassEnv: this.env.bass, midEnv: this.env.mid, highEnv: this.env.high, levelEnv: this.env.level,
      brightness: clamp(0.25 + this.env.high * 0.5),
      transient: Math.max(this.transient, beat ? 0.6 : 0),
      beat: beat && signal, strongBeat: beat && signal && beatInBar === 0, beatInBar,
      bpm: 0, bpmConfidence: 0,
    };
  }

  /** Seconds since the last message (for a "no data" warning). */
  get idleSeconds(): number {
    return (performance.now() - this.lastActivity) / 1000;
  }
}
