import * as THREE from 'three';
import type { MaterialLibrary } from './Materials';
import { at, box, cyl, rotated, seeded } from './Primitives';
import { plant } from './architecture/parts';
import type { BuildContext } from './architecture/BuildContext';

export interface BoothParams {
  time: number;
  dt: number;
  bpm: number;
  energy: number; // 0..1
  kick: number;
  bass: number;
  beatPhase: number;
  beatInBar: number;
  playing: boolean;
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
  private readonly pads: { mat: THREE.MeshBasicMaterial; base: THREE.Color; idx: number }[] = [];
  private readonly rings: THREE.MeshBasicMaterial[] = [];
  private readonly meters: { mat: THREE.MeshBasicMaterial; level: number; ch: number }[] = [];
  private readonly faders: THREE.Mesh[] = [];
  private crossfader!: THREE.Mesh;
  private readonly underglow: THREE.MeshBasicMaterial;
  private readonly laptopScreen: THREE.MeshBasicMaterial;
  private readonly candle: THREE.MeshBasicMaterial;
  private jogAngle = [0, 0];
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

  private buildController(m: MaterialLibrary): THREE.Group {
    const c = new THREE.Group();
    c.name = 'controller';
    const body = m.plastic(0x16171b, 0.42);
    const top = m.plastic(0x0d0e11, 0.5);
    const rnd = seeded(3);

    c.add(at(box(0.6, 0.032, 0.33, body, 1), 0, 0.016, 0));
    c.add(at(box(0.585, 0.006, 0.315, top, 1), 0, 0.035, 0));
    // slight bevel highlight on the front lip
    c.add(at(box(0.6, 0.008, 0.012, m.steel(), 1), 0, 0.028, 0.168));

    // jog wheels
    for (const s of [-1, 1]) {
      const x = s * 0.185;
      const holder = new THREE.Group();
      holder.position.set(x, 0.038, -0.025);
      holder.add(at(cyl(0.088, 0.088, 0.006, m.steel(), 36), 0, 0.003, 0));
      const ringMat = m.ownEmissive(PAD_COLORS[s > 0 ? 3 : 0], 1.8);
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
      spin.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.dynamic = true; });
      spin.userData.keep = true;
      holder.add(spin);
      this.jogs.push(spin);
      c.add(holder);

      // performance pads 4x2
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 4; k++) {
          const col = new THREE.Color(PAD_COLORS[(k + r * 3 + (s > 0 ? 2 : 0)) % PAD_COLORS.length]);
          const mat = m.ownEmissive(col, 0.9);
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.008, 0.028), mat);
          pad.position.set(x + (k - 1.5) * 0.043, 0.04, 0.083 + r * 0.037);
          pad.userData.dynamic = true;
          this.pads.push({ mat, base: col.clone(), idx: this.pads.length });
          c.add(pad);
        }
      }
      // transport buttons
      c.add(at(cyl(0.012, 0.012, 0.008, m.plastic(0x2a2c33, 0.5), 14), x - 0.05, 0.04, 0.145));
      c.add(at(cyl(0.012, 0.012, 0.008, m.plastic(0x2a2c33, 0.5), 14), x + 0.0, 0.04, 0.145));
      c.add(at(cyl(0.012, 0.012, 0.008, m.emissive('btn', '#7a8cff', 0.8), 14), x + 0.05, 0.04, 0.145));
    }

    // mixer section
    c.add(at(box(0.135, 0.004, 0.31, m.plastic(0x1d1f25, 0.5), 1), 0, 0.037, 0));
    for (let ch = 0; ch < 2; ch++) {
      const x = (ch === 0 ? -1 : 1) * 0.03;
      // EQ knobs
      for (let k = 0; k < 3; k++) {
        const knob = cyl(0.0085, 0.0085, 0.012, m.plastic(0x30323a, 0.4), 14);
        at(knob, x, 0.045, -0.095 + k * 0.032);
        c.add(knob);
        c.add(at(box(0.002, 0.001, 0.007, m.emissive('knobmark', '#ffffff', 1), 1), x, 0.0515, -0.098 + k * 0.032));
      }
      // channel fader slot + cap
      c.add(at(box(0.008, 0.003, 0.09, m.rubber(), 1), x, 0.0395, 0.07));
      const cap = box(0.02, 0.012, 0.012, m.plastic(0x3b3d46, 0.4), 1);
      at(cap, x, 0.047, 0.07);
      cap.userData.dynamic = true;
      c.add(cap);
      this.faders.push(cap);
      // VU meter LEDs
      for (let i = 0; i < 8; i++) {
        const mat = m.ownEmissive(i > 5 ? '#ff3b3b' : i > 3 ? '#ffc933' : '#33ff7a', 0.1);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.006), mat);
        led.position.set(x + (ch === 0 ? 0.027 : -0.027), 0.0395, 0.1 - i * 0.0085);
        led.userData.dynamic = true;
        this.meters.push({ mat, level: i / 8, ch });
        c.add(led);
      }
    }
    // crossfader
    c.add(at(box(0.09, 0.003, 0.009, m.rubber(), 1), 0, 0.0395, 0.147));
    this.crossfader = box(0.016, 0.012, 0.016, m.plastic(0x3b3d46, 0.4), 1);
    at(this.crossfader, 0, 0.047, 0.147);
    this.crossfader.userData.dynamic = true;
    c.add(this.crossfader);
    // browse knob + load buttons
    c.add(at(cyl(0.014, 0.014, 0.012, m.steel(), 16), 0, 0.045, -0.13));
    for (const s of [-1, 1]) c.add(at(box(0.026, 0.006, 0.014, m.plastic(0x2a2c33, 0.5), 1), s * 0.075, 0.041, -0.135));
    void rnd;
    return c;
  }

  update(p: BoothParams): void {
    const e = p.energy;
    // jog wheels spin at ~33⅓ rpm scaled by tempo
    const w = (33.3 / 60) * Math.PI * 2 * (p.bpm / 124) * (p.playing ? 1 : 0);
    this.jogAngle[0] += p.dt * w;
    this.jogAngle[1] += p.dt * w * 0.93;
    this.jogs[0].rotation.y = -this.jogAngle[0];
    this.jogs[1].rotation.y = -this.jogAngle[1];

    const pulse = Math.pow(1 - p.beatPhase, 3);
    this.pads.forEach((pad, i) => {
      const lit = (Math.floor(p.beatInBar * 2 + p.beatPhase * 2) + i) % 8 === 0 ? 1.8 : 0;
      pad.mat.color.copy(pad.base).multiplyScalar(0.25 + 0.5 * e + pulse * 0.8 * (i % 2 ? 1 : 0.4) + lit * 0.5 + p.drop * 1.5);
    });
    this.rings.forEach((r, i) => {
      const a = p.accent;
      r.color.copy(a).lerp(new THREE.Color(PAD_COLORS[i * 3]), 0.4).multiplyScalar(1.1 + e * 1.6 + pulse * 0.7);
    });
    // VU meters follow bass with fast attack, slow decay
    for (const m of this.meters) {
      const level = Math.min(1, p.bass * 1.1 + p.kick * 0.3) * (m.ch === 0 ? 1 : 0.92);
      m.mat.color.set(m.level > 0.75 ? '#ff3b3b' : m.level > 0.5 ? '#ffc933' : '#33ff7a').multiplyScalar(level > m.level ? 1.6 : 0.06);
    }
    this.crossfader.position.x = Math.sin(p.time * 0.13) * 0.012;
    this.faders[0].position.z = 0.07 - 0.015 * Math.sin(p.time * 0.17 + 1);
    this.faders[1].position.z = 0.07 - 0.015 * Math.sin(p.time * 0.19);
    this.underglow.color.copy(p.accent).multiplyScalar(0.8 + e * 1.6 + pulse * 0.6);
    this.laptopScreen.color.set('#ffffff').lerp(p.accent, 0.25).multiplyScalar(0.28 + 0.18 * e + pulse * 0.06);
    const flick = 1.6 + Math.sin(p.time * 9) * 0.35 + Math.sin(p.time * 23) * 0.2;
    this.candle.color.set('#ffad5c').multiplyScalar(flick);
    this.controllerLight.intensity = 3.2 + e * 2.2 + p.drop * 3;
    this.controllerLight.color.set('#ffb878').lerp(p.accent, 0.25);
  }
}
