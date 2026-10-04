import * as THREE from 'three';
import { CHARACTER_SPECS, type CharacterSpec } from './characters';
import { buildCharacterGeometry, type LodLevel } from './CharacterGeometry';
import { loadGlbCharacter } from './GlbCharacter';

/**
 * A crowd character "asset slot". The crowd simulation never touches model details — it only
 * asks a slot for geometry (already in the rig-part format the crowd shader understands) and a
 * height. Swap a slot's implementation to replace a placeholder with a real model.
 */
export interface CharacterAsset {
  readonly id: string;
  readonly spec: CharacterSpec;
  /** True once a real model (e.g. GLB) replaced the procedural placeholder. */
  readonly isPlaceholder: boolean;
  getGeometry(lod: LodLevel): THREE.BufferGeometry;
}

class ProceduralCharacterAsset implements CharacterAsset {
  readonly isPlaceholder = true;
  private cache: (THREE.BufferGeometry | undefined)[] = [];
  constructor(readonly spec: CharacterSpec) {}
  get id(): string { return this.spec.id; }
  getGeometry(lod: LodLevel): THREE.BufferGeometry {
    return (this.cache[lod] ??= buildCharacterGeometry(this.spec, lod));
  }
}

/** Holds the 10 character slots (character01 … character10). */
export class CharacterLibrary {
  readonly slots: CharacterAsset[] = CHARACTER_SPECS.map((s) => new ProceduralCharacterAsset(s));

  get count(): number { return this.slots.length; }

  replace(index: number, asset: CharacterAsset): void {
    this.slots[index] = asset;
  }

  /**
   * Replace placeholder slots with real models listed in assets/manifest.json:
   *   { "characters": { "character01": "characters/character01/character01.glb" } }
   * Returns the slot ids that were replaced (the crowd must be re-laid-out to use them).
   */
  async loadOverrides(base: string, map: Record<string, string> | undefined): Promise<string[]> {
    const replaced: string[] = [];
    if (!map) return replaced;
    await Promise.all(Object.entries(map).map(async ([id, path]) => {
      const idx = this.slots.findIndex((s) => s.id === id);
      if (idx < 0) return;
      try {
        this.slots[idx] = await loadGlbCharacter(this.slots[idx].spec, base + path);
        replaced.push(id);
      } catch (e) {
        console.warn(`[assets] character slot ${id}: ${(e as Error).message}`);
      }
    }));
    return replaced;
  }

  /** 1.0 == 1.75 m. */
  heightScale(index: number): number {
    return this.slots[index].spec.height / 1.75;
  }
}
