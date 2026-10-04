import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Asset slots for everything that is not a crowd character (booth, speakers, fixtures, props …).
 *
 * Drop a .glb at the slot's path under /public/assets and list it in /public/assets/manifest.json:
 *
 *   { "models": { "lighting/moving-head": "lighting/moving-head/moving-head.glb" } }
 *
 * `model(slot, fallback)` returns a clone of the loaded GLB when present, otherwise the procedural
 * placeholder. Nothing else in the codebase needs to change to upgrade an asset.
 */
export class AssetRegistry {
  private loaded = new Map<string, THREE.Object3D>();
  private base = import.meta.env.BASE_URL + 'assets/';
  manifest: { models?: Record<string, string>; characters?: Record<string, string> } = {};

  async init(): Promise<void> {
    try {
      const res = await fetch(this.base + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      this.manifest = (await res.json()) as typeof this.manifest;
    } catch {
      return; // no manifest: placeholders only
    }
    const loader = new GLTFLoader();
    const jobs = Object.entries(this.manifest.models ?? {}).map(async ([slot, path]) => {
      try {
        const gltf = await loader.loadAsync(this.base + path);
        this.loaded.set(slot, gltf.scene);
      } catch (e) {
        console.warn(`[assets] could not load "${slot}" from ${path}`, e);
      }
    });
    await Promise.all(jobs);
  }

  has(slot: string): boolean {
    return this.loaded.has(slot);
  }

  model(slot: string, fallback: () => THREE.Object3D): THREE.Object3D {
    const src = this.loaded.get(slot);
    return src ? src.clone(true) : fallback();
  }
}

export const assets = new AssetRegistry();
