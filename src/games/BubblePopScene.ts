import Phaser from 'phaser';
import { PALETTE } from '../config';
import { audio } from '../core/AudioManager';
import { floatText, rewardFly } from '../core/FX';
import { progress } from '../core/Progress';
import { label } from '../core/UI';
import { ThreeGameScene } from '../3d/base/ThreeGameScene';
import { createOceanWorld, type World } from '../3d/environments';
import { createObject } from '../3d/objects';
import { bubbleBurst, sparkleBurst } from '../3d/particles';
import { tapFx } from '../3d/feedback';
import type { Interactable } from '../3d/interaction';
import * as THREE from 'three';

/**
 * Bubble Pop - now genuinely 3D.
 *
 * Real translucent spheres float up through the Ocean World; a raycast tap
 * pops the actual mesh (it scales away, bursts bubbles and changes the score).
 */

interface Bubble {
  id: number;
  obj: THREE.Group;
  handle: Interactable;
  vx: number;
  vy: number;
  phase: number;
  gold: boolean;
  r: number;
}

const ROUND_TIME = 45;
const X_RANGE = 7.4;
const Z_RANGE = 3.6;
const BOTTOM = -3.5;
const TOP = 12;

export class BubblePopScene extends ThreeGameScene {
  private bubbles: Bubble[] = [];
  private world: World | null = null;
  private layer = new THREE.Group();
  private score = 0;
  private timeLeft = ROUND_TIME;
  private combo = 0;
  private comboTimer = 0;
  private spawnAcc = 0;
  private popped = 0;
  private nextId = 1;
  private comboTxt: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('BubblePop');
  }

  create(): void {
    this.bubbles = [];
    this.score = 0;
    this.timeLeft = ROUND_TIME;
    this.combo = 0;
    this.comboTimer = 0;
    this.spawnAcc = 0;
    this.popped = 0;
    this.layer = new THREE.Group();

    const ok = this.setup3D({
      lighting: 'day',
      camera: { pos: [0, 5, 17], look: [0, 4.4, 0], fov: 46 },
      introDur: 800,
      introFrom: [4, 10, 24],
      hud: { score: 0, timer: ROUND_TIME, center: '🫧 BUBBLE POP' },
    });
    if (!ok) return;

    // Created only once the stage exists, so a WebGL failure never leaves a
    // stray blank label floating over the error panel.
    this.comboTxt = label(this, 640, 112, ' ', {
      size: 44,
      color: '#ffd93d',
      stroke: '#0a4a5c',
      strokeThickness: 7,
      depth: 20,
    });

    label(this, 640, 688, 'Tap the bubbles!', { size: 24, color: '#ffffff', alpha: 0.92, stroke: '#0a4a5c', strokeThickness: 5 });
    this.input.on('pointerdown', () => audio.resumeAfterGesture());

    this.exposeTest({
      state: () => ({
        score: this.score,
        timeLeft: Math.max(0, Math.round(this.timeLeft * 10) / 10),
        combo: this.combo,
        popped: this.popped,
        bubbles: this.bubbles.length,
        ready: this.gameplayReady,
        ids: this.bubbles.map((b) => b.id),
      }),
      probe: () => this.probeBubble(),
    });
  }

  protected build3D(): void {
    const stage = this.stage!;
    this.world = createOceanWorld(stage, { seed: 4 });
    stage.scene.add(this.layer);

    // gentle light shafts so the play field reads as water
    const fill = new THREE.HemisphereLight(0xbfe9ff, 0x1b5f7a, 0.5);
    stage.scene.add(fill);

    for (let i = 0; i < 5; i++) this.spawnBubble(true);
  }

  private probeBubble(): { x: number; y: number; label?: string } | null {
    const stage = this.stage;
    if (!stage || !this.bubbles.length) return null;
    const b = this.bubbles[Math.floor(this.bubbles.length / 2)];
    const p = stage.project(b.obj.position.x, b.obj.position.y, b.obj.position.z);
    return p ? { x: p.x, y: p.y, label: `bubble-${b.id}` } : null;
  }

  /* ---------------- spawning ---------------- */

  private spawnBubble(initial = false): void {
    if (this.bubbles.length > 26 || !this.stage) return;
    const gold = Math.random() < 0.09;
    const r = gold ? 1.15 : 0.55 + Math.random() * 0.55;
    const obj = createObject('bubble', {
      color: gold ? 0xffe066 : PALETTE[Math.floor(Math.random() * PALETTE.length)],
      size: r * 2,
    });
    if (gold) {
      const star = createObject('star', { size: 0.9 });
      star.rotation.y = Math.random() * 6.28;
      obj.add(star);
      obj.userData.goldStar = star;
    }
    obj.position.set(
      (Math.random() * 2 - 1) * X_RANGE,
      initial ? -1 + Math.random() * 8 : BOTTOM,
      (Math.random() * 2 - 1) * Z_RANGE
    );
    this.layer.add(obj);

    const elapsed = ROUND_TIME - this.timeLeft;
    const speed = 1.7 + elapsed * 0.06 + Math.random() * 1.1;
    const b: Bubble = {
      id: this.nextId++,
      obj,
      handle: null as unknown as Interactable,
      vx: (Math.random() * 2 - 1) * 0.9,
      vy: speed,
      phase: Math.random() * Math.PI * 2,
      gold,
      r,
    };
    b.handle = this.interact!.add(obj, {
      kind: 'tap',
      sound: gold ? 'star' : 'pop',
      onTap: () => this.pop(b),
    });
    this.bubbles.push(b);

    // squash & stretch entrance
    const target = obj.scale.x;
    obj.scale.setScalar(target * 0.15);
    this.stage.tween({ dur: 260, ease: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2), onUpdate: (t) => obj.scale.setScalar(target * Math.max(0.15, t)) });
  }

  /* ---------------- popping ---------------- */

  private pop(b: Bubble): void {
    const idx = this.bubbles.indexOf(b);
    if (idx < 0) return;
    this.bubbles.splice(idx, 1);

    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = 1.6;
    const mult = Math.min(5, this.combo);
    const value = b.gold ? 100 * mult : 10 * mult;
    this.score += value;
    this.popped++;
    this.hud?.setScore(this.score);
    progress.track('bubbles_popped', 1);
    audio.play(b.gold ? 'reward' : 'pop');

    const p = b.obj.position.clone();
    const screen = this.stage?.project(p.x, p.y, p.z);
    if (screen) {
      floatText(this, screen.x, screen.y, `+${value}`, {
        color: b.gold ? '#ffd93d' : '#ffffff',
        size: b.gold ? 42 : 32,
      });
    }
    if (this.fx) {
      bubbleBurst(this.fx, p, { count: b.gold ? 18 : 9, speed: 3.5, life: 0.8 });
      if (b.gold) sparkleBurst(this.fx, p, { count: 22, speed: 5, life: 1.1, size: 0.5 });
    }
    if (b.gold && screen) rewardFly(this, 900, 240, '🌟 GOLDEN!');
    tapFx(this.fx, p, b.gold ? 'star' : 'pop');

    // remove from the raycast set immediately, then animate the mesh away
    this.interact?.remove(b.obj);
    const from = b.obj.scale.x;
    this.stage?.tween({
      dur: 170,
      ease: (t) => t,
      onUpdate: (t) => b.obj.scale.setScalar(from * (1 + 0.45 * t)),
      onComplete: () => b.obj.removeFromParent(),
    });

    if (mult > 1 && this.comboTxt) {
      this.comboTxt.setText(`x${mult} COMBO!`);
      this.comboTxt.setScale(1.35);
      this.stage?.tween({ dur: 240, ease: (t) => 1 - Math.pow(1 - t, 3), onUpdate: (t) => this.comboTxt?.setScale(1.35 - 0.35 * t) });
    }
    if (b.gold || mult >= 5) this.rig?.shake(0.3, 0.25);
  }

  /* ---------------- frame ---------------- */

  protected override on3DUpdate(dt: number): void {
    if (!this.gameplayReady) return;

    this.timeLeft -= dt;
    this.hud?.setTimer(this.timeLeft);
    if (this.timeLeft <= 0) {
      this.endGame();
      return;
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTxt?.setText(' ');
      }
    }

    const elapsed = ROUND_TIME - this.timeLeft;
    this.spawnAcc += dt;
    const interval = Math.max(0.32, 1.05 - elapsed * 0.016);
    if (this.spawnAcc >= interval) {
      this.spawnAcc = 0;
      this.spawnBubble();
    }

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.phase += dt * 2.2;
      b.obj.position.x += (b.vx + Math.sin(b.phase) * 0.75) * dt;
      b.obj.position.y += b.vy * dt;
      b.obj.rotation.z = Math.sin(b.phase) * 0.12;
      if (b.obj.position.x < -X_RANGE || b.obj.position.x > X_RANGE) b.vx *= -1;
      const star = b.obj.userData.goldStar as THREE.Object3D | undefined;
      if (star) star.rotation.y += dt * 2.4;
      if (b.obj.position.y > TOP) {
        this.interact?.remove(b.obj);
        b.obj.removeFromParent();
        this.bubbles.splice(i, 1);
      }
    }

    this.world?.update(dt, performance.now() / 1000);
  }

  private endGame(): void {
    if (!this.gameplayReady) return;
    this.gameplayReady = false;
    for (const b of this.bubbles) {
      this.interact?.remove(b.obj);
      b.obj.removeFromParent();
    }
    this.bubbles = [];
    const stars = this.score >= 700 ? 3 : this.score >= 400 ? 2 : this.score >= 120 ? 1 : 0;
    this.finish({
      score: this.score,
      stars: Math.max(1, stars),
      win: stars >= 2,
      subtitle: `You popped ${this.popped} bubbles!`,
      lines: [{ icon: '🫧', label: 'Popped', value: String(this.popped) }],
    });
  }
}
