import type { CrowdFrame } from '../core/types';
import { clamp, lerp } from '../util/math';

export interface ReactionScore {
  score: number;
  label: string;
}

export interface SessionStats {
  durationSec: number;
  peakEnergy: number;
  avgEnergy: number;
  drops: number;
  highEnergyMoments: number;
  attendance: number;
  peakHype: number;
  reactionScore: number;
  bestReaction: number;
}

const START_ATTENDANCE = 184;
const MAX_ATTENDANCE = 1250;

/** Gamified session tracking. Attendance is a fictional, slowly-responding number — not a measurement. */
export class SessionManager {
  djName = 'RYAN';
  venueLabel = 'DC NIGHT';
  sessionName = 'SATURDAY NIGHT';
  running = false;

  private t = 0;
  private energyIntegral = 0;
  private peak = 0;
  private drops = 0;
  private highMoments = 0;
  private highFor = 0;
  private inHighMoment = false;
  private peakHype = 0;
  private attendance = START_ATTENDANCE;
  private reactionSum = 0;
  private reactionCount = 0;
  private bestReaction = 0;

  private pendingEval: { at: number; strength: number; preBuild: boolean; pre: number } | null = null;
  private buildSeen = false;
  private postSamples: number[] = [];
  onReaction: ((r: ReactionScore) => void) | null = null;

  start(djName: string, venue: string, session: string): void {
    this.djName = djName;
    this.venueLabel = venue;
    this.sessionName = session;
    this.t = 0;
    this.energyIntegral = 0;
    this.peak = 0;
    this.drops = 0;
    this.highMoments = 0;
    this.highFor = 0;
    this.inHighMoment = false;
    this.peakHype = 0;
    this.attendance = START_ATTENDANCE;
    this.reactionSum = 0;
    this.reactionCount = 0;
    this.bestReaction = 0;
    this.pendingEval = null;
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  update(f: CrowdFrame): void {
    if (!this.running) return;
    const dt = f.dt;
    this.t += dt;
    this.energyIntegral += f.crowdEnergy * dt;
    this.peak = Math.max(this.peak, f.crowdEnergy);
    this.peakHype = Math.max(this.peakHype, clamp((f.crowdEnergy / 100) * 0.8 + f.dropIntensity * 0.35, 0, 1) * 100);

    if (f.crowdEnergy > 75) this.highFor += dt; else { this.highFor = 0; this.inHighMoment = false; }
    if (this.highFor > 4 && !this.inHighMoment) { this.inHighMoment = true; this.highMoments++; }

    // Fictional headcount: eases towards a target tied to the engine's slow attendance model.
    const target = lerp(START_ATTENDANCE, MAX_ATTENDANCE, f.crowdDensity > 0.75 ? (f.crowdDensity - 0.75) / 0.25 : 0);
    this.attendance += (target - this.attendance) * Math.min(1, dt * 0.15);

    if (f.state === 'ENERGY_BUILD') this.buildSeen = true;
    if (f.events.drop) {
      this.drops++;
      this.pendingEval = { at: this.t + 9, strength: f.events.dropStrength, preBuild: this.buildSeen, pre: f.crowdEnergy };
      this.postSamples.length = 0;
      this.buildSeen = false;
    }
    if (this.pendingEval) {
      this.postSamples.push(f.crowdEnergy);
      if (this.t >= this.pendingEval.at) {
        const p = this.pendingEval;
        this.pendingEval = null;
        const peakAfter = Math.max(...this.postSamples);
        const avgAfter = this.postSamples.reduce((a, b) => a + b, 0) / this.postSamples.length;
        const score = Math.round(
          clamp(0.38 * peakAfter + 0.3 * avgAfter + 20 * p.strength + (p.preBuild ? 10 : 0) + 2, 40, 99),
        );
        const label = score >= 92 ? 'PERFECT DROP' : score >= 82 ? 'HUGE DROP' : score >= 70 ? 'GOOD ENERGY' : 'CROWD WARMING UP';
        this.reactionSum += score;
        this.reactionCount++;
        this.bestReaction = Math.max(this.bestReaction, score);
        this.onReaction?.({ score, label });
      }
    }
  }

  get stats(): SessionStats {
    return {
      durationSec: this.t,
      peakEnergy: this.peak,
      avgEnergy: this.t > 0 ? this.energyIntegral / this.t : 0,
      drops: this.drops,
      highEnergyMoments: this.highMoments,
      attendance: Math.round(this.attendance),
      peakHype: this.peakHype,
      reactionScore: this.reactionCount ? this.reactionSum / this.reactionCount : 0,
      bestReaction: this.bestReaction,
    };
  }
}

export function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(r)}`;
}
