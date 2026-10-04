import * as THREE from 'three';
import { SettingsManager } from './core/Settings';
import { QUALITY } from './core/Quality';
import type { CrowdFrame, QualityId } from './core/types';
import { AudioEngine, type ConnectResult } from './audio/AudioEngine';
import { MidiEngine } from './audio/MidiEngine';
import { EnergyEngine } from './engine/EnergyEngine';
import { SessionManager } from './engine/SessionManager';
import { CrowdManager } from './crowd/CrowdManager';
import { SceneManager } from './scene/SceneManager';
import { EnvironmentManager } from './scene/EnvironmentManager';
import { CameraRig } from './scene/CameraRig';
import { PerformanceManager, detectGpu, recommendFromGpu, type GpuInfo } from './core/PerformanceManager';
import { DebugManager } from './core/DebugManager';
import { UI } from './ui/UI';
import { assets } from './assets/AssetRegistry';
import { VENUES, VENUE_ORDER } from './scene/venues/venues';
import { clamp } from './util/math';

const STATE_LABEL: Record<string, string> = {
  CALM: 'CALM', GROOVE: 'GROOVE', ENERGY_BUILD: 'BUILDING', HYPE: 'HYPE', DROP: 'DROP', PEAK: 'PEAK', BREAKDOWN: 'BREAKDOWN', RECOVERY: 'RECOVERY',
};

/** Composition root: owns every manager and runs the frame loop. */
class ClubApp {
  readonly settings = new SettingsManager();
  readonly audio = new AudioEngine();
  readonly midi = new MidiEngine();
  /** Second, independent audio chain: the headset mic as a backup listener. */
  readonly backup = new AudioEngine();
  private backupUsed = false;
  readonly energy = new EnergyEngine();
  readonly session = new SessionManager();
  readonly crowd = new CrowdManager();
  readonly perf = new PerformanceManager();
  readonly debug = new DebugManager();
  readonly scene: SceneManager;
  readonly env: EnvironmentManager;
  readonly camera: CameraRig;
  readonly ui: UI;
  private gpu: GpuInfo;

  private running = false; // club started
  simRunning = true;
  private simTime = 0;
  private last = performance.now() / 1000;
  private frame!: CrowdFrame;
  private appliedVenue = '';
  private appliedQuality: QualityId | '' = '';
  private relayoutTimer = 0;
  private rebuildTimer = 0;
  private lastDebugAt = 0;
  private lastDropAt = -99;
  private lastBuildAt = -99;
  private beatFlash = false;
  private frameCount = 0;
  /** Largest simulation step per frame. Raised via ?dtmax= for slow test machines. */
  private readonly maxDt = Math.min(0.5, Number(new URLSearchParams(location.search).get('dtmax')) || 0.1);

  constructor() {
    const stage = document.getElementById('stage')!;
    this.scene = new SceneManager(stage);
    this.camera = new CameraRig(window.innerWidth / Math.max(1, window.innerHeight));
    this.scene.bindCamera(this.camera.camera);
    this.env = new EnvironmentManager(this.scene);
    this.scene.scene.add(this.crowd.group);
    this.gpu = detectGpu(this.scene.gl);

    // first launch: pick a sensible preset from the GPU
    if (!localStorage.getItem('echo.virtualclub.settings.v2')) {
      this.settings.set({ quality: recommendFromGpu(this.gpu), autoQuality: true });
    }
    this.perf.autoEnabled = this.settings.get().autoQuality;
    this.perf.onScale = (s) => this.scene.setResolutionScale(s);
    this.perf.onStepDown = (q) => {
      if (this.settings.get().autoQuality && this.running) {
        this.ui.notice(`Performance: switched to ${QUALITY[q].label} quality`, false, 3500);
        this.settings.set({ quality: q });
      }
    };

    this.ui = new UI(document.getElementById('ui-root')!, this.settings, {
      start: (o) => this.startClub(o.file),
      reconnectAudio: (o) => this.connectAudio(o.file),
      tap: () => this.tap(),
      drop: () => this.triggerDrop(),
      build: () => this.triggerBuild(),
      energyUp: () => this.nudgeEnergy(5),
      energyDown: () => this.nudgeEnergy(-5),
      calm: () => this.energy.crowdCalm(this.simTime),
      hype: () => this.energy.crowdHype(this.simTime),
      toggleSim: () => this.toggleSim(),
      fullscreen: () => this.toggleFullscreen(),
      endSession: () => this.endSession(),
      listDevices: () => this.audio.listDevices(),
    }, this.audio, this.midi);

    this.session.onReaction = (r) => this.ui.reaction(r.score, r.label);
    this.audio.endedHandler = () => {
      this.ui.notice('Audio source stopped. Switched to manual mode — tap T to keep the tempo, or reconnect in Settings → Audio.', true, 9000);
      this.ui.setAudioStatus('error', 'Source ended');
    };

    this.applyQualityAndVenue(true);
    this.settings.subscribe((s, changed) => this.onSettings(changed));
    this.frame = this.energy.update(0.016, 0, this.audio.features, false, this.settings.get());
    this.bindEvents();
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.ui.setAudioStatus('idle', 'Not connected');
    // non-blocking: pick up any user-supplied GLB overrides
    void assets.init().then(async () => {
      const replaced = await this.crowd.library.loadOverrides(import.meta.env.BASE_URL + 'assets/', assets.manifest.characters);
      if (replaced.length) { this.relayoutCrowd(); this.ui.notice(`Loaded custom character models: ${replaced.join(', ')}`, false, 3500); }
    });
    requestAnimationFrame(() => this.loop());
    (window as unknown as { __echo: ClubApp }).__echo = this;
  }

  // ----------------------------------------------------------------------- lifecycle
  private async startClub(file?: File): Promise<ConnectResult> {
    const s = this.settings.get();
    // Kick off fullscreen in the same user gesture as the click (and any system-audio prompt).
    if (s.autoFullscreen) void this.requestFullscreen();
    const res = await this.connectAudio(file);
    if (s.backupMic) await this.syncBackup();
    if (!res.ok && s.audioInput !== 'manual' && !(s.backupMic && this.backup.isLive)) {
      // Do not trap the user: tell them why and let them pick something else, or continue manually.
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      return res;
    }
    if (!res.ok) this.ui.notice(`${res.message} — using the headset mic as backup.`, true, 8000);
    this.beginSession();
    return res;
  }

  private beginSession(): void {
    const s = this.settings.get();
    this.energy.reset();
    this.session.start(s.djName, VENUES[s.venue].name.toUpperCase(), s.sessionName);
    this.crowd.scramble(this.simTime);
    this.running = true;
    this.simRunning = true;
    this.ui.hideLauncher();
    this.ui.showHud(VENUES[s.venue].name, VENUES[s.venue].location);
    this.ui.setSimState(true);
    this.ui.introCard(s.djName, VENUES[s.venue].name.toUpperCase(), s.sessionName);
    this.perf.setCurrent(s.quality);
    this.debug.enabled = s.debug;
  }

  private endSession(): void {
    this.running = false;
    this.session.stop();
    this.audio.disconnect();
    this.backup.disconnect();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.ui.showLauncher();
    this.ui.setAudioStatus('idle', 'Not connected');
  }

  private async connectAudio(file?: File): Promise<ConnectResult> {
    const s = this.settings.get();
    this.audio.setBeatSensitivity(s.beatSensitivity / 100);
    if (s.audioInput === 'midi') {
      this.audio.disconnect();
      const r = await this.midi.connect(s.midiDeviceId || undefined);
      this.ui.setAudioStatus(r.ok ? 'live' : 'error', r.ok ? `Controller · ${this.midi.deviceName}` : r.message);
      if (r.ok) {
        this.energy.clock.clearTap();
        this.ui.notice('Controller mode: press TAP (T) in time with your music to set the tempo, and map your controls in Settings → Audio.', false, 8000);
      }
      return { ok: r.ok, message: r.message };
    }
    this.midi.disconnect();
    const res = await this.audio.connect(s.audioInput, { deviceId: s.audioDeviceId || undefined, file, monitor: s.monitorAudio });
    this.ui.setAudioStatus(res.ok ? (this.audio.isLive ? 'live' : 'idle') : 'error', res.ok ? (this.audio.isLive ? `Live · ${this.audio.label}` : this.audio.label) : res.message);
    if (res.ok) {
      this.energy.clock.clearTap();
      if (s.audioInput === 'manual') this.ui.notice('Manual mode — tap T to set the beat.', false, 4500);
    }
    return res;
  }

  /** (Re)start or stop the headset-mic backup listener to match the settings. */
  private async syncBackup(): Promise<void> {
    const s = this.settings.get();
    if (!s.backupMic) {
      this.backup.disconnect();
      this.ui.setBackupStatus('off', 'Off');
      return;
    }
    this.backup.setBeatSensitivity(s.beatSensitivity / 100);
    const r = await this.backup.connect('mic', { deviceId: s.backupMicDeviceId || undefined });
    this.ui.setBackupStatus(r.ok ? 'live' : 'error', r.ok ? `Listening · ${this.backup.label}` : r.message);
    if (!r.ok) this.ui.notice(`Backup mic: ${r.message}`, true, 7000);
  }

  // ----------------------------------------------------------------------- controls
  private tap(): void {
    const bpm = this.energy.tap(this.simTime || performance.now() / 1000);
    if (bpm > 0) this.settings.set({ bpm: Math.round(bpm) });
  }
  private triggerDrop(): void {
    this.energy.triggerDrop();
  }
  private triggerBuild(): void {
    this.energy.triggerBuild(this.simTime);
  }
  private nudgeEnergy(d: number): void {
    this.settings.set({ crowdEnergy: clamp(this.settings.get().crowdEnergy + d, -50, 50) });
  }
  private toggleSim(): boolean {
    this.simRunning = !this.simRunning;
    return this.simRunning;
  }
  private async requestFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* needs a user gesture — F key works */ }
  }
  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.requestFullscreen();
  }

  // ----------------------------------------------------------------------- events
  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'range') {
        if (e.key === 'Escape') (t as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!this.running) {
        if (k === 'f') { e.preventDefault(); this.toggleFullscreen(); }
        return;
      }
      this.ui.wake();
      switch (k) {
        case ' ': e.preventDefault(); this.ui.setSimState(this.toggleSim()); break;
        case 't': this.tap(); break;
        case 'd': this.triggerDrop(); break;
        case 'b': this.triggerBuild(); break;
        case 'arrowup': e.preventDefault(); this.nudgeEnergy(5); break;
        case 'arrowdown': e.preventDefault(); this.nudgeEnergy(-5); break;
        case 'c': this.energy.crowdCalm(this.simTime); break;
        case 'v': this.energy.crowdHype(this.simTime); break;
        case 'f': e.preventDefault(); this.toggleFullscreen(); break;
        case 'h': this.ui.toggleUiHidden(); break;
        case 's': this.ui.toggleSettings(); break;
        case 'a': this.ui.toggleAudioPanel(); break;
        case '`': case 'g': this.settings.set({ debug: !this.settings.get().debug }); break;
        case 'escape': this.ui.toggleSettings(false); break;
        default:
          if (k >= '1' && k <= '5') this.settings.set({ venue: VENUE_ORDER[Number(k) - 1] });
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running) this.last = performance.now() / 1000;
    });
  }

  private onResize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.scene.resize(w, h);
    this.env.resize();
    this.camera.resize(w / Math.max(1, h));
  }

  private onSettings(changed: (keyof ReturnType<SettingsManager['get']>)[]): void {
    const s = this.settings.get();
    if (changed.includes('venue') || changed.includes('quality')) {
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => this.applyQualityAndVenue(false), 30);
    }
    if (changed.includes('crowdDensity') || changed.includes('characterDensity')) {
      window.clearTimeout(this.relayoutTimer);
      this.relayoutTimer = window.setTimeout(() => this.relayoutCrowd(), 250);
    }
    if (changed.includes('handsUpSensitivity') || changed.includes('phoneFrequency')) this.crowd.applySettings(s);
    if (changed.includes('beatSensitivity')) this.audio.setBeatSensitivity(s.beatSensitivity / 100);
    if (changed.includes('debug')) this.debug.enabled = s.debug;
    if ((changed.includes('backupMic') || changed.includes('backupMicDeviceId')) && this.running) void this.syncBackup();
    if (changed.includes('autoQuality')) this.perf.autoEnabled = s.autoQuality;
    if (changed.includes('bpm') && s.audioInput === 'manual') this.energy.clock.clearTap();
    if (changed.includes('audioInput') || changed.includes('audioDeviceId')) {
      // only applied when the user presses Connect (the permission prompts need a gesture)
    }
  }

  private applyQualityAndVenue(first: boolean): void {
    const s = this.settings.get();
    const q = QUALITY[s.quality];
    const qualityChanged = this.appliedQuality !== s.quality;
    if (qualityChanged) {
      this.scene.applyQuality(q);
      this.onResize();
      this.perf.setCurrent(s.quality);
      this.appliedQuality = s.quality;
    }
    if (qualityChanged || this.appliedVenue !== s.venue || first) {
      this.env.load(s.venue, q);
      this.appliedVenue = s.venue;
      this.camera.setLookAt(...(this.env.venue?.lookAt ?? [0, 1.7, -16]));
      this.relayoutCrowd();
      this.crowd.scramble(this.simTime);
      if (!first && this.running) {
        const v = VENUES[s.venue];
        this.ui.notice(`${v.name} — ${v.location}`, false, 2200);
        this.session.venueLabel = v.name.toUpperCase();
      }
      this.ui.showHud(VENUES[s.venue].name, VENUES[s.venue].location);
      if (!this.running) document.getElementById('hud')?.classList.add('hidden');
    }
    const rec = this.perf.recommended;
    this.ui.setQualityRecommendation(`GPU: ${this.gpu.renderer.slice(0, 48)} · suggested: ${QUALITY[rec].label}. Up to ${q.crowdMax} people, ${q.maxBeams} beams, ${q.realLights} dynamic lights.`);
  }

  private relayoutCrowd(): void {
    const s = this.settings.get();
    const q = QUALITY[s.quality];
    this.crowd.layout(this.env.crowdRegions, this.env.crowdSeed, s, q.crowdMax, this.camera.base, this.env.exclusions);
  }

  private lastLoggedState = '';
  private lastBeatLog = -1;
  private beatCounter = 0;
  private recordEvents(f: CrowdFrame): void {
    const L = this.debug.log;
    const t = +this.simTime.toFixed(1);
    if (f.events.beat) this.beatCounter++;
    if (f.events.drop) L.push({ t, kind: 'DROP', detail: `strength ${f.events.dropStrength.toFixed(2)} manual=${f.events.dropManual}` });
    if (f.events.buildStart) L.push({ t, kind: 'BUILD_START' });
    if (f.events.breakdownStart) L.push({ t, kind: 'BREAKDOWN_START' });
    if (f.events.peakStart) L.push({ t, kind: 'PEAK' });
    if (f.state !== this.lastLoggedState) {
      L.push({ t, kind: 'STATE', detail: `${f.state} e=${f.crowdEnergy.toFixed(0)} bpm=${f.bpm.toFixed(1)} conf=${f.bpmConfidence.toFixed(2)}` });
      this.lastLoggedState = f.state;
    }
    if (Math.floor(t / 10) !== this.lastBeatLog) {
      this.lastBeatLog = Math.floor(t / 10);
      L.push({ t, kind: 'TICK', detail: `energy=${f.crowdEnergy.toFixed(0)} beats=${this.beatCounter} bpm=${f.bpm.toFixed(1)} conf=${f.bpmConfidence.toFixed(2)} build=${f.buildIntensity.toFixed(2)} dropConf=${f.dropConfidence.toFixed(2)} bass=${f.bassEnergy.toFixed(2)}` });
    }
  }

  // ----------------------------------------------------------------------- frame loop
  private loop(): void {
    const nowMs = performance.now();
    const real = nowMs / 1000;
    const rawDt = Math.min(0.25, Math.max(0.0005, real - this.last));
    this.last = real;
    this.perf.update(rawDt);
    this.frameCount++;
    const s = this.settings.get();

    if (this.running && this.simRunning) {
      const dt = Math.min(this.maxDt, rawDt);
      this.simTime += dt;
      const midiOn = this.midi.connected && s.audioInput === 'midi';
      const bk = this.backup.isLive ? this.backup.update(real) : null;
      let features;
      let live: boolean;
      let useBackup = false;
      if (midiOn) {
        features = this.midi.features(dt, this.energy.clock.bpm, this.energy.clock.tick, this.energy.clock.beatInBar);
        const h = this.midi.consumeHits();
        if (h > 0) this.energy.bump(Math.min(h, 3));
        live = true;
        if (!this.midi.hasActivity && this.midi.idleSeconds > 5 && bk?.signal) {
          // controller is silent (probably owned by Serato): hear the music instead
          features = bk; useBackup = true;
        } else if (bk && bk.signal && bk.bpmConfidence > 0.4) {
          // controller gives the mood, the mic gives the tempo + beat grid
          features = { ...features, beat: bk.beat, strongBeat: bk.strongBeat, beatInBar: bk.beatInBar, bpm: bk.bpm, bpmConfidence: bk.bpmConfidence };
        }
      } else {
        features = this.audio.update(real);
        live = this.audio.isLive;
        if (!(live && features.signal) && bk?.signal) { features = bk; live = true; useBackup = true; }
      }
      this.backupUsed = useBackup;
      this.frame = this.energy.update(dt, this.simTime, features, live, s);
      const f = this.frame;
      if (f.events.drop) { this.lastDropAt = this.simTime; this.debug.lastDropAt = this.simTime; }
      if (f.events.buildStart) { this.lastBuildAt = this.simTime; this.debug.lastBuildAt = this.simTime; }
      if (this.debug.logging) this.recordEvents(f);
      this.session.update(f);
      this.crowd.update(f, dt, this.simTime);
      this.env.update(f, s, dt, this.simTime, true);
      this.camera.update(f, s.cameraMovement / 100, this.simTime, dt);
      this.beatFlash = f.events.beat;

      // bloom/aberration follow the show
      const bloom = (0.3 + f.crowdEnergy / 100 * 0.22 + f.dropIntensity * 0.22) * (this.env.venue?.bloomBoost ?? 1);
      this.scene.setBloom(bloom, 0.86 - f.dropIntensity * 0.04, 0.6);
      this.scene.setGrade(real, f.dropIntensity * 0.0035, 0.5);

      this.ui.updateHud(f, {
        input: this.backupUsed ? 'BACKUP MIC' : midiOn ? 'CONTROLLER' : live ? this.audio.label.toUpperCase() : s.audioInput === 'manual' ? 'MANUAL' : 'NO SIGNAL',
        live, manual: !live, people: this.crowd.count, attendance: this.session.stats.attendance, stateLabel: STATE_LABEL[f.state],
      }, real);
      this.ui.updateSession(this.session.stats);
    } else if (!this.running) {
      // behind the launcher: slow idle camera so the venue is alive (ambient mode)
      const dt = Math.min(this.maxDt, rawDt);
      this.simTime += dt;
      const f = this.energy.update(dt, this.simTime, this.audio.features, false, { ...s, crowdEnergy: -20 });
      this.frame = f;
      this.crowd.update(f, dt, this.simTime);
      this.env.update(f, s, dt, this.simTime, true);
      this.camera.update(f, s.cameraMovement / 100, this.simTime, dt);
      this.scene.setBloom(0.5, 0.82, 0.65);
      this.scene.setGrade(real, 0, 0.5);
    }

    this.scene.info.reset();
    if (!this.debug.skipRender) this.scene.render();

    // debug
    if (this.running && (this.debug.enabled || this.ui.audioPanelVisible) && real - this.lastDebugAt > 0.05) {
      this.lastDebugAt = real;
      const f = this.frame;
      const a = this.audio.features;
      const st = this.crowd.stats;
      const snap = {
        fps: this.perf.fps, frameMs: this.perf.frameMs, bpm: f.bpm, beatConfidence: f.bpmConfidence,
        bass: a.bass, mid: a.mid, high: a.high, rms: a.rms, level: a.level, crowdEnergy: f.crowdEnergy, state: f.state,
        visibleCharacters: st.visible, totalCharacters: st.total, activeLights: this.env.lighting.lightCount + this.env.lighting.realLightCount,
        audioStatus: this.audio.status, audioInput: s.audioInput, dropConfidence: f.dropConfidence, dropDetected: this.simTime - this.lastDropAt < 3,
        buildIntensity: f.buildIntensity, buildDetected: f.buildIntensity > 0.3, drawCalls: this.scene.info.render.calls, triangles: this.scene.info.render.triangles,
        handsUp: st.handsUp, phones: st.phones, jumping: st.jumping, resolutionScale: this.scene.resolutionScale, quality: s.quality, gpu: this.gpu.renderer,
        lightingMode: this.env.lighting.lightingMode, pattern: this.env.lighting.currentPattern, palette: this.env.lighting.currentPalette,
      };
      this.debug.data = snap;
      this.ui.setDebug(this.debug.enabled, snap);
      this.ui.updateAudioPanel(this.audio.getDebug(), f, this.beatFlash, { bass: a.bass, mid: a.mid, high: a.high, level: a.level, bpm: a.bpm || f.bpm, conf: a.bpmConfidence });
    } else if (!this.debug.enabled) this.ui.setDebug(false, null);

    requestAnimationFrame(() => this.loop());
  }
}

new ClubApp();
