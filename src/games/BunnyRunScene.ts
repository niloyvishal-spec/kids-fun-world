import Phaser from 'phaser';
import * as THREE from 'three';
import { audio } from '../core/AudioManager';
import { burst, floatText, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { button, label, Pill, type Btn } from '../core/UI';
import { ThreeGameScene } from '../3d/base/ThreeGameScene';
import { createCharacter, type CharacterHandle } from '../3d/characters';
import type { World } from '../3d/environments/common';
import { createGardenWorld } from '../3d/environments/garden';
import { GEO, group, matteMat, mesh, toyMat } from '../3d/materials';
import { createObject } from '../3d/objects';
import { coinBurst, sparkleBurst } from '../3d/particles';

const GROUND_Y = 600;
const BUNNY_X = 280;
const GRAVITY = 2600;
const JUMP_V = -980;
const HOP = 52;
const BW = 56;
const BH = 66;

const PX2W = 0.012;
const OBSTACLE_X = 1340;
const PICKUP_X = 1380;
const OBSTACLE_SPREAD = 150;
const DESPAWN_OBSTACLE = -120;
const DESPAWN_PICKUP = -80;

const LANE_CLEAR = 4.2;
const NEAR_Z = 6.48;
const DASH_GAP = 150 * PX2W;
const DASH_COUNT = 20;
const DASH_SPAN = DASH_GAP * DASH_COUNT;
const BUSH_GAP = 210 * PX2W;
const BUSH_COUNT = 14;
const BUSH_SPAN = BUSH_GAP * BUSH_COUNT;
const BUSH_X = 3.3;
const BUNNY_SCALE = 1.15;

const JUMP_X = 640;
const JUMP_Y = 626;
const JUMP_W = 232;
const JUMP_H = 96;

function toZ(px: number): number {
  return (BUNNY_X - px) * PX2W;
}

function designYToW(py: number): number {
  return (GROUND_Y - py) * PX2W;
}

function hopY(bunnyY: number): number {
  return (GROUND_Y - HOP - bunnyY) * PX2W;
}

interface Obstacle3D {
  g: THREE.Group;
  px: number;
  w: number;
  h: number;
}

interface Pickup3D {
  g: THREE.Group;
  px: number;
  py: number;
  kind: 'carrot' | 'star';
}

function makeRock(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(GEO.icosahedron(0.5), matteMat(0x96908a, { flatShading: true }));
  body.scale.set(w, h, w * 0.78);
  body.position.y = h / 2;
  body.rotation.set(0.28, 0.6, 0.1);
  const chip = mesh(GEO.icosahedron(0.5), matteMat(0x867f78, { flatShading: true }));
  const cs = w * 0.34;
  chip.scale.set(cs, cs * 0.8, cs * 0.8);
  chip.position.set(-w * 0.3, h * 0.2, w * 0.24);
  g.add(body, chip);
  return g;
}

function makeCactus(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const skin = matteMat(0x3f9b4a);
  const trunk = mesh(GEO.cylinder(w * 0.24, w * 0.27, h, 16), skin);
  trunk.position.y = h / 2;
  g.add(trunk);
  const armR = w * 0.13;
  for (const s of [-1, 1]) {
    const fore = mesh(GEO.cylinder(armR, armR, w * 0.4, 10), skin);
    fore.rotation.z = Math.PI / 2;
    fore.position.set(s * w * 0.2, h * 0.42, 0);
    const up = mesh(GEO.cylinder(armR, armR, h * 0.3, 10), skin);
    up.position.set(s * (w * 0.5 - armR), h * 0.57, 0);
    g.add(fore, up);
  }
  const bud = mesh(GEO.sphere(w * 0.11, 10), toyMat(0xff8fab));
  bud.position.y = h;
  g.add(bud);
  return g;
}

function makeLog(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const r = h / 2;
  const trunk = mesh(GEO.cylinder(r, r, w, 18), matteMat(0x9a5f34));
  trunk.rotation.z = Math.PI / 2;
  trunk.position.y = r;
  g.add(trunk);
  for (const s of [-1, 1]) {
    const ring = mesh(GEO.cylinder(r * 0.9, r * 0.9, 0.05, 18), matteMat(0xe0c49b));
    ring.rotation.z = Math.PI / 2;
    ring.position.set(s * (w / 2 - 0.025), r, 0);
    g.add(ring);
  }
  for (const x of [-w * 0.22, w * 0.14]) {
    const band = mesh(GEO.cylinder(r * 1.03, r * 1.03, 0.09, 16), matteMat(0x7d4a28));
    band.rotation.z = Math.PI / 2;
    band.position.set(x, r, 0);
    g.add(band);
  }
  const moss = mesh(GEO.sphere(r * 0.6, 10), matteMat(0x5fae4a));
  moss.scale.set(1.5, 0.5, 1);
  moss.position.set(-w * 0.16, h * 0.8, 0);
  g.add(moss);
  return g;
}

function makeMushroom(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const stemH = h * 0.5;
  const stem = mesh(GEO.cylinder(w * 0.17, w * 0.23, stemH, 14), matteMat(0xfff3e0));
  stem.position.y = stemH / 2;
  const cap = mesh(GEO.sphere(0.5, 18), toyMat(0xff5c5c));
  cap.scale.set(w, h * 0.58, w * 0.94);
  cap.position.y = h * 0.71;
  g.add(stem, cap);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const dot = mesh(GEO.sphere(w * 0.09, 8), matteMat(0xffffff), { cast: false });
    dot.position.set(
      Math.cos(a) * w * 0.28,
      h * 0.71 + Math.sin(a * 1.7) * h * 0.14 + h * 0.12,
      Math.sin(a) * w * 0.26
    );
    g.add(dot);
  }
  return g;
}

function makeCarrot(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(GEO.cone(0.2, 0.56, 14), toyMat(0xff8c33));
  body.rotation.x = Math.PI;
  body.position.y = -0.06;
  g.add(body);
  for (const s of [-1, 0, 1]) {
    const leaf = mesh(GEO.cone(0.07, 0.24, 8), matteMat(0x4fa83c));
    leaf.position.set(s * 0.07, 0.3, -Math.abs(s) * 0.04);
    leaf.rotation.z = -s * 0.4;
    g.add(leaf);
  }
  return g;
}

function makeBush(): THREE.Group {
  const dark = matteMat(0x3fa34d);
  const light = matteMat(0x54b24f);
  const p1 = mesh(GEO.sphere(0.42), dark);
  p1.position.y = 0.26;
  const p2 = mesh(GEO.sphere(0.3), light);
  p2.position.set(0.36, 0.2, 0.12);
  const p3 = mesh(GEO.sphere(0.26), dark);
  p3.position.set(-0.32, 0.17, -0.1);
  return group(p1, p2, p3);
}

/** Endless runner: jump over obstacles, collect carrots and stars - now in real 3D. */
export class BunnyRunScene extends ThreeGameScene {
  private bunny: CharacterHandle | null = null;
  private world: World | null = null;
  private distPill: Pill | null = null;
  private jumpBtn: Btn | null = null;
  private obstacles: Obstacle3D[] = [];
  private pickups: Pickup3D[] = [];
  private dashes: THREE.Object3D[] = [];
  private bushes: THREE.Object3D[] = [];
  private vy = 0;
  private onGround = true;
  private jumps = 0;
  private bunnyY = GROUND_Y - HOP;
  private speed = 330;
  private distance = 0;
  private score = 0;
  private carrots = 0;
  private starsGot = 0;
  private spawnDist = 320;
  private travelled = 0;
  private dead = false;
  private finished = false;
  private baseScale = BUNNY_SCALE;

  constructor() {
    super('BunnyRun');
  }

  create(): void {
    this.bunny = null;
    this.world = null;
    this.distPill = null;
    this.jumpBtn = null;
    this.obstacles = [];
    this.pickups = [];
    this.dashes = [];
    this.bushes = [];
    this.vy = 0;
    this.onGround = true;
    this.jumps = 0;
    this.bunnyY = GROUND_Y - HOP;
    this.speed = 330;
    this.distance = 0;
    this.score = 0;
    this.carrots = 0;
    this.starsGot = 0;
    this.spawnDist = 320;
    this.travelled = 0;
    this.dead = false;
    this.finished = false;
    this.baseScale = BUNNY_SCALE;

    const ok = this.setup3D({
      lighting: 'day',
      camera: { pos: [0, 3.2, 7], look: [0, 1, 0], fov: 46 },
      introDur: 800,
      introFrom: [5, 7.5, 17],
      hud: false,
    });
    if (!ok) return;

    const topFade = this.add.graphics().setDepth(5);
    topFade.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.34, 0.34, 0, 0);
    topFade.fillRect(0, 0, 1280, 170);
    const botFade = this.add.graphics().setDepth(5);
    botFade.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0, 0, 0.4, 0.4);
    botFade.fillRect(0, 520, 1280, 200);

    this.showHud({ score: 0, center: '🐰 BUNNY RUN' });
    this.distPill = new Pill(this, 640, 100, '📏 0 m', { color: 0x6bcb77, minW: 180, depth: 20 });
    label(this, 640, 548, 'TAP or SPACE to jump!', {
      size: 22,
      color: '#2f6b33',
      stroke: '#ffffff',
      strokeThickness: 5,
      depth: 12,
    });

    this.jumpBtn = button(this, {
      x: JUMP_X,
      y: JUMP_Y,
      w: JUMP_W,
      h: JUMP_H,
      icon: '⬆️',
      label: 'JUMP',
      layout: 'stack',
      color: 0x6bcb77,
      iconSize: 34,
      fontSize: 30,
      depth: 40,
      onClick: () => this.jump(),
    });

    this.addKey('SPACE', () => this.jump());
    this.addKey('UP', () => this.jump());
    this.addKey('W', () => this.jump());

    this.exposeTest({
      state: () => ({
        score: this.score,
        y: Math.round(hopY(this.bunnyY) * 1000) / 1000,
        jumping: !this.onGround,
        distance: this.distance,
        obstacles: this.obstacles.length,
        over: this.dead || this.finished,
        carrots: this.carrots,
        stars: this.starsGot,
        pickups: this.pickups.length,
        speed: Math.round(this.speed),
        jumps: this.jumps,
        ready: this.gameplayReady,
        anim: this.bunny ? this.bunny.anim.current : 'idle',
      }),
      probe: () => ({ x: JUMP_X, y: JUMP_Y, label: 'jump' }),
    });
  }

  protected build3D(): void {
    const stage = this.stage!;
    stage.scene.fog = new THREE.Fog(0xd9f6ff, 18, 34);

    const world = createGardenWorld(stage, { seed: 12, quality: stage.quality });
    this.world = world;
    this.clearRunway(world);

    const path = mesh(GEO.box(5, 0.06, 44), matteMat(0xd8bf8a), { cast: false, receive: true });
    path.position.set(0, 0.03, -12);
    stage.scene.add(path);
    for (const s of [-1, 1]) {
      const edge = mesh(GEO.box(0.22, 0.07, 44), matteMat(0xc2a878), { cast: false, receive: true });
      edge.position.set(s * 2.4, 0.035, -12);
      stage.scene.add(edge);
    }

    for (let i = 0; i < DASH_COUNT; i++) {
      const d = mesh(GEO.box(4.4, 0.03, 0.17), matteMat(0xbf9f63), { cast: false, receive: false });
      d.position.set(0, 0.075, NEAR_Z - i * DASH_GAP);
      stage.scene.add(d);
      this.dashes.push(d);
    }
    for (let i = 0; i < BUSH_COUNT; i++) {
      const b = makeBush();
      b.position.set(i % 2 === 0 ? -BUSH_X : BUSH_X, 0, NEAR_Z - i * BUSH_GAP);
      stage.scene.add(b);
      this.bushes.push(b);
    }

    const bunny = createCharacter('bunny', { scale: BUNNY_SCALE });
    bunny.root.rotation.y = Math.PI;
    bunny.root.position.set(0, 0, 0);
    bunny.play('run');
    stage.scene.add(bunny.root);
    this.bunny = bunny;
    this.baseScale = bunny.root.scale.x;

    this.rig?.followTarget(bunny.root, {
      height: 3.2,
      distance: 7,
      lerp: 4,
      worldAligned: true,
    });
  }

  private clearRunway(world: World): void {
    const box = new THREE.Box3();
    for (const o of world.root.children) {
      if (o.position.y > 1) continue;
      box.setFromObject(o);
      if (box.isEmpty()) continue;
      if (box.max.x - box.min.x > 30) continue;
      if (box.min.z > 8 || box.max.z < -30) continue;
      if (box.max.x < -LANE_CLEAR || box.min.x > LANE_CLEAR) continue;
      const side = o.position.x < 0 ? -1 : 1;
      o.position.x += side > 0 ? LANE_CLEAR - box.min.x : -LANE_CLEAR - box.max.x;
    }
  }

  protected override onGameplayStart(): void {
    this.jumpBtn?.pulse();
  }

  protected override on3DUpdate(dt: number, t: number): void {
    const stage = this.stage;
    const bunny = this.bunny;
    if (!stage || !bunny) return;

    bunny.update(dt);
    this.world?.update(dt, t / 1000);
    if (this.dead) return;

    this.vy += GRAVITY * dt;
    this.bunnyY += this.vy * dt;
    const floor = GROUND_Y - HOP;
    if (this.bunnyY >= floor) {
      if (!this.onGround) this.land();
      this.bunnyY = floor;
      this.vy = 0;
      this.onGround = true;
      this.jumps = 0;
      bunny.root.rotation.x = 0;
    }
    bunny.root.position.y = hopY(this.bunnyY);

    const anim = bunny.anim.current;
    if (!this.onGround) {
      if (anim !== 'jump' && anim !== 'fall') bunny.play('jump');
    } else if (anim !== 'run') {
      bunny.play('run');
    }

    if (!this.gameplayReady) return;

    this.speed = Math.min(760, this.speed + dt * 7);
    const dx = this.speed * dt;
    this.travelled += dx;
    this.distance = Math.floor(this.travelled / 46);
    this.score = this.distance + this.carrots * 10 + this.starsGot * 25;
    this.hud?.setScore(this.score);
    this.distPill?.set(`📏 ${this.distance} m`);

    const step = dx * PX2W;
    for (const d of this.dashes) {
      d.position.z += step;
      if (d.position.z > NEAR_Z) d.position.z -= DASH_SPAN;
    }
    for (const b of this.bushes) {
      b.position.z += step;
      if (b.position.z > NEAR_Z) b.position.z -= BUSH_SPAN;
    }

    this.spawnDist -= dx;
    if (this.spawnDist <= 0) {
      this.spawnWave();
      this.spawnDist = Phaser.Math.Between(260, 460) + this.speed * 0.35;
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.px -= dx;
      o.g.position.z = toZ(o.px);
      if (o.px < DESPAWN_OBSTACLE) {
        this.removeObstacle(i);
        continue;
      }
      if (
        Math.abs(o.px - BUNNY_X) < (o.w + BW) / 2 - 8 &&
        Math.abs(GROUND_Y - o.h / 2 - this.bunnyY) < (o.h + BH) / 2 - 10
      ) {
        this.die();
        return;
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.px -= dx;
      p.g.position.z = toZ(p.px);
      p.g.rotation.y += dt * 2;
      if (p.px < DESPAWN_PICKUP) {
        this.removePickup(i);
        continue;
      }
      if (Math.abs(p.px - BUNNY_X) < 52 && Math.abs(p.py - this.bunnyY) < 60) {
        this.collect(p);
        this.removePickup(i);
      }
    }
  }

  private spawnWave(): void {
    const stage = this.stage;
    if (!stage) return;
    if (Math.random() < 0.72) {
      const defs: { w: number; h: number; make: (w: number, h: number) => THREE.Group }[] = [
        { w: 86, h: 66, make: makeRock },
        { w: 70, h: 104, make: makeCactus },
        { w: 112, h: 56, make: makeLog },
        { w: 78, h: 78, make: makeMushroom },
      ];
      const def = defs[Phaser.Math.Between(0, defs.length - 1)];
      this.addObstacle(def.make(def.w, def.h), OBSTACLE_X, def.w, def.h);
      if (this.distance > 300 && Math.random() < 0.35) {
        this.addObstacle(def.make(def.w, def.h), OBSTACLE_X + OBSTACLE_SPREAD, def.w, def.h);
      }
    }
    if (Math.random() < 0.85) {
      const star = Math.random() < 0.25;
      const py = star ? GROUND_Y - 175 : GROUND_Y - 48;
      const g = star ? createObject('star', { size: 0.75 }) : makeCarrot();
      g.position.set(0, designYToW(py), toZ(PICKUP_X));
      stage.scene.add(g);
      this.pickups.push({ g, px: PICKUP_X, py, kind: star ? 'star' : 'carrot' });
    }
  }

  private addObstacle(g: THREE.Group, px: number, w: number, h: number): void {
    g.position.set(0, 0, toZ(px));
    this.stage?.scene.add(g);
    this.obstacles.push({ g, px, w, h });
  }

  private removeObstacle(i: number): void {
    this.obstacles[i]?.g.removeFromParent();
    this.obstacles.splice(i, 1);
  }

  private removePickup(i: number): void {
    this.pickups[i]?.g.removeFromParent();
    this.pickups.splice(i, 1);
  }

  private jump(): void {
    audio.resumeAfterGesture();
    if (this.dead) return;
    if (this.jumps < 2) {
      this.vy = JUMP_V - this.jumps * 90;
      this.jumps++;
      this.onGround = false;
      audio.play('jump');
      this.squash(0.86, 0.86);
      if (this.bunny) this.bunny.root.rotation.x = this.jumps === 2 ? 0.25 : 0.12;
    }
  }

  private squash(sx: number, sy: number): void {
    const stage = this.stage;
    const bunny = this.bunny;
    if (!stage || !bunny) return;
    const b = this.baseScale;
    stage.tween({
      dur: 180,
      ease: (k) => Math.sin(k * Math.PI),
      onUpdate: (k) => bunny.root.scale.set(b * (1 + (sx - 1) * k), b * (1 + (sy - 1) * k), b * (1 + (sx - 1) * k)),
      onComplete: () => bunny.root.scale.set(b, b, b),
    });
  }

  private land(): void {
    audio.play('land');
    const p = this.stage?.project(0, 0.1, 0);
    if (p) burst(this, p.x - 20, p.y, 0xd9f3c9, 8, { speed: 130, life: 420 });
    this.fx?.burst({
      pos: { x: 0, y: 0.08, z: 0 },
      count: 8,
      color: 0xd9f3c9,
      speed: 2.4,
      life: 0.42,
      size: 0.3,
      direction: 'ring',
      gravity: -4,
    });
    this.squash(1.15, 0.82);
  }

  private collect(p: Pickup3D): void {
    const stage = this.stage;
    const sp = stage ? stage.project(p.g.position.x, p.g.position.y, p.g.position.z) : null;
    if (p.kind === 'carrot') {
      this.carrots++;
      audio.play('collect');
      if (sp) {
        floatText(this, sp.x, sp.y, '+10', { color: '#ffa94d' });
        burst(this, sp.x, sp.y, 0xffa94d, 8);
      }
      if (this.fx) coinBurst(this.fx, p.g.position);
    } else {
      this.starsGot++;
      audio.play('star');
      if (sp) {
        floatText(this, sp.x, sp.y, '+25', { color: '#ffd93d' });
        sparkles(this, sp.x, sp.y, 0xffd93d, 12);
      }
      if (this.fx) sparkleBurst(this.fx, p.g.position);
      progress.track('stars_collected', 1);
    }
    this.score = this.distance + this.carrots * 10 + this.starsGot * 25;
    this.hud?.setScore(this.score);
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    audio.play('fail');
    const stage = this.stage;
    const bunny = this.bunny;
    if (stage && bunny) {
      const sp = stage.project(
        bunny.root.position.x,
        bunny.root.position.y + 0.6,
        bunny.root.position.z
      );
      if (sp) burst(this, sp.x, sp.y, 0xff6b6b, 16);
      this.fx?.burst({
        pos: { x: bunny.root.position.x, y: bunny.root.position.y + 0.5, z: bunny.root.position.z },
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
      bunny.play('sad');
      const y0 = bunny.root.position.y;
      const r0 = bunny.root.rotation.x;
      stage.tween({
        dur: 520,
        ease: (k) => 1 - (1 - k) * (1 - k),
        onUpdate: (k) => {
          bunny.root.position.y = y0 + 40 * PX2W * k;
          bunny.root.rotation.x = r0 + (Math.PI - r0) * k;
        },
        onComplete: () => {
          bunny.root.rotation.x = Math.PI;
        },
      });
    }
    this.time.delayedCall(850, () => {
      if (!this.scene.isActive()) return;
      progress.track('distance', this.distance);
      const stars = this.distance >= 600 ? 3 : this.distance >= 300 ? 2 : 1;
      this.finished = true;
      this.finish({
        score: this.score,
        stars,
        win: this.distance >= 300,
        subtitle: this.distance >= 300 ? 'Super jumping!' : 'Hop to it!',
        lines: [
          { icon: '📏', label: 'Distance', value: `${this.distance} m` },
          { icon: '🥕', label: 'Carrots', value: String(this.carrots) },
          { icon: '⭐', label: 'Stars', value: String(this.starsGot) },
        ],
      });
    });
  }

  protected override handleTap(_dx: number, _dy: number): void {
    this.jump();
  }
}
