import type { CrowdStateName } from '../core/types';

export interface StateInputs {
  energy: number;
  build: number;
  breakdown: boolean;
  drop: boolean;
  peak: boolean;
}

/**
 * Macro crowd state machine. Transitions use thresholds + hysteresis + minimum dwell times so the
 * crowd never flickers between moods:
 *
 *   CALM → GROOVE → ENERGY_BUILD → HYPE → DROP → PEAK → RECOVERY → GROOVE   (+ BREAKDOWN)
 */
export class CrowdStateMachine {
  state: CrowdStateName = 'CALM';
  age = 0;
  private highFor = 0;

  reset(): void {
    this.state = 'CALM';
    this.age = 0;
    this.highFor = 0;
  }

  private go(s: CrowdStateName): void {
    if (s === this.state) return;
    this.state = s;
    this.age = 0;
    this.highFor = 0;
  }

  update(dt: number, i: StateInputs): CrowdStateName {
    this.age += dt;
    if (i.energy > 70) this.highFor += dt; else this.highFor = 0;

    if (i.drop && !(this.state === 'DROP' && this.age < 3)) {
      this.go('DROP');
      return this.state;
    }
    const age = this.age;
    switch (this.state) {
      case 'DROP':
        if (age > 5.5) this.go(i.energy > 76 ? 'PEAK' : 'RECOVERY');
        break;
      case 'PEAK':
        if (age > 6 && i.energy < 76) this.go('RECOVERY');
        else if (age > 45) this.go('RECOVERY');
        else if (i.breakdown && age > 4) this.go('BREAKDOWN');
        break;
      case 'RECOVERY':
        if (i.build > 0.4) this.go('ENERGY_BUILD');
        else if (age > 7) this.go(i.energy > 66 ? 'HYPE' : 'GROOVE');
        break;
      case 'BREAKDOWN':
        if (i.build > 0.35) this.go('ENERGY_BUILD');
        else if (!i.breakdown && age > 3) this.go('GROOVE');
        break;
      case 'ENERGY_BUILD':
        if (age > 60) this.go('GROOVE');
        else if (i.build < 0.12 && age > 4) this.go(i.breakdown ? 'BREAKDOWN' : 'GROOVE');
        break;
      case 'HYPE':
        if (i.build > 0.45) this.go('ENERGY_BUILD');
        else if (i.energy > 86 && age > 6) this.go('PEAK');
        else if (i.energy < 56 && age > 5) this.go('GROOVE');
        break;
      case 'GROOVE':
        if (i.build > 0.4 && age > 2) this.go('ENERGY_BUILD');
        else if (i.breakdown && age > 3) this.go('BREAKDOWN');
        else if (i.peak || (i.energy > 88 && age > 3)) this.go('PEAK');
        else if (this.highFor > 3) this.go('HYPE');
        else if (i.energy < 13 && age > 4) this.go('CALM');
        break;
      case 'CALM':
        if (i.build > 0.4) this.go('ENERGY_BUILD');
        else if (i.energy > 24 && age > 2) this.go('GROOVE');
        break;
    }
    return this.state;
  }
}
