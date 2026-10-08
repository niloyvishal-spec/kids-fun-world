import Phaser from 'phaser';
import * as THREE from 'three';
import { audio } from '../core/AudioManager';
import { confetti, floatText } from '../core/FX';
import { progress } from '../core/Progress';
import { button, label, Meter, Pill, toast } from '../core/UI';
import { wait } from '../core/util';
import { ThreeGameScene } from '../3d/base/ThreeGameScene';
import { createCharacter, type CharacterHandle } from '../3d/characters';
import { createGardenWorld, type World } from '../3d/environments';
import { correctFx, wrongFx } from '../3d/feedback';
import { tumbleReaction } from '../3d/interaction';
import { GEO, matteMat, mesh } from '../3d/materials';
import { createObject } from '../3d/objects';
import { confettiBurst, sparkleBurst, victoryFireworks } from '../3d/particles';

/**
 * Math Adventure - now genuinely 3D.
 *
 * A bunny hops along a stepping-stone path in the Garden World towards a
 * golden trophy. The four answer options are chunky 3D blocks floating in the
 * world: a raycast tap on the right one makes the bunny celebrate and burst
 * into sparkles, a wrong one tumbles the block, shakes the camera and makes
 * the bunny sad. The question itself stays a HUD label above the 3D world.
 */

type Mode = 'add' | 'sub' | 'mul' | 'count';

const MODES: { id: Mode; icon: string; label: string; color: number }[] = [
  { id: 'add', icon: '➕', label: 'ADD', color: 0x6bcb77 },
  { id: 'sub', icon: '➖', label: 'SUBTRACT', color: 0x4aa3ff },
  { id: 'mul', icon: '✖️', label: 'TIMES', color: 0xa78bfa },
  { id: 'count', icon: '🔢', label: 'COUNT', color: 0xffa94d },
];

const QUESTIONS = 10;
const COUNT_EMOJI = ['🍕', '⭐', '🍎', '🎈', '🍓', '🐟'];

/* ---------------- world layout (tuned so everything frames on 1280x720) --- */

const CAM_X = 1.8;
const CAM_Z = 13.4;
const PATH_X0 = -7;
const PATH_X1 = 5;
const PATH_Z = -3;
const GOAL = { x: 6.8, y: 0.95, z: PATH_Z };

const ANSWER_X = [-5.4, -1.8, 1.8, 5.4];
const ANSWER_Y = 1.05;
const ANSWER_Z = 3;
const PLATE_W = 2.3;
const PLATE_H = 1.6;
const PLATE_D = 0.7;
const FACE_W = 0.765;
const FACE_H = 0.5;

const ANSWER_COLORS = [0x4dd0e1, 0x4aa3ff, 0xa78bfa, 0xffa94d];
const CORRECT_COLOR = 0x6bcb77;
const WRONG_COLOR = 0xff6b6b;

interface Answer {
  value: number;
  text: string;
  color: number;
  enabled: boolean;
  holder: THREE.Group;
  block: THREE.Group;
  bodyMat: THREE.MeshPhongMaterial;
  faceMat: THREE.MeshPhongMaterial;
  baseY: number;
  phase: number;
  yaw: number;
}

/* ---------------- canvas faces for the answer blocks --------------------- */

const faceCache = new Map<string, THREE.Texture>();

function answerTexture(text: string, color: number): THREE.Texture {
  const key = `${text}|${color}`;
  const hit = faceCache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = 440;
  c.height = 200;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 440, 200);

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    const x0 = 14;
    const y0 = 14;
    const w = 412;
    const h = 172;
    const r = 28;
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
    ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    ctx.arcTo(x0, y0 + h, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + w, y0, r);
    ctx.closePath();
    ctx.stroke();

    let size = 132;
    ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
    while (size > 48 && ctx.measureText(text).width > 340) {
      size -= 8;
      ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(31,35,64,0.55)';
    ctx.lineWidth = 8;
    ctx.strokeText(text, 220, 104);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 220, 104);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(key, tex);
  return tex;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class MathAdventureScene extends ThreeGameScene {
  private world: World | null = null;
  private bunny: CharacterHandle | null = null;
  private goal: THREE.Group | null = null;
  private answers: Answer[] = [];

  private mode: Mode | null = null;
  /** true while the "pick a game" dialog is blocking gameplay input */
  private modePick = false;
  private index = 0;
  private correct = 0;
  private wrong = 0;
  private combo = 0;
  private score = 0;
  private level = 1;
  private answer = 0;
  private questionText = '';
  private countVisual = '';
  private options: number[] = [];
  private locked = false;
  private over = false;
  private step = 0;
  private qToken = 0;
  private moodT = 0;

  private progressMeter!: Meter;
  private comboPill!: Pill;
  private questionCard: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('MathAdventure');
  }

  create(): void {
    this.world = null;
    this.bunny = null;
    this.goal = null;
    this.answers = [];
    this.mode = null;
    this.modePick = false;
    this.index = 0;
    this.correct = 0;
    this.wrong = 0;
    this.combo = 0;
    this.score = 0;
    this.level = 1;
    this.answer = 0;
    this.questionText = '';
    this.countVisual = '';
    this.options = [];
    this.locked = false;
    this.over = false;
    this.step = 0;
    this.qToken = 0;
    this.moodT = 0;
    this.questionCard = null;

    const ok = this.setup3D({
      lighting: 'day',
      camera: { pos: [CAM_X, 5.4, CAM_Z], look: [-0.4, 2.2, 0], fov: 46 },
      introDur: 850,
      introFrom: [5, 11, 24],
      hud: false,
    });
    if (!ok) return;

    this.showHud({ score: 0, center: '🔢 MATH ADVENTURE' });
    this.progressMeter = new Meter(this, {
      x: 640,
      y: 108,
      w: 520,
      h: 30,
      value: 0,
      max: QUESTIONS,
      color: 0x6bcb77,
      icon: '🚩',
      showValue: false,
      depth: 20,
    });
    this.comboPill = new Pill(this, 1120, 108, ' ', { color: 0xff6b6b, minW: 150, depth: 20 });

    this.input.on('pointerdown', () => audio.resumeAfterGesture());

    label(this, 640, 694, 'Tap the right answer!', {
      size: 24,
      color: '#ffffff',
      alpha: 0.92,
      stroke: '#0a4a5c',
      strokeThickness: 5,
      depth: 20,
    });

    // The mode dialog blocks all 3D input until a mode is chosen, so the first
    // question must only be generated once the player has picked one.
    this.showModeSelect();

    this.exposeTest({
      state: () => ({
        score: this.score,
        question: this.questionText,
        answer: this.answer,
        options: [...this.options],
        qIndex: this.index,
        correct: this.correct,
        wrong: this.wrong,
        over: this.over,
        mode: this.mode,
        combo: this.combo,
        level: this.level,
        locked: this.locked,
      }),
      probe: () => this.probeAnswer(),
    });
  }

  /* ---------------- 3D world ---------------- */

  protected build3D(): void {
    const stage = this.stage;
    if (!stage) return;

    this.world = createGardenWorld(stage, { seed: 4 });

    // stepping-stone path: the bunny hops towards the trophy
    const stoneMat = matteMat(0xe8d5a8);
    for (let i = 0; i < 9; i++) {
      const s = mesh(GEO.cylinder(0.62, 0.7, 0.16, 12), stoneMat, { cast: false, receive: true });
      s.position.set(PATH_X0 + (i / 8) * (PATH_X1 - PATH_X0), 0.08, PATH_Z);
      s.scale.set(1, 1, 0.72);
      stage.scene.add(s);
    }

    this.goal = createObject('trophy', { size: 1.5 });
    this.goal.position.set(GOAL.x, GOAL.y, GOAL.z);
    stage.scene.add(this.goal);

    this.bunny = createCharacter('bunny', { scale: 1.35 });
    this.bunny.root.position.set(PATH_X0, 0, PATH_Z);
    this.bunny.root.rotation.y = 1.15;
    this.bunny.play('idle');
    stage.scene.add(this.bunny.root);

    ANSWER_X.forEach((x, i) => {
      this.answers.push(this.makeAnswer(i, x));
    });
  }

  private makeAnswer(i: number, x: number): Answer {
    const stage = this.stage;
    const color = ANSWER_COLORS[i % ANSWER_COLORS.length];
    const block = createObject('block', { color });

    // clone every material so per-answer tinting never mutates the shared cache
    block.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const clone = (m.material as THREE.Material).clone();
      clone.userData = { shared: false };
      m.material = clone;
    });

    const body = block.children.find(
      (c): c is THREE.Mesh =>
        (c as THREE.Mesh).isMesh === true && (c as THREE.Mesh).geometry.type !== 'PlaneGeometry'
    );
    if (!body) throw new Error('answer block body missing');
    const bodyMat = body.material as THREE.MeshPhongMaterial;

    const faceMat = new THREE.MeshPhongMaterial({ shininess: 40 });
    faceMat.userData = { shared: false };
    const face = new THREE.Mesh(GEO.plane(FACE_W, FACE_H), faceMat);
    face.position.z = 0.514;
    face.castShadow = false;
    face.receiveShadow = false;
    block.add(face);
    faceMat.map = answerTexture('', color);
    faceMat.needsUpdate = true;

    const yaw = Math.atan2(CAM_X - x, CAM_Z - ANSWER_Z);
    block.rotation.y = yaw;
    block.scale.set(PLATE_W, PLATE_H, PLATE_D);

    const holder = new THREE.Group();
    holder.position.set(x, ANSWER_Y, ANSWER_Z);
    holder.add(block);
    stage?.scene.add(holder);

    const a: Answer = {
      value: 0,
      text: '',
      color,
      enabled: true,
      holder,
      block,
      bodyMat,
      faceMat,
      baseY: ANSWER_Y,
      phase: Math.random() * 6.28,
      yaw,
    };
    this.interact?.add(holder, { kind: 'tap', sound: 'click', onTap: () => this.pickAnswer(a) });
    return a;
  }

  protected override onGameplayStart(): void {
    this.bunny?.play('idle');
  }

  protected override on3DUpdate(dt: number, t: number): void {
    this.bunny?.update(dt);
    if (this.moodT > 0) {
      this.moodT -= dt;
      if (this.moodT <= 0) this.bunny?.play('idle');
    }
    for (const a of this.answers) {
      a.holder.position.y = a.baseY + Math.sin(t * 0.0022 + a.phase) * 0.07;
    }
    if (this.goal) this.goal.rotation.y += dt * 0.7;
    this.world?.update(dt, t * 0.001);
  }

  /* ---------------- questions ---------------- */

  private nextQuestion(): void {
    if (this.over) return;
    if (this.index >= QUESTIONS) {
      void this.endGame();
      return;
    }
    this.qToken++;
    this.locked = false;
    this.level = 1 + Math.floor(this.correct / 3);
    const q = this.generate();
    this.answer = q.answer;
    this.questionText = q.text;
    this.countVisual = q.countVisual ?? '';
    this.options = q.options;
    this.showAnswers(q.options);
    this.drawQuestionCard();
  }

  private generate(): { text: string; options: number[]; answer: number; countVisual?: string } {
    const lvl = this.level;
    const rnd = (min: number, max: number) => Phaser.Math.Between(min, max);
    if (this.mode === 'count') {
      const n = rnd(2, 5 + lvl * 2);
      const icon = COUNT_EMOJI[rnd(0, COUNT_EMOJI.length - 1)];
      const wrong = new Set<number>([n]);
      while (wrong.size < 4) wrong.add(Math.max(1, n + rnd(-3, 3)));
      const options = Phaser.Utils.Array.Shuffle([...wrong]);
      return { text: `How many?`, options, answer: n, countVisual: icon.repeat(n) };
    }
    if (this.mode === 'sub') {
      const a = rnd(3 + lvl, 6 + lvl * 3);
      const b = rnd(1, a - 1);
      const ans = a - b;
      return { text: `${a} − ${b} = ?`, options: this.makeOptions(ans), answer: ans };
    }
    if (this.mode === 'mul') {
      const a = rnd(2, 3 + lvl);
      const b = rnd(2, 4 + lvl);
      const ans = a * b;
      return { text: `${a} × ${b} = ?`, options: this.makeOptions(ans), answer: ans };
    }
    const a = rnd(1, 5 + lvl * 3);
    const b = rnd(1, 5 + lvl * 3);
    const ans = a + b;
    return { text: `${a} + ${b} = ?`, options: this.makeOptions(ans), answer: ans };
  }

  private makeOptions(ans: number): number[] {
    const set = new Set<number>([ans]);
    while (set.size < 4) {
      const delta = Phaser.Math.Between(-4, 4);
      const v = ans + (delta === 0 ? 1 : delta);
      if (v >= 0) set.add(v);
    }
    return Phaser.Utils.Array.Shuffle([...set]);
  }

  private showAnswers(options: number[]): void {
    options.forEach((opt, i) => {
      const a = this.answers[i];
      if (!a) return;
      a.value = opt;
      a.text = String(opt);
      a.color = ANSWER_COLORS[i % ANSWER_COLORS.length];
      a.enabled = true;
      a.block.rotation.set(0, a.yaw, 0);
      this.paintAnswer(a, a.color);
      this.interact?.setEnabled(a.holder, true);
      a.holder.scale.setScalar(1);
      this.stage?.tween({
        dur: 360,
        ease: easeOutBack,
        onUpdate: (k) => a.holder.scale.setScalar(0.12 + 0.88 * k),
        onComplete: () => a.holder.scale.setScalar(1),
      });
    });
  }

  private paintAnswer(a: Answer, color: number): void {
    a.bodyMat.color.setHex(color);
    a.faceMat.map = answerTexture(a.text, color);
    a.faceMat.needsUpdate = true;
  }

  private drawQuestionCard(): void {
    this.questionCard?.destroy(true);
    const c = this.add.container(0, 0).setDepth(20);
    this.questionCard = c;

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.96);
    g.fillRoundedRect(360, 128, 560, 150, 30);
    g.lineStyle(6, 0x4aa3ff, 1);
    g.strokeRoundedRect(360, 128, 560, 150, 30);
    c.add(g);

    if (this.mode === 'count' && this.countVisual) {
      c.add(label(this, 640, 156, 'Count them!', { size: 20, color: '#6b7280' }));
      c.add(label(this, 640, 196, this.questionText, { size: 44, color: '#33364f' }));
      c.add(
        this.add
          .text(640, 246, this.countVisual, { fontSize: '34px' })
          .setOrigin(0.5)
      );
    } else {
      c.add(label(this, 640, 203, this.questionText, { size: 58, color: '#33364f' }));
    }
  }

  private showModeSelect(): void {
    this.modePick = true;
    const objs: Phaser.GameObjects.GameObject[] = [];

    // Full-screen invisible blocker: without it the raycast answer blocks
    // underneath the dialog still receive taps (ThreeGameScene only skips
    // input when an *interactive* object is under the pointer).
    const blocker = this.add
      .rectangle(0, 0, 1280, 720, 0x000000, 0)
      .setOrigin(0)
      .setDepth(30)
      .setInteractive();
    objs.push(blocker);

    const scrim = this.add.graphics().setDepth(31);
    scrim.fillStyle(0x1f2340, 0.55);
    scrim.fillRect(0, 0, 1280, 720);
    const p = this.add.graphics().setDepth(32);
    p.fillStyle(0xffffff, 1);
    p.fillRoundedRect(340, 150, 600, 290, 40);
    p.lineStyle(5, 0xffffff, 1);
    p.strokeRoundedRect(340, 150, 600, 290, 40);
    const t = this.add
      .text(640, 205, '🔢 PICK A GAME', {
        fontFamily: "'Trebuchet MS',sans-serif",
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#33364f',
      })
      .setOrigin(0.5)
      .setDepth(33);
    objs.push(scrim, p, t);

    MODES.forEach((m, i) => {
      const b = button(this, {
        x: 490 + (i % 2) * 300,
        y: 300 + Math.floor(i / 2) * 90,
        w: 280,
        h: 84,
        icon: m.icon,
        label: m.label,
        color: m.color,
        fontSize: 26,
        iconSize: 34,
        depth: 34,
        onClick: () => {
          objs.forEach((o) => o.destroy());
          this.modePick = false;
          this.mode = m.id;
          this.nextQuestion();
        },
      });
      objs.push(b);
    });
  }

  /* ---------------- answering ---------------- */

  private pickAnswer(a: Answer): void {
    if (this.locked || this.over || this.modePick || !a.enabled) return;
    audio.resumeAfterGesture();

    const p = a.holder.position.clone();
    const s = this.stage?.project(p.x, p.y, p.z) ?? null;

    if (a.value === this.answer) {
      this.locked = true;
      this.correct++;
      this.combo++;
      const gained = 40 + this.combo * 10;
      this.score += gained;
      this.hud?.setScore(this.score);
      progress.track('math_correct', 1);
      this.paintAnswer(a, CORRECT_COLOR);
      correctFx(this.fx, p);
      if (s) floatText(this, s.x, s.y - 60, `+${gained}`, { color: '#2f9e44', size: 40 });

      this.bunny?.play('celebrate');
      this.moodT = 1.7;
      this.hopForward();

      if (this.combo >= 2) {
        this.comboPill.set(`🔥 x${this.combo}`);
        if (this.fx) confettiBurst(this.fx, p, { count: 34, life: 1.4 });
      }
      this.progressMeter.setValue(this.index + 1);

      const token = this.qToken;
      this.time.delayedCall(760, () => {
        if (!this.scene.isActive() || token !== this.qToken) return;
        this.index++;
        this.nextQuestion();
      });
    } else {
      this.combo = 0;
      this.comboPill.set(' ');
      this.wrong++;
      a.enabled = false;
      this.interact?.setEnabled(a.holder, false);
      this.paintAnswer(a, WRONG_COLOR);
      wrongFx(this.fx, p);
      tumbleReaction(a.block);
      this.cameras.main.shake(160, 0.005);
      this.rig?.shake(0.32, 0.3);
      if (s) floatText(this, s.x, s.y - 55, 'Try again!', { color: '#ff6b6b', size: 30 });

      this.bunny?.play('sad');
      this.moodT = 1.7;
    }
  }

  private hopForward(): void {
    const b = this.bunny;
    const stage = this.stage;
    if (!b || !stage) return;
    this.step = Math.min(QUESTIONS, this.step + 1);
    const k = this.step / QUESTIONS;
    const from = b.root.position.clone();
    const to = new THREE.Vector3(PATH_X0 + (PATH_X1 - PATH_X0) * k, 0, PATH_Z);
    stage.tween({
      dur: 430,
      ease: (t) => t,
      onUpdate: (t) => {
        b.root.position.x = from.x + (to.x - from.x) * t;
        b.root.position.z = from.z + (to.z - from.z) * t;
        b.root.position.y = Math.sin(t * Math.PI) * 0.8;
      },
      onComplete: () => {
        b.root.position.set(to.x, 0, to.z);
        if (this.fx) sparkleBurst(this.fx, to, { count: 10, speed: 3, life: 0.6, size: 0.35 });
      },
    });
  }

  private probeAnswer(): { x: number; y: number; label?: string } | null {
    const stage = this.stage;
    if (!stage || !this.answers.length || this.over) return null;
    const live = this.answers.filter((a) => a.enabled);
    const pool = live.length ? live : this.answers;
    const a = pool.find((v) => v.value !== this.answer) ?? pool[0];
    const p = stage.project(a.holder.position.x, a.holder.position.y, a.holder.position.z);
    return p ? { x: p.x, y: p.y, label: a.text } : null;
  }

  /* ---------------- finish ---------------- */

  private async endGame(): Promise<void> {
    if (this.over) return;
    this.over = true;
    this.locked = true;
    for (const a of this.answers) this.interact?.setEnabled(a.holder, false);

    audio.play('success');
    if (this.fx) {
      confettiBurst(this.fx, { x: 0, y: 6, z: 1 }, { count: 60, life: 1.8 });
      victoryFireworks(this.fx, { x: 0, y: 7, z: -3 }, 4);
    }
    confetti(this, 2000);
    toast(this, '🌟 MATH CHAMPION!', { color: 0x2f9e44, duration: 1500 });
    this.bunny?.play('celebrate');
    this.moodT = 4;

    await wait(this, 1000);
    if (!this.scene.isActive()) return;
    const stars = this.correct >= QUESTIONS ? 3 : this.correct >= 7 ? 2 : 1;
    this.finish({
      score: this.score,
      stars,
      win: this.correct >= 5,
      subtitle: `${this.correct} / ${QUESTIONS} correct!`,
      lines: [
        { icon: '✅', label: 'Correct', value: `${this.correct}/${QUESTIONS}` },
        { icon: '🔥', label: 'Best combo', value: `x${Math.max(1, this.combo)}` },
      ],
    });
  }
}
