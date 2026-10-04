import * as THREE from 'three';
import type { CharacterLibrary } from './CharacterAssets';
import { createCrowdMaterial } from './CrowdMaterial';
import type { PersonSpawn } from './CrowdLayout';
import type { LodLevel } from './CharacterGeometry';

export interface Bucket {
  key: string;
  mesh: THREE.InstancedMesh;
  pose: [Float32Array, Float32Array, Float32Array, Float32Array];
  attrs: THREE.InstancedBufferAttribute[];
  count: number;
}

export interface Placement {
  bucket: Bucket;
  slot: number;
}

/** GPU side of the crowd: one InstancedMesh per (character, LOD). Poses are streamed as instance attributes. */
export class CrowdRenderer {
  readonly group = new THREE.Group();
  readonly material = createCrowdMaterial();
  private buckets: Bucket[] = [];

  constructor(private readonly library: CharacterLibrary) {
    this.group.name = 'crowd';
  }

  get drawCalls(): number { return this.buckets.length; }

  clear(): void {
    for (const b of this.buckets) {
      this.group.remove(b.mesh);
      b.mesh.geometry.dispose(); // per-mesh geometry shell; shared attributes live in the library cache
      b.mesh.dispose();
    }
    this.buckets = [];
  }

  /** Rebuild all instanced meshes for a new layout. Returns the (bucket, slot) for every person. */
  rebuild(people: PersonSpawn[]): Placement[] {
    this.clear();
    const groups = new Map<string, number[]>();
    people.forEach((p, i) => {
      const key = `${p.char}:${p.lod}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(i);
    });
    const placements: Placement[] = new Array(people.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (const [key, list] of groups) {
      const [charS, lodS] = key.split(':');
      const char = Number(charS);
      const lod = Number(lodS) as LodLevel;
      const base = this.library.slots[char].getGeometry(lod);
      const geo = new THREE.BufferGeometry();
      for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.attributes[name]);
      if (base.index) geo.setIndex(base.index);
      geo.boundingSphere = base.boundingSphere?.clone() ?? null;

      const count = list.length;
      const pose = [0, 1, 2, 3].map(() => new Float32Array(count * 4)) as Bucket['pose'];
      const attrs = ['aPose0', 'aPose1', 'aPose2', 'aPose3'].map((name, i) => {
        const a = new THREE.InstancedBufferAttribute(pose[i], 4);
        a.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute(name, a);
        return a;
      });
      const tint = new Float32Array(count * 3);
      geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));

      const mesh = new THREE.InstancedMesh(geo, this.material, count);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `crowd-${key}`;
      const hs = this.library.heightScale(char);
      list.forEach((personIdx, slot) => {
        const p = people[personIdx];
        pos.set(p.x, p.y, p.z);
        q.setFromAxisAngle(up, p.yaw);
        scl.set(hs * p.width, hs * p.height, hs * p.width);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(slot, m);
        placements[personIdx] = { bucket: undefined as unknown as Bucket, slot };
        // tint: mostly neutral with small brightness/hue drift so repeated characters differ
        const v = 0.78 + Math.random() * 0.4;
        const h = (Math.random() - 0.5) * 0.14;
        tint[slot * 3] = v * (1 + h);
        tint[slot * 3 + 1] = v * (1 - Math.abs(h) * 0.3);
        tint[slot * 3 + 2] = v * (1 - h);
      });
      mesh.instanceMatrix.needsUpdate = true;
      const bucket: Bucket = { key, mesh, pose, attrs, count };
      list.forEach((personIdx) => (placements[personIdx].bucket = bucket));
      this.buckets.push(bucket);
      this.group.add(mesh);
    }
    return placements;
  }

  /** Call after poses were written. */
  flush(): void {
    for (const b of this.buckets) for (const a of b.attrs) a.needsUpdate = true;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }
}
