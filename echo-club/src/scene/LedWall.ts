import * as THREE from 'three';

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uBass, uEnergy, uKick, uDrop, uBuild, uBreak, uBright, uAspect, uHigh;
uniform vec3 uColA, uColB;
varying vec2 vUv;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.)), c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
}

void main(){
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  float t = uTime;
  float calm = 1.0 - uBreak * 0.65;
  vec3 col = vec3(0.0);

  // slow atmospheric clouds
  float n = noise(p*1.2 + vec2(t*0.04, -t*0.025))*0.6 + noise(p*2.9 - vec2(t*0.07, t*0.02))*0.4;
  col += mix(uColA, uColB, clamp(uv.x + n*0.5 - 0.25, 0., 1.)) * (0.05 + 0.22*n) * (0.6 + uEnergy);

  // tunnel rings + spokes (perspective feel)
  float r = length(p) + 0.001;
  float ang = atan(p.y, p.x);
  float speed = 0.12 + uEnergy*0.9 + uDrop*1.4 + uBuild*0.8;
  float rings = abs(fract(1.0/(r+0.28)*1.1 - t*speed) - 0.5);
  float ringL = smoothstep(0.045, 0.0, rings) * smoothstep(0.08, 0.7, r);
  float spokes = abs(fract(ang/6.28318*18.0 + t*0.03) - 0.5);
  float spokeL = smoothstep(0.025, 0.0, spokes) * smoothstep(0.15, 1.1, r) * 0.55;
  vec3 lineCol = mix(uColA, uColB, 0.5 + 0.5*sin(t*0.17 + r));
  col += (ringL + spokeL) * lineCol * (0.35 + 1.8*uEnergy + 1.5*uDrop) * calm;

  // geometric diamond frames reacting to bass
  float dm = abs(p.x)*0.8 + abs(p.y)*1.5;
  float rad = 0.46 + 0.22*uBass + 0.03*sin(t*0.8);
  float d1 = smoothstep(0.022, 0.0, abs(dm - rad));
  float d2 = smoothstep(0.016, 0.0, abs(dm - rad*0.62 - 0.05*uKick));
  float d3 = smoothstep(0.012, 0.0, abs(dm - rad*1.5 - 0.1*uBuild));
  col += (d1*1.2 + d2*0.8 + d3*0.5) * mix(vec3(1.0), uColA, 0.35) * (0.35 + uKick*1.4 + uDrop) * calm;

  // vertical light columns that sweep in time
  float sweep = fract(uv.x*9.0 + t*0.07*(1.0+uEnergy*3.0));
  float col1 = pow(max(0.0, 1.0 - abs(sweep - 0.5)*7.0), 3.0);
  col += col1 * uColB * 0.35 * uHigh * calm * (0.3 + uEnergy);

  // build-up: rising horizontal scan bars
  float bars = pow(max(0.0, 1.0 - abs(fract(uv.y*5.0 - t*(0.4+uBuild*2.0)) - 0.5)*8.0), 2.0);
  col += bars * mix(uColA, vec3(1.0), 0.6) * uBuild * 0.5;

  // drop: white-hot burst from centre
  float burst = smoothstep(1.2, 0.0, r) * uDrop;
  col += burst * mix(uColA, vec3(1.0), 0.45) * (0.28 + 0.3*noise(p*4.0 + t*3.0));

  // LED dot structure (only when dots resolve on screen)
  vec2 cell = uv * vec2(160.0*uAspect/1.7778, 90.0);
  vec2 cf = fract(cell) - 0.5;
  float fw = max(fwidth(cell.x), fwidth(cell.y));
  float dotMask = mix(1.0, 0.82 + 0.18*smoothstep(0.55, 0.2, length(cf)), clamp(1.0 - fw*2.0, 0.0, 1.0));
  col *= dotMask;

  // soft vignette on the panel edge
  vec2 e = abs(uv - 0.5)*2.0;
  col *= 1.0 - 0.35*pow(max(e.x, e.y), 5.0);
  col *= uBright;
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export interface LedWallParams {
  time: number;
  bass: number;
  energy: number; // 0..1
  kick: number;
  drop: number;
  build: number;
  breakdown: number;
  high: number;
  brightness: number;
  colA: THREE.Color;
  colB: THREE.Color;
}

/** A shader-driven LED screen. Generative club visuals — not a music visualizer: restrained palette, slow in calm moments. */
export class LedWall {
  readonly object = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number, frame: THREE.Material, framed = true) {
    this.width = width;
    this.height = height;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 }, uBass: { value: 0 }, uEnergy: { value: 0.2 }, uKick: { value: 0 }, uDrop: { value: 0 },
        uBuild: { value: 0 }, uBreak: { value: 0 }, uBright: { value: 1 }, uAspect: { value: width / height }, uHigh: { value: 0 },
        uColA: { value: new THREE.Color('#5f8bff') }, uColB: { value: new THREE.Color('#8f6bff') },
      },
      toneMapped: true,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    panel.userData.dynamic = true;
    this.object.add(panel);
    if (framed) {
      const f = 0.18;
      const parts: [number, number, number, number][] = [
        [width + f * 2, f, 0, height / 2 + f / 2],
        [width + f * 2, f, 0, -height / 2 - f / 2],
        [f, height, -width / 2 - f / 2, 0],
        [f, height, width / 2 + f / 2, 0],
      ];
      for (const [w, h, x, y] of parts) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), frame);
        m.position.set(x, y, -0.1);
        this.object.add(m);
      }
    }
    this.object.name = 'led-wall';
  }

  update(p: LedWallParams): void {
    const u = this.material.uniforms;
    u.uTime.value = p.time;
    u.uBass.value = p.bass;
    u.uEnergy.value = p.energy;
    u.uKick.value = p.kick;
    u.uDrop.value = p.drop;
    u.uBuild.value = p.build;
    u.uBreak.value = p.breakdown;
    u.uHigh.value = p.high;
    u.uBright.value = p.brightness;
    (u.uColA.value as THREE.Color).copy(p.colA);
    (u.uColB.value as THREE.Color).copy(p.colB);
  }
}
