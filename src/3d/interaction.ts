import * as THREE from 'three';
import { audio, type SfxName } from '../core/AudioManager';
import type { ThreeStage } from './engine/stage';

/**
 * Raycast-driven interaction layer shared by every 3D game.
 *
 * Games register objects with a kind (tap / drag / rotatable / bounce / door /
 * switch / button / chest / character / environment) and the scene forwards
 * pointer events here. Selection, dragging, highlighting and click sounds are
 * handled once instead of per game.
 */

export type InteractKind =
  | 'tap'
  | 'drag'
  | 'rotatable'
  | 'bounce'
  | 'door'
  | 'switch'
  | 'button'
  | 'chest'
  | 'character'
  | 'environment';

export interface InteractEvent {
  object: THREE.Object3D;
  interactable: Interactable;
  designX: number;
  designY: number;
  world: THREE.Vector3;
  /** Current drag point (drag events only). */
  point?: THREE.Vector3;
}

export interface InteractOpts {
  kind?: InteractKind;
  onTap?: (e: InteractEvent) => void;
  onDown?: (e: InteractEvent) => void;
  onDragStart?: (e: InteractEvent) => void;
  onDrag?: (e: InteractEvent) => void;
  onDragEnd?: (e: InteractEvent) => void;
  onActivate?: (e: InteractEvent) => void;
  onRotate?: (deltaRad: number, e: InteractEvent) => void;
  onBounce?: (e: InteractEvent) => void;
  enabled?: boolean;
  highlight?: boolean;
  sound?: SfxName;
  /** Drag constraint: horizontal plane at `y`, or camera-facing plane. */
  dragPlane?: { y: number } | 'screen';
  /** Marks an object as consumed (e.g. bubble popped) - ignores further input. */
  active?: boolean;
}

export class Interactable {
  readonly object: THREE.Object3D;
  readonly opts: InteractOpts;
  enabled = true;
  highlighted = false;
  active: boolean;
  private original: Map<THREE.Mesh, THREE.Material> | null = null;
  private clones: THREE.Mesh[] = [];
  private t = Math.random() * 6;

  constructor(object: THREE.Object3D, opts: InteractOpts) {
    this.object = object;
    this.opts = opts;
    this.enabled = opts.enabled !== false;
    this.active = opts.active ?? true;
  }

  setHighlight(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    if (on) {
      const orig = new Map<THREE.Mesh, THREE.Material>();
      this.original = orig;
      this.clones = [];
      this.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.material) return;
        const mat = m.material as THREE.Material;
        const clone = mat.clone();
        clone.userData = { ...mat.userData, shared: false };
        if ((clone as THREE.MeshPhongMaterial).emissive) {
          const pm = clone as THREE.MeshPhongMaterial;
          pm.emissive = pm.emissive.clone();
          pm.emissive.setHex(0x665511);
        }
        orig.set(m, mat);
        m.material = clone;
        this.clones.push(m);
      });
    } else {
      this.original?.forEach((mat, mesh) => {
        (mesh.material as THREE.Material)?.dispose?.();
        mesh.material = mat;
      });
      this.original = null;
      this.clones = [];
    }
  }

  pulse(dt: number): void {
    if (!this.highlighted) return;
    this.t += dt;
    const k = 0.55 + Math.sin(this.t * 6) * 0.4;
    for (const m of this.clones) {
      const pm = (m.material as THREE.MeshPhongMaterial) ?? null;
      if (pm && pm.emissive) pm.emissiveIntensity = k;
    }
  }

  dispose(): void {
    this.setHighlight(false);
  }
}

export class InteractionManager {
  private readonly stage: ThreeStage;
  private readonly items = new Map<THREE.Object3D, Interactable>();
  private readonly order: Interactable[] = [];
  private dragging: Interactable | null = null;
  private dragOffset = new THREE.Vector3();
  private dragPlane = new THREE.Plane();
  private lastWorld = new THREE.Vector3();
  private downPos = { x: 0, y: 0 };

  constructor(stage: ThreeStage) {
    this.stage = stage;
  }

  add(obj: THREE.Object3D, opts: InteractOpts = {}): Interactable {
    const it = new Interactable(obj, opts);
    this.items.set(obj, it);
    this.order.push(it);
    obj.userData.interactable = it;
    return it;
  }

  remove(obj: THREE.Object3D): void {
    const it = this.items.get(obj);
    if (!it) return;
    it.dispose();
    this.items.delete(obj);
    const i = this.order.indexOf(it);
    if (i >= 0) this.order.splice(i, 1);
    if (this.dragging === it) this.dragging = null;
    delete obj.userData.interactable;
  }

  get(obj: THREE.Object3D): Interactable | undefined {
    return this.items.get(obj);
  }

  setEnabled(obj: THREE.Object3D, on: boolean): void {
    const it = this.items.get(obj);
    if (it) it.enabled = on;
  }

  highlight(obj: THREE.Object3D, on: boolean): void {
    this.items.get(obj)?.setHighlight(on);
  }

  clear(): void {
    this.order.forEach((it) => it.dispose());
    this.items.clear();
    this.order.length = 0;
    this.dragging = null;
  }

  get count(): number {
    return this.order.length;
  }

  /** Find the registered interactable under a design-space pointer. */
  pick(dx: number, dy: number): { item: Interactable; point: THREE.Vector3 } | null {
    const roots = this.order.filter((i) => i.enabled && i.active).map((i) => i.object);
    if (!roots.length) return null;
    const hits = this.stage.raycast(dx, dy, roots);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        const it = this.items.get(o);
        if (it && it.enabled && it.active) return { item: it, point: hit.point.clone() };
        o = o.parent;
      }
    }
    return null;
  }

  private eventFor(item: Interactable, dx: number, dy: number, point: THREE.Vector3): InteractEvent {
    return { object: item.object, interactable: item, designX: dx, designY: dy, world: point.clone() };
  }

  handleDown(dx: number, dy: number): boolean {
    this.downPos = { x: dx, y: dy };
    const hit = this.pick(dx, dy);
    if (!hit) return false;
    const item = hit.item;
    const e = this.eventFor(item, dx, dy, hit.point);

    if (item.opts.sound) audio.play(item.opts.sound);
    item.opts.onDown?.(e);

    if (item.opts.kind === 'drag') {
      this.dragging = item;
      const targetY = item.opts.dragPlane === 'screen' ? 0 : (item.opts.dragPlane as { y: number } | undefined)?.y ?? item.object.position.y;
      if (item.opts.dragPlane === 'screen') {
        const n = new THREE.Vector3();
        this.stage.camera.getWorldDirection(n);
        this.dragPlane.setFromNormalAndCoplanarPoint(n, item.object.position);
      } else {
        this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, targetY, 0));
      }
      const p = this.stage.planeHit(dx, dy, this.dragPlane, new THREE.Vector3());
      if (p) this.dragOffset.copy(item.object.position).sub(p);
      item.opts.onDragStart?.(e);
    } else if (item.opts.kind === 'rotatable') {
      this.dragging = item;
    }
    return true;
  }

  handleMove(dx: number, dy: number): boolean {
    if (!this.dragging) return false;
    const item = this.dragging;
    if (item.opts.kind === 'drag') {
      const p = this.stage.planeHit(dx, dy, this.dragPlane, new THREE.Vector3());
      if (p) {
        p.add(this.dragOffset);
        this.lastWorld.copy(p);
        item.opts.onDrag?.(this.eventFor(item, dx, dy, p));
      }
    } else if (item.opts.kind === 'rotatable') {
      const dxp = dx - this.downPos.x;
      this.downPos.x = dx;
      item.opts.onRotate?.(dxp * 0.01, this.eventFor(item, dx, dy, item.object.position));
    }
    return true;
  }

  handleUp(dx: number, dy: number): void {
    const item = this.dragging;
    if (item) {
      const e = this.eventFor(item, dx, dy, this.lastWorld);
      if (item.opts.kind === 'drag') item.opts.onDragEnd?.(e);
      this.dragging = null;
      return;
    }
    const hit = this.pick(dx, dy);
    if (!hit) return;
    const item2 = hit.item;
    const e = this.eventFor(item2, dx, dy, hit.point);
    const movedDist = Math.hypot(dx - this.downPos.x, dy - this.downPos.y);
    if (movedDist > 26 && item2.opts.kind === 'tap') return;

    switch (item2.opts.kind) {
      case 'door':
      case 'switch':
      case 'button':
      case 'chest':
        item2.opts.onActivate?.(e);
        item2.opts.onTap?.(e);
        break;
      case 'bounce':
        item2.opts.onBounce?.(e);
        item2.opts.onTap?.(e);
        break;
      default:
        item2.opts.onTap?.(e);
        break;
    }
  }

  update(dt: number): void {
    for (const it of this.order) if (it.highlighted) it.pulse(dt);
  }
}

/** Friendly cartoon "ragdoll-lite" reaction: tip over and spring back. */
export function tumbleReaction(obj: THREE.Object3D, strength = 1): void {
  obj.rotation.z += (Math.random() > 0.5 ? 1 : -1) * 0.7 * strength;
  obj.rotation.x += (Math.random() - 0.5) * 0.5 * strength;
}
