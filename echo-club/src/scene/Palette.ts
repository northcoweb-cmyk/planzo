import * as THREE from 'three';

/** Restrained club palette: white, cool blue, subtle purple, occasional amber and red. */
export const C = {
  white: new THREE.Color('#f4f7ff'),
  warmWhite: new THREE.Color('#ffe6c4'),
  blue: new THREE.Color('#2f6bff'),
  iceBlue: new THREE.Color('#6fa8ff'),
  cyan: new THREE.Color('#38d8ff'),
  purple: new THREE.Color('#7b4dff'),
  violet: new THREE.Color('#a56bff'),
  amber: new THREE.Color('#ff9a3c'),
  red: new THREE.Color('#ff2a3a'),
  laser: new THREE.Color('#2cff8a'),
  laserBlue: new THREE.Color('#3b7bff'),
};

export type ColorSet = THREE.Color[];

export const COLOR_SETS: Record<string, ColorSet> = {
  coolWhite: [C.white, C.iceBlue],
  blueWhite: [C.blue, C.white, C.blue],
  bluePurple: [C.blue, C.purple, C.iceBlue],
  cyanBlue: [C.cyan, C.blue],
  whiteOnly: [C.white],
  violet: [C.purple, C.violet, C.white],
  warm: [C.amber, C.warmWhite],
  redAccent: [C.red, C.white, C.red],
  afterhours: [C.red, C.amber, C.purple],
  breakdown: [C.iceBlue, C.purple, C.warmWhite],
};
