import * as THREE from 'three';
import type { ThreeStage } from './engine/stage';

/**
 * Reusable camera rig: smooth follow, shake, zoom, cinematic intro and the
 * shared victory orbit. Games never touch `stage.camera` directly - they ask
 * the rig, which keeps every camera move tweened and pause-aware.
 */

export interface FollowOpts {
  /** Camera height above the target. */
  height?: number;
  /** How far behind the target the camera sits (along -target forward). */
  distance?: number;
  /** 0..1 smoothing per second (higher = snappier). */
  lerp?: number;
  /** Camera looks slightly ahead of the target along its velocity. */
  lookAhead?: number;
  /** Keep world axes (no yaw follow) - good for side runners. */
  worldAligned?: boolean;
  lookOffset?: THREE.Vector3;
}

export type Vec3 = [number, number, number] | THREE.Vector3;

function v(p: Vec3): THREE.Vector3 {
  return p instanceof THREE.Vector3 ? p : new THREE.Vector3(p[0], p[1], p[2]);
}

export class CameraRig {
  readonly stage: ThreeStage;
  private target: THREE.Object3D | null = null;
  private follow: FollowOpts = {};
  private offset = new THREE.Vector3();
  private shakeAmp = 0;
  private shakeT = 0;
  private introRunning = false;
  private orbit: { center: THREE.Vector3; radius: number; height: number; speed: number; angle: number } | null = null;
  private lookAt = new THREE.Vector3(0, 0, 0);
  private desired = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private baseFov: number;

  constructor(stage: ThreeStage) {
    this.stage = stage;
    this.baseFov = stage.camera.fov;
    this.lookAt.set(0, 0, 0);
  }

  /** Hard-set pose + look target (no tween). */
  setPose(pos: Vec3, look: Vec3): void {
    this.stage.camera.position.copy(v(pos));
    this.lookAt.copy(v(look));
    this.stage.camera.lookAt(this.lookAt);
    this.desired.copy(this.stage.camera.position);
    this.desiredLook.copy(this.lookAt);
  }

  get lookTarget(): THREE.Vector3 {
    return this.lookAt;
  }

  followTarget(obj: THREE.Object3D | null, opts: FollowOpts = {}): void {
    this.target = obj;
    this.follow = { height: 6, distance: 9, lerp: 3.5, lookAhead: 0, worldAligned: false, ...opts };
    this.offset.set(0, this.follow.height!, this.follow.distance!);
  }

  followPoint(get: () => THREE.Vector3 | null, opts: FollowOpts = {}): void {
    this.target = null;
    this.pointGetter = get;
    this.follow = { height: 6, distance: 9, lerp: 3.5, lookAhead: 0, worldAligned: true, ...opts };
    this.offset.set(0, this.follow.height!, this.follow.distance!);
  }

  private pointGetter: (() => THREE.Vector3 | null) | null = null;

  unfollow(): void {
    this.target = null;
    this.pointGetter = null;
  }

  /** Cinematic start: pull back from `from`, settle into the gameplay pose. */
  intro(opts: { from?: Vec3; fromLook?: Vec3; dur?: number; onDone?: () => void } = {}): void {
    const cam = this.stage.camera;
    const endPos = cam.position.clone();
    const endLook = this.lookAt.clone();
    const startPos = v(opts.from ?? [endPos.x * 1.45 + 2, endPos.y * 1.7 + 5, endPos.z * 1.5 + 6]);
    const startLook = v(opts.fromLook ?? endLook);
    const dur = opts.dur ?? 850;
    this.introRunning = true;
    cam.position.copy(startPos);
    this.lookAt.copy(startLook);
    cam.lookAt(this.lookAt);
    this.stage.tween({
      dur,
      ease: (t) => 1 - Math.pow(1 - t, 3),
      onUpdate: (t) => {
        cam.position.lerpVectors(startPos, endPos, t);
        this.lookAt.lerpVectors(startLook, endLook, t);
        cam.lookAt(this.lookAt);
      },
      onComplete: () => {
        this.introRunning = false;
        this.desired.copy(endPos);
        this.desiredLook.copy(endLook);
        opts.onDone?.();
      },
    });
  }

  get isIntroing(): boolean {
    return this.introRunning;
  }

  shake(amount = 0.35, dur = 0.35): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  zoom(fov: number, dur = 400, onDone?: () => void): void {
    const cam = this.stage.camera;
    const from = cam.fov;
    this.stage.tween({
      dur,
      onUpdate: (t) => {
        cam.fov = from + (fov - from) * t;
        cam.updateProjectionMatrix();
      },
      onComplete: onDone,
    });
  }

  resetZoom(): void {
    this.zoom(this.baseFov, 300);
  }

  /** Slow victory orbit around a focus point. */
  victory(focus: THREE.Vector3, opts: { radius?: number; height?: number; dur?: number; onDone?: () => void } = {}): void {
    const radius = opts.radius ?? 7;
    const height = opts.height ?? 4.5;
    const startPos = this.stage.camera.position.clone();
    const angle0 = Math.atan2(startPos.z - focus.z, startPos.x - focus.x);
    this.orbit = { center: focus.clone(), radius, height, speed: 0.7, angle: angle0 };
    this.target = null;
    this.pointGetter = null;
    this.stage.tween({
      dur: opts.dur ?? 2600,
      ease: (t) => t,
      onUpdate: () => {
        /* driven in update() while orbit is set */
      },
      onComplete: () => {
        this.orbit = null;
        opts.onDone?.();
      },
    });
  }

  stopVictory(): void {
    this.orbit = null;
  }

  update(dt: number): void {
    const cam = this.stage.camera;
    if (this.introRunning) return;

    if (this.orbit) {
      const o = this.orbit;
      o.angle += o.speed * dt;
      this.desired.set(
        o.center.x + Math.cos(o.angle) * o.radius,
        o.center.y + o.height,
        o.center.z + Math.sin(o.angle) * o.radius
      );
      this.desiredLook.copy(o.center);
      cam.position.lerp(this.desired, Math.min(1, dt * 3));
      this.lookAt.lerp(this.desiredLook, Math.min(1, dt * 4));
      cam.lookAt(this.lookAt);
      this.applyShake(dt, cam);
      return;
    }

    let src: THREE.Vector3 | null = null;
    if (this.target) src = this.target.getWorldPosition(new THREE.Vector3());
    else if (this.pointGetter) src = this.pointGetter();
    if (!src) {
      this.applyShake(dt, cam);
      return;
    }

    const f = this.follow;
    const back = f.worldAligned ? new THREE.Vector3(0, 0, 1) : this.forwardOfTarget();
    this.desired
      .copy(src)
      .addScaledVector(back, f.distance ?? 9)
      .add(new THREE.Vector3(0, f.height ?? 6, 0));
    this.desiredLook.copy(src).add(new THREE.Vector3(0, f.lookOffset?.y ?? 1.0, 0));
    if (f.lookAhead) this.desiredLook.addScaledVector(back, f.lookAhead);

    const k = 1 - Math.exp(-(f.lerp ?? 3.5) * dt);
    cam.position.lerp(this.desired, k);
    this.lookAt.lerp(this.desiredLook, Math.min(1, k * 1.3));
    cam.lookAt(this.lookAt);
    this.applyShake(dt, cam);
  }

  private forwardOfTarget(): THREE.Vector3 {
    if (!this.target) return new THREE.Vector3(0, 0, 1);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.getWorldQuaternion(new THREE.Quaternion()));
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
    return fwd.normalize();
  }

  private applyShake(dt: number, cam: THREE.Camera): void {
    if (this.shakeT <= 0) return;
    this.shakeT -= dt;
    const decay = Math.max(0, this.shakeT);
    const a = this.shakeAmp * decay;
    cam.position.x += (Math.random() - 0.5) * a;
    cam.position.y += (Math.random() - 0.5) * a;
    if (this.shakeT <= 0) this.shakeAmp = 0;
  }
}
