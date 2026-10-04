import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX_VERTS_PER_MESH = 600_000;

/**
 * Bakes every static mesh below `root` into one mesh per material. Venue scenery is thousands of
 * small parts; merging keeps the draw-call count tiny so the GPU budget goes to the crowd.
 * Meshes flagged `userData.dynamic` and instanced meshes are re-parented untouched (world transform kept).
 * Non-mesh objects (lights, sprites) are NOT carried over — the venue builder should not put them in `root`.
 */
export function batchStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];

  const visit = (o: THREE.Object3D): void => {
    // Whole subtrees can opt out (animated groups) and are re-parented untouched.
    if (o.userData.keep) {
      keep.push(o);
      return;
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      if ((mesh as THREE.InstancedMesh).isInstancedMesh || mesh.userData.dynamic || Array.isArray(mesh.material)) {
        keep.push(mesh);
      } else {
        let g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);
        if (g.index) g = g.toNonIndexed();
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        const list = buckets.get(mesh.material as THREE.Material);
        if (list) list.push(g); else buckets.set(mesh.material as THREE.Material, [g]);
      }
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);

  const out = new THREE.Group();
  out.name = 'static-batch';

  for (const [mat, geos] of buckets) {
    let chunk: THREE.BufferGeometry[] = [];
    let verts = 0;
    const flush = () => {
      if (!chunk.length) return;
      const merged = mergeGeometries(chunk, false);
      if (merged) {
        const m = new THREE.Mesh(merged, mat);
        m.matrixAutoUpdate = false;
        m.receiveShadow = true;
        out.add(m);
      }
      chunk.forEach((c) => c.dispose());
      chunk = [];
      verts = 0;
    };
    for (const g of geos) {
      chunk.push(g);
      verts += g.attributes.position.count;
      if (verts > MAX_VERTS_PER_MESH) flush();
    }
    flush();
  }
  for (const k of keep) out.attach(k);
  return out;
}
