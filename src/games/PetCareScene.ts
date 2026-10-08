import Phaser from 'phaser';
import * as THREE from 'three';
import { audio } from '../core/AudioManager';
import { burst, confetti, floatText, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { button, label, Meter, Pill, toast } from '../core/UI';
import { createFood } from '../3d/assets/food';
import { ThreeGameScene } from '../3d/base/ThreeGameScene';
import { createCharacter, type CharacterHandle } from '../3d/characters';
import { GEO, glassMat, group, matteMat, mesh, toyMat } from '../3d/materials';
import { createObject } from '../3d/objects';
import { confettiBurst, sparkleBurst, waterSplash } from '../3d/particles';

const SESSION = 90;
const BTN_W = 196;
const BTN_H = 76;
const BTN_Y = 660;
const BTN_X = [216, 428, 640, 852, 1064];

interface Action {
  icon: string;
  label: string;
  color: number;
  apply: () => void;
}

/** Nurturing game: feed, wash, play and pamper a cute pet - now in real 3D. */
export class PetCareScene extends ThreeGameScene {
  private happy = 65;
  private food = 70;
  private clean = 60;
  private timeLeft = SESSION;
  private actions = 0;
  private sleeping = false;
  private idle = 0;
  private won = false;
  private over = false;
  private score = 0;
  private faceKey = '';
  private faceTimer = 0;
  private moving = false;
  private biteBusy = false;
  private petScale = 1.7;
  private meters: Meter[] = [];
  private thought: Phaser.GameObjects.Text | null = null;
  private timePill: Pill | null = null;
  private room = new THREE.Group();
  private pet: CharacterHandle | null = null;
  private bite: THREE.Group | null = null;
  private ball: THREE.Group | null = null;
  private tubBubbles: THREE.Object3D[] = [];
  private home = new THREE.Vector3(0.4, 0, 1);
  private biteHome = new THREE.Vector3(4.8, 0.74, 1.4);
  private tubTop = new THREE.Vector3(-5.8, 1.3, 3.4);

  constructor() {
    super('PetCare');
  }

  create(): void {
    this.happy = 65;
    this.food = 70;
    this.clean = 60;
    this.timeLeft = SESSION;
    this.actions = 0;
    this.sleeping = false;
    this.idle = 0;
    this.won = false;
    this.over = false;
    this.score = 0;
    this.faceKey = '';
    this.faceTimer = 0;
    this.moving = false;
    this.biteBusy = false;
    this.meters = [];
    this.thought = null;
    this.timePill = null;
    this.room = new THREE.Group();
    this.pet = null;
    this.bite = null;
    this.ball = null;
    this.tubBubbles = [];

    const ok = this.setup3D({
      lighting: 'indoor',
      camera: { pos: [9, 8, 12], look: [0.4, 1.6, 0.6], fov: 45 },
      introDur: 800,
      introFrom: [15, 14, 20],
      hud: { score: 0, timer: SESSION, center: '🐶 PET CARE' },
    });
    if (!ok) return;

    this.timePill = new Pill(this, 640, 100, `⏱ ${SESSION}s`, { color: 0x4aa3ff, minW: 170, depth: 20 });
    this.thought = label(this, 640, 300, ' ', { size: 46, depth: 12 });

    const defs = [
      { icon: '❤️', color: 0xff6b6b, key: 'happy' as const },
      { icon: '🍎', color: 0xffa94d, key: 'food' as const },
      { icon: '✨', color: 0x4dd0e1, key: 'clean' as const },
    ];
    this.meters = defs.map(
      (d, i) =>
        new Meter(this, {
          x: 280,
          y: 175 + i * 76,
          w: 340,
          h: 34,
          value: this[d.key],
          max: 100,
          color: d.color,
          icon: d.icon,
          depth: 20,
        })
    );

    const actions: Action[] = [
      { icon: '🍗', label: 'FEED', color: 0xffa94d, apply: () => this.doAction('food', 28, 'feed') },
      { icon: '🛁', label: 'BATH', color: 0x4dd0e1, apply: () => this.doAction('clean', 32, 'bath') },
      { icon: '⚽', label: 'PLAY', color: 0x6bcb77, apply: () => this.doAction('happy', 24, 'play') },
      { icon: '💤', label: 'SLEEP', color: 0x4aa3ff, apply: () => this.doAction('none', 0, 'sleep') },
      { icon: '❤️', label: 'PAT', color: 0xff8fab, apply: () => this.doAction('happy', 10, 'pat') },
    ];
    actions.forEach((a, i) => {
      button(this, {
        x: BTN_X[i],
        y: BTN_Y,
        w: BTN_W,
        h: BTN_H,
        icon: a.icon,
        label: a.label,
        layout: 'stack',
        color: a.color,
        iconSize: 32,
        fontSize: 22,
        depth: 20,
        onClick: a.apply,
      });
    });

    label(this, 940, 330, 'Keep all bars full\nfor a happy pet!', {
      size: 24,
      color: '#ffffff',
      stroke: '#33364f',
      strokeThickness: 5,
      wrap: 320,
      depth: 15,
    });

    this.input.on('pointerdown', () => audio.resumeAfterGesture());

    this.updateMeters();
    this.setFace();

    this.exposeTest({
      state: () => ({
        score: this.score,
        food: this.food,
        happy: this.happy,
        clean: this.clean,
        hunger: this.food,
        happiness: this.happy,
        energy: this.energy(),
        mood: this.pet ? this.pet.anim.current : 'idle',
        sleeping: this.sleeping,
        actions: this.actions,
        timeLeft: Math.max(0, Math.round(this.timeLeft * 10) / 10),
        won: this.won,
        over: this.over,
      }),
      probe: () => ({ x: BTN_X[0], y: BTN_Y, label: 'feed' }),
    });
  }

  /* ---------------- 3D world ---------------- */

  protected build3D(): void {
    const stage = this.stage!;
    stage.scene.add(this.room);

    const floor = mesh(GEO.box(30, 0.5, 26), matteMat(0xc98a5b), { cast: false, receive: true });
    floor.position.set(0, -0.25, 3);
    this.room.add(floor);
    for (let i = 0; i < 15; i++) {
      const plank = mesh(GEO.box(0.1, 0.04, 26), matteMat(0xb87b52), { cast: false, receive: true });
      plank.position.set(-14 + i * 2, 0.02, 3);
      this.room.add(plank);
    }

    const backWall = mesh(GEO.box(19, 8, 0.5), matteMat(0xffd6e0), { cast: false, receive: true });
    backWall.position.set(0, 4, -7.25);
    const leftWall = mesh(GEO.box(0.5, 8, 15), matteMat(0xffe9ef), { cast: false, receive: true });
    leftWall.position.set(-9.25, 4, 0);
    const skirtBack = mesh(GEO.box(19, 0.6, 0.72), matteMat(0xffffff), { cast: false });
    skirtBack.position.set(0, 0.3, -7.2);
    const skirtLeft = mesh(GEO.box(0.72, 0.6, 15), matteMat(0xffffff), { cast: false });
    skirtLeft.position.set(-9.2, 0.3, 0);
    this.room.add(backWall, leftWall, skirtBack, skirtLeft);

    const winFrame = mesh(GEO.roundedBox(4.2, 3.2, 0.3, 0.2), matteMat(0xffffff));
    winFrame.position.set(4.4, 4.2, -6.95);
    const winPane = mesh(GEO.roundedBox(3.6, 2.6, 0.2, 0.15), glassMat(0xbfe6ff, 0.9), { cast: false });
    winPane.position.set(4.4, 4.2, -6.82);
    const mullionV = mesh(GEO.box(0.16, 2.6, 0.24), matteMat(0xffffff), { cast: false });
    mullionV.position.set(4.4, 4.2, -6.72);
    const mullionH = mesh(GEO.box(3.6, 0.16, 0.24), matteMat(0xffffff), { cast: false });
    mullionH.position.set(4.4, 4.2, -6.72);
    this.room.add(winFrame, winPane, mullionV, mullionH);

    const picFrame = mesh(GEO.box(0.16, 2.1, 2.5), matteMat(0xffffff));
    picFrame.position.set(-8.92, 4.4, -2.6);
    const picArt = mesh(GEO.box(0.16, 1.7, 2.1), toyMat(0xfff3c4));
    picArt.position.set(-8.84, 4.4, -2.6);
    this.room.add(picFrame, picArt);

    const rug = mesh(GEO.cylinder(3.3, 3.3, 0.14, 32), matteMat(0xff8fab), { cast: false, receive: true });
    rug.position.set(0.4, 0.07, 1);
    const rugRing = mesh(GEO.torus(2.7, 0.14), matteMat(0xffd93d), { cast: false, receive: true });
    rugRing.rotation.x = -Math.PI / 2;
    rugRing.position.set(0.4, 0.14, 1);
    this.room.add(rug, rugRing);

    const bedBase = mesh(GEO.cylinder(1.7, 1.9, 0.5, 26), toyMat(0xa78bfa));
    bedBase.position.set(-5, 0.25, -3.6);
    const bedMatt = mesh(GEO.sphere(1.5, 18), matteMat(0xc4b5fd), { cast: false, receive: true });
    bedMatt.scale.set(1, 0.34, 1);
    bedMatt.position.set(-5, 0.58, -3.6);
    const bedRim = mesh(GEO.torus(1.6, 0.22), toyMat(0xa78bfa));
    bedRim.rotation.x = -Math.PI / 2;
    bedRim.position.set(-5, 0.7, -3.6);
    const bed = group(bedBase, bedMatt, bedRim);
    this.room.add(bed);
    this.interact!.add(bed, { kind: 'tap', onTap: () => this.doAction('none', 0, 'sleep') });

    const tub = new THREE.Group();
    tub.position.set(-5.8, 0, 3.4);
    const tubFloor = mesh(GEO.roundedBox(3.4, 0.4, 2.4, 0.16), matteMat(0xffffff), { receive: true });
    tubFloor.position.y = 0.2;
    const rimFront = mesh(GEO.roundedBox(3.4, 1.3, 0.32, 0.14), matteMat(0xffffff));
    rimFront.position.set(0, 0.85, 1.04);
    const rimBack = rimFront.clone();
    rimBack.position.z = -1.04;
    const rimLeft = mesh(GEO.roundedBox(0.32, 1.3, 1.8, 0.14), matteMat(0xffffff));
    rimLeft.position.set(-1.54, 0.85, 0);
    const rimRight = rimLeft.clone();
    rimRight.position.x = 1.54;
    const water = mesh(GEO.roundedBox(2.9, 1, 1.8, 0.12), glassMat(0x4dd0e1, 0.5), {
      cast: false,
      receive: false,
    });
    water.position.y = 0.66;
    const tapPost = mesh(GEO.cylinder(0.1, 0.12, 1.4, 12), toyMat(0xc9d2de));
    tapPost.position.set(0, 2.2, -1.35);
    const tapArm = mesh(GEO.box(0.18, 0.18, 0.9), toyMat(0xc9d2de));
    tapArm.position.set(0, 2.8, -0.95);
    const tapHead = mesh(GEO.sphere(0.15, 10), toyMat(0xc9d2de));
    tapHead.position.set(0, 2.7, -0.5);
    tub.add(tubFloor, rimFront, rimBack, rimLeft, rimRight, water, tapPost, tapArm, tapHead);
    for (let i = 0; i < 4; i++) {
      const b = mesh(GEO.sphere(0.14, 10), glassMat(0xffffff, 0.75), { cast: false, receive: false });
      b.position.set(-1.1 + i * 0.7, 1.16, -0.5 + (i % 2) * 0.9);
      b.userData.phase = i * 1.7;
      tub.add(b);
      this.tubBubbles.push(b);
    }
    this.room.add(tub);
    this.interact!.add(tub, { kind: 'tap', onTap: () => this.doAction('clean', 32, 'bath') });

    const bowl = new THREE.Group();
    bowl.position.set(4.8, 0, 1.4);
    const bowlFoot = mesh(GEO.cylinder(0.42, 0.5, 0.12, 20), matteMat(0x2f6fa8));
    bowlFoot.position.y = 0.06;
    const bowlBody = mesh(GEO.cylinder(0.92, 0.6, 0.55, 24), toyMat(0x4aa3ff));
    bowlBody.position.y = 0.275;
    const bowlRim = mesh(GEO.torus(0.9, 0.1), matteMat(0xffffff));
    bowlRim.rotation.x = -Math.PI / 2;
    bowlRim.position.y = 0.54;
    bowl.add(bowlFoot, bowlBody, bowlRim);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const k = mesh(GEO.sphere(0.13, 8), toyMat(i % 2 ? 0x8a5a2b : 0xa8703c));
      k.position.set(Math.cos(a) * 0.45, 0.56 + (i % 3) * 0.05, Math.sin(a) * 0.45);
      bowl.add(k);
    }
    this.room.add(bowl);
    this.interact!.add(bowl, { kind: 'tap', onTap: () => this.doAction('food', 28, 'feed') });

    this.bite = createFood('cookie', 0.75);
    this.bite.position.copy(this.biteHome);
    this.room.add(this.bite);
    this.interact!.add(this.bite, { kind: 'tap', onTap: () => this.doAction('food', 28, 'feed') });

    this.ball = createObject('ball', { color: 0xffd93d, size: 0.95 });
    this.ball.position.set(3, 0.48, 2.6);
    this.room.add(this.ball);
    this.interact!.add(this.ball, { kind: 'tap', onTap: () => this.doAction('happy', 16, 'toy') });

    this.pet = createCharacter('dog', { scale: this.petScale });
    this.pet.root.position.copy(this.home);
    this.room.add(this.pet.root);
    this.pet.play('idle');
    this.interact!.add(this.pet.root, { kind: 'tap', onTap: () => this.doAction('happy', 10, 'pat') });
  }

  protected override onGameplayStart(): void {
    this.pet?.play('happy');
  }

  protected override on3DUpdate(dt: number, t: number): void {
    if (this.pet) this.pet.update(dt);
    if (this.ball) this.ball.rotation.y += dt * 0.6;
    for (const b of this.tubBubbles) {
      b.position.y = 1.16 + Math.sin(t / 600 + ((b.userData.phase as number) ?? 0)) * 0.05;
    }
    const tp = this.thoughtPos();
    if (tp) this.thought?.setPosition(tp.x, tp.y);

    if (!this.gameplayReady || this.won || this.over) return;

    this.timeLeft -= dt;
    this.hud?.setTimer(this.timeLeft);
    this.timePill?.set(`⏱ ${Math.max(0, Math.ceil(this.timeLeft))}s`);

    if (this.timeLeft <= 0) {
      this.endGame(false);
      return;
    }

    this.food = Math.max(0, this.food - 1.5 * dt);
    this.clean = Math.max(0, this.clean - 1.1 * dt);
    this.happy = Math.max(0, this.happy - 1.0 * dt);
    this.idle += dt;
    if (this.idle > 7 && !this.sleeping) {
      this.sleeping = true;
      this.setFace();
    }

    this.updateMeters();
    this.faceTimer += dt;
    if (this.faceTimer >= 0.5) {
      this.faceTimer = 0;
      this.setFace();
    }

    if (this.food <= 0 || this.clean <= 0 || this.happy <= 0) this.thought?.setText('🥺');
  }

  /* ---------------- actions ---------------- */

  private doAction(stat: 'food' | 'clean' | 'happy' | 'none', amount: number, kind: string): void {
    if (this.won || this.over || !this.pet) return;
    audio.resumeAfterGesture();
    this.actions++;
    this.idle = 0;
    this.faceTimer = 0;
    this.sleeping = kind === 'sleep';

    if (stat === 'food') this.food = Math.min(100, this.food + amount);
    if (stat === 'clean') this.clean = Math.min(100, this.clean + amount);
    if (stat === 'happy') this.happy = Math.min(100, this.happy + amount);

    if (stat === 'happy' && kind === 'play') this.food = Math.max(0, this.food - 4);

    audio.play(kind === 'bath' ? 'pop' : 'collect');
    this.updateMeters(true);
    this.setFace();
    this.pulsePet();
    this.react3D(kind);

    const p = this.petScreen();
    if (p) {
      const icon =
        kind === 'feed' ? '🍗' : kind === 'bath' ? '🫧' : kind === 'play' ? '⚽' : kind === 'sleep' ? '💤' : '🧸';
      floatText(this, p.x + 90, p.y - 80, icon, { size: 44, color: '#ffffff', stroke: '' });
      burst(this, p.x, p.y, 0xffd93d, 10);
    }

    if (kind === 'bath') {
      for (let i = 0; i < 5; i++) {
        this.stage?.delay(i * 90, () => {
          const s = this.petScreen();
          if (s && this.scene.isActive()) {
            burst(this, s.x + Phaser.Math.Between(-90, 90), s.y + Phaser.Math.Between(-60, 60), 0x9be2ff, 6, {
              speed: 90,
            });
          }
        });
      }
    }

    this.score = this.computeScore();
    this.hud?.setScore(this.score);

    if (this.food >= 95 && this.clean >= 95 && this.happy >= 95) this.celebrate();
  }

  /** Single scoring formula shared by the HUD and the result screen. */
  private computeScore(win = false): number {
    const avg = (this.happy + this.food + this.clean) / 3;
    return Math.round(this.actions * 15 + avg * 4 + (win ? 300 : 0));
  }

  private react3D(kind: string): void {
    const pet = this.pet;
    if (!pet) return;
    if (kind === 'feed') {
      pet.play('happy');
      this.flyFood();
    } else if (kind === 'bath') {
      pet.play('bounce');
      this.splash();
    } else if (kind === 'play') {
      this.chase();
    } else if (kind === 'sleep') {
      pet.play('sleep');
    } else if (kind === 'toy') {
      pet.play('happy');
      this.bounceToy();
    } else if (kind === 'pat') {
      pet.play('happy');
      const s = this.petScreen();
      if (s) sparkles(this, s.x, s.y - 60, 0xff8fab, 8);
    }
  }

  private flyFood(): void {
    const stage = this.stage;
    const bite = this.bite;
    if (!stage || !bite || this.biteBusy) return;
    this.biteBusy = true;
    const start = this.biteHome.clone();
    bite.position.copy(start);
    bite.visible = true;
    stage.tween({
      dur: 560,
      ease: (k) => k,
      onUpdate: (k) => {
        bite.position.lerpVectors(start, this.headPos(), k);
        bite.position.y += Math.sin(k * Math.PI) * 0.65;
        bite.rotation.x = k * 4;
        bite.rotation.y = k * 5;
      },
      onComplete: () => {
        bite.visible = false;
        bite.position.copy(this.biteHome);
        bite.rotation.set(0, 0, 0);
        if (this.fx) sparkleBurst(this.fx, this.headPos(), { count: 14, speed: 3.2, life: 0.7, size: 0.35 });
        stage.delay(800, () => {
          bite.visible = true;
          this.biteBusy = false;
        });
      },
    });
  }

  private splash(): void {
    const fx = this.fx;
    if (!fx) return;
    const p = this.headPos();
    p.y = Math.max(0.6, p.y - 0.4);
    waterSplash(fx, p, { count: 26, speed: 5, life: 0.8, size: 0.45 });
    waterSplash(fx, this.tubTop, { count: 18, speed: 4, life: 0.7 });
    for (let i = 1; i <= 3; i++) {
      this.stage?.delay(i * 130, () => waterSplash(fx, p, { count: 10, speed: 3.6, life: 0.6 }));
    }
  }

  private chase(): void {
    const stage = this.stage;
    const pet = this.pet;
    const ball = this.ball;
    if (!stage || !pet || !ball || this.moving) return;
    this.moving = true;
    const tx = THREE.MathUtils.clamp(ball.position.x + Phaser.Math.Between(-2, 2), -1.6, 5.4);
    const tz = THREE.MathUtils.clamp(ball.position.z + Phaser.Math.Between(-1, 2), 0.6, 5.2);
    this.hopBall(new THREE.Vector3(tx, 0.48, tz));
    pet.play('walk');
    this.moveTo(new THREE.Vector3(tx - 0.8, 0, tz - 0.8), 760, () => {
      pet.play('happy');
      stage.delay(640, () => {
        pet.play('walk');
        this.moveTo(this.home, 760, () => {
          this.faceYaw(0, 320, () => {
            pet.play('idle');
            this.moving = false;
          });
        });
      });
    });
  }

  private moveTo(to: THREE.Vector3, dur: number, onDone?: () => void): void {
    const stage = this.stage;
    const pet = this.pet;
    if (!stage || !pet) {
      onDone?.();
      return;
    }
    const from = pet.root.position.clone();
    const target = to.clone();
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    if (dx * dx + dz * dz < 0.01) {
      onDone?.();
      return;
    }
    const startYaw = pet.root.rotation.y;
    const delta = shortAngle(startYaw, Math.atan2(dx, dz));
    stage.tween({
      dur,
      ease: (k) => k,
      onUpdate: (k) => {
        pet.root.position.lerpVectors(from, target, k);
        pet.root.rotation.y = startYaw + delta * k;
      },
      onComplete: () => {
        pet.root.position.copy(target);
        pet.root.rotation.y = startYaw + delta;
        onDone?.();
      },
    });
  }

  private faceYaw(yaw: number, dur = 320, onDone?: () => void): void {
    const stage = this.stage;
    const pet = this.pet;
    if (!stage || !pet) {
      onDone?.();
      return;
    }
    const startYaw = pet.root.rotation.y;
    const delta = shortAngle(startYaw, yaw);
    if (Math.abs(delta) < 0.01) {
      onDone?.();
      return;
    }
    stage.tween({
      dur,
      ease: (k) => k,
      onUpdate: (k) => {
        pet.root.rotation.y = startYaw + delta * k;
      },
      onComplete: () => {
        pet.root.rotation.y = yaw;
        onDone?.();
      },
    });
  }

  private hopBall(to: THREE.Vector3): void {
    const stage = this.stage;
    const ball = this.ball;
    if (!stage || !ball) return;
    const from = ball.position.clone();
    stage.tween({
      dur: 640,
      ease: (k) => k,
      onUpdate: (k) => {
        ball.position.lerpVectors(from, to, k);
        ball.position.y = 0.48 + Math.sin(k * Math.PI) * 1.7;
        ball.rotation.x = k * 5;
        ball.rotation.z = k * 2.5;
      },
      onComplete: () => {
        ball.position.copy(to);
        ball.position.y = 0.48;
        ball.rotation.x = 0;
        ball.rotation.z = 0;
      },
    });
  }

  private bounceToy(): void {
    const stage = this.stage;
    const ball = this.ball;
    if (!stage || !ball) return;
    const base = ball.position.y;
    stage.tween({
      dur: 620,
      ease: (k) => k,
      onUpdate: (k) => {
        ball.position.y = base + Math.abs(Math.sin(k * Math.PI * 2)) * 1.3;
        ball.rotation.x = k * 6;
      },
      onComplete: () => {
        ball.position.y = base;
        ball.rotation.x = 0;
      },
    });
  }

  private pulsePet(): void {
    const stage = this.stage;
    const pet = this.pet;
    if (!stage || !pet) return;
    const base = this.petScale;
    stage.tween({
      dur: 300,
      ease: (k) => Math.sin(k * Math.PI),
      onUpdate: (k) => pet.root.scale.setScalar(base * (1 + 0.14 * k)),
      onComplete: () => pet.root.scale.setScalar(base),
    });
  }

  private headPos(): THREE.Vector3 {
    const v = new THREE.Vector3();
    if (!this.pet) return v;
    this.pet.root.updateMatrixWorld(true);
    return this.pet.rig.head.getWorldPosition(v);
  }

  private petScreen(): { x: number; y: number } | null {
    if (!this.stage || !this.pet) return null;
    this.pet.root.updateMatrixWorld(true);
    const p = this.pet.rig.body.getWorldPosition(new THREE.Vector3());
    return this.stage.project(p.x, p.y, p.z);
  }

  private thoughtPos(): { x: number; y: number } | null {
    if (!this.stage || !this.pet) return null;
    this.pet.root.updateMatrixWorld(true);
    const h = this.pet.rig.head.getWorldPosition(new THREE.Vector3());
    return this.stage.project(h.x, h.y + 1.1, h.z);
  }

  /* ---------------- state ---------------- */

  private updateMeters(animate = false): void {
    this.meters[0]?.setValue(this.happy, animate);
    this.meters[1]?.setValue(this.food, animate);
    this.meters[2]?.setValue(this.clean, animate);
  }

  private energy(): number {
    if (this.sleeping) return 100;
    return Math.max(0, Math.min(99, 100 - Math.round(this.idle * 6)));
  }

  private setFace(): void {
    let face = '🐶';
    if (this.sleeping) face = '😴';
    else if (this.happy < 28) face = '😢';
    else if (this.food < 28) face = '🥺';
    else if (this.clean < 28) face = '😖';
    else if (this.happy > 85 && this.food > 70 && this.clean > 70) face = '🥰';
    if (face === this.faceKey) return;
    this.faceKey = face;
    this.thought?.setText(
      this.sleeping
        ? '💤'
        : this.food < 30
          ? '🍎?'
          : this.clean < 30
            ? '🫧?'
            : this.happy < 30
              ? '😢'
              : ' '
    );
    if (!this.pet) return;
    if (this.sleeping) this.pet.play('sleep');
    else if (face === '🥰') this.pet.play('happy');
    else if (face === '😢' || face === '🥺' || face === '😖') this.pet.play('sad');
    else this.pet.play('idle');
  }

  private celebrate(): void {
    if (this.won) return;
    this.won = true;
    progress.track('pet_wins', 1);
    audio.play('success');
    confetti(this, 2200);
    toast(this, '🥰 YOUR PET IS SUPER HAPPY!', { color: 0xff8fab, duration: 2000, fontSize: 34 });

    const stage = this.stage;
    const pet = this.pet;
    if (stage && pet) {
      pet.play('celebrate');
      const centre = pet.rig.body.getWorldPosition(new THREE.Vector3());
      if (this.fx) {
        confettiBurst(this.fx, centre, { count: 44, speed: 7, life: 1.7 });
        sparkleBurst(this.fx, centre, { count: 26, speed: 5.5, life: 1.2, size: 0.5 });
      }
      this.rig?.shake(0.3, 0.35);
      const base = this.petScale;
      for (let i = 0; i < 3; i++) {
        stage.delay(i * 520, () => {
          stage.tween({
            dur: 300,
            ease: (k) => Math.sin(k * Math.PI),
            onUpdate: (k) => pet.root.scale.setScalar(base * (1 + 0.3 * k)),
            onComplete: () => pet.root.scale.setScalar(base),
          });
        });
      }
    }

    this.time.delayedCall(1700, () => this.endGame(true));
  }

  private endGame(win: boolean): void {
    if (!this.scene.isActive() || this.over) return;
    this.over = true;
    this.gameplayReady = false;
    const avg = (this.happy + this.food + this.clean) / 3;
    const score = this.computeScore(win);
    const stars = win ? 3 : avg >= 70 ? 2 : 1;
    this.finish({
      score,
      stars,
      win,
      subtitle: win ? 'A truly loved pet!' : 'Your pet had fun with you!',
      lines: [
        { icon: '❤️', label: 'Happiness', value: `${Math.round(this.happy)}%` },
        { icon: '🍎', label: 'Food', value: `${Math.round(this.food)}%` },
        { icon: '✨', label: 'Clean', value: `${Math.round(this.clean)}%` },
      ],
    });
  }
}

function shortAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
