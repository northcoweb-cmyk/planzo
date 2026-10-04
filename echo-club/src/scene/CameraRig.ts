import * as THREE from 'three';
import type { CrowdFrame } from '../core/types';
import { clamp, damp } from '../util/math';

/**
 * DJ point-of-view camera. Movement is deliberately restrained: a breathing sway, a tiny beat
 * bounce, a slow push during builds and a short low-frequency shake on drops. Scaled by the
 * "Camera Movement" setting (0 = locked off).
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly base = new THREE.Vector3(0, 2.56, 0.55);
  readonly lookAt = new THREE.Vector3(0, 1.75, -16);
  private push = 0;
  private shake = 0;
  private bounce = 0;
  private tmp = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 600);
    this.camera.position.copy(this.base);
    this.camera.lookAt(this.lookAt);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setLookAt(x: number, y: number, z: number): void {
    this.lookAt.set(x, y, z);
  }

  update(f: CrowdFrame, movement01: number, time: number, dt: number): void {
    const k = movement01;
    this.push = damp(this.push, f.buildIntensity * 0.55 + f.dropIntensity * 0.1, 0.9, dt);
    this.shake = damp(this.shake, f.dropIntensity > 0.6 ? f.dropIntensity : 0, 4, dt);
    this.bounce = damp(this.bounce, f.kick, 22, dt);

    const sway = (Math.sin(time * 0.31) * 0.045 + Math.sin(time * 0.17 + 1.3) * 0.03) * k;
    const bob = (Math.sin(time * 0.43) * 0.012) * k;
    const beatBob = -this.bounce * 0.012 * (0.4 + f.crowdEnergy / 140) * k;
    const bass = f.bassEnergy * 0.004 * k;
    const sx = (Math.sin(time * 31) + Math.sin(time * 47.3)) * 0.5 * this.shake * 0.018 * k;
    const sy = (Math.sin(time * 37.7) + Math.sin(time * 53.1)) * 0.5 * this.shake * 0.014 * k;

    this.tmp.copy(this.base);
    this.tmp.x += sway + sx;
    this.tmp.y += bob + beatBob + sy + (Math.sin(time * 90) * bass);
    this.tmp.z -= this.push * k;
    this.camera.position.copy(this.tmp);
    this.look.copy(this.lookAt);
    this.look.x += sway * 0.7;
    this.look.y += beatBob * 0.6 + sy * 0.5;
    this.camera.lookAt(this.look);
    // clamp subtle FOV breathing on the drop
    const targetFov = 58 - clamp(f.dropIntensity, 0, 1) * 1.8 * k;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, targetFov, 3, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
