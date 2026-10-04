export type VenueId = 'DC_NIGHT' | 'WAREHOUSE' | 'UNDERGROUND' | 'ROOFTOP' | 'FESTIVAL';
export type AudioInputKind = 'system' | 'mic' | 'line' | 'demo' | 'file' | 'manual';
export type QualityId = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
export type LightingModeId = 'CALM' | 'HOUSE' | 'PEAK' | 'DROP' | 'BREAKDOWN' | 'AFTERHOURS';
export type LightingOverride = 'AUTO' | LightingModeId;

/** Macro crowd state (see engine/CrowdStateMachine). */
export type CrowdStateName =
  | 'CALM'
  | 'GROOVE'
  | 'ENERGY_BUILD'
  | 'HYPE'
  | 'DROP'
  | 'PEAK'
  | 'BREAKDOWN'
  | 'RECOVERY';

/** Raw per-frame measurements from the audio chain (all 0..1 unless noted). */
export interface AudioFeatures {
  /** True when a live signal is present on the selected input. */
  signal: boolean;
  /** Peak-normalised loudness after auto-gain. */
  level: number;
  rms: number;
  bass: number;
  mid: number;
  high: number;
  /** Slow, dip-free envelopes (auto-gained) used for energy + structure analysis. */
  bassEnv: number;
  midEnv: number;
  highEnv: number;
  levelEnv: number;
  /** Spectral centroid, 0 (dark) .. 1 (bright). */
  brightness: number;
  /** Onset strength of the current frame, normalised. */
  transient: number;
  beat: boolean;
  strongBeat: boolean;
  /** Beat number inside the bar, 0..3, best-effort downbeat estimate. */
  beatInBar: number;
  bpm: number;
  bpmConfidence: number;
}

/** Discrete musical events emitted by the structure detector / manual controls. */
export interface MusicEvents {
  beat: boolean;
  strongBeat: boolean;
  drop: boolean;
  dropStrength: number;
  dropManual: boolean;
  buildStart: boolean;
  breakdownStart: boolean;
  peakStart: boolean;
}

/** Output of the Crowd Energy Engine — everything the visuals consume. */
export interface CrowdFrame {
  time: number;
  dt: number;
  state: CrowdStateName;
  stateAge: number;
  /** 0..100 */
  crowdEnergy: number;
  beatStrength: number;
  bassEnergy: number;
  highFrequencyEnergy: number;
  buildIntensity: number;
  dropIntensity: number;
  rhythmIntensity: number;
  /** 0..1 portion of the venue that is "filled". */
  crowdDensity: number;
  reactionProbability: number;
  lightingIntensity: number;
  /** BPM used by the beat clock (detected, tapped or manual). */
  bpm: number;
  bpmConfidence: number;
  beatPhase: number;
  beatInBar: number;
  /** Beat counter that increments on every beat-clock tick. */
  beatCount: number;
  events: MusicEvents;
  /** Number of milliseconds-scale kick envelope 0..1 (decays fast after each beat). */
  kick: number;
  signal: boolean;
  dropConfidence: number;
  breakdown: boolean;
  /** Seconds of build in progress (0 when none). */
  buildTime: number;
}
