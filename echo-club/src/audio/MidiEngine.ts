import type { AudioFeatures } from '../core/types';
import { clamp, damp } from '../util/math';

/**
 * Reads the DJ controller (e.g. Numark Party Mix 2) over Web MIDI — READ ONLY, nothing is ever sent.
 *
 * A controller sends *control* data, not audio. ECHO uses it three ways:
 *   1. The on-screen DJ board mirrors every mapped control (faders, knobs, jogs, pads, buttons).
 *   2. Mixer state shapes the room: faders/crossfader = how much music is playing, so a silent mixer
 *      can't be fooled by room noise; moving the crossfader / filter / EQ builds hype; pads cheer.
 *   3. Optional action buttons (tap tempo, build, drop).
 *
 * MIDI numbers differ per model/mode, so controls are *learned* (guided setup in Settings → Audio).
 */
export type MidiTarget =
  | 'crossfader'
  | 'faderA' | 'faderB' | 'trimA' | 'trimB' | 'hiA' | 'hiB' | 'midA' | 'midB' | 'lowA' | 'lowB'
  | 'filterA' | 'filterB' | 'tempoA' | 'tempoB' | 'jogA' | 'jogB'
  | 'playA' | 'playB' | 'cueA' | 'cueB' | 'syncA' | 'syncB'
  | 'padA1' | 'padA2' | 'padA3' | 'padA4' | 'padA5' | 'padA6' | 'padA7' | 'padA8'
  | 'padB1' | 'padB2' | 'padB3' | 'padB4' | 'padB5' | 'padB6' | 'padB7' | 'padB8'
  | 'tap' | 'build' | 'drop';

export interface MidiTargetInfo { id: MidiTarget; label: string; hint: string; kind: 'continuous' | 'button' | 'jog'; group: 'essential' | 'deck' | 'pads' | 'actions' }

const cont = (id: MidiTarget, label: string, hint: string, group: MidiTargetInfo['group']): MidiTargetInfo => ({ id, label, hint, kind: 'continuous', group });
const btn = (id: MidiTarget, label: string, hint: string, group: MidiTargetInfo['group']): MidiTargetInfo => ({ id, label, hint, kind: 'button', group });

export const MIDI_TARGETS: MidiTargetInfo[] = [
  cont('crossfader', 'Crossfader', 'Slide the CROSSFADER back and forth', 'essential'),
  cont('faderA', 'Left channel fader', 'Move the LEFT channel fader', 'essential'),
  cont('faderB', 'Right channel fader', 'Move the RIGHT channel fader', 'essential'),
  cont('lowA', 'Left bass (LOW) knob', 'Turn the LEFT LOW / BASS knob', 'essential'),
  cont('lowB', 'Right bass (LOW) knob', 'Turn the RIGHT LOW / BASS knob', 'essential'),
  btn('playA', 'Left PLAY button', 'Press the LEFT play button', 'deck'),
  btn('playB', 'Right PLAY button', 'Press the RIGHT play button', 'deck'),
  { id: 'jogA', label: 'Left jog wheel', hint: 'Spin the LEFT jog wheel', kind: 'jog', group: 'deck' },
  { id: 'jogB', label: 'Right jog wheel', hint: 'Spin the RIGHT jog wheel', kind: 'jog', group: 'deck' },
  cont('hiA', 'Left treble (HI) knob', 'Turn the LEFT HI / TREBLE knob', 'deck'),
  cont('hiB', 'Right treble (HI) knob', 'Turn the RIGHT HI / TREBLE knob', 'deck'),
  cont('midA', 'Left MID knob', 'Turn the LEFT MID knob', 'deck'),
  cont('midB', 'Right MID knob', 'Turn the RIGHT MID knob', 'deck'),
  cont('trimA', 'Left GAIN / TRIM knob', 'Turn the LEFT GAIN / TRIM knob', 'deck'),
  cont('trimB', 'Right GAIN / TRIM knob', 'Turn the RIGHT GAIN / TRIM knob', 'deck'),
  cont('filterA', 'Left FILTER knob', 'Turn the LEFT FILTER knob', 'deck'),
  cont('filterB', 'Right FILTER knob', 'Turn the RIGHT FILTER knob', 'deck'),
  cont('tempoA', 'Left tempo (pitch) fader', 'Move the LEFT tempo / pitch fader', 'deck'),
  cont('tempoB', 'Right tempo (pitch) fader', 'Move the RIGHT tempo / pitch fader', 'deck'),
  btn('cueA', 'Left CUE button', 'Press the LEFT cue button', 'deck'),
  btn('cueB', 'Right CUE button', 'Press the RIGHT cue button', 'deck'),
  btn('syncA', 'Left SYNC button', 'Press the LEFT sync button', 'deck'),
  btn('syncB', 'Right SYNC button', 'Press the RIGHT sync button', 'deck'),
  ...(['A', 'B'] as const).flatMap((d) =>
    [1, 2, 3, 4, 5, 6, 7, 8].map((i) => btn(`pad${d}${i}` as MidiTarget, `${d === 'A' ? 'Left' : 'Right'} pad ${i}`, `Press pad ${i} (${i <= 4 ? 'top' : 'bottom'} row, ${((i - 1) % 4) + 1} from the left) on the ${d === 'A' ? 'LEFT' : 'RIGHT'} deck`, 'pads')),
  ),
  btn('tap', 'Tap-tempo button (optional)', 'Press any button you will tap in time with the music', 'actions'),
  btn('build', 'Trigger BUILD (optional)', 'Press a button/pad to trigger a build-up', 'actions'),
  btn('drop', 'Trigger DROP (optional)', 'Press a button/pad to trigger a drop', 'actions'),
];
const INFO = new Map(MIDI_TARGETS.map((t) => [t.id, t]));

export interface MidiBinding { kind: 'cc' | 'note'; ch: number; num: number }
export type MidiMap = Partial<Record<MidiTarget, MidiBinding>>;
export interface MidiDevice { id: string; name: string }

/** Snapshot the DJ board renders. `undefined` = control not mapped (board leaves it alone). */
export interface BoardView {
  mapped: boolean;
  crossfader?: number;
  fader: [number | undefined, number | undefined];
  trim: [number | undefined, number | undefined];
  hi: [number | undefined, number | undefined];
  mid: [number | undefined, number | undefined];
  low: [number | undefined, number | undefined];
  filter: [number | undefined, number | undefined];
  tempo: [number | undefined, number | undefined];
  jogAngle: [number, number];
  jogMapped: [boolean, boolean];
  playMapped: [boolean, boolean];
  playing: [boolean, boolean];
  cue: [boolean, boolean];
  sync: [boolean, boolean];
  pads: [boolean[], boolean[]];
}

const MAP_KEY = 'echo.virtualclub.midimap.v2';

export class MidiEngine {
  connected = false;
  deviceName = '';
  message = '';
  map: MidiMap = {};
  lastMessage = '';
  messageCount = 0;
  learning: MidiTarget | null = null;
  onLearned: ((t: MidiTarget, b: MidiBinding) => void) | null = null;

  private access: MIDIAccess | null = null;
  private inputs: MIDIInput[] = [];
  private values: Record<string, number> = {};
  private held = new Map<string, boolean>();
  private playing = { A: false, B: false };
  private env = { bass: 0, mid: 0, high: 0, level: 0 };
  private hits = 0;
  private activity = 0;
  private transient = 0;
  private lastActivity = 0;
  private jog = { A: 0, B: 0 };
  private jogVel = { A: 0, B: 0 };
  private actions: MidiTarget[] = [];
  private keyToTargets = new Map<string, MidiTarget[]>();

  constructor() {
    try {
      const raw = localStorage.getItem(MAP_KEY) ?? localStorage.getItem('echo.virtualclub.midimap.v1');
      if (raw) {
        const m = JSON.parse(raw) as Record<string, MidiBinding>;
        // v1 names → v2
        if (m.bassA) { m.lowA = m.bassA; delete m.bassA; }
        if (m.bassB) { m.lowB = m.bassB; delete m.bassB; }
        if (m.highA) { m.hiA = m.highA; delete m.highA; }
        if (m.highB) { m.hiB = m.highB; delete m.highB; }
        this.map = m as MidiMap;
      }
    } catch { /* ignore */ }
    this.rebuildIndex();
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  get mappedCount(): number { return Object.keys(this.map).length; }
  get hasMapping(): boolean { return this.mappedCount > 0; }
  /** True when the controller is attached and delivering data. */
  get alive(): boolean { return this.connected && this.messageCount > 0; }
  get hasActivity(): boolean { return this.messageCount > 0; }
  get idleSeconds(): number { return (performance.now() - this.lastActivity) / 1000; }

  async listDevices(): Promise<MidiDevice[]> {
    if (!MidiEngine.supported()) return [];
    try {
      this.access = this.access ?? (await navigator.requestMIDIAccess({ sysex: false }));
      return [...this.access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? 'MIDI input' }));
    } catch {
      return [];
    }
  }

  async connect(deviceId?: string): Promise<{ ok: boolean; message: string }> {
    this.disconnect();
    if (!MidiEngine.supported()) {
      return { ok: false, message: 'This browser has no Web MIDI. Use Chrome or Edge.' };
    }
    try {
      this.access = this.access ?? (await navigator.requestMIDIAccess({ sysex: false }));
    } catch (e) {
      return { ok: false, message: `MIDI access was blocked (${(e as Error).name}). Allow it in the address bar and try again.` };
    }
    const all = [...this.access.inputs.values()];
    if (!all.length) return { ok: false, message: 'No MIDI controller found. Plug in the Party Mix 2 and press Refresh.' };
    let chosen = all.filter((i) => i.id === deviceId);
    if (!chosen.length) chosen = all.filter((i) => /numark|party ?mix/i.test(i.name ?? ''));
    if (!chosen.length) chosen = all;
    for (const input of chosen) {
      input.onmidimessage = (e) => this.handle(e);
      this.inputs.push(input);
      try { void input.open(); } catch { /* lazily opened */ }
    }
    this.connected = true;
    this.deviceName = chosen.map((i) => i.name).join(' + ');
    this.lastActivity = performance.now();
    this.message = `Reading ${this.deviceName}.`;
    return { ok: true, message: this.message };
  }

  disconnect(): void {
    for (const i of this.inputs) i.onmidimessage = null;
    this.inputs = [];
    this.connected = false;
    this.learning = null;
  }

  startLearn(t: MidiTarget): void { this.learning = t; }
  cancelLearn(): void { this.learning = null; }

  clearMap(): void {
    this.map = {};
    this.persist();
    this.rebuildIndex();
  }

  unmap(t: MidiTarget): void {
    delete this.map[t];
    this.persist();
    this.rebuildIndex();
  }

  private persist(): void {
    try { localStorage.setItem(MAP_KEY, JSON.stringify(this.map)); } catch { /* ignore */ }
  }

  private key(b: MidiBinding): string { return `${b.kind}:${b.ch}:${b.num}`; }

  private rebuildIndex(): void {
    this.keyToTargets.clear();
    for (const t of Object.keys(this.map) as MidiTarget[]) {
      const k = this.key(this.map[t]!);
      const l = this.keyToTargets.get(k) ?? [];
      l.push(t);
      this.keyToTargets.set(k, l);
    }
  }

  private handle(e: MIDIMessageEvent): void {
    const d = e.data;
    if (!d || d.length < 2) return;
    const status = d[0] & 0xf0;
    if (status === 0xf0 || status === 0xc0 || status === 0xd0) return;
    const ch = d[0] & 0x0f;
    const num = d[1];
    const val = d.length > 2 ? d[2] : 0;
    let b: MidiBinding;
    let pressed = true;
    let v = val;
    if (status === 0xb0) b = { kind: 'cc', ch, num };
    else if (status === 0x90) { b = { kind: 'note', ch, num }; pressed = val > 0; }
    else if (status === 0x80) { b = { kind: 'note', ch, num }; pressed = false; v = 0; }
    else if (status === 0xe0) { b = { kind: 'cc', ch, num: 128 + 0 }; v = (num | (d[2] << 7)) >> 7; } // pitch bend → 7-bit
    else return;
    this.messageCount++;
    this.lastActivity = performance.now();
    this.lastMessage = `${b.kind === 'cc' ? 'CC' : 'Note'} ${b.num} · ch ${b.ch + 1} · ${status === 0x80 ? 'off' : 'value ' + v}`;

    if (this.learning) {
      if (b.kind === 'note' && !pressed) return; // wait for the press, not the release
      const t = this.learning;
      const info = INFO.get(t)!;
      if (info.kind === 'continuous' && b.kind !== 'cc') return; // knobs/faders are CCs
      if (info.kind === 'button' && b.kind === 'cc' && v === 0) return;
      // refuse a control that already belongs to a different target (jog jitter, wrong control)
      const owners = this.keyToTargets.get(this.key(b)) ?? [];
      if (owners.some((o) => o !== t)) return;
      this.map[t] = b;
      this.learning = null;
      this.persist();
      this.rebuildIndex();
      this.onLearned?.(t, b);
      return;
    }

    const targets = this.keyToTargets.get(this.key(b));
    if (!targets) {
      if (b.kind === 'note' && pressed) this.hits++;
      return;
    }
    for (const t of targets) {
      const info = INFO.get(t)!;
      if (info.kind === 'continuous') {
        const nv = v / 127;
        const old = this.values[t];
        this.values[t] = nv;
        if (old !== undefined) this.activity += Math.abs(nv - old) * (t === 'crossfader' ? 3.2 : t.startsWith('filter') ? 2.4 : t.startsWith('fader') ? 1.1 : t.startsWith('tempo') ? 0.3 : 1.4);
      } else if (info.kind === 'jog') {
        const deck = t === 'jogA' ? 'A' : 'B';
        const delta = v < 64 ? v : v - 128; // relative encoding (1.. = clockwise, 127.. = counter)
        this.jog[deck] += delta * 0.055;
        this.jogVel[deck] += delta * 0.9;
        this.activity += Math.min(0.15, Math.abs(delta) * 0.012);
      } else {
        const down = b.kind === 'note' ? pressed : v > 0;
        this.held.set(t, down);
        if (down) {
          if (t === 'playA') this.playing.A = !this.playing.A;
          else if (t === 'playB') this.playing.B = !this.playing.B;
          else if (t === 'tap' || t === 'build' || t === 'drop') this.actions.push(t);
          else if (t.startsWith('pad')) this.hits++;
          else this.activity += 0.15;
        }
      }
    }
  }

  private val(t: MidiTarget): number | undefined {
    if (!this.map[t]) return undefined;
    return this.values[t];
  }

  /** Pads/buttons pressed since the last call. */
  consumeHits(): number { const h = this.hits; this.hits = 0; return h; }
  /** Crossfader / filter / EQ "DJ is working the mix" activity since the last call. */
  consumeActivity(): number { const a = this.activity; this.activity = 0; return a; }
  consumeActions(): MidiTarget[] { const a = this.actions; this.actions = []; return a; }

  /** EQ knobs centre at 64: below = cut (kill at 0), above = flat. */
  private eq(v: number): number { return v < 0.5 ? v * 2 : 1; }

  /** Fader × crossfader per deck (1 when unmapped, 0 for a deck that is not mapped at all once the other is). */
  private deckLevels(): { a: number; b: number; mixed: boolean } {
    const m = this.map;
    const mapped = (s: 'A' | 'B') => (['fader', 'low', 'hi', 'play'] as const).some((k) => m[`${k}${s}` as MidiTarget]);
    const any = mapped('A') || mapped('B');
    if (!any) return { a: 1, b: 1, mixed: false };
    const xf = this.val('crossfader') ?? 0.5;
    const gA = m.crossfader ? clamp((1 - xf) * 2.2) : 1;
    const gB = m.crossfader ? clamp(xf * 2.2) : 1;
    const lvl = (s: 'A' | 'B', g: number) => {
      if (!mapped(s)) return 0;
      const fader = this.val(`fader${s}` as MidiTarget) ?? (m[`fader${s}` as MidiTarget] ? 0 : 0.85);
      const play = m[`play${s}` as MidiTarget] ? (this.playing[s] ? 1 : 0) : 1;
      return fader * g * play;
    };
    return { a: lvl('A', gA), b: lvl('B', gB), mixed: true };
  }

  /** 0..1 how much music the *mixer* says is going out (1 if nothing relevant is mapped). */
  mixLevel(): number {
    const d = this.deckLevels();
    return d.mixed ? Math.max(d.a, d.b) : 1;
  }

  /** True if faders/play are mapped, i.e. the mixer can veto "music" detected by the microphone. */
  get canVeto(): boolean {
    return this.alive && (['faderA', 'faderB', 'crossfader', 'playA', 'playB'] as MidiTarget[]).some((t) => this.map[t]);
  }

  /** Synthesise features from the controller alone (used when there is no audio). */
  features(dt: number, bpm: number, beat: boolean, beatInBar: number): AudioFeatures {
    const m = this.map;
    const d = this.deckLevels();
    const bassOf = (s: 'A' | 'B', w: number) => w * this.eq(this.val(`low${s}` as MidiTarget) ?? 0.5);
    const hiOf = (s: 'A' | 'B', w: number) => w * this.eq(this.val(`hi${s}` as MidiTarget) ?? 0.5);
    const level = Math.max(d.a, d.b);
    const bass = Math.min(1, bassOf('A', d.a) + bassOf('B', d.b) * 0.9);
    const high = Math.max(hiOf('A', d.a), hiOf('B', d.b));
    const rate = (t: number, cur: number) => damp(cur, t, t > cur ? 6 : 3, dt);
    this.env.level = rate(level, this.env.level);
    this.env.bass = rate(bass, this.env.bass);
    this.env.high = rate(high, this.env.high);
    this.env.mid = rate(level * 0.8, this.env.mid);
    this.transient = damp(this.transient, 0, 8, dt);
    if (this.hits > 0) this.transient = Math.min(1, this.transient + 0.4 * this.hits);
    const signal = level > 0.04 && (m.faderA || m.faderB || m.playA || m.playB || m.crossfader ? true : false);
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

  /** Per-frame: decay jog velocity. */
  step(dt: number): void {
    this.jogVel.A = damp(this.jogVel.A, 0, 7, dt);
    this.jogVel.B = damp(this.jogVel.B, 0, 7, dt);
  }

  view(): BoardView {
    const m = this.map;
    const pads = (s: 'A' | 'B') => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => this.held.get(`pad${s}${i}` as MidiTarget) === true);
    const two = (n: string): [number | undefined, number | undefined] => [this.val(`${n}A` as MidiTarget), this.val(`${n}B` as MidiTarget)];
    return {
      mapped: this.alive && this.hasMapping,
      crossfader: this.val('crossfader'),
      fader: two('fader'), trim: two('trim'), hi: two('hi'), mid: two('mid'), low: two('low'), filter: two('filter'), tempo: two('tempo'),
      jogAngle: [this.jog.A, this.jog.B],
      jogMapped: [!!m.jogA, !!m.jogB],
      playMapped: [!!m.playA, !!m.playB],
      playing: [this.playing.A, this.playing.B],
      cue: [this.held.get('cueA') === true, this.held.get('cueB') === true],
      sync: [this.held.get('syncA') === true, this.held.get('syncB') === true],
      pads: [pads('A'), pads('B')],
    };
  }
}
