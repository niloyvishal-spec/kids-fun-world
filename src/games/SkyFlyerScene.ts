import Phaser from 'phaser';
import * as THREE from 'three';
import { audio } from '../core/AudioManager';
import { burst, floatText, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { button, label, Pill, type Btn } from '../core/UI';
import { ThreeGameScene } from '../3d/base/ThreeGameScene';
import { createCharacter, type CharacterHandle } from '../3d/characters';
import { makeCloud, makeGround } from '../3d/environments/common';
import { GEO, group, matteMat, mesh, toyMat } from '../3d/materials';
import { createObject } from '../3d/objects';
import { confettiBurst, sparkleBurst } from '../3d/particles';

const BIRD_SCALE = 3;
/** Local height of the body centre - the logical position is that centre. */
const CENTER_OFF = 0.55 * BIRD_SCALE;
const GROUND_Y = 0.8;
const CEIL_Y = 13;

const GRAVITY = -24;
const FLAP_V = 9.4;
const MAX_FALL = -12.5;
const HIT_R = 0.9;

const SPAWN_X = 21;
const DESPAWN_X = -21;
const PILLAR_W = 1.7;
const PILLAR_D = 2.6;
const SPACING = 13;
const BASE_SPEED = 7.6;
const MAX_SPEED = 15;
const SPEED_STEP = 0.2;
const GAP_HALF_MAX = 2.5;
const GAP_HALF_MIN = 1.95;
const TARGET_GATES = 15;

const CLOUD_SPAN = 62;
const DASH_SPAN = 56;

const FLAP_X = 640;
const FLAP_Y = 634;
const FLAP_W = 252;
const FLAP_H = 94;

const CANDY_COLS = [0xff5f8f, 0x6fd3ff, 0xffd166, 0xc77dff, 0x7ce38b];

interface Gate {
  g: THREE.Group;
  x: number;
  gapBot: number;
  gapTop: number;
  star: THREE.Group | null;
  starY: number;
  starTaken: boolean;
  passed: boolean;
}

function makeColumn(
  y0: number,
  y1: number,
  color: number,
  capAt: 'top' | 'bottom',
  seed: number
): THREE.Group {
  const g = new THREE.Group();
  const h = Math.max(0.6, y1 - y0);
  const body = mesh(GEO.roundedBox(PILLAR_W, h, PILLAR_D, 0.3), toyMat(color));
  body.position.y = y0 + h / 2;
  g.add(body);

  const band = mesh(GEO.roundedBox(PILLAR_W + 0.18, 0.36, PILLAR_D + 0.18, 0.16), toyMat(0xffffff));
  band.position.y = y0 + h * 0.58;
  g.add(band);

  const lipY = capAt === 'top' ? y1 - 0.24 : y0 + 0.24;
  const lip = mesh(GEO.roundedBox(PILLAR_W + 0.55, 0.5, PILLAR_D + 0.55, 0.22), toyMat(0xfffdf6, { shiny: true }));
  lip.position.y = lipY;
  g.add(lip);

  const dir = capAt === 'top' ? 1 : -1;
  for (let i = -1; i <= 1; i++) {
    const drop = mesh(GEO.sphere(0.26, 10), toyMat(CANDY_COLS[(seed + i + 5) % CANDY_COLS.length]));
    drop.position.set(i * 0.62, lipY + dir * 0.44, 0);
    g.add(drop);
  }
  return g;
}

function candyTree(i: number): THREE.Group {
  const trunk = mesh(GEO.cylinder(0.2, 0.3, 1.9, 10), matteMat(0x6b3f23), { cast: false, receive: false });
  trunk.position.y = 0.95;
  const col = CANDY_COLS[i % CANDY_COLS.length];
  const top = mesh(GEO.sphere(1.25), toyMat(col), { cast: false, receive: false });
  top.position.y = 2.5;
  const side = mesh(GEO.sphere(0.75), toyMat(col), { cast: false, receive: false });
  side.position.set(0.8, 2.05, 0.35);
  return group(trunk, top, side);
}

function lollipop(i: number): THREE.Group {
  const stick = mesh(GEO.cylinder(0.07, 0.07, 2, 8), matteMat(0xf7f7f7), { cast: false, receive: false });
  stick.position.y = 1;
  const head = mesh(GEO.sphere(0.62), toyMat(CANDY_COLS[(i + 2) % CANDY_COLS.length]), { cast: false, receive: false });
  head.position.y = 2.3;
  const stripe = mesh(
    GEO.torus(0.56, 0.14),
    toyMat(0xffffff, { transparent: true, opacity: 0.85 }),
    { cast: false, receive: false }
  );
  stripe.position.y = 2.3;
  stripe.rotation.set(0.9 + (i % 3) * 0.4, i * 1.1, 0.3);
  return group(stick, head, stripe);
}

function gumDrop(i: number): THREE.Group {
  const b = mesh(
    GEO.sphere(0.85),
    toyMat(CANDY_COLS[(i + 3) % CANDY_COLS.length], { transparent: true, opacity: 0.92 }),
    { cast: false, receive: false }
  );
  b.position.y = 0.62;
  b.scale.set(1, 0.8, 1);
  return group(b);
}

/** Fly a little bird through the gaps between floating candy towers. */
export class SkyFlyerScene extends ThreeGameScene {
  private bird: CharacterHandle | null = null;
  private pivot: THREE.Group | null = null;
  private gatePill: Pill | null = null;
  private flapBtn: Btn | null = null;
  private gates: Gate[] = [];
  private clouds: THREE.Group[] = [];
  private dashes: THREE.Object3D[] = [];

  private birdY = 7.4;
  private vy = 0;
  private deadVy = 0;
  private flapT = 99;
  private speed = BASE_SPEED;
  private score = 0;
  private passed = 0;
  private starsGot = 0;
  private flaps = 0;
  private spawnDist = SPACING;
  private elapsed = 0;
  private hitGround = false;
  private dead = false;
  private finished = false;
  private baseScale = BIRD_SCALE;

  constructor() {
    super('SkyFlyer');
  }

  create(): void {
    this.bird = null;
    this.pivot = null;
    this.gatePill = null;
    this.flapBtn = null;
    this.gates = [];
    this.clouds = [];
    this.dashes = [];
    this.birdY = 7.4;
    this.vy = 0;
    this.deadVy = 0;
    this.flapT = 99;
    this.speed = BASE_SPEED;
    this.score = 0;
    this.passed = 0;
    this.starsGot = 0;
    this.flaps = 0;
    this.spawnDist = SPACING;
    this.elapsed = 0;
    this.hitGround = false;
    this.dead = false;
    this.finished = false;
    this.baseScale = BIRD_SCALE;

    const ok = this.setup3D({
      lighting: 'candy',
      camera: { pos: [0, 9, 17], look: [0, 6.5, 0], fov: 55 },
      introDur: 850,
      introFrom: [15, 17, 30],
      hud: { score: 0, center: '🐤 SKY FLYER' },
    });
    if (!ok) return;

    this.gatePill = new Pill(this, 640, 100, `🚪 0 / ${TARGET_GATES}`, {
      color: 0x4dd0e1,
      minW: 220,
      depth: 20,
    });
    label(this, 640, 545, 'TAP to flap - fly through the gaps!', {
      size: 22,
      color: '#33364f',
      stroke: '#ffffff',
      strokeThickness: 5,
      depth: 12,
    });

    this.flapBtn = button(this, {
      x: FLAP_X,
      y: FLAP_Y,
      w: FLAP_W,
      h: FLAP_H,
      icon: '⬆️',
      label: 'FLAP',
      layout: 'stack',
      color: 0x4dd0e1,
      iconSize: 34,
      fontSize: 30,
      depth: 40,
      onClick: () => this.flap(),
    });

    this.addKey('SPACE', () => this.flap());
    this.addKey('UP', () => this.flap());
    this.addKey('W', () => this.flap());

    this.exposeTest({
      state: () => ({
        y: Math.round(this.birdY * 100) / 100,
        vy: Math.round(this.vy * 100) / 100,
        gates: this.passed,
        stars: this.starsGot,
        score: this.score,
        flaps: this.flaps,
        obstacles: this.gates.length,
        speed: Math.round(this.speed * 10) / 10,
        over: this.dead || this.finished,
        ready: this.gameplayReady,
        anim: this.bird ? this.bird.anim.current : 'none',
      }),
      probe: () => ({ x: FLAP_X, y: FLAP_Y, label: 'flap' }),
    });
  }

  protected build3D(): void {
    const stage = this.stage!;
    stage.scene.fog = new THREE.Fog(0xffd9f0, 46, 104);

    stage.scene.add(makeGround(48, 0xffc9e5));

    // Mountain ring sits well outside the camera, so nothing ever blocks the
    // flight lane (the camera itself is at z = 17).
    const cols = [0xffb3d1, 0xc5a3ff, 0xa8e6ff, 0xffe08a];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.35;
      const rad = 30 + ((i * 7) % 4) * 2.5;
      const h = 9 + ((i * 5) % 7);
      const r = 5 + ((i * 3) % 4);
      const m = mesh(GEO.cone(r, h, 12), matteMat(cols[i % 4]), { cast: false, receive: false });
      m.position.set(Math.cos(a) * rad, h * 0.5, Math.sin(a) * rad);
      const cap = mesh(GEO.cone(r * 0.4, h * 0.34, 12), matteMat(0xffffff), { cast: false, receive: false });
      cap.position.set(m.position.x, h * 0.83, m.position.z);
      stage.scene.add(m, cap);
    }

    // Candy scenery only on the far side of the lane (z <= -5).
    for (let i = 0; i < 16; i++) {
      const k = i % 3;
      const g = k === 0 ? candyTree(i) : k === 1 ? lollipop(i) : gumDrop(i);
      g.position.set(-24 + ((i * 11) % 49), 0, -5 - ((i * 7) % 17));
      g.rotation.y = (i * 1.7) % 6.28;
      g.scale.setScalar(0.8 + ((i * 7) % 5) * 0.15);
      stage.scene.add(g);
    }

    for (let i = 0; i < 10; i++) {
      const c = makeCloud(1.5 + (i % 3) * 0.5);
      c.position.set(-30 + ((i * 13) % 61), 5.5 + ((i * 5) % 8), -24 + ((i * 9) % 18));
      stage.scene.add(c);
      this.clouds.push(c);
    }

    for (let i = 0; i < 30; i++) {
      const d = mesh(GEO.box(0.8, 0.06, 0.2), toyMat(CANDY_COLS[i % 5]), { cast: false, receive: false });
      d.position.set(-DASH_SPAN / 2 + ((i * 5.7) % DASH_SPAN), 0.06, -7 + ((i * 3.1) % 14));
      d.rotation.y = ((i * 0.7) % 1.2) - 0.6;
      stage.scene.add(d);
      this.dashes.push(d);
    }

    const pivot = new THREE.Group();
    const bird = createCharacter('bird', { scale: BIRD_SCALE });
    bird.root.position.set(0, -CENTER_OFF, 0);
    bird.root.rotation.y = Math.PI / 2;
    bird.play('idle');
    pivot.add(bird.root);
    pivot.position.y = this.birdY;
    stage.scene.add(pivot);
    this.pivot = pivot;
    this.bird = bird;
    this.baseScale = bird.root.scale.x;

    this.spawnGate();
  }

  protected override onGameplayStart(): void {
    this.vy = 0;
    this.flapBtn?.pulse();
  }

  protected override on3DUpdate(dt: number, t: number): void {
    const stage = this.stage;
    const bird = this.bird;
    if (!stage || !bird || !this.pivot) return;

    const ts = t / 1000;
    bird.update(dt);
    this.updateWings(ts, dt);

    if (this.gameplayReady && !this.dead && !this.finished) {
      const dx = this.speed * dt;
      this.moveScenery(dx);
    }

    if (this.dead) {
      this.fallDead(dt);
      return;
    }
    if (this.finished) return;

    if (!this.gameplayReady) {
      this.birdY = 7.4 + Math.sin(ts * 2.2) * 0.2;
      this.vy = Math.cos(ts * 2.2) * 0.44;
      this.applyBird();
      return;
    }

    this.elapsed += dt;
    this.vy = Math.max(MAX_FALL, this.vy + GRAVITY * dt);
    this.birdY += this.vy * dt;

    if (this.birdY <= GROUND_Y) {
      this.birdY = GROUND_Y;
      this.die();
      return;
    }
    if (this.birdY >= CEIL_Y) {
      this.birdY = CEIL_Y;
      if (this.vy > 0) this.vy = 0;
    }
    this.applyBird();

    this.spawnDist -= this.speed * dt;
    if (this.spawnDist <= 0) {
      this.spawnGate();
      this.spawnDist = SPACING;
    }

    for (let i = this.gates.length - 1; i >= 0; i--) {
      const gate = this.gates[i];
      gate.x -= this.speed * dt;
      gate.g.position.x = gate.x;

      if (gate.star) {
        gate.star.position.x = gate.x;
        gate.star.position.y = gate.starY + Math.sin(ts * 3) * 0.18;
        gate.star.rotation.y += dt * 2.6;
        if (
          !gate.starTaken &&
          Math.abs(gate.x) < 1.6 &&
          Math.abs(this.birdY - gate.star.position.y) < 1.5
        ) {
          this.collectStar(gate);
        }
      }

      if (!gate.passed && gate.x < 0) {
        this.onGatePassed(gate);
        if (this.finished) return;
      }

      if (gate.x < DESPAWN_X) {
        this.removeGate(i);
        continue;
      }
      if (Math.abs(gate.x) < PILLAR_W / 2 + HIT_R && this.hits(gate)) {
        this.die();
        return;
      }
    }
  }

  protected override handleTap(_dx: number, _dy: number): void {
    this.flap();
  }

  /* ---------------- scenery ---------------- */

  private moveScenery(dx: number): void {
    for (const c of this.clouds) {
      c.position.x -= dx * 0.3;
      if (c.position.x < -CLOUD_SPAN / 2) c.position.x += CLOUD_SPAN;
    }
    for (const d of this.dashes) {
      d.position.x -= dx;
      if (d.position.x < -DASH_SPAN / 2) d.position.x += DASH_SPAN;
    }
  }

  private applyBird(): void {
    if (!this.pivot || !this.bird) return;
    this.pivot.position.set(0, this.birdY, 0);
    this.pivot.rotation.z = Phaser.Math.Clamp(this.vy * 0.05, -0.55, 0.5);
  }

  private updateWings(t: number, dt: number): void {
    const bird = this.bird;
    if (!bird) return;
    // The celebrate clip drives the wings itself (a cheering bird flaps!).
    if (bird.anim.current === 'celebrate') return;

    this.flapT += dt;
    const blend = Phaser.Math.Clamp((this.flapT - 0.6) / 0.5, 0, 1);
    const flap = Math.sin((this.flapT / 0.45) * Math.PI * 2) * 1.3 * (1 - blend);
    const glide = Math.sin(t * 3.4) * 0.28 * blend;
    const a = this.dead ? 0.5 : flap + glide;
    if (bird.rig.armL) bird.rig.armL.rotation.z = -a;
    if (bird.rig.armR) bird.rig.armR.rotation.z = a;
  }

  /* ---------------- gates ---------------- */

  private spawnGate(): void {
    const stage = this.stage;
    if (!stage) return;
    const seed = this.gates.length + this.passed;
    const half = Math.max(GAP_HALF_MIN, GAP_HALF_MAX - this.passed * 0.04);
    const center = Phaser.Math.Between(50, 105) / 10;
    const gapBot = center - half;
    const gapTop = center + half;

    const g = new THREE.Group();
    g.position.x = SPAWN_X;
    g.add(makeColumn(0, gapBot, CANDY_COLS[seed % 5], 'top', seed));
    g.add(makeColumn(gapTop, 19, CANDY_COLS[(seed + 2) % 5], 'bottom', seed + 1));
    stage.scene.add(g);

    let star: THREE.Group | null = null;
    if (Math.random() < 0.65) {
      star = createObject('star', { size: 1, color: 0xffd93d });
      star.position.set(SPAWN_X, center, 0);
      stage.scene.add(star);
    }

    this.gates.push({ g, x: SPAWN_X, gapBot, gapTop, star, starY: center, starTaken: false, passed: false });
  }

  private removeGate(i: number): void {
    const gate = this.gates[i];
    if (!gate) return;
    gate.g.removeFromParent();
    gate.star?.removeFromParent();
    this.gates.splice(i, 1);
  }

  /** Circle (the bird) vs the two pillar boxes, in the XY plane. */
  private hits(gate: Gate): boolean {
    const y = this.birdY;
    const hx = PILLAR_W / 2;
    const x0 = gate.x - hx;
    const x1 = gate.x + hx;
    const dx = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0;

    const dyBottom = y < 0 ? -y : y > gate.gapBot ? y - gate.gapBot : 0;
    if (dx * dx + dyBottom * dyBottom < HIT_R * HIT_R) return true;

    const dyTop = y < gate.gapTop ? gate.gapTop - y : 0;
    return dx * dx + dyTop * dyTop < HIT_R * HIT_R;
  }

  private onGatePassed(gate: Gate): void {
    gate.passed = true;
    this.passed++;
    this.score += 10;
    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_STEP);
    audio.play('right');
    progress.track('gates_flown', 1);
    this.hud?.setScore(this.score);
    this.gatePill?.set(`🚪 ${this.passed} / ${TARGET_GATES}`);

    const p = this.stage?.project(0, this.birdY + 1.6, 0);
    if (p) {
      floatText(this, p.x, p.y, '+10', { color: '#4dd0e1' });
      burst(this, p.x, p.y, 0x4dd0e1, 8);
    }

    if (this.passed >= TARGET_GATES) this.win();
  }

  private collectStar(gate: Gate): void {
    if (!gate.star) return;
    const pos = gate.star.position.clone();
    gate.star.removeFromParent();
    gate.star = null;
    gate.starTaken = true;

    this.starsGot++;
    this.score += 25;
    audio.play('star');
    progress.track('stars_collected', 1);
    this.hud?.setScore(this.score);
    if (this.fx) sparkleBurst(this.fx, pos);
    const p = this.stage?.project(pos.x, pos.y, pos.z);
    if (p) {
      floatText(this, p.x, p.y, '+25', { color: '#ffd93d' });
      sparkles(this, p.x, p.y, 0xffd93d, 10);
    }
  }

  /* ---------------- input ---------------- */

  private flap(): void {
    audio.resumeAfterGesture();
    if (this.dead || this.finished || !this.gameplayReady) return;

    this.vy = FLAP_V;
    this.flapT = 0;
    this.flaps++;
    audio.play('jump');

    const bird = this.bird;
    const stage = this.stage;
    if (bird && stage) {
      const b = this.baseScale;
      stage.tween({
        dur: 190,
        ease: (k) => Math.sin(k * Math.PI),
        onUpdate: (k) => bird.root.scale.setScalar(b * (1 + 0.13 * k)),
        onComplete: () => bird.root.scale.setScalar(b),
      });
    }
    this.fx?.burst({
      pos: { x: -0.5, y: this.birdY - 0.9, z: 0 },
      count: 6,
      color: 0xffffff,
      speed: 1.8,
      life: 0.35,
      size: 0.35,
      tex: 'soft',
      gravity: -1.5,
      drag: 2,
    });
  }

  /* ---------------- end of run ---------------- */

  private die(): void {
    if (this.dead || this.finished) return;
    this.dead = true;
    this.deadVy = this.vy;
    audio.play('fail');

    const stage = this.stage;
    if (stage) {
      const p = stage.project(0, this.birdY, 0);
      if (p) burst(this, p.x, p.y, 0xff6b6b, 16);
      this.fx?.burst({
        pos: { x: 0, y: this.birdY, z: 0 },
        count: 16,
        color: 0xff6b6b,
        speed: 4.5,
        life: 0.7,
        size: 0.4,
        tex: 'star',
        additive: true,
        gravity: -8,
        drag: 1.4,
      });
      this.rig?.shake(0.35, 0.3);
    }
    this.bird?.play('sad');

    this.time.delayedCall(950, () => {
      if (!this.scene.isActive() || this.finished) return;
      this.finished = true;
      const gates = this.passed;
      const stars = gates >= 12 ? 3 : gates >= 7 ? 2 : 1;
      this.finish({
        score: this.score,
        stars,
        win: false,
        subtitle: gates >= 12 ? 'Almost at the clouds!' : 'Keep flapping!',
        lines: [
          { icon: '🚪', label: 'Gates', value: String(gates) },
          { icon: '⭐', label: 'Stars', value: String(this.starsGot) },
          { icon: '🦅', label: 'Flaps', value: String(this.flaps) },
        ],
      });
    });
  }

  private fallDead(dt: number): void {
    const pivot = this.pivot;
    if (!pivot) return;

    this.deadVy = Math.max(-34, this.deadVy + GRAVITY * dt);
    this.birdY += this.deadVy * dt;
    if (this.birdY <= GROUND_Y) {
      this.birdY = GROUND_Y;
      if (!this.hitGround) {
        this.hitGround = true;
        this.deadVy = 0;
        audio.play('thud');
        const p = this.stage?.project(0, GROUND_Y, 0);
        if (p) burst(this, p.x, p.y, 0xe6d6c2, 12, { speed: 160 });
        this.fx?.burst({
          pos: { x: 0, y: 0.3, z: 0 },
          count: 12,
          color: [0xe6d6c2, 0xcbb9a4],
          speed: 2.6,
          life: 0.6,
          size: 0.4,
          direction: 'ring',
          gravity: -4,
        });
      }
    }
    pivot.position.y = this.birdY;
    if (!this.hitGround) pivot.rotation.z = Math.max(-1.75, pivot.rotation.z - dt * 3.4);
  }

  private win(): void {
    if (this.dead || this.finished) return;
    this.finished = true;
    audio.play('success');

    const y0 = this.birdY;
    const stage = this.stage;
    if (stage) {
      stage.tween({
        dur: 1000,
        ease: (k) => 1 - (1 - k) * (1 - k),
        onUpdate: (k) => {
          this.birdY = y0 + 3.5 * k;
          this.applyBird();
        },
      });
      const p = { x: 0, y: this.birdY + 1, z: 0 };
      if (this.fx) {
        confettiBurst(this.fx, p);
        sparkleBurst(this.fx, p);
      }
      const sp = stage.project(0, y0 + 1.4, 0);
      if (sp) {
        sparkles(this, sp.x, sp.y, 0xffd93d, 16);
        burst(this, sp.x, sp.y, 0xffd93d, 14);
      }
    }
    this.bird?.play('celebrate');

    this.time.delayedCall(1150, () => {
      if (!this.scene.isActive()) return;
      this.finish({
        score: this.score,
        stars: 3,
        win: true,
        subtitle: 'You flew to the clouds!',
        lines: [
          { icon: '🚪', label: 'Gates', value: String(this.passed) },
          { icon: '⭐', label: 'Stars', value: String(this.starsGot) },
          { icon: '🦅', label: 'Flaps', value: String(this.flaps) },
        ],
      });
    });
  }
}
