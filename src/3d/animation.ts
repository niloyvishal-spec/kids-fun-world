import * as THREE from 'three';

/**
 * Procedural character animation controller.
 *
 * Characters in this collection are built from lightweight low-poly part
 * hierarchies (no skeletal data), so every clip is evaluated per frame from a
 * shared pose description. Games drive it with:
 *
 *   character.play('jump');
 *   character.play('celebrate');
 *
 * The controller only ever touches `body / head / arms / legs / eyes` - never
 * `root` - so gameplay code stays free to move the character through the
 * world while it animates.
 */

export interface CharacterRig {
  /** Whole character; moved by gameplay code. */
  root: THREE.Group;
  /** Torso (bob / lean / breathing). */
  body: THREE.Object3D;
  head: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  tail?: THREE.Object3D;
  /** Eye groups; scaled on Y to blink. */
  eyes?: THREE.Object3D[];
  extras?: Record<string, THREE.Object3D | undefined>;
}

export type AnimName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'wave'
  | 'dance'
  | 'celebrate'
  | 'happy'
  | 'sad'
  | 'sleep'
  | 'interact'
  | 'bounce'
  | 'none';

interface ClipDef {
  dur: number;
  loop: boolean;
}

const CLIPS: Record<AnimName, ClipDef> = {
  idle: { dur: 0, loop: true },
  walk: { dur: 0, loop: true },
  run: { dur: 0, loop: true },
  jump: { dur: 0.85, loop: false },
  fall: { dur: 0, loop: true },
  wave: { dur: 1.4, loop: false },
  dance: { dur: 0, loop: true },
  celebrate: { dur: 0, loop: true },
  happy: { dur: 1.1, loop: false },
  sad: { dur: 0, loop: true },
  sleep: { dur: 0, loop: true },
  interact: { dur: 1.0, loop: false },
  bounce: { dur: 0, loop: true },
  none: { dur: 0, loop: true },
};

interface PartRest {
  obj: THREE.Object3D;
  rot: THREE.Euler;
  pos: THREE.Vector3;
}

interface RigState {
  parts: PartRest[];
  eyeRestY: number[];
}

const restCache = new WeakMap<CharacterRig, RigState>();

function captureRest(rig: CharacterRig): RigState {
  const hit = restCache.get(rig);
  if (hit) return hit;
  const parts: PartRest[] = [];
  const push = (o?: THREE.Object3D): void => {
    if (o) parts.push({ obj: o, rot: o.rotation.clone(), pos: o.position.clone() });
  };
  push(rig.body);
  push(rig.head);
  push(rig.armL);
  push(rig.armR);
  push(rig.legL);
  push(rig.legR);
  push(rig.tail);
  const eyeRestY = (rig.eyes ?? []).map((e) => e.scale.y || 1);
  const st: RigState = { parts, eyeRestY };
  restCache.set(rig, st);
  return st;
}

export interface PlayOpts {
  loop?: boolean;
  speed?: number;
  onEnd?: () => void;
}

export class AnimController {
  private readonly rig: CharacterRig;
  private rest: RigState;
  private currentAnim: AnimName = 'idle';
  private clipTime = 0;
  private clipDur = 0;
  private clipLoop = true;
  private onEnd: (() => void) | null = null;
  private clock = 0;
  private speedScale = 1;
  private blinkIn = 2;
  private blinkT = 0;
  private gaze: THREE.Vector3 | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(rig: CharacterRig) {
    this.rig = rig;
    this.rest = captureRest(rig);
  }

  get current(): AnimName {
    return this.currentAnim;
  }

  get phase(): number {
    return this.clock;
  }

  setSpeedScale(mult: number): void {
    this.speedScale = Math.max(0.1, mult);
  }

  /** Smoothly follow a world point with the head (null to release). */
  lookAtPoint(p: THREE.Vector3 | null): void {
    this.gaze = p ? p.clone() : null;
  }

  /** Blend idle / walk / run from a horizontal speed (world units/second). */
  setLocomotion(speed: number): void {
    const auto = this.currentAnim === 'idle' || this.currentAnim === 'walk' || this.currentAnim === 'run';
    if (!auto) return;
    const next: AnimName = speed < 0.15 ? 'idle' : speed < 4.5 ? 'walk' : 'run';
    if (next !== this.currentAnim) this.play(next);
  }

  play(name: AnimName, opts: PlayOpts = {}): void {
    const def = CLIPS[name] ?? CLIPS.idle;
    this.currentAnim = name;
    this.clipTime = 0;
    this.clipLoop = opts.loop ?? def.loop;
    this.clipDur = def.dur;
    this.onEnd = opts.onEnd ?? null;
    if (name === 'jump' || name === 'happy' || name === 'interact') {
      // one-shot clips are scaled by the caller's speed
      this.clipDur = def.dur / (opts.speed ?? 1);
    }
  }

  /** Convenience: true when a one-shot clip is still playing. */
  get busy(): boolean {
    return !this.clipLoop && this.clipTime < this.clipDur;
  }

  update(dt: number): void {
    const d = Math.min(0.05, dt) * this.speedScale;
    this.clock += d;
    this.clipTime += d;

    if (!this.clipLoop && this.clipDur > 0 && this.clipTime >= this.clipDur) {
      const cb = this.onEnd;
      this.onEnd = null;
      this.play('idle');
      cb?.();
    }

    const t = this.clock;
    const body = this.rig.body;
    const head = this.rig.head;
    const armL = this.rig.armL;
    const armR = this.rig.armR;
    const legL = this.rig.legL;
    const legR = this.rig.legR;
    const tail = this.rig.tail;

    // ---- reset to rest pose -------------------------------------
    for (const p of this.rest.parts) {
      p.obj.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      p.obj.position.set(p.pos.x, p.pos.y, p.pos.z);
    }

    const breathe = Math.sin(t * 2.1);
    let eyesClosed = false;

    switch (this.currentAnim) {
      case 'idle': {
        body.position.y += breathe * 0.03;
        body.scale.y = 1 + breathe * 0.015;
        head.rotation.y += Math.sin(t * 1.15) * 0.14;
        head.rotation.x += Math.sin(t * 0.83) * 0.05;
        armL && (armL.rotation.x += Math.sin(t * 2.1) * 0.07);
        armR && (armR.rotation.x += Math.sin(t * 2.1 + 0.4) * 0.07);
        tail && (tail.rotation.y = Math.sin(t * 2.4) * 0.35);
        break;
      }
      case 'walk': {
        const p = t * 7;
        const s = Math.sin(p);
        if (legL) legL.rotation.x += s * 0.7;
        if (legR) legR.rotation.x += -s * 0.7;
        if (armL) armL.rotation.x += -s * 0.5;
        if (armR) armR.rotation.x += s * 0.5;
        body.position.y += Math.abs(Math.sin(p)) * 0.05;
        body.rotation.x += 0.06;
        head.rotation.x += -0.03;
        tail && (tail.rotation.y = Math.sin(p * 0.5) * 0.3);
        break;
      }
      case 'run': {
        const p = t * 10.5;
        const s = Math.sin(p);
        if (legL) legL.rotation.x += s * 1.0;
        if (legR) legR.rotation.x += -s * 1.0;
        if (armL) armL.rotation.x += -s * 0.9;
        if (armR) armR.rotation.x += s * 0.9;
        body.position.y += Math.abs(Math.sin(p)) * 0.09;
        body.rotation.x += 0.2;
        head.rotation.x += -0.1;
        tail && (tail.rotation.y = Math.sin(p * 0.5) * 0.45);
        break;
      }
      case 'jump': {
        const k = this.clipDur > 0 ? this.clipTime / this.clipDur : 0;
        const up = Math.sin(Math.min(1, k) * Math.PI);
        if (legL) legL.rotation.x += -0.6 * up;
        if (legR) legR.rotation.x += -0.35 * up;
        if (armL) armL.rotation.z += 1.9 * up;
        if (armR) armR.rotation.z += -1.9 * up;
        body.rotation.x += -0.12 * up;
        head.rotation.x += -0.15 * up;
        tail && (tail.rotation.x += -0.7 * up);
        break;
      }
      case 'fall': {
        if (armL) armL.rotation.z += 1.3;
        if (armR) armR.rotation.z += -1.3;
        if (legL) legL.rotation.x += 0.3;
        if (legR) legR.rotation.x += -0.3;
        body.rotation.x += 0.1;
        head.rotation.x += 0.12;
        break;
      }
      case 'wave': {
        const k = Math.min(1, this.clipTime / 0.3);
        if (armR) {
          armR.rotation.z += -2.3 * k;
          armR.rotation.x += Math.sin(t * 11) * 0.45 * k;
        }
        if (armL) armL.rotation.x += 0.1;
        head.rotation.z += Math.sin(t * 11) * 0.07;
        body.position.y += breathe * 0.04;
        break;
      }
      case 'dance': {
        const p = t * 6;
        body.rotation.y += Math.sin(p * 0.5) * 0.34;
        body.position.y += Math.abs(Math.sin(p * 0.5)) * 0.09;
        if (armL) {
          armL.rotation.z += 1.5 + Math.sin(p * 0.5) * 0.7;
          armL.rotation.x += Math.sin(p) * 0.3;
        }
        if (armR) {
          armR.rotation.z += -1.5 - Math.cos(p * 0.5) * 0.7;
          armR.rotation.x += Math.cos(p) * 0.3;
        }
        if (legL) legL.rotation.x += Math.sin(p) * 0.35;
        if (legR) legR.rotation.x += -Math.sin(p) * 0.35;
        head.rotation.z += Math.sin(p * 0.5) * 0.16;
        tail && (tail.rotation.y = Math.sin(p * 0.5) * 0.6);
        break;
      }
      case 'celebrate': {
        const p = t * 6.5;
        body.position.y += Math.abs(Math.sin(p)) * 0.22;
        body.rotation.y += Math.sin(p * 0.5) * 0.18;
        if (armL) armL.rotation.z += 2.2 + Math.sin(p) * 0.25;
        if (armR) armR.rotation.z += -2.2 - Math.cos(p) * 0.25;
        if (legL) legL.rotation.x += Math.sin(p) * 0.4;
        if (legR) legR.rotation.x += -Math.sin(p) * 0.4;
        head.rotation.x += -0.16;
        tail && (tail.rotation.y = Math.sin(p * 2) * 0.6);
        break;
      }
      case 'happy':
      case 'bounce': {
        const p = t * 9;
        body.position.y += Math.abs(Math.sin(p)) * 0.16;
        body.scale.y = 1 + Math.sin(p * 2) * 0.04;
        if (armL) armL.rotation.z += 1.6 + Math.sin(p) * 0.3;
        if (armR) armR.rotation.z += -1.6 - Math.sin(p) * 0.3;
        head.rotation.x += -0.1;
        break;
      }
      case 'sad': {
        body.rotation.x += 0.16;
        body.position.y += -0.05 + Math.sin(t * 1.4) * 0.02;
        head.rotation.x += 0.34;
        head.rotation.z += Math.sin(t * 1.2) * 0.06;
        if (armL) armL.rotation.x += 0.18;
        if (armR) armR.rotation.x += 0.18;
        tail && (tail.rotation.x += 0.6);
        break;
      }
      case 'sleep': {
        body.position.y += breathe * 0.05;
        body.scale.y = 1 + breathe * 0.03;
        head.rotation.z += 0.3;
        head.rotation.x += 0.14;
        if (armL) armL.rotation.x += 0.2;
        if (armR) armR.rotation.x += 0.2;
        eyesClosed = true;
        break;
      }
      case 'interact': {
        const k = this.clipDur > 0 ? Math.min(1, this.clipTime / this.clipDur) : 1;
        const reach = Math.sin(Math.min(1, k) * Math.PI);
        if (armR) armR.rotation.x += -1.4 * reach;
        if (armL) armL.rotation.x += -0.5 * reach;
        body.rotation.x += 0.12 * reach;
        head.rotation.x += -0.12 * reach;
        break;
      }
      case 'none':
      default:
        break;
    }

    // ---- head gaze ------------------------------------------------
    if (this.gaze) {
      this.rig.root.getWorldPosition(this.tmp);
      const dx = this.gaze.x - this.tmp.x;
      const dy = this.gaze.y - (this.tmp.y + 1);
      const dz = this.gaze.z - this.tmp.z;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, Math.max(0.3, Math.hypot(dx, dz)));
      head.rotation.y += THREE.MathUtils.clamp(yaw, -0.7, 0.7);
      head.rotation.x += THREE.MathUtils.clamp(pitch, -0.5, 0.5);
    }

    // ---- blinking -------------------------------------------------
    const eyes = this.rig.eyes;
    if (eyes && eyes.length) {
      if (this.blinkT > 0) {
        this.blinkT -= dt;
        if (this.blinkT <= 0) this.applyBlink(eyes, false);
      } else {
        this.blinkIn -= dt;
        if (this.blinkIn <= 0) {
          this.applyBlink(eyes, true);
          this.blinkT = 0.12;
          this.blinkIn = 2.2 + Math.random() * 3;
        }
      }
      if (eyesClosed) this.applyBlink(eyes, true, true);
    }
  }

  private applyBlink(eyes: THREE.Object3D[], closed: boolean, sticky = false): void {
    eyes.forEach((e, i) => {
      const base = this.rest.eyeRestY[i] ?? e.scale.y ?? 1;
      e.scale.y = closed ? base * 0.1 : base;
    });
    if (sticky) this.blinkIn = 0.4;
  }

  /** Snap back to the rest pose (used when the character is destroyed). */
  reset(): void {
    for (const p of this.rest.parts) {
      p.obj.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      p.obj.position.set(p.pos.x, p.pos.y, p.pos.z);
      p.obj.scale.set(1, 1, 1);
    }
    (this.rig.eyes ?? []).forEach((e, i) => (e.scale.y = this.rest.eyeRestY[i] ?? 1));
    this.play('idle');
  }
}

/** Small wrapper so games can treat a character as one object. */
export interface AnimatedCharacter {
  root: THREE.Group;
  rig: CharacterRig;
  anim: AnimController;
  play(name: AnimName, opts?: PlayOpts): void;
  update(dt: number): void;
}

export function wrapCharacter(rig: CharacterRig): AnimatedCharacter {
  const anim = new AnimController(rig);
  return {
    root: rig.root,
    rig,
    anim,
    play(name, opts) {
      anim.play(name, opts);
    },
    update(dt) {
      anim.update(dt);
    },
  };
}
