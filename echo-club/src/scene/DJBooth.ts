import * as THREE from 'three';
import type { MaterialLibrary } from './Materials';
import { at, box, cyl, rotated, seeded } from './Primitives';
import { plant } from './architecture/parts';
import type { BuildContext } from './architecture/BuildContext';
import type { BoardView } from '../audio/MidiEngine';

export interface BoothParams {
  time: number;
  dt: number;
  bpm: number;
  energy: number; // 0..1
  kick: number;
  bass: number;
  beatPhase: number;
  beatInBar: number;
  /** 0..1 — is there music? Nothing on the board "plays" without it. */
  music: number;
  drop: number;
  build: number;
  accent: THREE.Color;
}

const PAD_COLORS = ['#ff2a3d', '#ff8a1f', '#2fd6ff', '#3d5bff', '#ff2a3d', '#33ff99', '#a64dff', '#ffd22a'];

/**
 * The DJ position: table, a Numark Party Mix 2-style controller (no branding), monitors, laptop,
 * props and cables. Viewed from behind, as if the user stood there. Static parts are batchable;
 * the animated parts (jog wheels, pads, LEDs, meters) keep their own materials.
 */
export class DJBooth {
  readonly object = new THREE.Group();
  /** Heights the camera / crowd layout rely on. */
  readonly stageY = 0.8;
  readonly tableTopY = 1.74;
  private readonly jogs: THREE.Group[] = [];
  private readonly pads: { mat: THREE.MeshBasicMaterial; base: THREE.Color; deck: number; idx: number }[] = [];
  private readonly rings: THREE.MeshBasicMaterial[] = [];
  private readonly meters: { mat: THREE.MeshBasicMaterial; level: number; ch: number }[] = [];
  private readonly faders: THREE.Mesh[] = [];
  private crossfader!: THREE.Mesh;
  /** knobs[deck][name] */
  private readonly knobs: Record<string, THREE.Group>[] = [{}, {}];
  private readonly btns: Record<string, THREE.MeshBasicMaterial>[] = [{}, {}];
  private spin = [0, 0];
  private readonly underglow: THREE.MeshBasicMaterial;
  private readonly laptopScreen: THREE.MeshBasicMaterial;
  private readonly candle: THREE.MeshBasicMaterial;
  readonly controllerLight = new THREE.PointLight('#ffb878', 1, 4, 2);

  constructor(private readonly ctx: BuildContext) {
    const m = ctx.mats;
    const g = this.object;
    g.name = 'dj-booth';
    const sy = this.stageY;

    // ---- stage deck
    g.add(at(box(9, sy, 4.4, m.blackMetal(), 2), 0, sy / 2, -0.4));
    g.add(at(box(9.1, 0.05, 4.5, m.steel(), 2), 0, sy + 0.005, -0.4));

    // ---- table
    const topY = this.tableTopY;
    g.add(at(box(3.0, 0.07, 1.0, m.blackMetal(), 2), 0, topY - 0.035, -0.95));
    g.add(at(box(3.0, topY - sy - 0.08, 0.9, m.darkWood(), 2), 0, sy + (topY - sy - 0.08) / 2, -1.0));
    g.add(at(box(0.08, topY - sy, 0.95, m.blackMetal(), 2), -1.46, sy + (topY - sy) / 2, -0.95));
    g.add(at(box(0.08, topY - sy, 0.95, m.blackMetal(), 2), 1.46, sy + (topY - sy) / 2, -0.95));
    this.underglow = m.ownEmissive('#2f5bff', 1.4);
    const ug = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.03, 0.03), this.underglow);
    ug.position.set(0, topY - 0.09, -0.46);
    ug.userData.dynamic = true;
    g.add(ug);

    // ---- controller
    const ctrl = this.buildController(m);
    ctrl.scale.setScalar(1.7);
    ctrl.position.set(0, topY, -0.93);
    g.add(ctrl);

    // ---- monitors (angled to the DJ)
    for (const s of [-1, 1]) {
      const mon = new THREE.Group();
      mon.add(at(box(0.36, 0.52, 0.36, m.rubber(), 1), 0, 0.26, 0));
      mon.add(at(rotated(cyl(0.13, 0.1, 0.05, m.plastic(0x060607, 0.7), 20), Math.PI / 2), 0, 0.17, 0.18));
      mon.add(at(rotated(cyl(0.04, 0.03, 0.03, m.steel(), 12), Math.PI / 2), 0, 0.4, 0.18));
      mon.add(at(box(0.38, 0.03, 0.38, m.steel(), 1), 0, 0.52, 0));
      mon.position.set(s * 1.28, topY, -1.05);
      mon.rotation.y = -s * 0.35;
      g.add(mon);
    }

    // ---- laptop
    const lap = new THREE.Group();
    lap.add(at(box(0.62, 0.025, 0.42, m.steel(), 1), 0, 0.0125, 0));
    this.laptopScreen = m.ownEmissive('#ffffff', 0.5);
    this.laptopScreen.map = DJBooth.screenTexture();
    const lid = new THREE.Group();
    lid.add(at(box(0.62, 0.42, 0.02, m.blackMetal(), 1), 0, 0.21, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.57, 0.37), this.laptopScreen);
    scr.position.set(0, 0.21, 0.012);
    scr.userData.dynamic = true;
    lid.add(scr);
    lid.position.set(0, 0.02, -0.2);
    lid.rotation.x = -0.28;
    lap.add(lid);
    lap.position.set(1.0, topY, -1.38);
    lap.rotation.y = -0.3;
    lap.scale.setScalar(0.85);
    g.add(lap);

    // ---- props: drink, candle, headphones
    g.add(at(cyl(0.045, 0.038, 0.11, m.glass(), 14), -1.05, topY + 0.055, -0.72));
    g.add(at(cyl(0.04, 0.034, 0.06, m.plastic(0x8a4a16, 0.2), 14), -1.05, topY + 0.032, -0.72));
    this.candle = m.ownEmissive('#ffad5c', 2.2);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), this.candle);
    flame.scale.set(0.8, 1.6, 0.8);
    flame.position.set(-1.28, topY + 0.095, -0.7);
    flame.userData.dynamic = true;
    g.add(flame);
    g.add(at(cyl(0.035, 0.035, 0.07, m.glass(), 12), -1.28, topY + 0.035, -0.7));
    const hp = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI), m.rubber());
    hp.position.set(0.55, topY + 0.095, -0.6);
    hp.rotation.set(0, 0.4, 0);
    g.add(hp);
    for (const s of [-1, 1]) g.add(at(cyl(0.05, 0.05, 0.04, m.rubber(), 14), 0.55 + s * 0.09 * Math.cos(0.4), topY + 0.02, -0.6 - s * 0.09 * Math.sin(0.4)));

    // ---- cables (controller → laptop, controller → monitors)
    const cableMat = m.rubber();
    const cables: THREE.Vector3[][] = [
      [new THREE.Vector3(0.35, topY + 0.02, -1.1), new THREE.Vector3(0.6, topY + 0.01, -1.3), new THREE.Vector3(0.8, topY + 0.02, -1.35)],
      [new THREE.Vector3(-0.5, topY + 0.02, -1.15), new THREE.Vector3(-0.9, topY + 0.005, -1.25), new THREE.Vector3(-1.25, topY + 0.01, -1.1)],
      [new THREE.Vector3(0.5, topY + 0.02, -1.2), new THREE.Vector3(0.9, topY + 0.005, -1.0), new THREE.Vector3(1.25, topY + 0.01, -1.05)],
    ];
    for (const pts of cables) {
      const curve = new THREE.CatmullRomCurve3(pts);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 5, false), cableMat));
    }

    // ---- flanking props: plants + PA stacks live in the venue; booth carries the plants
    g.add(at(plant(ctx, 1.25), -3.4, sy, -1.6));
    g.add(at(plant(ctx, 1.1), 3.4, sy, -1.4));

    // ---- booth light (warm, small) so the controller reads in the dark
    this.controllerLight.position.set(0, topY + 0.85, -0.6);
    g.add(this.controllerLight);
  }

  /** Decorative dim "software" screen for the laptop prop (not live data). */
  private static screenTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = '#080b14'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#121a2e'; g.fillRect(0, 0, 256, 14);
    const rnd = seeded(12);
    for (let band = 0; band < 2; band++) {
      const y0 = 24 + band * 54;
      g.fillStyle = '#0d1424'; g.fillRect(8, y0, 240, 46);
      for (let x = 10; x < 246; x += 2) {
        const h = 4 + rnd() * 34 * (0.5 + 0.5 * Math.sin(x * 0.05 + band));
        g.fillStyle = band ? '#4f7dff' : '#a56bff';
        g.fillRect(x, y0 + 23 - h / 2, 1.4, h);
      }
    }
    g.fillStyle = '#1a2440';
    for (let i = 0; i < 4; i++) g.fillRect(8 + i * 60, 134, 52, 18);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private knob(m: MaterialLibrary, c: THREE.Group, deck: number, name: string, x: number, z: number, r = 0.0085, v = 0.5): void {
    const g = new THREE.Group();
    g.userData.keep = true;
    g.position.set(x, 0.045, z);
    g.add(cyl(r, r, 0.012, m.plastic(0x30323a, 0.4), 14));
    const mark = box(0.0022, 0.001, 0.0072, m.emissive('knobmark', '#ffffff', 1), 1);
    mark.position.set(0, 0.0065, -r * 0.55);
    g.add(mark);
    g.rotation.y = (v - 0.5) * Math.PI * 1.5;
    c.add(g);
    this.knobs[deck][name] = g;
  }

  private buildController(m: MaterialLibrary): THREE.Group {
    const c = new THREE.Group();
    c.name = 'controller';
    const body = m.plastic(0x16171b, 0.42);
    const top = m.plastic(0x0d0e11, 0.5);

    c.add(at(box(0.6, 0.032, 0.33, body, 1), 0, 0.016, 0));
    c.add(at(box(0.585, 0.006, 0.315, top, 1), 0, 0.035, 0));
    c.add(at(box(0.6, 0.008, 0.012, m.steel(), 1), 0, 0.028, 0.168));

    for (let deck = 0; deck < 2; deck++) {
      const s = deck === 0 ? -1 : 1; // deck A (left) / B (right) as seen by the DJ
      const x = s * 0.185;
      const holder = new THREE.Group();
      holder.position.set(x, 0.038, -0.025);
      holder.add(at(cyl(0.088, 0.088, 0.006, m.steel(), 36), 0, 0.003, 0));
      const ringMat = m.ownEmissive(PAD_COLORS[deck ? 3 : 0], 1.2);
      this.rings.push(ringMat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.081, 0.0032, 6, 48), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.0085;
      ring.userData.dynamic = true;
      holder.add(ring);
      const spin = new THREE.Group();
      spin.add(at(cyl(0.074, 0.074, 0.012, m.plastic(0x08090b, 0.3), 36), 0, 0.012, 0));
      spin.add(at(cyl(0.022, 0.022, 0.004, m.steel(), 18), 0, 0.019, 0));
      spin.add(at(box(0.004, 0.002, 0.05, m.emissive('jogmark', '#f2f4ff', 1.2), 1), 0, 0.0195, -0.045));
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        spin.add(at(rotated(box(0.004, 0.001, 0.012, m.plastic(0x23252b, 0.5), 1), 0, -a, 0), Math.sin(a) * 0.06, 0.0185, -Math.cos(a) * 0.06));
      }
      spin.userData.keep = true;
      holder.add(spin);
      this.jogs.push(spin);
      c.add(holder);

      // performance pads 4x2 (index 0..7 = top row left→right, then bottom row)
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 4; k++) {
          const col = new THREE.Color(PAD_COLORS[(k + r * 3 + (deck ? 2 : 0)) % PAD_COLORS.length]);
          const mat = m.ownEmissive(col, 0.3);
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.008, 0.028), mat);
          pad.position.set(x + (k - 1.5) * 0.043, 0.04, 0.083 + r * 0.037);
          pad.userData.dynamic = true;
          this.pads.push({ mat, base: col.clone(), deck, idx: r * 4 + k });
          c.add(pad);
        }
      }
      // transport buttons: cue · play · sync (own emissive materials so they can light)
      const btnDefs: [string, number, string][] = [['cue', -0.05, '#ffb347'], ['play', 0, '#4be3a0'], ['sync', 0.05, '#7a8cff']];
      for (const [name, dx, col] of btnDefs) {
        const mat = m.ownEmissive(col, 0.12);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 14), mat);
        b.position.set(x + dx, 0.04, 0.145);
        b.userData.dynamic = true;
        this.btns[deck][name] = mat;
        c.add(b);
      }
    }

    // ---- mixer section: per channel trim / hi / mid / low / filter, channel fader, VU
    c.add(at(box(0.135, 0.004, 0.31, m.plastic(0x1d1f25, 0.5), 1), 0, 0.037, 0));
    for (let ch = 0; ch < 2; ch++) {
      const x = (ch === 0 ? -1 : 1) * 0.03;
      this.knob(m, c, ch, 'trim', x, -0.118, 0.0075, 0.6);
      this.knob(m, c, ch, 'hi', x, -0.088);
      this.knob(m, c, ch, 'mid', x, -0.058);
      this.knob(m, c, ch, 'low', x, -0.028);
      this.knob(m, c, ch, 'filter', x, 0.002, 0.008);
      c.add(at(box(0.008, 0.003, 0.09, m.rubber(), 1), x, 0.0395, 0.07));
      const cap = box(0.02, 0.012, 0.012, m.plastic(0x3b3d46, 0.4), 1);
      at(cap, x, 0.047, 0.115 - 0.8 * 0.09);
      cap.userData.dynamic = true;
      c.add(cap);
      this.faders.push(cap);
      for (let i = 0; i < 8; i++) {
        const mat = m.ownEmissive(i > 5 ? '#ff3b3b' : i > 3 ? '#ffc933' : '#33ff7a', 0.05);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.006), mat);
        led.position.set(x + (ch === 0 ? 0.027 : -0.027), 0.0395, 0.1 - i * 0.0085);
        led.userData.dynamic = true;
        this.meters.push({ mat, level: i / 8, ch });
        c.add(led);
      }
    }
    c.add(at(box(0.09, 0.003, 0.009, m.rubber(), 1), 0, 0.0395, 0.147));
    this.crossfader = box(0.016, 0.012, 0.016, m.plastic(0x3b3d46, 0.4), 1);
    at(this.crossfader, 0, 0.047, 0.147);
    this.crossfader.userData.dynamic = true;
    c.add(this.crossfader);
    c.add(at(cyl(0.014, 0.014, 0.012, m.steel(), 16), 0, 0.045, -0.13));
    for (const s of [-1, 1]) c.add(at(box(0.026, 0.006, 0.014, m.plastic(0x2a2c33, 0.5), 1), s * 0.075, 0.041, -0.135));
    return c;
  }

  /**
   * Drive the board. With a mapped controller (`view.mapped`) every mapped control mirrors the real
   * hardware; unmapped controls stay at rest. Nothing animates on its own without music.
   */
  update(p: BoothParams, view: BoardView | null): void {
    const music = p.music;
    const live = !!view?.mapped;
    const pulse = Math.pow(1 - p.beatPhase, 3) * music;

    // ---------- jog wheels
    const w = (33.3 / 60) * Math.PI * 2 * (p.bpm / 124);
    for (let d = 0; d < 2; d++) {
      const spinning = live && view!.playMapped[d] ? view!.playing[d] : music > 0.3;
      this.spin[d] += p.dt * w * (spinning ? 1 : 0) * (d ? 0.93 : 1);
      const scratch = live && view!.jogMapped[d] ? view!.jogAngle[d] : 0;
      this.jogs[d].rotation.y = -(this.spin[d] + scratch);
    }

    // ---------- pads
    for (const pad of this.pads) {
      const held = live && view!.pads[pad.deck][pad.idx];
      const v = held ? 3.2 : 0.22 + pulse * 0.28 * (pad.idx % 2 ? 1 : 0.5) + p.drop * 0.6 * music;
      pad.mat.color.copy(pad.base).multiplyScalar(v);
    }

    // ---------- jog rings + buttons
    for (let d = 0; d < 2; d++) {
      const spinning = live && view!.playMapped[d] ? view!.playing[d] : music > 0.3;
      this.rings[d].color.copy(p.accent).lerp(new THREE.Color(PAD_COLORS[d * 3]), 0.4).multiplyScalar(0.25 + (spinning ? 0.6 + p.energy * 0.9 + pulse * 0.5 : 0));
      const b = this.btns[d];
      const playOn = live && view!.playMapped[d] ? view!.playing[d] : music > 0.3;
      b.play.color.set('#4be3a0').multiplyScalar(playOn ? 2.2 : 0.12);
      b.cue.color.set('#ffb347').multiplyScalar(live && view!.cue[d] ? 3 : 0.12);
      b.sync.color.set('#7a8cff').multiplyScalar(live && view!.sync[d] ? 3 : 0.12);
    }

    // ---------- knobs, faders, crossfader (mirror hardware when known)
    const setKnob = (deck: number, name: string, v: number | undefined, dflt: number) => {
      const k = this.knobs[deck][name];
      const val = live && v !== undefined ? v : dflt;
      k.rotation.y = (val - 0.5) * Math.PI * 1.5;
    };
    for (let d = 0; d < 2; d++) {
      setKnob(d, 'trim', view?.trim[d], 0.6);
      setKnob(d, 'hi', view?.hi[d], 0.5);
      setKnob(d, 'mid', view?.mid[d], 0.5);
      setKnob(d, 'low', view?.low[d], 0.5);
      setKnob(d, 'filter', view?.filter[d], 0.5);
      const fv = live && view!.fader[d] !== undefined ? view!.fader[d]! : 0.8;
      this.faders[d].position.z = 0.115 - fv * 0.09;
    }
    const xf = live && view!.crossfader !== undefined ? view!.crossfader : 0.5;
    this.crossfader.position.x = (xf - 0.5) * 0.08;

    // ---------- VU meters follow real bass, scaled by the channel fader when we know it
    for (const m of this.meters) {
      const fv = live && view!.fader[m.ch] !== undefined ? view!.fader[m.ch]! : 1;
      const level = Math.min(1, (p.bass * 1.1 + p.kick * 0.3) * music * fv);
      m.mat.color.set(m.level > 0.75 ? '#ff3b3b' : m.level > 0.5 ? '#ffc933' : '#33ff7a').multiplyScalar(level > m.level ? 1.6 : 0.05);
    }

    this.underglow.color.copy(p.accent).multiplyScalar(0.45 + music * (0.5 + p.energy * 1.1 + pulse * 0.4));
    this.laptopScreen.color.set('#ffffff').lerp(p.accent, 0.25).multiplyScalar(0.1 + music * (0.2 + 0.12 * p.energy + pulse * 0.05));
    const flick = 1.6 + Math.sin(p.time * 9) * 0.35 + Math.sin(p.time * 23) * 0.2;
    this.candle.color.set('#ffad5c').multiplyScalar(flick);
    this.controllerLight.intensity = 6 + music * (p.energy * 2.5 + p.drop * 3);
    this.controllerLight.color.set('#ffb878').lerp(p.accent, 0.25);
  }
}
