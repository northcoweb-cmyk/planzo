import * as THREE from 'three';

/**
 * Crowd material: a standard PBR material whose vertex stage runs a tiny procedural skeleton.
 * All animation (bounce, arms, head, legs, props) is driven by four per-instance vec4 attributes, so
 * hundreds of independently animated people cost a handful of draw calls and almost no CPU.
 *
 *  aPose0 = (pelvisDy, lean, sway, twist)
 *  aPose1 = (armA pitch, armA abduct, armA elbow, head nod)
 *  aPose2 = (armB pitch, armB abduct, armB elbow, head yaw)
 *  aPose3 = (legA step, legB step, spawn scale, prop)      prop: 0 none · 1 phone rec · 2 flash · 3 phone glow · 4 drink
 *  aTint  = per-instance clothing/hair colour multiplier
 */
const VERT_DECL = /* glsl */ `
attribute vec2 aPF; // x = rig part id, y = material flag
attribute vec3 aPivotA;
attribute vec3 aPivotB;
attribute vec4 aPose0;
attribute vec4 aPose1;
attribute vec4 aPose2;
attribute vec4 aPose3;
attribute vec3 aTint;
varying vec3 vTint;
varying float vFlagF;
varying float vGlow;

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

void crowdPose(inout vec3 p, inout vec3 n) {
  int part = int(aPF.x + 0.5);
  int flag = int(aPF.y + 0.5);
  float dy = aPose0.x;
  float prop = aPose3.w;
  bool upper = false;

  // Props are collapsed into the elbow unless the current prop state shows them.
  bool phoneVisible = prop > 0.5 && prop < 3.5;
  bool cupVisible = prop > 3.5;
  if (((flag == 3 || flag == 4) && !phoneVisible) || (flag == 5 && !cupVisible)) {
    p = aPivotB;
  }

  if (part >= 2 && part <= 5) {
    upper = true;
    bool sideA = part <= 3;
    vec4 P = sideA ? aPose1 : aPose2;
    float side = sideA ? 1.0 : -1.0;
    if (part == 3 || part == 5) {
      mat3 Re = rotX(-P.z);
      p = aPivotB + Re * (p - aPivotB);
      n = Re * n;
    }
    mat3 Rs = rotX(-P.x) * rotZ(side * P.y);
    p = aPivotA + Rs * (p - aPivotA);
    n = Rs * n;
  } else if (part == 1) {
    upper = true;
    mat3 Rh = rotY(aPose2.w) * rotX(aPose1.w);
    p = aPivotA + Rh * (p - aPivotA);
    n = Rh * n;
  } else if (part == 10) {
    upper = true;
  } else if (part >= 6) {
    bool sideA = (part == 6 || part == 7);
    float d = max(-dy, 0.0);
    float alpha = acos(clamp(1.0 - d / 0.84, -1.0, 1.0));
    float stp = sideA ? aPose3.x : aPose3.y;
    float tuck = max(dy, 0.0) * 1.4;
    float hip = -alpha - stp * 0.8 - tuck * 0.5;
    float knee = 2.0 * alpha + stp * 1.0 + tuck;
    if (part == 7 || part == 9) {
      mat3 Rk = rotX(knee);
      p = aPivotB + Rk * (p - aPivotB);
      n = Rk * n;
    }
    mat3 Rh = rotX(hip);
    p = aPivotA + Rh * (p - aPivotA);
    n = Rh * n;
  }

  if (upper) {
    mat3 Ru = rotY(aPose0.w) * rotZ(aPose0.z) * rotX(aPose0.y);
    vec3 pv = vec3(0.0, 0.92, 0.0);
    p = pv + Ru * (p - pv);
    n = Ru * n;
  }
  p.y += dy;
  p *= aPose3.z;
}
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vTint;
varying float vFlagF;
varying float vGlow;
`;

export function createCrowdMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
  mat.customProgramCacheKey = () => 'echo-crowd-v1';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        {
          vec3 dummy = vec3(0.0);
          vec3 nn = objectNormal;
          crowdPose(dummy, nn);
          objectNormal = normalize(nn);
        }
        vTint = aTint;
        vFlagF = aPF.y;
        {
          float pr = aPose3.w;
          int fl = int(aPF.y + 0.5);
          vGlow = (fl == 4) ? (pr > 1.5 && pr < 2.5 ? 7.0 : (pr > 2.5 && pr < 3.5 ? 0.9 : 2.1)) : 0.0;
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 nn2 = vec3(0.0, 1.0, 0.0);
          crowdPose(transformed, nn2);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float cloth = 1.0 - step(0.5, vFlagF);
          float hair = step(1.5, vFlagF) * (1.0 - step(2.5, vFlagF));
          diffuseColor.rgb *= mix(vec3(1.0), vTint, cloth + hair * 0.5);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float isScreen = step(3.5, vFlagF) * (1.0 - step(4.5, vFlagF));
          vec3 gc = mix(vec3(0.5, 0.68, 1.0), vec3(1.0), step(5.0, vGlow));
          totalEmissiveRadiance += gc * vGlow * isScreen;
        }`,
      );
  };
  return mat;
}
