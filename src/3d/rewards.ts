import * as THREE from 'three';
import { audio } from '../core/AudioManager';
import { PALETTE } from '../config';
import type { ThreeStage } from './engine/stage';
import {
  coinBurst,
  confettiBurst,
  sparkleBurst,
  victoryFireworks,
  type ParticleSystem,
} from './particles';
import { cachedGeo, GEO, glowMat, group, mesh, toyMat } from './materials';

/**
 * Shared 3D reward animations: chest openings, coins/stars flying to the HUD
 * counters, trophy pops, gift openings, fireworks and a spin-able reward wheel.
 */

function worldAtDesign(stage: ThreeStage, designX: number, designY: number, dist = 4): THREE.Vector3 {
  const ndc = new THREE.Vector3(
    (designX / stage.designW) * 2 - 1,
    -((designY / stage.designH) * 2 - 1),
    0.5
  ).unproject(stage.camera);
  const dir = ndc.sub(stage.camera.position).normalize();
  return stage.camera.position.clone().addScaledVector(dir, dist);
}

export class RewardFX {
  private readonly stage: ThreeStage;
  private readonly fx: ParticleSystem;

  constructor(stage: ThreeStage, fx: ParticleSystem) {
    this.stage = stage;
    this.fx = fx;
  }

  /** Chest lid opens, glows and throws coins + stars. */
  openChest(chest: THREE.Object3D, pos: THREE.Vector3, onOpen?: () => void): void {
    const lid = chest.userData.lid as THREE.Object3D | undefined;
    audio.play('reward');
    if (lid) {
      const from = lid.rotation.x;
      const to = from - 1.9;
      this.stage.tween({
        dur: 520,
        ease: (t) => 1 - Math.pow(1 - t, 3),
        onUpdate: (t) => {
          lid.rotation.x = from + (to - from) * t;
        },
      });
    }
    this.stage.delay(260, () => {
      sparkleBurst(this.fx, pos, { count: 26, speed: 5, life: 1.1, size: 0.5 });
      coinBurst(this.fx, { x: pos.x, y: pos.y + 0.6, z: pos.z }, { count: 18 });
      onOpen?.();
    });
  }

  /** Fly a coin/star from the world to a HUD design-space counter. */
  flyToHUD(
    from: THREE.Vector3,
    targetDesign: { x: number; y: number },
    opts: { kind?: 'coin' | 'star'; dur?: number; onArrive?: () => void } = {}
  ): void {
    const kind = opts.kind ?? 'coin';
    const obj: THREE.Object3D = kind === 'coin' ? this.makeCoin() : this.makeStar();
    obj.position.copy(from);
    this.stage.scene.add(obj);
    const to = worldAtDesign(this.stage, targetDesign.x, targetDesign.y, 3.2);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 2.4, 0));
    const start = from.clone();
    this.stage.tween({
      dur: opts.dur ?? 720,
      ease: (t) => t * t * (3 - 2 * t),
      onUpdate: (t) => {
        const a = start.clone().lerp(mid, t);
        const b = mid.clone().lerp(to, t);
        obj.position.copy(a.lerp(b, t));
        obj.rotation.y += 0.35;
        const s = 1 + t * 0.7;
        obj.scale.setScalar(s);
      },
      onComplete: () => {
        obj.removeFromParent();
        audio.play(kind === 'coin' ? 'coin' : 'star');
        sparkleBurst(this.fx, to, { count: 8, life: 0.4, size: 0.3 });
        opts.onArrive?.();
      },
    });
  }

  /** Trophy appears with a scale/bounce pop. */
  trophyReveal(pos: THREE.Vector3, scale = 1.4): THREE.Group {
    const t = this.makeTrophy();
    t.position.copy(pos);
    t.scale.setScalar(0.01);
    this.stage.scene.add(t);
    const target = scale;
    this.stage.tween({
      dur: 620,
      ease: (k) => {
        // elastic-ish back easing
        const c1 = 1.9;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      },
      onUpdate: (k) => t.scale.setScalar(Math.max(0.01, target * k)),
      onComplete: () => {
        sparkleBurst(this.fx, pos, { count: 20, speed: 4, life: 1 });
        audio.play('reward');
      },
    });
    this.stage.tween({
      dur: 2400,
      ease: (k) => k,
      onUpdate: () => {
        t.rotation.y += 0.03;
      },
      onComplete: () => t.removeFromParent(),
    });
    return t;
  }

  /** Gift box lid pops off with confetti. */
  giftOpen(gift: THREE.Object3D, pos: THREE.Vector3): void {
    const lid = gift.userData.lid as THREE.Object3D | undefined;
    audio.play('reward');
    if (lid) {
      this.stage.tween({
        dur: 460,
        ease: (t) => 1 - Math.pow(1 - t, 3),
        onUpdate: (t) => {
          lid.position.y = t * 2.4;
          lid.rotation.z = t * 0.8;
          lid.rotation.x = t * 0.5;
        },
        onComplete: () => lid.removeFromParent(),
      });
    }
    this.stage.delay(180, () => confettiBurst(this.fx, { x: pos.x, y: pos.y + 0.8, z: pos.z }, { count: 40 }));
  }

  fireworks(center: THREE.Vector3, times = 4): void {
    victoryFireworks(this.fx, { x: center.x, y: center.y + 3, z: center.z }, times);
  }

  confetti(pos: THREE.Vector3, count = 34): void {
    confettiBurst(this.fx, pos, { count });
  }

  sparkle(pos: THREE.Vector3, count = 16): void {
    sparkleBurst(this.fx, pos, { count });
  }

  private makeCoin(): THREE.Object3D {
    const g = cachedGeo('reward:coin', () => new THREE.CylinderGeometry(0.34, 0.34, 0.09, 18));
    const m = mesh(g, toyMat(0xffd93d, { emissive: 0xffa94d, emissiveIntensity: 0.35 }));
    m.rotation.x = Math.PI / 2;
    const wrap = new THREE.Group();
    wrap.add(m);
    return wrap;
  }

  private makeStar(): THREE.Group {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.4 : 0.17;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    shape.closePath();
    const g = GEO.extrude(shape, 0.14, 'reward-star');
    const s = mesh(g, glowMat(0xffd93d, 0.5));
    s.rotation.x = 0;
    const wrap = new THREE.Group();
    wrap.add(s);
    return wrap;
  }

  private makeTrophy(): THREE.Group {
    const cup = mesh(GEO.lathe([[0, 0], [0.42, 0.05], [0.5, 0.4], [0.42, 0.72], [0.3, 0.8], [0, 0.82]], 16), toyMat(0xffd93d, { emissive: 0xffa94d, emissiveIntensity: 0.3 }));
    const stem = mesh(GEO.cylinder(0.12, 0.2, 0.3, 12), toyMat(0xffc93d));
    stem.position.y = -0.28;
    const base = mesh(GEO.roundedBox(0.8, 0.22, 0.6, 0.08), toyMat(0xc98a5b));
    base.position.y = -0.52;
    const l = mesh(GEO.torus(0.2, 0.05), toyMat(0xffd93d));
    l.position.set(-0.5, 0.42, 0);
    l.rotation.y = Math.PI / 2;
    const r = l.clone();
    r.position.x = 0.5;
    return group(cup, stem, base, l, r);
  }
}

/* ------------------------------------------------------------------ */
/* reward wheel                                                        */
/* ------------------------------------------------------------------ */

export interface RewardWheel extends THREE.Group {
  /** Bind the stage so `spinTo` uses pause-aware tweens. */
  setStage(stage: ThreeStage): void;
  /** Smoothly spin so `index` lands under the pointer. */
  spinTo(index: number, dur: number, onDone?: () => void): void;
  readonly index: number;
}

export function createRewardWheel(radius = 3, segments = 12): RewardWheel {
  const wheel = new THREE.Group() as RewardWheel;
  const segAngle = (Math.PI * 2) / segments;

  for (let i = 0; i < segments; i++) {
    const color = PALETTE[i % PALETTE.length];
    const g = cachedGeo(`wheel:${radius}:${i}`, () => {
      const geo = new THREE.CircleGeometry(radius, 12, i * segAngle, segAngle - 0.02);
      return geo;
    });
    const wedge = mesh(g, toyMat(color), { cast: false, receive: false });
    wedge.rotation.x = -Math.PI / 2;
    wedge.position.y = 0.12;
    wheel.add(wedge);
    const pip = mesh(GEO.sphere(radius * 0.055, 10), glowMat(0xffffff, 0.5));
    const a = i * segAngle + segAngle / 2;
    pip.position.set(Math.cos(a) * radius * 0.86, 0.16, Math.sin(a) * radius * 0.86);
    wheel.add(pip);
  }

  const rim = mesh(GEO.cylinder(radius * 1.06, radius * 1.06, 0.3, segments * 2), toyMat(0xfff6e3));
  rim.position.y = 0;
  wheel.add(rim);

  const hub = mesh(GEO.sphere(radius * 0.16, 14), glowMat(0xffd93d, 0.6));
  hub.position.y = 0.24;
  wheel.add(hub);

  const pointer = mesh(GEO.cone(radius * 0.14, radius * 0.4, 8), toyMat(0xff5c7a));
  pointer.position.set(0, 0.34, -radius * 0.92);
  pointer.rotation.x = -Math.PI / 2;
  wheel.add(pointer);

  let current = 0;
  Object.defineProperty(wheel, 'index', { get: () => current, enumerable: true });

  const stageRef: { stage: ThreeStage | null } = { stage: null };
  wheel.setStage = (s: ThreeStage) => {
    stageRef.stage = s;
  };

  wheel.spinTo = (index: number, dur: number, onDone?: () => void): void => {
    const from = wheel.rotation.y;
    const turns = Math.PI * 2 * 4;
    const target = -(index * segAngle + segAngle / 2) - turns;
    const stage = stageRef.stage;
    const apply = (v: number): void => {
      wheel.rotation.y = v;
    };
    const done = (): void => {
      current = ((index % segments) + segments) % segments;
      onDone?.();
    };
    if (stage) {
      stage.tween({
        dur,
        ease: (t) => 1 - Math.pow(1 - t, 4),
        onUpdate: (t) => apply(from + (target - from) * t),
        onComplete: done,
      });
    } else {
      apply(target);
      done();
    }
  };

  return wheel;
}
