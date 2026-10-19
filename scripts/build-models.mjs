// 预处理 3D 模型：下载源 GLB → 合并顶点 / 封闭面部空腔 / 简化头骨 / 归一化并对齐 → 输出紧凑的二进制网格。
// 输出格式：Uint32[顶点数, 索引数] + Float32 positions + Uint32 indices
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const cacheDir = path.join(root, 'scripts/.cache');
const outDir = path.join(root, 'public/models');
fs.mkdirSync(cacheDir, { recursive: true });

const SOURCES = {
  head: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb',
  skull: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ScatteringSkull/glTF-Binary/ScatteringSkull.glb',
};
const HEAD_HEIGHT = 2.9;
const SKULL_TRIS = 30000;

async function fetchGlb(name) {
  const file = path.join(cacheDir, `${name}.glb`);
  if (!fs.existsSync(file)) {
    const res = await fetch(SOURCES[name]);
    if (!res.ok) throw new Error(`下载 ${name} 失败：${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file);
}

function parseGlb(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const prim = json.meshes[0].primitives[0];
  const read = (accIndex, Ctor, comps) => {
    const acc = json.accessors[accIndex];
    const view = json.bufferViews[acc.bufferView];
    const base = binStart + (view.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = view.byteStride || Ctor.BYTES_PER_ELEMENT * comps;
    const out = new Ctor(acc.count * comps);
    const dv = new DataView(buf.buffer, buf.byteOffset);
    for (let i = 0; i < acc.count; i++) for (let c = 0; c < comps; c++) {
      const o = base + i * stride + c * Ctor.BYTES_PER_ELEMENT;
      out[i * comps + c] = Ctor === Float32Array ? dv.getFloat32(o, true) : Ctor === Uint32Array ? dv.getUint32(o, true) : dv.getUint16(o, true);
    }
    return out;
  };
  const positions = read(prim.attributes.POSITION, Float32Array, 3);
  const idxAcc = json.accessors[prim.indices];
  const raw = read(prim.indices, idxAcc.componentType === 5125 ? Uint32Array : Uint16Array, 1);
  return { positions, indices: Uint32Array.from(raw) };
}

function toMerged({ positions, indices }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  return mergeVertices(g, 1e-4);
}

// 扫描模型的眼睛、嘴是向内凹的深腔：从竖直中轴向外打射线，被自身遮挡的顶点视为腔内，
// 固定其余顶点做拉普拉斯平滑，腔体会收拢成一张跨过开口的平滑曲面（像闭着眼）。
function closeCavities(geo) {
  geo.computeBoundingBox();
  const pos = geo.attributes.position, idx = geo.index.array, n = pos.count;
  const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  const h = geo.boundingBox.max.y - geo.boundingBox.min.y;
  const nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) for (let j = 0; j < 3; j++) {
    nb[idx[i + j]].add(idx[i + (j + 1) % 3]);
    nb[idx[i + j]].add(idx[i + (j + 2) % 3]);
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const rc = new THREE.Raycaster(), v = new THREE.Vector3(), d = new THREE.Vector3();
  const free = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y < c.y - 0.05 * h) continue;
    d.set(v.x - c.x, 0, v.z - c.z).normalize();
    rc.set(v.clone().addScaledVector(d, 1e-3 * h), d);
    if (rc.intersectObject(mesh, false).length) free[i] = 1;
  }
  const arr = pos.array, tmp = new Float32Array(arr.length);
  for (let it = 0; it < 300; it++) {
    tmp.set(arr);
    for (let i = 0; i < n; i++) {
      if (!free[i]) continue;
      let x = 0, y = 0, z = 0;
      for (const k of nb[i]) { x += tmp[k * 3]; y += tmp[k * 3 + 1]; z += tmp[k * 3 + 2]; }
      const m = nb[i].size;
      arr[i * 3] = x / m; arr[i * 3 + 1] = y / m; arr[i * 3 + 2] = z / m;
    }
  }
  pos.needsUpdate = true;
  return geo;
}

function normalize(geo, height) {
  geo.computeBoundingBox();
  const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);
  const s = new THREE.Vector3(); geo.boundingBox.getSize(s);
  const k = height / s.y;
  geo.scale(k, k, k);
  geo.computeBoundingBox();
  return geo;
}

function topBox(geo, depth) {
  const p = geo.attributes.position, top = geo.boundingBox.max.y, box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.y > top - depth) box.expandByPoint(v); }
  return box;
}

async function simplify(geo, targetTris) {
  await MeshoptSimplifier.ready;
  const positions = geo.attributes.position.array;
  const [idx] = MeshoptSimplifier.simplify(Uint32Array.from(geo.index.array), positions, 3, targetTris * 3, 0.01);
  const remap = new Map(), outPos = [], outIdx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let r = remap.get(idx[i]);
    if (r === undefined) {
      r = remap.size; remap.set(idx[i], r);
      outPos.push(positions[idx[i] * 3], positions[idx[i] * 3 + 1], positions[idx[i] * 3 + 2]);
    }
    outIdx[i] = r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  g.setIndex(new THREE.BufferAttribute(outIdx, 1));
  return g;
}

function write(name, geo) {
  const pos = Float32Array.from(geo.attributes.position.array);
  const idx = Uint32Array.from(geo.index.array);
  const header = new Uint32Array([pos.length / 3, idx.length]);
  const file = path.join(outDir, `${name}.bin`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(header.buffer), Buffer.from(pos.buffer), Buffer.from(idx.buffer)]));
  console.log(`${name}: ${pos.length / 3} 顶点 / ${idx.length / 3} 面 → ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

const head = normalize(closeCavities(toMerged(parseGlb(await fetchGlb('head')))), HEAD_HEIGHT);
write('head', head);

const skull = normalize(await simplify(toMerged(parseGlb(await fetchGlb('skull'))), SKULL_TRIS), 1);
const cb = topBox(head, 0.55);
const k = (cb.max.x - cb.min.x) * 0.92 / (skull.boundingBox.max.x - skull.boundingBox.min.x);
skull.scale(k, k, k);
skull.computeBoundingBox();
skull.translate(0, cb.max.y - skull.boundingBox.max.y - 0.04,
  (cb.min.z + cb.max.z) / 2 - (skull.boundingBox.min.z + skull.boundingBox.max.z) / 2);
write('skull', skull);
