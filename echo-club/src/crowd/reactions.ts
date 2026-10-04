/** Tunable reaction tables. Every major reaction is probabilistic and rolled per person. */
export interface ReactionProfile {
  handsUp: number;
  jump: number;
  phone: number;
  clap: number;
  point: number;
}

export const REACTIONS: { bigDrop: ReactionProfile; peak: ReactionProfile; build: ReactionProfile } = {
  bigDrop: { handsUp: 0.8, jump: 0.35, phone: 0.2, clap: 0.15, point: 0.1 },
  peak: { handsUp: 0.55, jump: 0.2, phone: 0.14, clap: 0.1, point: 0.06 },
  build: { handsUp: 0.35, jump: 0.05, phone: 0.1, clap: 0.18, point: 0.04 },
};

/** Person animation states. */
export const CS = {
  IDLE: 0,
  LOW_ENERGY: 1,
  DANCING: 2,
  BOUNCING: 3,
  HANDS_UP: 4,
  JUMPING: 5,
  PHONE_RECORDING: 6,
  CHEERING: 7,
  LOOKING_AROUND: 8,
  CLAPPING: 9,
  POINTING: 10,
  HYPE: 11,
  BIG_DROP: 12,
} as const;
export const CS_COUNT = 13;
export const CS_NAMES = ['IDLE', 'LOW_ENERGY', 'DANCING', 'BOUNCING', 'HANDS_UP', 'JUMPING', 'PHONE_RECORDING', 'CHEERING', 'LOOKING_AROUND', 'CLAPPING', 'POINTING', 'HYPE', 'BIG_DROP'];

/** Base weights per macro crowd state, indexed by CS. */
const W = (idle: number, low: number, dance: number, bounce: number, hands: number, jump: number, phone: number, cheer: number, look: number, clap: number, point: number, hype: number, drop: number): number[] =>
  [idle, low, dance, bounce, hands, jump, phone, cheer, look, clap, point, hype, drop];

export const STATE_WEIGHTS: Record<string, number[]> = {
  CALM:         W(0.2, 0.46, 0.1, 0.0, 0.0, 0.0, 0.04, 0.0, 0.17, 0.0, 0.01, 0.0, 0.0),
  GROOVE:       W(0.06, 0.22, 0.42, 0.16, 0.02, 0.0, 0.04, 0.0, 0.05, 0.01, 0.02, 0.0, 0.0),
  ENERGY_BUILD: W(0.02, 0.06, 0.2, 0.22, 0.2, 0.03, 0.05, 0.0, 0.1, 0.1, 0.02, 0.0, 0.0),
  HYPE:         W(0.0, 0.04, 0.22, 0.22, 0.2, 0.06, 0.08, 0.03, 0.02, 0.03, 0.03, 0.07, 0.0),
  DROP:         W(0.0, 0.0, 0.05, 0.1, 0.1, 0.1, 0.06, 0.1, 0.0, 0.03, 0.02, 0.2, 0.24),
  PEAK:         W(0.0, 0.0, 0.1, 0.14, 0.18, 0.1, 0.09, 0.08, 0.0, 0.04, 0.03, 0.14, 0.1),
  BREAKDOWN:    W(0.2, 0.34, 0.06, 0.0, 0.08, 0.0, 0.05, 0.0, 0.18, 0.02, 0.03, 0.0, 0.0),
  RECOVERY:     W(0.0, 0.08, 0.3, 0.2, 0.1, 0.02, 0.06, 0.1, 0.02, 0.1, 0.02, 0.0, 0.0),
};

/** [min, max] seconds a person holds each state before re-rolling. */
export const STATE_HOLD: [number, number][] = [
  [3, 7], [4, 10], [5, 14], [4, 10], [3, 8], [2, 5], [5, 13], [2.5, 6], [2, 4.5], [2, 6], [1.5, 4], [4, 10], [5, 9],
];
