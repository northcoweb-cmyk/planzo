export interface DebugSnapshot {
  fps: number;
  frameMs: number;
  bpm: number;
  beatConfidence: number;
  bass: number;
  mid: number;
  high: number;
  rms: number;
  level: number;
  crowdEnergy: number;
  state: string;
  visibleCharacters: number;
  totalCharacters: number;
  activeLights: number;
  audioStatus: string;
  audioInput: string;
  dropConfidence: number;
  dropDetected: boolean;
  buildIntensity: number;
  buildDetected: boolean;
  drawCalls: number;
  triangles: number;
  handsUp: number;
  phones: number;
  jumping: number;
  resolutionScale: number;
  quality: string;
  gpu: string;
  lightingMode: string;
  pattern: string;
  palette: string;
}

/** Holds the latest debug snapshot; the overlay reads from it only when debug is enabled. */
export interface LoggedEvent { t: number; kind: string; detail?: string }

export class DebugManager {
  /** Event log (only when ?log=1) for offline verification of the music-structure detection. */
  log: LoggedEvent[] = [];
  logging = new URLSearchParams(location.search).has('log');
  readonly skipRender = new URLSearchParams(location.search).has('norender');
  enabled = false;
  audioPanel = false;
  data: DebugSnapshot | null = null;
  lastDropAt = -99;
  lastBuildAt = -99;
}
