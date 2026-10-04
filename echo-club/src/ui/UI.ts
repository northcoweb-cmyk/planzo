import './ui.css';
import type { Settings, SettingsManager } from '../core/Settings';
import type { AudioInputKind, CrowdFrame, LightingOverride, QualityId, VenueId } from '../core/types';
import { MidiEngine, MIDI_TARGETS } from '../audio/MidiEngine';
import { AudioEngine, type AudioDebug, type ConnectResult, type DeviceInfo } from '../audio/AudioEngine';
import { VENUES, VENUE_ORDER } from '../scene/venues/venues';
import { formatDuration, type SessionStats } from '../engine/SessionManager';
import type { DebugSnapshot } from '../core/DebugManager';
import { QUALITY, QUALITY_ORDER } from '../core/Quality';

export interface UIHooks {
  start(opts: { file?: File }): Promise<ConnectResult>;
  reconnectAudio(opts: { file?: File }): Promise<ConnectResult>;
  tap(): void;
  drop(): void;
  build(): void;
  energyUp(): void;
  energyDown(): void;
  calm(): void;
  hype(): void;
  toggleSim(): boolean;
  fullscreen(): void;
  endSession(): void;
  listDevices(): Promise<DeviceInfo[]>;
  calibrate(): Promise<string>;
  midiAttach(): Promise<void>;
}

const ICONS: Record<AudioInputKind, string> = {
  system: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M8 10c1-1.5 2-1.5 3 0s2 1.5 3 0"/></svg>',
  line: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  demo: '<svg viewBox="0 0 24 24"><path d="M5 18V8l9-3v10"/><circle cx="5" cy="18" r="2"/><circle cx="14" cy="15" r="2"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 14l3-3 3 3M12 11v7"/></svg>',
  midi: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8" cy="12" r="2.2"/><circle cx="16" cy="12" r="2.2"/><path d="M12 8v8"/></svg>',
  manual: '<svg viewBox="0 0 24 24"><path d="M7 21V9a2 2 0 0 1 4 0v5l7 1v6"/><path d="M13 5.5a3 3 0 0 1 5 2"/></svg>',
};

const AUDIO_OPTIONS: { kind: AudioInputKind; title: string; desc: string; badge?: string }[] = [
  { kind: 'system', title: 'System audio', desc: 'Listens to what your computer is playing — Serato, Spotify, anything.', badge: 'Recommended' },
  { kind: 'line', title: 'Line in / virtual cable', desc: 'Pick an audio input: a sound card, or a loopback device like VB-Cable / BlackHole.' },
  { kind: 'midi', title: 'DJ controller (MIDI)', desc: 'Reads your Numark Party Mix 2 directly: faders, EQ, crossfader, pads. No audio needed.', badge: 'Direct' },
  { kind: 'mic', title: 'Microphone', desc: 'Hears your speakers through the mic. Works anywhere, least precise.' },
  { kind: 'demo', title: 'Built-in demo set', desc: 'A synthesised house track with builds and drops, to try the club right now.' },
  { kind: 'file', title: 'Audio file', desc: 'Play an MP3/WAV/AAC from your computer through the club.' },
  { kind: 'manual', title: 'Manual (tap the beat)', desc: 'No audio capture. Tap tempo and trigger builds and drops yourself.' },
];

type ElProps<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style' | 'class'>> & { class?: string; style?: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps<K> = {}, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: cls, style, ...rest } = props as Record<string, unknown>;
  if (cls) e.className = String(cls);
  if (style) e.setAttribute('style', String(style));
  Object.assign(e, rest);
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class UI {
  private root: HTMLElement;
  private launcher!: HTMLElement;
  private hud!: HTMLElement;
  private drawer!: HTMLElement;
  private refreshers: (() => void)[] = [];
  private idleTimer = 0;
  private uiHidden = false;
  private fileInput: HTMLInputElement | null = null;
  private pickedFile: File | undefined;
  private noticeTimer = 0;
  private reactionTimer = 0;
  private introTimer = 0;
  private lastHud = 0;
  private lastClock = '';
  private els: Record<string, HTMLElement> = {};
  private beatLed: HTMLElement | null = null;
  private debugCanvas!: HTMLCanvasElement;
  private audioPanelOpen = false;
  private deviceSelects: HTMLSelectElement[] = [];
  private audioStatusEls: HTMLElement[] = [];
  private launcherAudioNote!: HTMLElement;
  private launcherDeviceRow!: HTMLElement;
  private launcherFileRow!: HTMLElement;
  private qualityRec!: HTMLElement;
  private statEls: Record<string, HTMLElement> = {};
  private simBtn!: HTMLButtonElement;
  private midiSelects: HTMLSelectElement[] = [];
  private launcherMidiRow!: HTMLElement;
  private midiPanel!: HTMLElement;
  private midiMonitor!: HTMLElement;
  private midiBound: Record<string, HTMLElement> = {};
  private midiPopulated = false;
  private backupPills: HTMLElement[] = [];
  private midiConnPill: HTMLElement | null = null;
  private midiWizardPrompt!: HTMLElement;
  private wizSkip!: HTMLElement;
  private wizSkipGroup!: HTMLElement;
  private wizStop!: HTMLElement;
  private wiz: { list: typeof MIDI_TARGETS; i: number } | null = null;
  private backupSelects: HTMLSelectElement[] = [];

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly settings: SettingsManager,
    private readonly hooks: UIHooks,
    private readonly audio: AudioEngine,
    private readonly midi: MidiEngine,
  ) {
    this.root = rootEl;
    this.buildLauncher();
    this.buildHud();
    this.settings.subscribe(() => this.refreshers.forEach((r) => r()));
    window.addEventListener('mousemove', () => this.wake(), { passive: true });
    window.addEventListener('mousedown', () => this.wake(), { passive: true });
    window.addEventListener('touchstart', () => this.wake(), { passive: true });
  }

  // ======================================================================== launcher
  private buildLauncher(): void {
    const s = this.settings.get();
    const L = (this.launcher = el('div', { id: 'launcher' }));
    const card = el('div', { class: 'launch-card' });
    card.innerHTML = `
      <div class="wordmark"><h1>ECHO</h1><span>Virtual club · V2</span></div>
      <p class="lede">A live nightclub crowd for your second monitor. Play your set the way you always do — the room reacts to the music. Pick a venue, pick how ECHO should hear your music, press start.</p>`;

    // --- step 1: venue
    const s1 = el('section', { class: 'step' });
    s1.innerHTML = '<h2><b>1</b>Choose your venue</h2>';
    const vg = el('div', { class: 'venue-grid' });
    const venueBtns = new Map<VenueId, HTMLButtonElement>();
    for (const id of VENUE_ORDER) {
      const v = VENUES[id];
      const b = el('button', { class: 'venue-card', type: 'button' });
      b.innerHTML = `<div class="venue-art" style="background:linear-gradient(160deg, ${v.swatch[0]} 0%, ${v.swatch[1]} 60%, ${v.swatch[2]} 130%)"></div>
        <div class="venue-meta"><strong>${v.name}</strong><small>${v.location}</small><p>${v.tagline}</p></div>`;
      b.onclick = () => this.settings.set({ venue: id });
      venueBtns.set(id, b);
      vg.appendChild(b);
    }
    s1.appendChild(vg);
    card.appendChild(s1);
    this.refreshers.push(() => venueBtns.forEach((b, id) => b.setAttribute('aria-pressed', String(this.settings.get().venue === id))));

    // --- step 2: audio
    const s2 = el('section', { class: 'step' });
    s2.innerHTML = '<h2><b>2</b>How should ECHO hear your music?</h2>';
    const ag = el('div', { class: 'audio-grid' });
    const audioBtns = new Map<AudioInputKind, HTMLButtonElement>();
    for (const o of AUDIO_OPTIONS) {
      const b = el('button', { class: 'audio-card', type: 'button' });
      b.innerHTML = `${ICONS[o.kind]}<strong>${o.title}${o.badge ? `<em>${o.badge}</em>` : ''}</strong><span>${o.desc}</span>`;
      b.onclick = () => { this.settings.set({ audioInput: o.kind }); this.updateLauncherAudio(); };
      audioBtns.set(o.kind, b);
      ag.appendChild(b);
    }
    s2.appendChild(ag);
    this.launcherAudioNote = el('div', { class: 'audio-note' });
    s2.appendChild(this.launcherAudioNote);
    this.launcherDeviceRow = el('div', { class: 'audio-extra' });
    const devField = el('div', { class: 'field' }, '<label>Audio input device</label>');
    const devSel = el('select');
    devField.appendChild(devSel);
    this.deviceSelects.push(devSel);
    devSel.onchange = () => this.settings.set({ audioDeviceId: devSel.value });
    const refreshDev = el('button', { class: 'btn ghost', type: 'button' }, 'Refresh devices');
    refreshDev.onclick = () => void this.populateDevices(true);
    this.launcherDeviceRow.append(devField, refreshDev);
    s2.appendChild(this.launcherDeviceRow);
    this.launcherMidiRow = el('div', { class: 'audio-extra' });
    const mf = el('div', { class: 'field' }, '<label>MIDI controller</label>');
    const msel = el('select');
    msel.onchange = () => this.settings.set({ midiDeviceId: msel.value });
    mf.appendChild(msel);
    this.midiSelects.push(msel);
    const mref = el('button', { class: 'btn ghost', type: 'button' }, 'Find controllers');
    mref.onclick = () => void this.populateMidi();
    this.launcherMidiRow.append(mf, mref);
    s2.appendChild(this.launcherMidiRow);
    this.launcherFileRow = el('div', { class: 'audio-extra' });
    this.fileInput = el('input', { type: 'file', accept: 'audio/*' });
    this.fileInput.onchange = () => { this.pickedFile = this.fileInput!.files?.[0]; };
    const ff = el('div', { class: 'field' }, '<label>Audio file</label>');
    ff.appendChild(this.fileInput);
    this.launcherFileRow.appendChild(ff);
    s2.appendChild(this.launcherFileRow);
    card.appendChild(s2);
    this.refreshers.push(() => { audioBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(this.settings.get().audioInput === k))); this.updateLauncherAudio(); });

    // --- step 3: session
    const s3 = el('section', { class: 'step' });
    s3.innerHTML = '<h2><b>3</b>Your set</h2>';
    const row = el('div', { class: 'audio-extra' });
    const f1 = el('div', { class: 'field' }, '<label>DJ name</label>');
    const i1 = el('input', { type: 'text', value: s.djName, maxLength: 18 });
    i1.oninput = () => this.settings.set({ djName: i1.value.toUpperCase() });
    f1.appendChild(i1);
    const f2 = el('div', { class: 'field' }, '<label>Session</label>');
    const i2 = el('input', { type: 'text', value: s.sessionName, maxLength: 28 });
    i2.oninput = () => this.settings.set({ sessionName: i2.value.toUpperCase() });
    f2.appendChild(i2);
    row.append(f1, f2);
    s3.appendChild(row);
    card.appendChild(s3);

    // --- footer
    const foot = el('div', { class: 'launch-footer' });
    const start = el('button', { class: 'btn-start', type: 'button' }, 'START CLUB');
    start.onclick = async () => {
      start.disabled = true;
      start.textContent = 'CONNECTING…';
      const err = card.querySelector('#start-error') as HTMLElement;
      err.textContent = '';
      const res = await this.hooks.start({ file: this.pickedFile });
      start.disabled = false;
      start.textContent = 'START CLUB';
      if (!res.ok) err.textContent = res.message;
    };
    const fsLabel = el('label', { class: 'check' });
    const fsBox = el('input', { type: 'checkbox', checked: s.autoFullscreen });
    fsBox.onchange = () => this.settings.set({ autoFullscreen: fsBox.checked });
    fsLabel.append(fsBox, document.createTextNode('Go fullscreen on start'));
    this.refreshers.push(() => { fsBox.checked = this.settings.get().autoFullscreen; });
    const bkLabel = el('label', { class: 'check', title: 'Also listens through your headset mic as a backup if the main input hears nothing' });
    const bkBox = el('input', { type: 'checkbox', checked: s.backupMic });
    bkBox.onchange = () => { this.settings.set({ backupMic: bkBox.checked }); if (bkBox.checked) void this.populateDevices(true); };
    bkLabel.append(bkBox, document.createTextNode('Headset mic as backup'));
    this.refreshers.push(() => { bkBox.checked = this.settings.get().backupMic; });
    const mdLabel = el('label', { class: 'check', title: 'Mirrors your faders/knobs/pads on the on-screen board and hypes the crowd when you work the mix' });
    const mdBox = el('input', { type: 'checkbox', checked: s.midiLayer });
    mdBox.onchange = () => this.settings.set({ midiLayer: mdBox.checked });
    mdLabel.append(mdBox, document.createTextNode('Read my DJ controller'));
    this.refreshers.push(() => { mdBox.checked = this.settings.get().midiLayer; });
    foot.append(start, fsLabel, bkLabel, mdLabel, el('span', { class: 'hint-line' }, 'Tip: drag this window to your left monitor, then press <span class="kbd">F</span>'));
    card.appendChild(foot);
    card.appendChild(el('div', { id: 'start-error' }));

    const help = el('details', { class: 'help' });
    help.innerHTML = `<summary>Connecting Serato DJ Lite &amp; Spotify</summary>
      <ol>
        <li><b>ECHO listens to audio — it can't plug into Serato directly.</b> Serato DJ Lite has no public live-data connection, and Spotify doesn't expose its playback. ECHO analyses the actual sound instead, so it reacts to whatever you play.</li>
        <li><b>Windows (Chrome / Edge):</b> choose <i>System audio</i>, press Start, pick <i>Entire screen</i> and tick <i>Also share system audio</i>. This captures what Windows plays on its default output — if Serato outputs to your controller's own sound device, set that as the Windows default output, or use a virtual cable.</li>
        <li><b>Mac:</b> browsers only share tab audio. Install a free loopback driver (BlackHole), route Serato's output to it (multi-output device so you still hear it), then pick it under <i>Line in</i>.</li>
        <li><b>Can't capture anything?</b> Use <i>Microphone</i> (it hears your speakers) or <i>Manual</i> and tap the beat with <span class="kbd">T</span>. Builds and drops are always one key away: <span class="kbd">B</span> and <span class="kbd">D</span>.</li>
      </ol>`;
    card.appendChild(help);
    L.appendChild(card);
    this.root.appendChild(L);
    this.updateLauncherAudio();
    void this.populateDevices(false);
  }

  private updateLauncherAudio(): void {
    const kind = this.settings.get().audioInput;
    const note = this.launcherAudioNote;
    note.className = 'audio-note';
    this.launcherDeviceRow.classList.toggle('hidden', !(kind === 'line' || kind === 'mic'));
    this.launcherFileRow.classList.toggle('hidden', kind !== 'file');
    this.launcherMidiRow.classList.toggle('hidden', kind !== 'midi');
    if (kind === 'midi' && !this.midiPopulated) void this.populateMidi();
    switch (kind) {
      case 'system': {
        const hint = AudioEngine.platformHint();
        const bad = !AudioEngine.supportsSystemAudio();
        note.classList.toggle('bad', bad);
        note.innerHTML = `<b>${bad ? 'Not available in this browser.' : 'When you press Start,'}</b> ${hint}`;
        break;
      }
      case 'line': note.innerHTML = 'Choose the input your music arrives on. For Serato on the same computer use a <b>virtual audio cable</b> (VB-Cable, BlackHole, Loopback) or a sound card with a loopback/line-in. ECHO never plays this input back, so there is no feedback.'; break;
      case 'midi':
        note.classList.add('warn');
        note.innerHTML = MidiEngine.supported()
          ? '<b>Reads the controller\'s faders, EQ, crossfader and pads (read-only — nothing is sent to it).</b> It hears <i>what you do</i>, not the sound: pull the bass EQ out and the crowd settles, bring it back and they erupt; hit a pad and they cheer. Set the tempo with <span class="kbd">T</span>. <b>Windows caveat:</b> if Serato has the controller open, the browser may receive nothing — the monitor in Settings → Audio will show that. In that case use System audio or a virtual cable.'
          : '<b>This browser has no Web MIDI.</b> Use Chrome or Edge, or pick an audio input.';
        if (!MidiEngine.supported()) note.classList.add('bad');
        break;
      case 'mic': note.classList.add('warn'); note.innerHTML = 'The microphone hears your room speakers. Keep it away from the speakers if you hear a screech, and lower the volume a little. Level auto-adjusts.'; break;
      case 'demo': note.innerHTML = 'Plays a built-in 124&nbsp;BPM house arrangement (groove → breakdown → build → drop) through your speakers and analyses it exactly like any other input.'; break;
      case 'file': note.innerHTML = 'Loads a local audio file, plays it (looping) and analyses it live.'; break;
      case 'manual': note.classList.add('warn'); note.innerHTML = 'Manual performance mode. Tap <span class="kbd">T</span> in time with your music, set a BPM, and use <span class="kbd">B</span> (build) and <span class="kbd">D</span> (drop). <span class="kbd">↑</span>/<span class="kbd">↓</span> raise and lower the crowd.'; break;
    }
  }

  private async populateMidi(): Promise<void> {
    this.midiPopulated = true;
    const devs = await this.midi.listDevices();
    for (const sel of this.midiSelects) {
      const cur = this.settings.get().midiDeviceId;
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '' }, devs.length ? 'Auto (Numark / all)' : 'No MIDI controllers found'));
      for (const d of devs) sel.appendChild(el('option', { value: d.id }, d.name));
      sel.value = devs.some((d) => d.id === cur) ? cur : '';
    }
  }

  private async populateDevices(askPermission: boolean): Promise<void> {
    if (askPermission && navigator.mediaDevices?.getUserMedia) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch { /* labels stay hidden until permission is granted */ }
    }
    const devices = await this.hooks.listDevices();
    for (const sel of this.backupSelects) {
      const cur = this.settings.get().backupMicDeviceId;
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '' }, 'Default microphone'));
      for (const d of devices) sel.appendChild(el('option', { value: d.id }, d.label));
      sel.value = devices.some((d) => d.id === cur) ? cur : '';
    }
    for (const sel of this.deviceSelects) {
      const cur = this.settings.get().audioDeviceId;
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '' }, devices.length ? 'Default input' : 'No inputs found (click Refresh)'));
      for (const d of devices) sel.appendChild(el('option', { value: d.id }, d.label));
      sel.value = devices.some((d) => d.id === cur) ? cur : '';
    }
  }

  hideLauncher(): void {
    this.launcher.classList.add('leaving');
    window.setTimeout(() => this.launcher.classList.add('hidden'), 800);
  }

  showLauncher(): void {
    this.launcher.classList.remove('hidden');
    requestAnimationFrame(() => this.launcher.classList.remove('leaving'));
    this.hud.classList.add('hidden');
    this.drawer.classList.remove('open');
  }

  // ======================================================================== HUD
  private buildHud(): void {
    const H = (this.hud = el('div', { id: 'hud', class: 'hidden' }));
    H.innerHTML = `
      <div id="brand" class="hud-fade"><div class="b1">ECHO</div><div class="b2" id="loc">WASHINGTON DC</div><div class="b3" id="clock">11:47 PM</div></div>
      <div id="energy" class="hud-fade"><div class="e1">CROWD ENERGY</div><div class="e2" id="e-val">0%</div><div class="bar"><i id="e-bar"></i></div></div>
      <div id="status" class="hud-fade"></div>
      <div id="reaction"><div class="r1">CROWD REACTION</div><div class="r2" id="r-score">94%</div><div class="r3" id="r-label">PERFECT DROP</div></div>
      <div id="intro"><div class="i1" id="i-dj"></div><div class="i2">ECHO</div><div class="i3" id="i-venue"></div></div>
      <div id="notice"></div>
      <div id="controls"></div>
      <button id="gear-btn" aria-label="Settings" title="Settings (S)"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
      <pre id="debug" class="hidden"></pre>`;
    this.root.appendChild(H);
    for (const id of ['loc', 'clock', 'e-val', 'e-bar', 'status', 'reaction', 'r-score', 'r-label', 'intro', 'i-dj', 'i-venue', 'notice', 'controls', 'debug', 'gear-btn']) {
      this.els[id] = H.querySelector('#' + id) as HTMLElement;
    }
    this.els['gear-btn'].onclick = () => this.toggleSettings();

    // manual controls
    const c = this.els.controls;
    const mk = (label: string, key: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', class: cls }, `${label}<small>${key}</small>`);
      b.onclick = fn;
      c.appendChild(b);
      return b;
    };
    this.simBtn = mk('Pause', 'SPACE', () => { const running = this.hooks.toggleSim(); this.setSimState(running); }) as HTMLButtonElement;
    mk('Tap beat', 'T', () => this.hooks.tap());
    c.appendChild(el('div', { class: 'sep' }));
    mk('Build', 'B', () => this.hooks.build());
    mk('Drop', 'D', () => this.hooks.drop());
    c.appendChild(el('div', { class: 'sep' }));
    mk('Energy +', '↑', () => this.hooks.energyUp());
    mk('Energy −', '↓', () => this.hooks.energyDown());
    mk('Calm', 'C', () => this.hooks.calm());
    mk('Hype', 'V', () => this.hooks.hype());

    this.buildDrawer();
    this.buildAudioDebug();
  }

  setSimState(running: boolean): void {
    this.simBtn.innerHTML = `${running ? 'Pause' : 'Play'}<small>SPACE</small>`;
    this.simBtn.classList.toggle('on', !running);
  }

  showHud(venueLabel: string, location: string): void {
    this.hud.classList.remove('hidden');
    this.els.loc.textContent = location;
    this.wake();
    this.updateStatic();
  }

  /** Mouse/keyboard activity: reveal the (normally almost invisible) UI. */
  wake(): void {
    if (this.hud.classList.contains('hidden')) return;
    this.hud.classList.add('active');
    document.body.style.cursor = '';
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.drawer.classList.contains('open')) return this.wake();
      this.hud.classList.remove('active');
      document.body.style.cursor = 'none';
    }, 3200);
  }

  toggleUiHidden(): void {
    this.uiHidden = !this.uiHidden;
    this.hud.classList.toggle('ui-hidden', this.uiHidden);
    this.notice(this.uiHidden ? 'UI hidden — press H to show' : 'UI visible', false, 1400);
  }
  get isUiHidden(): boolean { return this.uiHidden; }

  introCard(dj: string, venue: string, session: string): void {
    this.els['i-dj'].textContent = `DJ ${dj}`;
    this.els['i-venue'].textContent = `${venue}  ·  ${session}`;
    this.els.intro.classList.add('show');
    window.clearTimeout(this.introTimer);
    this.introTimer = window.setTimeout(() => this.els.intro.classList.remove('show'), 4200);
  }

  reaction(score: number, label: string): void {
    this.els['r-score'].textContent = `${score}%`;
    this.els['r-label'].textContent = label;
    this.els.reaction.classList.add('show');
    window.clearTimeout(this.reactionTimer);
    this.reactionTimer = window.setTimeout(() => this.els.reaction.classList.remove('show'), 4200);
  }

  notice(msg: string, bad = false, ms = 6000): void {
    const n = this.els.notice;
    n.textContent = msg;
    n.classList.toggle('bad', bad);
    n.classList.add('show');
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => n.classList.remove('show'), ms);
  }

  private updateStatic(): void {
    this.refreshers.forEach((r) => r());
  }

  /** Per-frame HUD refresh (throttled). */
  updateHud(f: CrowdFrame, info: { input: string; live: boolean; manual: boolean; people: number; attendance: number; stateLabel: string }, now: number): void {
    if (now - this.lastHud < 0.1) return;
    this.lastHud = now;
    const e = Math.round(f.crowdEnergy);
    this.els['e-val'].textContent = `${e}%`;
    (this.els['e-bar'] as HTMLElement).style.width = `${e}%`;
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (time !== this.lastClock) { this.lastClock = time; this.els.clock.textContent = time; }
    const dot = info.live ? 'live' : info.manual ? 'manual' : '';
    const waiting = info.live && f.musicActive < 0.3;
    const bpmTxt = waiting ? '— BPM' : `${Math.round(f.bpm)} BPM`;
    const stateTxt = waiting ? 'WAITING FOR MUSIC' : info.stateLabel;
    this.els.status.innerHTML =
      `<i class="dot ${dot}"></i>${info.input}<span class="sep">|</span>${bpmTxt}<span class="sep">|</span>${stateTxt}<span class="sep">|</span>${info.attendance.toLocaleString()} IN THE ROOM`;
  }

  // ======================================================================== settings drawer
  private buildDrawer(): void {
    const D = (this.drawer = el('aside', { class: 'drawer', id: 'drawer' }));
    D.innerHTML = `<div class="drawer-head"><h3>Settings</h3><button class="icon-btn" id="drawer-close" aria-label="Close">✕</button></div>`;
    const tabs = el('div', { class: 'tabs' });
    const body = el('div', { class: 'drawer-body' });
    const panels: Record<string, HTMLElement> = {};
    const names: [string, string][] = [['audio', 'Audio'], ['show', 'Show'], ['crowd', 'Crowd'], ['gfx', 'Graphics'], ['session', 'Session']];
    for (const [id, label] of names) {
      const b = el('button', { type: 'button' }, label);
      b.onclick = () => select(id);
      b.dataset.tab = id;
      tabs.appendChild(b);
      const p = el('div', { class: 'tab-panel' });
      panels[id] = p;
      body.appendChild(p);
    }
    const select = (id: string) => {
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      Object.entries(panels).forEach(([k, p]) => p.classList.toggle('on', k === id));
    };
    D.append(tabs, body);
    this.root.appendChild(D);
    D.querySelector('#drawer-close')!.addEventListener('click', () => this.toggleSettings(false));

    const slider = (parent: HTMLElement, label: string, key: keyof Settings, min: number, max: number, step: number, fmt: (v: number) => string, help?: string) => {
      const row = el('div', { class: 'row' });
      const top = el('div', { class: 'top' }, `<label>${label}</label>`);
      const out = el('output');
      top.appendChild(out);
      const inp = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
      inp.oninput = () => this.settings.set({ [key]: Number(inp.value) } as Partial<Settings>);
      row.append(top, inp);
      if (help) row.appendChild(el('small', {}, help));
      parent.appendChild(row);
      const refresh = () => { const v = this.settings.get()[key] as number; inp.value = String(v); out.textContent = fmt(v); };
      this.refreshers.push(refresh);
      refresh();
    };
    const toggle = (parent: HTMLElement, label: string, key: keyof Settings, help?: string) => {
      const row = el('div', { class: 'toggle' }, `<span>${label}</span>`);
      const b = el('button', { type: 'button' });
      b.onclick = () => this.settings.set({ [key]: !this.settings.get()[key] } as Partial<Settings>);
      row.appendChild(b);
      parent.appendChild(row);
      if (help) parent.appendChild(el('small', { style: 'display:block;margin:-8px 0 14px;color:var(--text-faint);font-size:11.5px' }, help));
      const refresh = () => b.setAttribute('aria-pressed', String(Boolean(this.settings.get()[key])));
      this.refreshers.push(refresh);
      refresh();
    };
    const pct = (v: number) => `${Math.round(v)}%`;

    // ---- audio
    {
      const p = panels.audio;
      p.appendChild(el('div', { class: 'sec' }, 'Input'));
      const pill = el('div', { class: 'status-pill' }, '<i></i><span>Not connected</span>');
      this.audioStatusEls.push(pill);
      p.appendChild(pill);
      const inRow = el('div', { class: 'row' });
      const sel = el('select');
      for (const o of AUDIO_OPTIONS) sel.appendChild(el('option', { value: o.kind }, o.title));
      sel.onchange = () => this.settings.set({ audioInput: sel.value as AudioInputKind });
      inRow.append(el('div', { class: 'top' }, '<label>Audio input</label>'), sel);
      p.appendChild(inRow);
      this.refreshers.push(() => { sel.value = this.settings.get().audioInput; devRow.classList.toggle('hidden', !['line', 'mic'].includes(this.settings.get().audioInput)); fileRow.classList.toggle('hidden', this.settings.get().audioInput !== 'file'); });
      const devRow = el('div', { class: 'row' }, '<div class="top"><label>Device</label></div>');
      const dsel = el('select');
      dsel.onchange = () => this.settings.set({ audioDeviceId: dsel.value });
      this.deviceSelects.push(dsel);
      devRow.appendChild(dsel);
      p.appendChild(devRow);
      const fileRow = el('div', { class: 'row' }, '<div class="top"><label>File</label></div>');
      const fin = el('input', { type: 'file', accept: 'audio/*' });
      fin.onchange = () => { this.pickedFile = fin.files?.[0]; };
      fileRow.appendChild(fin);
      p.appendChild(fileRow);
      const btns = el('div', { class: 'btn-row' });
      const rc = el('button', { class: 'btn', type: 'button' }, 'Connect / reconnect');
      rc.onclick = async () => {
        const r = await this.hooks.reconnectAudio({ file: this.pickedFile });
        this.notice(r.message, !r.ok);
      };
      const tap = el('button', { class: 'btn ghost', type: 'button' }, 'Tap beat (T)');
      tap.onclick = () => this.hooks.tap();
      btns.append(rc, tap);
      p.appendChild(btns);
      // ---- microphone level / noise gate
      p.appendChild(el('div', { class: 'sec' }, 'Microphone level & noise gate'));
      const meter = el('div', { class: 'row' });
      meter.innerHTML = '<div class="top"><label>Mic level</label><output id="mic-db">– dB</output></div><div style="position:relative;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden"><i id="mic-bar" style="display:block;height:100%;width:0;background:var(--accent)"></i><i id="mic-gate" style="position:absolute;top:0;bottom:0;width:2px;background:var(--warn);left:50%"></i></div><small>The orange line is the noise gate. Music must be louder than it to count — room noise stays below it so the crowd stays quiet in silence.</small>';
      p.appendChild(meter);
      slider(p, 'Noise gate', 'micGateDb', -75, -25, 1, (v) => `${v} dB`, 'Raise it if the crowd moves with no music; lower it if the crowd ignores quiet music.');
      const cal = el('div', { class: 'btn-row' });
      const calBtn = el('button', { class: 'btn', type: 'button' }, 'Calibrate to my room');
      calBtn.onclick = async () => {
        calBtn.textContent = 'Listening… keep music OFF';
        const msg = await this.hooks.calibrate();
        calBtn.textContent = 'Calibrate to my room';
        this.notice(msg, false, 7000);
      };
      cal.appendChild(calBtn);
      p.appendChild(cal);
      slider(p, 'Beat sync offset', 'beatOffsetMs', -150, 150, 5, (v) => `${v > 0 ? '+' : ''}${v} ms`, 'If lights / arms hit slightly early or late, nudge this. Positive = later.');

      // ---- DJ controller (MIDI) — works next to ANY audio input
      p.appendChild(el('div', { class: 'sec' }, 'DJ controller (Numark Party Mix 2)'));
      toggle(p, 'Read my DJ controller', 'midiLayer', 'Runs alongside the mic / system audio. The on-screen board mirrors your faders, knobs, jogs and pads; moving the crossfader or filter hypes the crowd; a silent mixer means a silent room.');
      this.midiPanel = el('div', { class: 'midi-panel' });
      const mrow = el('div', { class: 'row' }, '<div class="top"><label>Controller</label></div>');
      const msel2 = el('select');
      msel2.onchange = () => this.settings.set({ midiDeviceId: msel2.value });
      this.midiSelects.push(msel2);
      mrow.appendChild(msel2);
      this.midiPanel.appendChild(mrow);
      this.midiConnPill = el('div', { class: 'status-pill' }, '<i></i><span>Not connected</span>');
      this.midiPanel.appendChild(this.midiConnPill);
      this.midiMonitor = el('div', { class: 'status-pill' }, '<i></i><span>No messages yet — move a fader</span>');
      this.midiPanel.appendChild(this.midiMonitor);
      const wizBox = el('div', { class: 'audio-note', style: 'margin:10px 0' });
      wizBox.innerHTML = '<b>Guided setup.</b> ECHO asks you to move one control at a time and remembers it. Do <i>Quick setup</i> first (crossfader, faders, bass knobs); the rest is optional.';
      this.midiWizardPrompt = el('div', { style: 'margin-top:8px;font-size:13px;color:var(--text)' });
      wizBox.appendChild(this.midiWizardPrompt);
      this.midiPanel.appendChild(wizBox);
      const wb = el('div', { class: 'btn-row' });
      const mkb = (label: string, fn: () => void, ghost = false) => { const b = el('button', { class: 'btn' + (ghost ? ' ghost' : ''), type: 'button' }, label); b.onclick = fn; wb.appendChild(b); return b; };
      mkb('Quick setup', () => void this.startWizard(['essential']));
      mkb('Full setup', () => void this.startWizard(['essential', 'deck', 'pads', 'actions']));
      mkb('Pads only', () => void this.startWizard(['pads']), true);
      this.midiPanel.appendChild(wb);
      const wb2 = el('div', { class: 'btn-row' });
      this.wizSkip = el('button', { class: 'btn ghost hidden', type: 'button' }, 'Skip this control');
      this.wizSkip.onclick = () => this.wizardNext(false);
      this.wizSkipGroup = el('button', { class: 'btn ghost hidden', type: 'button' }, 'Skip section');
      this.wizSkipGroup.onclick = () => this.wizardSkipGroup();
      this.wizStop = el('button', { class: 'btn ghost hidden', type: 'button' }, 'Stop');
      this.wizStop.onclick = () => this.wizardStop();
      wb2.append(this.wizSkip, this.wizSkipGroup, this.wizStop);
      this.midiPanel.appendChild(wb2);
      const det = el('details', { class: 'help' });
      det.appendChild(el('summary', {}, 'All mapped controls'));
      for (const t of MIDI_TARGETS) {
        const r = el('div', { style: 'display:flex;align-items:center;gap:8px;margin:6px 0' });
        const lab = el('span', { style: 'flex:1;font-size:12px;color:var(--text-dim)' }, t.label);
        const bound = el('output', { style: 'font:11px var(--mono);color:var(--text-faint);min-width:64px;text-align:right' });
        this.midiBound[t.id] = bound;
        const b = el('button', { class: 'btn ghost', type: 'button', style: 'padding:4px 9px' }, 'Learn');
        b.onclick = () => { void this.learnOne(t.id); };
        r.append(lab, bound, b);
        det.appendChild(r);
      }
      const clr = el('button', { class: 'btn ghost', type: 'button', style: 'margin-top:8px' }, 'Clear all mappings');
      clr.onclick = () => { this.wizardStop(); this.midi.clearMap(); this.midiRefreshBound(); };
      det.appendChild(clr);
      this.midiPanel.appendChild(det);
      p.appendChild(this.midiPanel);
      this.midiRefreshBound();
      p.appendChild(el('div', { class: 'sec' }, 'Backup headset mic'));
      toggle(p, 'Use headset mic as backup', 'backupMic', 'Runs alongside your main input. If the main input hears nothing it takes over; with the DJ controller it adds the tempo and beat. It only listens — nothing is recorded or played back.');
      const bkRow = el('div', { class: 'row' }, '<div class="top"><label>Headset mic</label></div>');
      const bsel = el('select');
      bsel.onchange = () => this.settings.set({ backupMicDeviceId: bsel.value });
      this.backupSelects.push(bsel);
      bkRow.appendChild(bsel);
      p.appendChild(bkRow);
      const bpill = el('div', { class: 'status-pill' }, '<i></i><span>Off</span>');
      this.backupPills.push(bpill);
      p.appendChild(bpill);
      toggle(p, 'Monitor input through speakers', 'monitorAudio', 'Only for line-in/mic testing. Leave off to avoid feedback.');
      p.appendChild(el('div', { class: 'sec' }, 'Tempo & sensitivity'));
      slider(p, 'Manual BPM', 'bpm', 70, 180, 1, (v) => `${v}`, 'Used in Manual mode and as a fallback if the tempo can\'t be detected. Tap beat overrides it.');
      slider(p, 'Sensitivity', 'sensitivity', 0, 100, 1, pct, 'How strongly music loudness lifts the crowd.');
      slider(p, 'Beat sensitivity', 'beatSensitivity', 0, 100, 1, pct, 'Higher catches softer kicks; lower ignores noise.');
      slider(p, 'Drop sensitivity', 'dropSensitivity', 0, 100, 1, pct, 'Higher fires drops more readily. Drops are always rate-limited.');
      const dbg = el('div', { class: 'btn-row' });
      const ab = el('button', { class: 'btn ghost', type: 'button' }, 'Audio debug panel (A)');
      ab.onclick = () => this.toggleAudioPanel();
      dbg.appendChild(ab);
      p.appendChild(dbg);
    }
    // ---- show
    {
      const p = panels.show;
      p.appendChild(el('div', { class: 'sec' }, 'Venue'));
      const vrow = el('div', { class: 'row' });
      const vs = el('select');
      for (const id of VENUE_ORDER) vs.appendChild(el('option', { value: id }, `${VENUES[id].name} — ${VENUES[id].location}`));
      vs.onchange = () => this.settings.set({ venue: vs.value as VenueId });
      vrow.append(el('div', { class: 'top' }, '<label>Venue (keys 1–5)</label>'), vs);
      p.appendChild(vrow);
      this.refreshers.push(() => { vs.value = this.settings.get().venue; });
      p.appendChild(el('div', { class: 'sec' }, 'Lighting'));
      const lrow = el('div', { class: 'row' });
      const lm = el('select');
      for (const m of ['AUTO', 'CALM', 'HOUSE', 'PEAK', 'DROP', 'BREAKDOWN', 'AFTERHOURS']) lm.appendChild(el('option', { value: m }, m === 'AUTO' ? 'Auto (follows the music)' : m[0] + m.slice(1).toLowerCase()));
      lm.onchange = () => this.settings.set({ lightingMode: lm.value as LightingOverride });
      lrow.append(el('div', { class: 'top' }, '<label>Lighting mode</label>'), lm);
      p.appendChild(lrow);
      this.refreshers.push(() => { lm.value = this.settings.get().lightingMode; });
      slider(p, 'Lighting intensity', 'lightingIntensity', 20, 150, 1, pct);
      slider(p, 'Fog amount', 'fogAmount', 0, 100, 1, pct);
      slider(p, 'Camera movement', 'cameraMovement', 0, 100, 1, pct, 'Beat bounce, slow build push and drop shake. 0 = locked off.');
      toggle(p, 'Reduce flashing', 'reduceFlashing', 'Disables strobes and lasers — for photosensitivity or a calmer look.');
    }
    // ---- crowd
    {
      const p = panels.crowd;
      slider(p, 'Crowd density', 'crowdDensity', 20, 100, 1, pct, 'How much of the venue is filled (front of the room first).');
      slider(p, 'Character density', 'characterDensity', 50, 150, 1, pct, 'How far out the highest-detail characters extend. Lower = faster.');
      slider(p, 'Crowd energy', 'crowdEnergy', -50, 50, 1, (v) => (v > 0 ? `+${v}` : `${v}`), 'Manual lift or drain on top of the music (↑ / ↓ keys). In Manual mode this sets the crowd level.');
      slider(p, 'Hands-up sensitivity', 'handsUpSensitivity', 0, 100, 1, pct);
      slider(p, 'Phone frequency', 'phoneFrequency', 0, 100, 1, pct);
    }
    // ---- graphics
    {
      const p = panels.gfx;
      p.appendChild(el('div', { class: 'sec' }, 'Quality'));
      const seg = el('div', { class: 'seg' });
      for (const q of QUALITY_ORDER) {
        const b = el('button', { type: 'button' }, QUALITY[q].label);
        b.onclick = () => this.settings.set({ quality: q, autoQuality: false });
        b.dataset.q = q;
        seg.appendChild(b);
      }
      p.appendChild(seg);
      this.refreshers.push(() => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(this.settings.get().quality === b.dataset.q))));
      this.qualityRec = el('small', { style: 'display:block;margin:8px 0 16px;color:var(--text-faint);font-size:11.5px' });
      p.appendChild(this.qualityRec);
      toggle(p, 'Auto-adjust for performance', 'autoQuality', 'Lowers resolution, then the preset, if the frame rate drops.');
      p.appendChild(el('div', { class: 'sec' }, 'Display'));
      const fs = el('div', { class: 'btn-row' });
      const fb = el('button', { class: 'btn', type: 'button' }, 'Fullscreen (F)');
      fb.onclick = () => this.hooks.fullscreen();
      fs.appendChild(fb);
      p.appendChild(fs);
      toggle(p, 'Debug mode', 'debug', 'FPS, BPM, beat confidence, energy, state, characters, lights, audio status. Shortcut: `');
    }
    // ---- session
    {
      const p = panels.session;
      p.appendChild(el('div', { class: 'sec' }, 'This session'));
      const grid = el('div', { class: 'stat-grid' });
      for (const [k, label] of [['dur', 'Duration'], ['peak', 'Peak energy'], ['avg', 'Average energy'], ['drops', 'Major drops'], ['high', 'High-energy moments'], ['att', 'Est. attendance'], ['hype', 'Peak hype'], ['score', 'Crowd reaction']] as const) {
        const s = el('div', { class: 'stat' }, `<b>–</b><span>${label}</span>`);
        this.statEls[k] = s.querySelector('b') as HTMLElement;
        grid.appendChild(s);
      }
      p.appendChild(grid);
      p.appendChild(el('small', { style: 'display:block;margin:10px 0 0;color:var(--text-faint);font-size:11.5px;line-height:1.5' }, 'Attendance is a fictional number that rises with the energy of your set — it is a game, not a measurement.'));
      p.appendChild(el('div', { class: 'sec' }, 'Set details'));
      const f1 = el('div', { class: 'row' }, '<div class="top"><label>DJ name</label></div>');
      const i1 = el('input', { type: 'text', maxLength: 18 });
      i1.oninput = () => this.settings.set({ djName: i1.value.toUpperCase() });
      f1.appendChild(i1);
      const f2 = el('div', { class: 'row' }, '<div class="top"><label>Session name</label></div>');
      const i2 = el('input', { type: 'text', maxLength: 28 });
      i2.oninput = () => this.settings.set({ sessionName: i2.value.toUpperCase() });
      f2.appendChild(i2);
      p.append(f1, f2);
      this.refreshers.push(() => { if (document.activeElement !== i1) i1.value = this.settings.get().djName; if (document.activeElement !== i2) i2.value = this.settings.get().sessionName; });
      const end = el('div', { class: 'btn-row' });
      const eb = el('button', { class: 'btn ghost', type: 'button' }, 'End session & return to menu');
      eb.onclick = () => { this.toggleSettings(false); this.hooks.endSession(); };
      const rs = el('button', { class: 'btn ghost', type: 'button' }, 'Reset settings');
      rs.onclick = () => this.settings.reset();
      end.append(eb, rs);
      p.appendChild(end);
    }
    select('audio');
    this.refreshers.forEach((r) => r());
  }

  toggleSettings(force?: boolean): void {
    const open = force ?? !this.drawer.classList.contains('open');
    this.drawer.classList.toggle('open', open);
    if (open) { this.wake(); void this.populateDevices(false); }
  }
  get settingsOpen(): boolean { return this.drawer.classList.contains('open'); }

  private midiRefreshBound(): void {
    for (const t of MIDI_TARGETS) {
      const b = this.midi.map[t.id];
      const el2 = this.midiBound[t.id];
      if (el2) el2.textContent = b ? `${b.kind === 'cc' ? 'CC' : 'Note'} ${b.num}` : '—';
    }
  }

  private async ensureMidi(): Promise<boolean> {
    if (this.midi.connected) return true;
    await this.hooks.midiAttach();
    return this.midi.connected;
  }

  private async learnOne(id: (typeof MIDI_TARGETS)[number]['id']): Promise<void> {
    if (!(await this.ensureMidi())) { this.notice('Plug in the controller first (and allow MIDI access).', true); return; }
    const t = MIDI_TARGETS.find((x) => x.id === id)!;
    this.notice(t.hint, false, 4000);
    this.midi.startLearn(id);
    this.midi.onLearned = () => { this.midiRefreshBound(); this.notice(`${t.label} mapped ✓`, false, 1500); };
  }

  private async startWizard(groups: string[]): Promise<void> {
    if (!(await this.ensureMidi())) { this.notice('Plug in the controller first (and allow MIDI access).', true); return; }
    const list = MIDI_TARGETS.filter((t) => groups.includes(t.group));
    this.wiz = { list, i: -1 };
    this.wizSkip.classList.remove('hidden');
    this.wizSkipGroup.classList.remove('hidden');
    this.wizStop.classList.remove('hidden');
    this.wizardNext(true);
  }

  private wizardNext(advance: boolean): void {
    const w = this.wiz;
    if (!w) return;
    if (advance || w.i < 0) w.i++;
    else { this.midi.cancelLearn(); w.i++; }
    if (w.i >= w.list.length) { this.wizardStop(true); return; }
    const t = w.list[w.i];
    this.midiWizardPrompt.innerHTML = `<b>${w.i + 1}/${w.list.length}</b> · ${t.hint}`;
    this.midi.startLearn(t.id);
    this.midi.onLearned = () => { this.midiRefreshBound(); this.wizardNext(true); };
  }

  private wizardSkipGroup(): void {
    const w = this.wiz;
    if (!w) return;
    const g = w.list[Math.max(0, w.i)].group;
    this.midi.cancelLearn();
    while (w.i < w.list.length && w.list[w.i].group === g) w.i++;
    w.i--; // wizardNext(true) will advance
    this.wizardNext(true);
  }

  private wizardStop(done = false): void {
    this.midi.cancelLearn();
    this.wiz = null;
    this.wizSkip?.classList.add('hidden');
    this.wizSkipGroup?.classList.add('hidden');
    this.wizStop?.classList.add('hidden');
    if (this.midiWizardPrompt) this.midiWizardPrompt.textContent = done ? 'Setup complete ✓ — the board on screen now mirrors your controller.' : '';
    this.midiRefreshBound();
  }

  /** Live microphone level + gate marker (Settings → Audio). */
  setMicMeter(rawDb: number, gateDb: number): void {
    if (!this.settingsOpen) return;
    const bar = document.getElementById('mic-bar');
    const gate = document.getElementById('mic-gate');
    const out = document.getElementById('mic-db');
    if (!bar || !gate || !out) return;
    const pos = (db: number) => `${Math.max(0, Math.min(100, ((db + 80) / 60) * 100))}%`;
    bar.style.width = pos(rawDb);
    bar.style.background = rawDb > gateDb ? 'var(--good)' : 'var(--accent)';
    gate.style.left = pos(gateDb);
    out.textContent = `${rawDb.toFixed(0)} dB`;
  }

  updateSession(stats: SessionStats): void {
    if (this.settingsOpen && this.midi.connected && this.midiMonitor) {
      const got = this.midi.hasActivity;
      this.midiMonitor.className = `status-pill ${got ? 'live' : ''}`;
      this.midiMonitor.querySelector('span')!.textContent = got
        ? `${this.midi.lastMessage}`
        : this.midi.idleSeconds > 4 ? 'Nothing received — Serato may own the controller. Close/disable it there, or use audio.' : 'Waiting for a message — move a fader…';
    }
    if (!this.settingsOpen) return;
    const S = this.statEls;
    S.dur.textContent = formatDuration(stats.durationSec);
    S.peak.textContent = `${Math.round(stats.peakEnergy)}%`;
    S.avg.textContent = `${Math.round(stats.avgEnergy)}%`;
    S.drops.textContent = String(stats.drops);
    S.high.textContent = String(stats.highEnergyMoments);
    S.att.textContent = stats.attendance.toLocaleString();
    S.hype.textContent = `${Math.round(stats.peakHype)}%`;
    S.score.textContent = stats.bestReaction ? `${Math.round(stats.reactionScore)}%` : '–';
  }

  setQualityRecommendation(text: string): void {
    if (this.qualityRec) this.qualityRec.textContent = text;
  }

  setMidiStatus(ok: boolean, text: string): void {
    this.midiConnPill?.classList.toggle('live', ok);
    this.midiConnPill?.classList.toggle('err', !ok);
    const sp = this.midiConnPill?.querySelector('span');
    if (sp) sp.textContent = text;
  }

  setBackupStatus(status: string, text: string): void {
    for (const pill of this.backupPills) {
      pill.className = `status-pill ${status === 'live' ? 'live' : status === 'error' ? 'err' : ''}`;
      pill.querySelector('span')!.textContent = text;
    }
  }

  setAudioStatus(status: string, text: string): void {
    for (const pill of this.audioStatusEls) {
      pill.className = `status-pill ${status === 'live' ? 'live' : status === 'error' ? 'err' : ''}`;
      pill.querySelector('span')!.textContent = text;
    }
  }

  // ======================================================================== debug
  setDebug(on: boolean, snap: DebugSnapshot | null): void {
    const d = this.els.debug;
    d.classList.toggle('hidden', !on);
    if (!on || !snap) return;
    const f = (n: number, p = 0) => n.toFixed(p);
    d.textContent =
      `FPS            ${f(snap.fps)}  (${f(snap.frameMs, 1)} ms)   res ${f(snap.resolutionScale * 100)}%  ${snap.quality}\n` +
      `BPM            ${f(snap.bpm, 1)}   confidence ${f(snap.beatConfidence * 100)}%\n` +
      `Bass/Mid/High  ${f(snap.bass * 100)} / ${f(snap.mid * 100)} / ${f(snap.high * 100)}   RMS ${f(snap.rms, 3)}\n` +
      `Crowd energy   ${f(snap.crowdEnergy, 1)}\n` +
      `State          ${snap.state}   light:${snap.lightingMode} ${snap.pattern}/${snap.palette}\n` +
      `Characters     ${snap.visibleCharacters}/${snap.totalCharacters}  hands ${snap.handsUp}  phones ${snap.phones}  jump ${snap.jumping}\n` +
      `Active lights  ${snap.activeLights}   draws ${snap.drawCalls}  tris ${(snap.triangles / 1000).toFixed(0)}k\n` +
      `Audio          ${snap.audioInput} · ${snap.audioStatus}\n` +
      `Drop           conf ${f(snap.dropConfidence * 100)}%  ${snap.dropDetected ? '◀ DROP' : ''}\n` +
      `Build          ${f(snap.buildIntensity * 100)}%  ${snap.buildDetected ? '◀ BUILD' : ''}\n` +
      `GPU            ${snap.gpu}`;
  }

  private buildAudioDebug(): void {
    const p = el('div', { id: 'audio-debug', class: 'hidden' });
    p.innerHTML = `<h4><span>Audio debug</span><span>beat<i class="beat-led" id="ad-led"></i></span></h4><canvas id="ad-canvas" width="720" height="192"></canvas><div class="meters" id="ad-meters"></div>`;
    this.hud.appendChild(p);
    this.els['audio-debug'] = p;
    this.debugCanvas = p.querySelector('#ad-canvas') as HTMLCanvasElement;
    this.beatLed = p.querySelector('#ad-led');
    const meters = p.querySelector('#ad-meters')!;
    const names = ['Input', 'Bass', 'Mid', 'High', 'RMS', 'Energy', 'Drop', 'Build'];
    for (const n of names) {
      const m = el('div', { class: 'meter' }, `<span>${n}</span><div class="t"><i data-m="${n}"></i></div><b data-v="${n}" style="font-weight:400;text-align:right">0</b>`);
      meters.appendChild(m);
    }
    const bpmLine = el('div', { style: 'grid-column:1/-1;margin-top:2px', id: 'ad-bpm' });
    meters.appendChild(bpmLine);
  }

  toggleAudioPanel(force?: boolean): void {
    this.audioPanelOpen = force ?? !this.audioPanelOpen;
    this.els['audio-debug'].classList.toggle('hidden', !this.audioPanelOpen);
    if (this.audioPanelOpen) this.wake();
  }
  get audioPanelVisible(): boolean { return this.audioPanelOpen; }

  updateAudioPanel(d: AudioDebug, f: CrowdFrame, beat: boolean, features: { bass: number; mid: number; high: number; level: number; bpm: number; conf: number }): void {
    if (!this.audioPanelOpen) return;
    const c = this.debugCanvas;
    const g = c.getContext('2d')!;
    const W = c.width, Hh = c.height;
    g.clearRect(0, 0, W, Hh);
    const n = d.spectrum.length;
    const bw = W / n;
    for (let i = 0; i < n; i++) {
      const v = d.spectrum[i] / 255;
      g.fillStyle = `hsl(${220 + i * 1.2}, 80%, ${40 + v * 30}%)`;
      g.fillRect(i * bw + 1, Hh * 0.62 - v * Hh * 0.6, bw - 2, v * Hh * 0.6);
    }
    // onset history + threshold
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    const oh = d.onsetHistory;
    for (let i = 0; i < oh.length; i++) {
      const x = (i / (oh.length - 1)) * W;
      const y = Hh - 6 - oh[i] * Hh * 0.32;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,184,102,0.7)';
    g.setLineDash([4, 4]);
    g.beginPath();
    const ty = Hh - 6 - d.threshold * Hh * 0.32;
    g.moveTo(0, ty); g.lineTo(W, ty);
    g.stroke();
    g.setLineDash([]);
    this.beatLed?.classList.toggle('on', beat);
    const set = (name: string, v01: number, text: string) => {
      const bar = this.els['audio-debug'].querySelector(`[data-m="${name}"]`) as HTMLElement;
      const val = this.els['audio-debug'].querySelector(`[data-v="${name}"]`) as HTMLElement;
      bar.style.width = `${Math.max(0, Math.min(1, v01)) * 100}%`;
      val.textContent = text;
    };
    set('Input', (d.inputLevelDb + 70) / 70, `${d.inputLevelDb.toFixed(0)}dB`);
    set('Bass', features.bass, features.bass.toFixed(2));
    set('Mid', features.mid, features.mid.toFixed(2));
    set('High', features.high, features.high.toFixed(2));
    set('RMS', d.rms * 4, d.rms.toFixed(3));
    set('Energy', f.crowdEnergy / 100, f.crowdEnergy.toFixed(0));
    set('Drop', f.dropConfidence, f.dropConfidence.toFixed(2));
    set('Build', f.buildIntensity, f.buildIntensity.toFixed(2));
    (this.els['audio-debug'].querySelector('#ad-bpm') as HTMLElement).textContent = `BPM ${features.bpm.toFixed(1)} · confidence ${(features.conf * 100).toFixed(0)}% · ${f.state}`;
  }
}
