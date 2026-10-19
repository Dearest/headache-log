import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PAIN_TYPE, PAIN_TYPES } from '../data';
import type { Mark } from '../types';
import { MAX_MARKS, dotFragment, dotVertex, holoFragment, holoVertex, skullFragment, skullVertex } from './shaders';

export type ViewName = 'front' | 'left' | 'right' | 'back' | 'top';
export interface Hit { x: number; y: number; z: number; nx: number; ny: number; nz: number; region: string }

const VIEWS: Record<ViewName, [number, number, number]> = {
  front: [0, 0.15, 1], left: [1, 0.15, 0], right: [-1, 0.15, 0], back: [0, 0.15, -1], top: [0, 1, 0.12],
};
const HEAD_OFFSET_Y = -0.55;

const meshCache = new Map<string, Promise<THREE.BufferGeometry>>();
function loadMesh(name: string) {
  let p = meshCache.get(name);
  if (!p) {
    p = fetch(`/models/${name}.bin`).then((r) => {
      if (!r.ok) throw new Error(`模型加载失败：${name}`);
      return r.arrayBuffer();
    }).then((buf) => {
      const [nv, ni] = new Uint32Array(buf, 0, 2);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 8, nv * 3), 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, 8 + nv * 12, ni), 1));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return geo;
    });
    meshCache.set(name, p);
  }
  return p;
}

function topBox(geo: THREE.BufferGeometry, depth: number) {
  const p = geo.attributes.position, top = geo.boundingBox!.max.y, box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.y > top - depth) box.expandByPoint(v); }
  return box;
}

export class HeadScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private timer = new THREE.Timer();
  private ro: ResizeObserver;
  private uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x3fb6ff) },
    uN: { value: 0 },
    uMP: { value: Array.from({ length: MAX_MARKS }, () => new THREE.Vector4()) },
    uMT: { value: Array.from({ length: MAX_MARKS }, () => new THREE.Vector4()) },
  };
  private head?: THREE.Mesh;
  private inner?: THREE.Mesh;
  private skull?: THREE.Mesh;
  private dots?: THREE.Points;
  private hb?: THREE.Box3;
  private showSkull = false;
  private tween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private downAt: [number, number] | null = null;
  private raycaster = new THREE.Raycaster();
  private disposed = false;
  private pendingMarks: Mark[] | null = null;
  private pendingDots: Mark[] | null = null;
  onTap?: (hit: Hit) => void;
  onReady?: () => void;

  constructor(private el: HTMLElement, private opts: { interactive: boolean; fit?: number }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x05080c);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, -0.35, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.enableZoom = opts.interactive;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 14;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.93, 96), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.95;
    const ring2 = ring.clone();
    ring2.material = ringMat.clone();
    ring2.scale.setScalar(1.35);
    (ring2.material as THREE.MeshBasicMaterial).opacity = 0.18;
    this.scene.add(ring, ring2);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.0, 0.5, 0.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    this.camera.position.set(0, 0.15, 1).setLength(this.fitDist()).add(this.controls.target);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);

    this.load();
    this.renderer.setAnimationLoop(this.frame);
  }

  private async load() {
    const geo = await loadMesh('head');
    if (this.disposed) return;
    this.hb = topBox(geo, 1.15);
    const holo = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: holoVertex, fragmentShader: holoFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.head = new THREE.Mesh(geo, holo);
    this.inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x06131c, transparent: true, opacity: 0.85 }));
    this.inner.scale.setScalar(0.995);
    this.head.add(this.inner);
    this.head.position.y = HEAD_OFFSET_Y;
    this.scene.add(this.head);
    if (this.pendingMarks) this.setMarks(this.pendingMarks);
    if (this.pendingDots) this.setDots(this.pendingDots);
    if (this.showSkull) this.setSkull(true);
    this.onReady?.();
  }

  private fitDist() {
    const k = this.opts.fit ?? 1.2;
    return Math.max(4.6, k / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
  }

  private resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  private onDown = (e: PointerEvent) => {
    this.downAt = [e.clientX, e.clientY];
    this.controls.autoRotate = false;
  };

  private onUp = (e: PointerEvent) => {
    const down = this.downAt;
    this.downAt = null;
    if (!down || !this.opts.interactive || !this.head || !this.onTap) return;
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ptr = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ptr, this.camera);
    const hit = this.raycaster.intersectObject(this.head, false)[0];
    if (!hit?.face) return;
    const p = this.head.worldToLocal(hit.point.clone());
    const n = hit.face.normal;
    this.onTap({ x: p.x, y: p.y, z: p.z, nx: n.x, ny: n.y, nz: n.z, region: this.regionOf(p) });
  };

  regionOf(p: THREE.Vector3) {
    const hb = this.hb!;
    const ny = (p.y - hb.min.y) / (hb.max.y - hb.min.y);
    const nx = (p.x - (hb.min.x + hb.max.x) / 2) / ((hb.max.x - hb.min.x) / 2);
    const nz = (p.z - (hb.min.z + hb.max.z) / 2) / ((hb.max.z - hb.min.z) / 2);
    const side = nx > 0 ? '左' : '右', lat = Math.abs(nx);
    if (ny > 0.85) return lat < 0.5 ? '头顶' : `${side}侧头顶`;
    if (nz > 0.55) {
      if (ny > 0.5) return lat > 0.4 ? `${side}额角` : '前额';
      if (ny > 0.15) return lat > 0.2 ? `${side}眼眶` : '眉心 / 鼻根';
      return ny > -0.15 ? `${side}面颊` : '下颌';
    }
    if (nz < -0.55) {
      if (ny > 0.55) return lat > 0.35 ? `${side}后脑上部` : '后脑勺上部';
      if (ny > 0.25) return lat > 0.3 ? `${side}枕部` : '后脑勺（枕部）';
      return '枕下 / 后颈';
    }
    if (nz > 0.1 && ny > 0.3) return `${side}太阳穴（颞部）`;
    if (ny > 0.5) return `${side}侧头部`;
    if (ny > 0) return nz < -0.2 ? `${side}耳后` : `${side}耳上 / 耳前`;
    return `${side}耳下 / 下颌角`;
  }

  setMarks(marks: Mark[]) {
    if (!this.head) { this.pendingMarks = marks; return; }
    const list = marks.slice(0, MAX_MARKS);
    this.uniforms.uN.value = list.length;
    const typeIndex = (t: Mark['type']) => PAIN_TYPES.findIndex((p) => p.id === t);
    list.forEach((m, i) => {
      this.uniforms.uMP.value[i].set(m.x, m.y, m.z, PAIN_TYPE[m.type].radius);
      this.uniforms.uMT.value[i].set(m.nx, m.ny, m.nz, typeIndex(m.type));
    });
  }

  setDots(marks: Mark[]) {
    if (!this.head) { this.pendingDots = marks; return; }
    if (this.dots) {
      this.head.remove(this.dots);
      this.dots.geometry.dispose();
    }
    const pos = new Float32Array(marks.length * 3), col = new Float32Array(marks.length * 3);
    const c = new THREE.Color();
    marks.forEach((m, i) => {
      pos.set([m.x + m.nx * 0.02, m.y + m.ny * 0.02, m.z + m.nz * 0.02], i * 3);
      c.set(PAIN_TYPE[m.type].color).toArray(col, i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dots = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 260 * Math.min(devicePixelRatio, 2) } },
      vertexShader: dotVertex, fragmentShader: dotFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.head.add(this.dots);
  }

  async setSkull(on: boolean) {
    this.showSkull = on;
    if (!this.head || !this.inner) return;
    this.inner.visible = !on;
    if (on && !this.skull) {
      const geo = await loadMesh('skull');
      if (this.disposed || this.skull) return;
      this.skull = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x1f5f86) } },
        vertexShader: skullVertex, fragmentShader: skullFragment,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.head.add(this.skull);
    }
    if (this.skull) this.skull.visible = this.showSkull;
  }

  setView(v: ViewName) {
    this.controls.autoRotate = false;
    const to = new THREE.Vector3(...VIEWS[v]).normalize().multiplyScalar(this.fitDist());
    this.tween = { from: this.camera.position.clone().sub(this.controls.target), to, t: 0 };
  }

  private frame = () => {
    this.timer.update();
    const dt = this.timer.getDelta();
    this.uniforms.uTime.value = this.timer.getElapsed();
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt * 2.2);
      const k = 1 - Math.pow(1 - tw.t, 3);
      const v = tw.from.clone().lerp(tw.to, k).setLength(THREE.MathUtils.lerp(tw.from.length(), tw.to.length(), k));
      this.camera.position.copy(this.controls.target).add(v);
      if (tw.t === 1) this.tween = null;
    }
    this.controls.update();
    this.composer.render();
  };

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    });
    this.dots?.geometry.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
