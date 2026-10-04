import type { AudioInputKind, LightingOverride, QualityId, VenueId } from './types';

export interface Settings {
  djName: string;
  sessionName: string;
  venue: VenueId;
  audioInput: AudioInputKind;
  audioDeviceId: string;
  midiDeviceId: string;
  /** Headset-mic backup listener that runs alongside the main input. */
  backupMic: boolean;
  backupMicDeviceId: string;
  /** Manual / fallback BPM. 0 = auto-detect when audio is live. */
  bpm: number;
  sensitivity: number; // 0..100
  beatSensitivity: number;
  dropSensitivity: number;
  handsUpSensitivity: number;
  phoneFrequency: number;
  crowdDensity: number; // 20..100 (% of venue filled)
  characterDensity: number; // 50..150 detail radius bias
  /** Manual crowd energy offset in points, -50..+50. */
  crowdEnergy: number;
  lightingIntensity: number; // 0..150
  lightingMode: LightingOverride;
  fogAmount: number; // 0..100
  cameraMovement: number; // 0..100
  quality: QualityId;
  autoQuality: boolean;
  reduceFlashing: boolean;
  autoFullscreen: boolean;
  debug: boolean;
  monitorAudio: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  djName: 'RYAN',
  sessionName: 'SATURDAY NIGHT',
  venue: 'DC_NIGHT',
  audioInput: 'system',
  audioDeviceId: '',
  midiDeviceId: '',
  backupMic: false,
  backupMicDeviceId: '',
  bpm: 124,
  sensitivity: 55,
  beatSensitivity: 55,
  dropSensitivity: 55,
  handsUpSensitivity: 60,
  phoneFrequency: 50,
  crowdDensity: 100,
  characterDensity: 100,
  crowdEnergy: 0,
  lightingIntensity: 100,
  lightingMode: 'AUTO',
  fogAmount: 55,
  cameraMovement: 50,
  quality: 'HIGH',
  autoQuality: true,
  reduceFlashing: false,
  autoFullscreen: true,
  debug: false,
  monitorAudio: false,
};

const KEY = 'echo.virtualclub.settings.v2';

type Listener = (s: Settings, changed: (keyof Settings)[]) => void;

/** Persistent, observable settings store (localStorage). */
export class SettingsManager {
  private data: Settings;
  private listeners = new Set<Listener>();

  constructor() {
    this.data = { ...DEFAULT_SETTINGS, ...this.load() };
  }

  private load(): Partial<Settings> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<Settings>;
      const clean: Partial<Settings> = {};
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        if (k in parsed && typeof parsed[k] === typeof DEFAULT_SETTINGS[k]) (clean as Record<string, unknown>)[k] = parsed[k];
      }
      return clean;
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable (private mode) — settings just don't persist */
    }
  }

  get(): Readonly<Settings> {
    return this.data;
  }

  set(patch: Partial<Settings>): void {
    const changed: (keyof Settings)[] = [];
    for (const k of Object.keys(patch) as (keyof Settings)[]) {
      if (patch[k] !== undefined && this.data[k] !== patch[k]) {
        (this.data as unknown as Record<string, unknown>)[k] = patch[k];
        changed.push(k);
      }
    }
    if (!changed.length) return;
    this.save();
    for (const l of this.listeners) l(this.data, changed);
  }

  reset(): void {
    this.set({ ...DEFAULT_SETTINGS });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
