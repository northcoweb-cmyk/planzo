/**
 * Character slot definitions. Each of the 10 slots is described by data only; the procedural
 * placeholder geometry is generated from it, and any slot can later be overridden by a real model
 * (see assets/AssetRegistry + crowd/CharacterAsset).
 */
export type HairStyle = 'short' | 'buzz' | 'long' | 'ponytail' | 'curly' | 'bun';
export type TopKind = 'oversizedTee' | 'tee' | 'crop' | 'tank' | 'buttonUp' | 'hoodie' | 'jacket' | 'dress' | 'fitted';
export type BottomKind = 'jeans' | 'cargo' | 'skirt' | 'dress';
export type Accessory = 'cap' | 'sunglasses' | 'chain' | 'bag' | 'beanie';

export interface CharacterSpec {
  id: string; // asset slot id, e.g. "character01"
  label: string;
  gender: 'male' | 'female';
  /** Real-world height in metres; scales the whole instance. */
  height: number;
  /** Half distance between shoulder joints. */
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  torsoDepth: number;
  skin: string;
  hair: { style: HairStyle; color: string };
  top: { kind: TopKind; color: string; accent?: string; hem: number };
  bottom: { kind: BottomKind; color: string; baggy: number };
  shoes: { color: string; sole: string };
  accessories: Accessory[];
  capColor?: string;
}

export const CHARACTER_SPECS: CharacterSpec[] = [
  {
    id: 'character01', label: 'Male · black oversized tee', gender: 'male', height: 1.82,
    shoulder: 0.215, chest: 0.178, waist: 0.15, hip: 0.158, torsoDepth: 0.64,
    skin: '#5a3a28', hair: { style: 'buzz', color: '#0c0908' },
    top: { kind: 'oversizedTee', color: '#16161a', hem: 0.92 },
    bottom: { kind: 'jeans', color: '#1d2230', baggy: 1.1 },
    shoes: { color: '#e8e8e8', sole: '#f4f4f4' }, accessories: [],
  },
  {
    id: 'character02', label: 'Female · black crop top, long blonde hair', gender: 'female', height: 1.68,
    shoulder: 0.176, chest: 0.15, waist: 0.12, hip: 0.158, torsoDepth: 0.62,
    skin: '#d9ad90', hair: { style: 'long', color: '#c9a45e' },
    top: { kind: 'crop', color: '#101012', hem: 1.2 },
    bottom: { kind: 'cargo', color: '#1a1a1e', baggy: 1.35 },
    shoes: { color: '#ececec', sole: '#ffffff' }, accessories: [],
  },
  {
    id: 'character03', label: 'Male · cream tee, cap, cargo pants', gender: 'male', height: 1.78,
    shoulder: 0.205, chest: 0.172, waist: 0.148, hip: 0.156, torsoDepth: 0.64,
    skin: '#a9714e', hair: { style: 'short', color: '#17120e' },
    top: { kind: 'oversizedTee', color: '#d9d3c3', hem: 0.9 },
    bottom: { kind: 'cargo', color: '#6e6a5e', baggy: 1.3 },
    shoes: { color: '#f2f2f2', sole: '#e0ddd5' }, accessories: ['cap'], capColor: '#1b2538',
  },
  {
    id: 'character04', label: 'Female · dark tank, long brown hair, shoulder bag', gender: 'female', height: 1.66,
    shoulder: 0.17, chest: 0.146, waist: 0.118, hip: 0.16, torsoDepth: 0.62,
    skin: '#b98660', hair: { style: 'long', color: '#4a2f1d' },
    top: { kind: 'tank', color: '#121214', hem: 1.04 },
    bottom: { kind: 'jeans', color: '#15171d', baggy: 1.15 },
    shoes: { color: '#f0f0f0', sole: '#ffffff' }, accessories: ['bag'],
  },
  {
    id: 'character05', label: 'Male · olive oversized shirt, sunglasses', gender: 'male', height: 1.84,
    shoulder: 0.218, chest: 0.18, waist: 0.152, hip: 0.158, torsoDepth: 0.66,
    skin: '#c28c68', hair: { style: 'short', color: '#2a1d14' },
    top: { kind: 'oversizedTee', color: '#3b4a2c', hem: 0.9 },
    bottom: { kind: 'jeans', color: '#14161b', baggy: 1.2 },
    shoes: { color: '#1a1a1a', sole: '#dcdcdc' }, accessories: ['sunglasses'],
  },
  {
    id: 'character06', label: 'Female · dark fitted top, curly hair', gender: 'female', height: 1.64,
    shoulder: 0.172, chest: 0.148, waist: 0.118, hip: 0.162, torsoDepth: 0.62,
    skin: '#6a4430', hair: { style: 'curly', color: '#140d09' },
    top: { kind: 'fitted', color: '#17171a', hem: 1.12 },
    bottom: { kind: 'cargo', color: '#1b1b1f', baggy: 1.4 },
    shoes: { color: '#262626', sole: '#e6e6e6' }, accessories: [],
  },
  {
    id: 'character07', label: 'Male · club button-up, chain', gender: 'male', height: 1.76,
    shoulder: 0.206, chest: 0.17, waist: 0.146, hip: 0.155, torsoDepth: 0.64,
    skin: '#9a6a48', hair: { style: 'short', color: '#100c0a' },
    top: { kind: 'buttonUp', color: '#2b2a2c', accent: '#46444a', hem: 0.94 },
    bottom: { kind: 'jeans', color: '#101114', baggy: 1.0 },
    shoes: { color: '#ececec', sole: '#f8f8f8' }, accessories: ['chain'],
  },
  {
    id: 'character08', label: 'Female · dark jacket, ponytail', gender: 'female', height: 1.7,
    shoulder: 0.178, chest: 0.15, waist: 0.122, hip: 0.158, torsoDepth: 0.62,
    skin: '#e0b99c', hair: { style: 'ponytail', color: '#2b1c12' },
    top: { kind: 'jacket', color: '#1c1d22', accent: '#cfcfd2', hem: 0.98 },
    bottom: { kind: 'jeans', color: '#0f1013', baggy: 1.1 },
    shoes: { color: '#e9e9e9', sole: '#ffffff' }, accessories: [],
  },
  {
    id: 'character09', label: 'Male · grey hoodie, cap', gender: 'male', height: 1.8,
    shoulder: 0.212, chest: 0.178, waist: 0.155, hip: 0.16, torsoDepth: 0.66,
    skin: '#7c5238', hair: { style: 'buzz', color: '#0e0a08' },
    top: { kind: 'hoodie', color: '#7b7d82', hem: 0.9 },
    bottom: { kind: 'jeans', color: '#1c2434', baggy: 1.35 },
    shoes: { color: '#f2f2f2', sole: '#e8e8e8' }, accessories: ['cap'], capColor: '#101010',
  },
  {
    id: 'character10', label: 'Female · dark dress, long dark hair, boots', gender: 'female', height: 1.72,
    shoulder: 0.174, chest: 0.148, waist: 0.116, hip: 0.158, torsoDepth: 0.62,
    skin: '#d2a183', hair: { style: 'long', color: '#0f0a08' },
    top: { kind: 'dress', color: '#0e0e12', hem: 0.74 },
    bottom: { kind: 'dress', color: '#0e0e12', baggy: 1 },
    shoes: { color: '#0b0b0d', sole: '#1a1a1a' }, accessories: [],
  },
];
