import Phaser from 'phaser';
import * as THREE from 'three';
import { audio } from '../core/AudioManager';
import { burst, confetti, floatText, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { button, Pill, toast, type Btn } from '../core/UI';
import { ThreeGameScene } from '../3d/base/ThreeGameScene';
import type { ThreeStage } from '../3d/engine/stage';
import type { World } from '../3d/environments/common';
import { createRacingWorld } from '../3d/environments/racing';
import { GEO, glassMat, glowMat, matteMat, mesh, toyMat, type Quality } from '../3d/materials';
import { createObject } from '../3d/objects';
import { coinBurst, confettiBurst, sparkleBurst } from '../3d/particles';
import { createVehicle, type VehicleHandle } from '../3d/vehicles';

const ROAD_L = 360;
const ROAD_R = 920;
const TARGET_M = 900;
const ROAD_LEN = 420;
const PX2W = 14 / 560;
const X_MIN = (ROAD_L + 50 - 640) * PX2W;
const X_MAX = (ROAD_R - 50 - 640) * PX2W;
const STEER_RATE = 520 * PX2W;
const TAP_KICK = 1.4;
const WORLD_RATE = 3.4;
const SPAWN_Z = -56;
const DESPAWN_Z = 14;
const STEER_MIN_Y = 200;
const BOOST_S = 2.4;
const LEFT_X = 150;
const LEFT_Y = 620;
const RIGHT_X = 1130;
const RIGHT_Y = 620;
const BTN_W = 170;
const BTN_H = 110;

interface TrackDef {
  id: number;
  name: string;
  icon: string;
  sky: [number, number];
  grass: number;
  road: number;
  speed: number;
  obstacleRate: number;
}

const TRACKS: TrackDef[] = [
  { id: 0, name: 'Sunny Sprint', icon: '🌳', sky: [0x63c9ff, 0xd6f3ff], grass: 0x7ed957, road: 0x555a6b, speed: 1, obstacleRate: 0.75 },
  { id: 1, name: 'Sunset Speedway', icon: '🌅', sky: [0xff9a5c, 0xffd9a0], grass: 0x8bc34a, road: 0x4d4f5e, speed: 1.18, obstacleRate: 0.95 },
  { id: 2, name: 'Moonlit Motorway', icon: '🌙', sky: [0x2b3a67, 0x5a6ea8], grass: 0x4c8f52, road: 0x3b3f52, speed: 1.35, obstacleRate: 1.1 },
];

interface Drop {
  obj: THREE.Group;
  kind: 'obstacle' | 'coin' | 'star';
  hx: number;
  hz: number;
}

function makeBarrier(): THREE.Group {
  const g = new THREE.Group();
  const board = mesh(GEO.box(2.7, 0.72, 0.22), toyMat(0xffffff));
  board.position.y = 1.35;
  g.add(board);
  for (let i = 0; i < 5; i++) {
    const stripe = mesh(GEO.box(0.46, 0.74, 0.06), toyMat(0xff5c5c), { cast: false });
    stripe.position.set(-1.08 + i * 0.54, 1.35, 0.14);
    g.add(stripe);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-0.3, 0.3]) {
      const leg = mesh(GEO.box(0.16, 1, 0.16), matteMat(0x8e99a8));
      leg.position.set(sx * 1.1, 0.5, sz);
      g.add(leg);
    }
    const foot = mesh(GEO.box(0.7, 0.12, 1), matteMat(0x6f7784), { cast: false });
    foot.position.set(sx * 1.1, 0.06, 0);
    g.add(foot);
  }
  return g;
}

function makeRock(): THREE.Group {
  const g = new THREE.Group();
  const rock = mesh(GEO.icosahedron(1), matteMat(0x8b8f9a));
  rock.position.y = 0.78;
  rock.scale.set(1.05, 0.8, 0.95);
  g.add(rock);
  const chip = mesh(GEO.icosahedron(0.4), matteMat(0x767a86));
  chip.position.set(0.85, 0.3, 0.55);
  chip.scale.set(1, 0.7, 1);
  g.add(chip);
  return g;
}

function makeBarrel(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(GEO.cylinder(0.9, 0.9, 1.7, 18), toyMat(0xb0603a));
  body.position.y = 0.85;
  g.add(body);
  for (const y of [0.42, 1.28]) {
    const band = mesh(GEO.torus(0.9, 0.07), matteMat(0x5a4038));
    band.rotation.x = -Math.PI / 2;
    band.position.y = y;
    g.add(band);
  }
  const top = mesh(GEO.cylinder(0.7, 0.7, 0.1, 18), toyMat(0x7a4a30), { cast: false });
  top.position.y = 1.72;
  g.add(top);
  return g;
}

export class MiniRacingScene extends ThreeGameScene {
  private phase: 'select' | 'race' = 'select';
  private track: TrackDef = TRACKS[0];
  private car: VehicleHandle | null = null;
  private worldA: World | null = null;
  private worldB: World | null = null;
  private body: THREE.Object3D | null = null;
  private flame: THREE.Group | null = null;
  private shield: THREE.Mesh | null = null;
  private targetX = 0;
  private x = 0;
  private drops: Drop[] = [];
  private distance = 0;
  private hearts = 3;
  private invuln = 0;
  private coins = 0;
  private starsGot = 0;
  private elapsed = 0;
  private scroll = 0;
  private travel = 0;
  private score = 0;
  private spawnGap = 300;
  private boosting = false;
  private boostLeft = 0;
  private finished = false;
  private leftKey = false;
  private rightKey = false;
  private leftPtr = false;
  private rightPtr = false;
  private dragActive = false;
  private leftBtn: Btn | null = null;
  private rightBtn: Btn | null = null;
  private selectBox: Phaser.GameObjects.Container | null = null;
  private heartPill: Pill | null = null;
  private speedPill: Pill | null = null;
  private progPill: Pill | null = null;

  constructor() {
    super('MiniRacing');
  }

  create(): void {
    this.phase = 'select';
    this.track = TRACKS[0];
    this.car = null;
    this.worldA = null;
    this.worldB = null;
    this.body = null;
    this.flame = null;
    this.shield = null;
    this.targetX = 0;
    this.x = 0;
    this.drops = [];
    this.distance = 0;
    this.hearts = 3;
    this.invuln = 0;
    this.coins = 0;
    this.starsGot = 0;
    this.elapsed = 0;
    this.scroll = 0;
    this.travel = 0;
    this.score = 0;
    this.spawnGap = 300;
    this.boosting = false;
    this.boostLeft = 0;
    this.finished = false;
    this.leftKey = false;
    this.rightKey = false;
    this.leftPtr = false;
    this.rightPtr = false;
    this.dragActive = false;
    this.leftBtn = null;
    this.rightBtn = null;
    this.selectBox = null;
    this.heartPill = null;
    this.speedPill = null;
    this.progPill = null;

    const ok = this.setup3D({
      lighting: 'day',
      camera: { pos: [0, 4.5, 9], look: [0, 1, -6], fov: 55 },
      introDur: 700,
      introFrom: [6, 2.6, -7],
      hud: { score: 0, timer: 0, timerUp: true, center: '🚗 MINI RACING' },
    });
    if (!ok) return;

    this.heartPill = new Pill(this, 640, 100, '❤️❤️❤️', { color: 0xff6b6b, minW: 190, depth: 20 });
    this.speedPill = new Pill(this, 640, 150, `⚡ ${this.kmh()} km/h`, { color: 0xffa94d, minW: 190, depth: 20 });
    this.progPill = new Pill(this, 640, 660, `🏁 0 / ${TARGET_M} m`, { color: 0x4aa3ff, minW: 260, depth: 20 });

    this.leftBtn = button(this, {
      x: LEFT_X,
      y: LEFT_Y,
      w: BTN_W,
      h: BTN_H,
      icon: '◀',
      label: 'LEFT',
      layout: 'stack',
      color: 0x4aa3ff,
      iconSize: 40,
      fontSize: 22,
      depth: 40,
    });
    this.rightBtn = button(this, {
      x: RIGHT_X,
      y: RIGHT_Y,
      w: BTN_W,
      h: BTN_H,
      icon: '▶',
      label: 'RIGHT',
      layout: 'stack',
      color: 0x4aa3ff,
      iconSize: 40,
      fontSize: 22,
      depth: 40,
    });
    this.bindSteerButton(this.leftBtn, 'left');
    this.bindSteerButton(this.rightBtn, 'right');

    this.input.on('pointerdown', () => audio.resumeAfterGesture());

    for (const code of ['LEFT', 'UP', 'A', 'W']) {
      this.addKey(code, () => this.hold('left', true), () => this.hold('left', false));
    }
    for (const code of ['RIGHT', 'DOWN', 'D', 'S']) {
      this.addKey(code, () => this.hold('right', true), () => this.hold('right', false));
    }

    this.time.addEvent({
      delay: 2400,
      loop: true,
      callback: () => {
        if (this.phase === 'race' && Math.random() < 0.6) {
          const x = Phaser.Math.Between(ROAD_L + 60, ROAD_R - 60);
          sparkles(this, x, Phaser.Math.Between(120, 400), 0xffffff, 3);
        }
      },
    });

    this.showTrackSelect();

    this.exposeTest({
      state: () => ({
        x: Math.round(this.x * 1000) / 1000,
        speed: Math.round(this.speedPx()),
        distance: this.distance,
        score: this.score,
        steer: this.targetX > this.x + 0.02 ? 1 : this.targetX < this.x - 0.02 ? -1 : 0,
        lives: this.hearts,
        health: this.hearts,
        boosting: this.boosting,
        over: this.finished,
        phase: this.phase,
        coins: this.coins,
        stars: this.starsGot,
        elapsed: Math.round(this.elapsed * 10) / 10,
        ready: this.gameplayReady,
        kmh: this.kmh(),
      }),
      probe: () => (this.leftBtn && !this.finished ? { x: LEFT_X, y: LEFT_Y, label: 'left' } : null),
    });
  }

  private showTrackSelect(): void {
    const box = this.add.container(0, 0).setDepth(30);
    this.selectBox = box;
    const scrim = this.add.graphics();
    scrim.fillStyle(0x1f2340, 0.55);
    scrim.fillRect(0, 0, 1280, 720);
    const p = this.add.graphics();
    p.fillStyle(0xffffff, 1);
    p.fillRoundedRect(240, 170, 800, 400, 40);
    p.lineStyle(5, 0xffffff, 1);
    p.strokeRoundedRect(240, 170, 800, 400, 40);
    const t = this.add
      .text(640, 235, '🚗 PICK A TRACK', {
        fontFamily: "'Trebuchet MS',sans-serif",
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#33364f',
      })
      .setOrigin(0.5);
    box.add([scrim, p, t]);

    TRACKS.forEach((tr, i) => {
      const b = button(this, {
        x: 400 + i * 240,
        y: 360,
        w: 210,
        h: 150,
        icon: tr.icon,
        label: tr.name.split(' ')[0],
        sub: `${tr.speed.toFixed(2)}x speed`,
        layout: 'stack',
        color: [0x6bcb77, 0xffa94d, 0xa78bfa][i],
        iconSize: 50,
        fontSize: 26,
        subSize: 16,
        depth: 31,
        onClick: () => this.startRace(tr),
      });
      b.setDepth(31);
      box.add(b);
    });

    const tip = this.add
      .text(640, 500, '◀ ▶ buttons, ← → / A/D, or drag to steer', {
        fontFamily: "'Trebuchet MS',sans-serif",
        fontSize: '24px',
        color: '#6b7280',
      })
      .setOrigin(0.5);
    box.add(tip);
  }

  private startRace(track: TrackDef): void {
    if (this.phase === 'race') return;
    this.track = track;
    this.phase = 'race';
    this.selectBox?.destroy(true);
    this.selectBox = null;
    const preset = track.id === 1 ? 'sunset' : track.id === 2 ? 'night' : 'day';
    this.stage?.setLighting(preset);
    this.car?.setLights(true);
    audio.play('whoosh');
    audio.play('engine');
    toast(this, '🏁 GO!', { color: 0xffd93d, fontSize: 56, duration: 1100 });
  }

  private bindSteerButton(b: Btn, side: 'left' | 'right'): void {
    b.on('pointerdown', () => {
      audio.resumeAfterGesture();
      if (side === 'left') this.leftPtr = true;
      else this.rightPtr = true;
      this.press(side);
    });
    const release = (): void => {
      if (side === 'left') this.leftPtr = false;
      else this.rightPtr = false;
    };
    b.on('pointerup', release);
    b.on('pointerupoutside', release);
    b.on('pointerout', release);
  }

  private press(side: 'left' | 'right'): void {
    if (this.phase === 'select' && !this.finished) this.startRace(TRACKS[0]);
    if (this.finished) return;
    this.targetX = Phaser.Math.Clamp(
      this.targetX + (side === 'left' ? -TAP_KICK : TAP_KICK),
      X_MIN,
      X_MAX
    );
  }

  private hold(side: 'left' | 'right', on: boolean): void {
    if (side === 'left') {
      if (this.leftKey === on) return;
      this.leftKey = on;
    } else {
      if (this.rightKey === on) return;
      this.rightKey = on;
    }
    if (on && this.phase === 'select' && !this.finished) this.startRace(TRACKS[0]);
  }

  protected build3D(): void {
    const stage = this.stage!;

    const ground = mesh(GEO.plane(1600, 2600), matteMat(0x69a05a), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.03, -700);
    stage.scene.add(ground);

    const quality: Quality = stage.quality === 'high' ? 'medium' : stage.quality;
    this.worldA = createRacingWorld(stage, { seed: 7, quality });
    this.worldB = createRacingWorld(stage, { seed: 7, quality });
    stage.scene.add(this.worldA.root, this.worldB.root);

    this.car = createVehicle('racingCar', { color: 0x4aa3ff, accent: 0xffd93d, scale: 1.3 });
    this.car.root.rotation.y = Math.PI;
    this.car.root.position.set(0, 0, 0);
    stage.scene.add(this.car.root);

    this.body = (this.car.root.userData.body as THREE.Object3D | undefined) ?? null;
    const host = this.body ?? this.car.root;

    this.flame = new THREE.Group();
    this.flame.position.set(0, 0.35, -1.45);
    for (const s of [-1, 1]) {
      const f = mesh(GEO.cone(0.2, 0.8, 10), glowMat(0xffa94d, 1.3), { cast: false, receive: false });
      f.rotation.x = -Math.PI / 2;
      f.position.set(s * 0.36, 0, -0.42);
      this.flame.add(f);
    }
    this.flame.visible = false;
    host.add(this.flame);

    this.shield = mesh(GEO.sphere(1.85, 20), glassMat(0x9be2ff, 0.32), { cast: false, receive: false });
    this.shield.position.y = 0.65;
    this.shield.scale.set(1, 0.66, 1);
    this.shield.visible = false;
    this.car.root.add(this.shield);

    this.rig?.followTarget(this.car.root, {
      height: 4.5,
      distance: 9,
      lerp: 4,
      lookAhead: -6,
      worldAligned: true,
    });
  }

  protected override onGameplayStart(): void {
    this.leftBtn?.pulse();
    this.rightBtn?.pulse();
  }

  protected override on3DUpdate(dt: number, t: number): void {
    const anyDown =
      this.input.mousePointer.isDown ||
      this.input.activePointer.isDown ||
      this.input.pointer1.isDown;
    if (!anyDown) {
      this.leftPtr = false;
      this.rightPtr = false;
      this.dragActive = false;
    }

    const stage = this.stage;
    const car = this.car;
    const worldA = this.worldA;
    const worldB = this.worldB;
    if (!stage || !car || !worldA || !worldB) return;

    let worldStep = 0;

    if (this.phase === 'race' && !this.finished) {
      this.elapsed += dt;
      this.hud?.setTimer(this.elapsed);

      if (this.leftKey || this.leftPtr) this.targetX -= STEER_RATE * dt;
      if (this.rightKey || this.rightPtr) this.targetX += STEER_RATE * dt;
      this.targetX = Phaser.Math.Clamp(this.targetX, X_MIN, X_MAX);
      this.x += (this.targetX - this.x) * Math.min(1, dt * 9);

      const speedPx = this.speedPx();
      this.scroll += speedPx * dt;
      this.distance = Math.min(TARGET_M, Math.floor(this.scroll / 46));
      this.score = this.coins * 10 + this.starsGot * 25 + Math.floor(this.distance / 2);
      this.hud?.setScore(this.score);
      this.progPill?.set(`🏁 ${this.distance} / ${TARGET_M} m`);
      this.speedPill?.set(`⚡ ${this.kmh()} km/h`);

      worldStep = speedPx * PX2W * WORLD_RATE * dt;
      this.travel += worldStep;

      this.spawnGap -= speedPx * dt;
      if (this.spawnGap <= 0) {
        this.spawnDrop(stage);
        this.spawnGap = Phaser.Math.Between(200, 360);
      }

      if (this.boosting) {
        this.boostLeft -= dt;
        if (this.boostLeft <= 0) {
          this.boosting = false;
          this.boostLeft = 0;
          if (this.flame) this.flame.visible = false;
        }
      }

      if (this.invuln > 0) {
        this.invuln -= dt;
        if (this.body) this.body.visible = Math.floor(this.elapsed * 12) % 2 === 0;
        if (this.invuln <= 0) {
          this.invuln = 0;
          if (this.body) this.body.visible = true;
          if (this.shield) this.shield.visible = false;
        }
      }

      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.obj.position.z += worldStep;
        if (d.kind === 'coin') d.obj.rotation.y += dt * 3;
        if (d.obj.position.z > DESPAWN_Z) {
          this.removeDrop(i);
          continue;
        }
        if (Math.abs(d.obj.position.x - this.x) >= d.hx || Math.abs(d.obj.position.z) >= d.hz) {
          continue;
        }

        if (d.kind === 'obstacle') {
          if (this.invuln > 0) continue;
          this.hearts--;
          this.heartPill?.set('❤️'.repeat(Math.max(0, this.hearts)) || '💔', 0xff6b6b);
          this.invuln = 1.6;
          audio.play('fail');
          const sp = stage.project(d.obj.position.x, 1, d.obj.position.z);
          if (sp) burst(this, sp.x, sp.y, 0xff6b6b, 14);
          if (this.fx) {
            this.fx.burst({
              pos: { x: d.obj.position.x, y: 1, z: d.obj.position.z },
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
          }
          this.rig?.shake(0.35, 0.3);
          const cp = stage.project(this.x, 1.2, 0);
          if (cp) floatText(this, cp.x, cp.y - 70, '-1 ❤️', { color: '#ff6b6b' });
          this.removeDrop(i);
          if (this.hearts <= 0) {
            this.endRace(false);
            return;
          }
        } else if (d.kind === 'coin') {
          this.coins++;
          audio.play('coin');
          const sp = stage.project(d.obj.position.x, 1, d.obj.position.z);
          if (sp) {
            floatText(this, sp.x, sp.y, '+10', { color: '#ffd93d', size: 26 });
            burst(this, sp.x, sp.y, 0xffd93d, 8);
          }
          if (this.fx) coinBurst(this.fx, d.obj.position);
          this.removeDrop(i);
          if (this.coins % 3 === 0) this.startBoost();
        } else {
          this.starsGot++;
          audio.play('star');
          progress.track('stars_collected', 1);
          const sp = stage.project(d.obj.position.x, 1, d.obj.position.z);
          if (sp) {
            sparkles(this, sp.x, sp.y, 0xffd93d, 12);
            floatText(this, sp.x, sp.y, '+25', { color: '#ffd93d', size: 30 });
          }
          if (this.fx) sparkleBurst(this.fx, d.obj.position);
          this.removeDrop(i);
        }
      }

      if (this.distance >= TARGET_M) this.endRace(true);
    }

    worldA.root.position.z = this.travel % ROAD_LEN;
    worldB.root.position.z = (this.travel % ROAD_LEN) - ROAD_LEN;
    worldA.update(dt, t);
    worldB.update(dt, t);

    if (this.shield?.visible) {
      const k = 1 + Math.sin(t / 90) * 0.05;
      this.shield.scale.set(k, 0.66 * k, k);
    }
    if (this.flame?.visible) {
      const k = 0.8 + Math.abs(Math.sin(t / 65)) * 0.4;
      this.flame.scale.set(1, 1, k);
    }

    const gap = this.targetX - this.x;
    const turn = Phaser.Math.Clamp(gap * 0.8, -1, 1);
    car.root.position.x = this.x;
    car.root.rotation.y = Math.PI - Phaser.Math.Clamp(gap * 0.4, -0.22, 0.22);
    car.steer(-turn * 0.42);
    car.setBodyRoll(-turn * 0.13, this.boosting ? -0.03 : 0);
    if (worldStep > 0) car.spinWheels(worldStep / 0.9);
  }

  private spawnDrop(stage: ThreeStage): void {
    const roll = Math.random();
    const px = Phaser.Math.Between(ROAD_L + 55, ROAD_R - 55);
    const x = (px - 640) * PX2W;
    if (roll < 0.42 * this.track.obstacleRate) {
      const which = Phaser.Math.Between(0, 2);
      const g = which === 0 ? makeBarrier() : which === 1 ? makeRock() : makeBarrel();
      const hx = which === 0 ? 2.05 : which === 1 ? 1.75 : 1.625;
      const hz = which === 0 ? 1.35 : which === 1 ? 1.425 : 1.65;
      g.position.set(x, 0, SPAWN_Z);
      stage.scene.add(g);
      this.drops.push({ obj: g, kind: 'obstacle', hx, hz });
    } else if (roll < 0.82) {
      const g = createObject('coin', { size: 1.6 });
      g.position.set(x, 1, SPAWN_Z);
      stage.scene.add(g);
      this.drops.push({ obj: g, kind: 'coin', hx: 1.5, hz: 1.3 });
    } else {
      const g = createObject('star', { size: 1.65 });
      g.position.set(x, 1.1, SPAWN_Z);
      stage.scene.add(g);
      this.drops.push({ obj: g, kind: 'star', hx: 1.525, hz: 1.325 });
    }
  }

  private removeDrop(i: number): void {
    this.drops[i]?.obj.removeFromParent();
    this.drops.splice(i, 1);
  }

  private startBoost(): void {
    if (this.boosting) return;
    this.boosting = true;
    this.boostLeft = BOOST_S;
    if (this.flame) this.flame.visible = true;
    audio.play('engine');
  }

  private speedPx(): number {
    return 420 * this.track.speed * (this.boosting ? 1.3 : 1);
  }

  private kmh(): number {
    return Math.round(this.speedPx() * PX2W * WORLD_RATE * 3.6);
  }

  protected override handleTap(dx: number, dy: number): void {
    if (this.phase !== 'race' || this.finished || dy <= STEER_MIN_Y) return;
    this.dragActive = true;
    this.targetX = Phaser.Math.Clamp((dx - 640) * PX2W, X_MIN, X_MAX);
  }

  protected override handleDragMove(dx: number, dy: number): void {
    if (!this.dragActive || this.phase !== 'race' || this.finished || dy <= STEER_MIN_Y) return;
    this.targetX = Phaser.Math.Clamp((dx - 640) * PX2W, X_MIN, X_MAX);
  }

  protected override handleDragEnd(_dx: number, _dy: number): void {
    this.dragActive = false;
  }

  private endRace(won: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.gameplayReady = false;
    this.leftKey = false;
    this.rightKey = false;
    this.leftPtr = false;
    this.rightPtr = false;
    this.dragActive = false;
    this.boosting = false;
    this.boostLeft = 0;
    if (this.flame) this.flame.visible = false;
    if (this.body) this.body.visible = true;
    if (this.shield) this.shield.visible = false;
    for (const d of this.drops) d.obj.removeFromParent();
    this.drops = [];

    if (won) {
      this.score += 200 + this.hearts * 50;
      audio.play('success');
      confetti(this, 2000);
      progress.track('races_won', 1);
      if (this.fx) confettiBurst(this.fx, { x: 0, y: 3, z: -8 }, { count: 40, speed: 7, life: 1.6 });
      const fl = this.add.graphics().setDepth(20);
      for (let i = 0; i < 14; i++) {
        fl.fillStyle(i % 2 === 0 ? 0xffffff : 0x33364f, 1);
        fl.fillRect(ROAD_L + i * 40, 300, 40, 40);
        fl.fillStyle(i % 2 === 0 ? 0x33364f : 0xffffff, 1);
        fl.fillRect(ROAD_L + i * 40, 340, 40, 40);
      }
      fl.setAlpha(0);
      this.tweens.add({ targets: fl, alpha: 1, duration: 400 });
    } else {
      audio.play('fail');
    }

    this.time.delayedCall(won ? 1100 : 800, () => {
      if (!this.scene.isActive()) return;
      const stars = won ? (this.hearts === 3 ? 3 : this.elapsed < 70 ? 2 : 1) : 1;
      this.finish({
        score: this.score,
        stars,
        win: won,
        subtitle: won ? 'You crossed the finish line!' : 'Out of hearts — try again!',
        lines: [
          { icon: '⏱', label: 'Time', value: `${this.elapsed.toFixed(1)}s` },
          { icon: '🪙', label: 'Coins', value: String(this.coins) },
          { icon: '⭐', label: 'Stars', value: String(this.starsGot) },
        ],
      });
    });
  }
}
