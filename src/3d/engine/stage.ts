import * as THREE from 'three';
import { applyLighting, type LightingPreset } from '../lighting';
import { setRenderQuality, type Quality } from '../materials';

/**
 * Reusable 3D stage foundation shared by every Three.js game.
 *
 * Owns the WebGL renderer, scene, camera, lights, resize handling, the
 * animation loop (tweens + timers that respect pause), pointer raycasting
 * and WebGL failure handling. Games build content into `stage.scene` and
 * drive movement with `stage.tween` / `stage.delay`.
 *
 * The stage canvas sits *underneath* the transparent Phaser canvas (z-index 1
 * vs 2), so the shared HUD always draws on top of the 3D world and pointer
 * events keep flowing through Phaser.
 */

export type { Quality };

export class WebGLUnavailableError extends Error {
  constructor(reason: string) {
    super(`WebGL unavailable: ${reason}`);
    this.name = 'WebGLUnavailableError';
  }
}

export interface StageOptions {
  /** Element the stage canvas is positioned over (usually #game-root). */
  parent: HTMLElement;
  /** Element whose on-screen rect the 3D canvas must match (Phaser canvas). */
  host: HTMLElement;
  designW: number;
  designH: number;
  quality?: Quality;
  lighting?: LightingPreset;
  onContextLost?: () => void;
}

interface Anim {
  elapsed: number;
  dur: number;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
  ease: (t: number) => number;
}

interface Timer {
  at: number;
  fn: () => void;
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Device capability probe -> low / medium / high render budget. */
export function detectQuality(): Quality {
  try {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
    if (coarse && (cores <= 4 || small || mem <= 3)) return 'low';
    if (coarse || cores <= 4 || small || mem <= 4) return 'medium';
    return 'high';
  } catch {
    return 'medium';
  }
}

const PIXEL_RATIO_CAP: Record<Quality, number> = { high: 2, medium: 1.5, low: 1 };

export class ThreeStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly quality: Quality;
  readonly designW: number;
  readonly designH: number;
  lighting: LightingPreset;

  private readonly parent: HTMLElement;
  private readonly host: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly anims: Anim[] = [];
  private readonly timers: Timer[] = [];
  private updateHooks: ((dt: number, now: number) => void)[] = [];
  private raf = 0;
  private running = false;
  private lastT = 0;
  private time = 0;
  private ro: ResizeObserver | null = null;
  private disposed = false;

  constructor(opts: StageOptions) {
    this.parent = opts.parent;
    this.host = opts.host;
    this.designW = opts.designW;
    this.designH = opts.designH;
    this.quality = opts.quality ?? detectQuality();
    this.lighting = opts.lighting ?? 'day';
    setRenderQuality(this.quality);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: this.quality === 'high',
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[this.quality]));
      if (!renderer.getContext()) throw new Error('no context');
    } catch (err) {
      throw new WebGLUnavailableError(err instanceof Error ? err.message : String(err));
    }
    this.renderer = renderer;

    this.canvas = renderer.domElement;
    this.canvas.style.position = 'absolute';
    this.canvas.style.zIndex = '1';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.left = '0px';
    this.canvas.style.top = '0px';
    this.canvas.setAttribute('data-three-stage', '1');

    this.scene = new THREE.Scene();

    const aspect = opts.designW / opts.designH;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 320);
    this.camera.position.set(0, 17.6, 13.4);
    this.camera.lookAt(0, 0, 1.1);

    applyLighting(this.scene, this.lighting, this.quality);

    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.parent.appendChild(this.canvas);
    this.syncLayout();

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      opts.onContextLost?.();
    });

    try {
      this.ro = new ResizeObserver(() => this.syncLayout());
      this.ro.observe(this.host);
    } catch {
      window.addEventListener('resize', this.syncLayout);
    }
  }

  /** Swap the lighting preset + sky at runtime. */
  setLighting(preset: LightingPreset): void {
    this.lighting = preset;
    applyLighting(this.scene, preset, this.quality);
  }

  /** Match the 3D canvas rect to the host canvas rect (Phaser FIT scaling). */
  readonly syncLayout = (): void => {
    if (this.disposed) return;
    try {
      const hr = this.host.getBoundingClientRect();
      const pr = this.parent.getBoundingClientRect();
      const w = Math.max(1, Math.round(hr.width));
      const h = Math.max(1, Math.round(hr.height));
      this.canvas.style.left = `${Math.round(hr.left - pr.left)}px`;
      this.canvas.style.top = `${Math.round(hr.top - pr.top)}px`;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[this.quality]));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    } catch {
      /* layout must never crash the game */
    }
  };

  onUpdate(fn: (dt: number, now: number) => void): void {
    this.updateHooks.push(fn);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.time += dt * 1000;
      this.tick(dt);
      try {
        this.renderer.render(this.scene, this.camera);
      } catch {
        /* a render error must not kill the loop silently forever */
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** True while the render loop is running (i.e. not paused). */
  get isRunning(): boolean {
    return this.running;
  }

  /** Milliseconds of stage time (frozen while stopped). */
  get now(): number {
    return this.time;
  }

  private tick(dt: number): void {
    const ms = dt * 1000;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].at) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        try {
          fn();
        } catch {
          /* timer errors are contained */
        }
      }
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.elapsed += ms;
      const k = a.dur <= 0 ? 1 : Math.min(1, a.elapsed / a.dur);
      try {
        a.onUpdate(a.ease(k));
      } catch {
        /* contained */
      }
      if (k >= 1) {
        this.anims.splice(i, 1);
        try {
          a.onComplete?.();
        } catch {
          /* contained */
        }
      }
    }
    for (const fn of this.updateHooks) {
      try {
        fn(dt, this.time);
      } catch {
        /* contained */
      }
    }
  }

  /** Pause-aware timer (frozen while the stage is stopped). */
  delay(ms: number, fn: () => void): void {
    this.timers.push({ at: this.time + ms, fn });
  }

  /** Pause-aware tween. */
  tween(opts: {
    dur: number;
    onUpdate: (t: number) => void;
    onComplete?: () => void;
    ease?: (t: number) => number;
  }): void {
    this.anims.push({
      elapsed: 0,
      dur: opts.dur,
      onUpdate: opts.onUpdate,
      onComplete: opts.onComplete,
      ease: opts.ease ?? easeOutCubic,
    });
  }

  clearScheduled(): void {
    this.timers.length = 0;
    this.anims.length = 0;
  }

  /* ---------------- pointer / picking ---------------- */

  /** Browser client coords -> design-space coords. */
  clientToDesign(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * this.designW,
      y: ((clientY - r.top) / r.height) * this.designH,
    };
  }

  /** Convert design-space coords to an NDC ray and intersect targets. */
  pick(designX: number, designY: number, targets: THREE.Object3D[]): THREE.Object3D | null {
    this.pointer.set((designX / this.designW) * 2 - 1, -((designY / this.designH) * 2 - 1));
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData && obj.userData.pick) return obj;
        obj = obj.parent;
      }
    }
    return null;
  }

  /** Raw raycast helpers for drag/placement (no userData.pick requirement). */
  raycast(designX: number, designY: number, targets: THREE.Object3D[]): THREE.Intersection[] {
    this.pointer.set((designX / this.designW) * 2 - 1, -((designY / this.designH) * 2 - 1));
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(targets, true);
  }

  /** Intersect a design-space pointer with a world plane (drag/placement). */
  planeHit(
    designX: number,
    designY: number,
    plane: THREE.Plane,
    out?: THREE.Vector3
  ): THREE.Vector3 | null {
    this.pointer.set((designX / this.designW) * 2 - 1, -((designY / this.designH) * 2 - 1));
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const target = out ?? new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, target) ? target : null;
  }

  /** Project a world position to design-space coords (null if behind camera). */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.designW, y: ((1 - v.y) / 2) * this.designH };
  }

  /** Read a pixel from the 3D canvas (design-space coords). Test helper. */
  readPixel(designX: number, designY: number): [number, number, number, number] {
    const gl = this.renderer.getContext();
    const bw = this.renderer.domElement.width;
    const bh = this.renderer.domElement.height;
    const px = Math.max(0, Math.min(bw - 1, Math.floor((designX / this.designW) * bw)));
    const py = Math.max(0, Math.min(bh - 1, Math.floor((1 - designY / this.designH) * bh)));
    const buf = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return [buf[0], buf[1], buf[2], buf[3]];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.clearScheduled();
    this.updateHooks = [];
    try {
      this.ro?.disconnect();
    } catch {
      /* ignore */
    }
    window.removeEventListener('resize', this.syncLayout);
    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      const mat = (m as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(mat)) mat.forEach((mm) => !mm.userData.shared && mm.dispose());
      else if (mat && !mat.userData.shared) mat.dispose();
    });
    this.renderer.dispose();
    this.canvas.remove();
  }
}

export { easeInOutQuad, easeOutCubic };
