import Phaser from 'phaser';
import { EMOJI_FONT } from '../config';
import { audio } from '../core/AudioManager';
import { confetti, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { button, label, Pill, toast, type Btn } from '../core/UI';
import { ThreeGameScene } from '../3d/base/ThreeGameScene';
import { createGardenWorld, type World } from '../3d/environments';
import { wrongFx } from '../3d/feedback';
import { GEO, group, matteMat, mesh, toyMat } from '../3d/materials';
import { createObject } from '../3d/objects';
import { confettiBurst, sparkleBurst, victoryFireworks } from '../3d/particles';
import * as THREE from 'three';

/**
 * Memory Match - now genuinely 3D.
 *
 * Every card is a real rounded-box mesh standing on a felt tabletop in the
 * Garden World: tapping one spins the actual card 180 degrees about its own
 * Y axis so the back face becomes the front face, misses spin back after the
 * usual beat and matched pairs burst into 3D particles before sinking into
 * the table. All original rules (deck size per difficulty, moves, score
 * formula, time bonus, star thresholds, tracking, sounds) are unchanged.
 */

interface Card {
  id: number;
  emoji: string;
  h: number;
  /** Resting height of the card root (bottom row sits on the table, 0). */
  baseY: number;
  root: THREE.Group;
  flipper: THREE.Group;
  anchor: THREE.Vector3;
  faceUp: boolean;
  matched: boolean;
  ready: boolean;
  flipGen: number;
}

const EMOJI_POOL = ['🐰', '🐶', '🐱', '🦊', '🐼', '🐻', '🦁', '🐸', '🐵', '🐷', '🐮', '🐔'];

const LEVELS = [
  { label: 'EASY', pairs: 4, icon: '🌱', color: 0x6bcb77 },
  { label: 'MEDIUM', pairs: 6, icon: '🌟', color: 0x4aa3ff },
  { label: 'HARD', pairs: 8, icon: '🔥', color: 0xff6b6b },
];

const COLS = 4;
const CARD_W = 2.2;
const CARD_D = 0.16;
const GAP_X = 0.3;
const GAP_Y = 0.28;
const AVAIL_H = 6.4;
const MAX_H = 2.3;
const CARD_TILT = -0.09;
const FLIP_MS = 300;
const FLIP_BACK_MS = 260;

const smooth = (t: number): number => t * t * (3 - 2 * t);
const outBack = (t: number): number => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

/* ------------------------------------------------------------------ */
/* card face textures (canvas -> THREE.Texture, cached per emoji/shape) */
/* ------------------------------------------------------------------ */

const faceCache = new Map<string, THREE.Texture>();

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function cardTexture(kind: 'front' | 'back', emoji: string, aspect: number): THREE.Texture {
  const key = `${kind}|${emoji}|${aspect.toFixed(2)}`;
  const hit = faceCache.get(key);
  if (hit) return hit;

  const W = 192;
  const H = Math.max(64, Math.round(W * aspect));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (ctx) {
    const pad = 4;
    const w = W - pad * 2;
    const h = H - pad * 2;
    const r = Math.min(w, h) * 0.11;
    if (kind === 'back') {
      ctx.fillStyle = '#4aa3ff';
      roundRectPath(ctx, pad, pad, w, h, r);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = W * 0.03;
      ctx.stroke();
      const ring = Math.min(w, h) * 0.24;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, ring, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = W * 0.022;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fffdf4';
      roundRectPath(ctx, pad, pad, w, h, r);
      ctx.fill();
      ctx.strokeStyle = '#ffd93d';
      ctx.lineWidth = W * 0.035;
      ctx.stroke();
      ctx.font = `${Math.round(H * 0.5)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, W / 2, H / 2 + H * 0.02);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(key, tex);
  return tex;
}

function faceMaterial(tex: THREE.Texture): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    map: tex,
    shininess: 70,
    specular: 0x333333,
    transparent: true,
    alphaTest: 0.35,
  });
}

/* ------------------------------------------------------------------ */
/* scene                                                               */
/* ------------------------------------------------------------------ */

export class MemoryMatchScene extends ThreeGameScene {
  private cards: Card[] = [];
  private first: Card | null = null;
  private second: Card | null = null;
  private lock = false;
  private moves = 0;
  private matched = 0;
  private pairs = 4;
  private score = 0;
  private elapsed = 0;
  private started = false;
  private over = false;
  private activeLevel = 0;
  private boardGen = 0;
  private lastSec = -1;
  private timerPill!: Pill;
  private movesPill!: Pill;
  private levelBtns: Btn[] = [];
  private world: World | null = null;
  private boardGroup: THREE.Group | null = null;
  private fixture: THREE.Group | null = null;
  private token: THREE.Group | null = null;

  constructor() {
    super('MemoryMatch');
  }

  create(): void {
    this.cards = [];
    this.first = null;
    this.second = null;
    this.lock = false;
    this.moves = 0;
    this.matched = 0;
    this.pairs = 4;
    this.score = 0;
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.activeLevel = 0;
    this.boardGen = 0;
    this.lastSec = -1;
    this.levelBtns = [];
    this.world = null;
    this.boardGroup = null;
    this.fixture = null;
    this.token = null;

    const ok = this.setup3D({
      lighting: 'day',
      camera: { pos: [0, 9, 13.7], look: [0, 2.9, 0], fov: 42 },
      introDur: 450,
      introFrom: [5, 15, 21],
      hud: { score: 0, center: '🃏 MEMORY MATCH' },
    });
    if (!ok) return;

    this.movesPill = new Pill(this, 640, 96, 'MOVES 0', { color: 0xa78bfa, minW: 190, depth: 20 });
    this.timerPill = new Pill(this, 995, 44, '⏱ 0s', { color: 0x4aa3ff, minW: 150, depth: 20 });

    this.addLevelButtons();
    label(this, 640, 616, 'Find all the matching pairs!', {
      size: 20,
      color: '#ffffff',
      stroke: '#2b4a1e',
      strokeThickness: 5,
      depth: 20,
    });

    this.startLevel(0);

    this.exposeTest({
      state: () => ({
        score: this.score,
        moves: this.moves,
        flipped: this.cards.filter((c) => c.faceUp && !c.matched).map((c) => c.id),
        matched: this.matched,
        deck: this.cards.filter((c) => !c.matched).map((c) => c.id),
        over: this.over,
        pairs: this.pairs,
        total: this.cards.length,
        level: LEVELS[this.activeLevel].label,
        lock: this.lock,
        ready: this.gameplayReady,
      }),
      probe: () => this.probeCard(),
    });
  }

  /* ---------------- 3D world ---------------- */

  protected build3D(): void {
    const stage = this.stage!;

    this.world = createGardenWorld(stage, { seed: 21 });
    this.world.root.position.y = -3;

    this.boardGroup = new THREE.Group();
    stage.scene.add(this.boardGroup);

    // felt-topped wooden table the cards stand on
    const top = mesh(GEO.roundedBox(11.4, 0.44, 3.9, 0.1), matteMat(0xcf9a63));
    top.position.y = -0.22;
    const trim = mesh(GEO.roundedBox(11.7, 0.18, 4.2, 0.07), matteMat(0xa9713c));
    trim.position.y = -0.5;
    const felt = mesh(GEO.plane(10.7, 3.25), matteMat(0x3aa35f), { cast: false });
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.012;

    const table = group(top, trim, felt);
    const legGeo = GEO.box(0.44, 2.6, 0.44);
    for (const [lx, lz] of [
      [-5, -1.4],
      [5, -1.4],
      [-5, 1.4],
      [5, 1.4],
    ]) {
      const leg = mesh(legGeo, matteMat(0x9a6b3f));
      leg.position.set(lx, -1.72, lz);
      table.add(leg);
    }
    stage.scene.add(table);

    // tabletop props
    const block = createObject('block', { size: 0.85, color: 0x4aa3ff, label: 'A' });
    block.position.set(-5, 0.425, 1.15);
    block.rotation.y = -0.35;
    stage.scene.add(block);

    const gem = createObject('gem', { size: 0.85 });
    gem.position.set(5, 0.5, 1.15);
    stage.scene.add(gem);
    this.token = gem;

    const star = createObject('star', { size: 1.15 });
    star.rotation.x = -Math.PI / 2;
    star.position.set(0, 0.08, 1.6);
    stage.scene.add(star);
  }

  protected override onGameplayStart(): void {
    this.syncLevelBtns();
  }

  protected override on3DUpdate(dt: number, t: number): void {
    this.world?.update(dt, t / 1000);
    if (this.token) this.token.rotation.y += dt * 0.7;

    if (this.started && !this.over) {
      this.elapsed += dt;
      const sec = Math.floor(this.elapsed);
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        this.timerPill.set(`⏱ ${sec}s`);
      }
    }
  }

  /* ---------------- level select ---------------- */

  private addLevelButtons(): void {
    this.levelBtns = LEVELS.map((lv, i) =>
      button(this, {
        x: 400 + i * 240,
        y: 664,
        w: 200,
        h: 56,
        icon: lv.icon,
        label: lv.label,
        sub: `${lv.pairs} pairs`,
        color: lv.color,
        iconSize: 24,
        fontSize: 22,
        subSize: 15,
        depth: 30,
        onClick: () => this.startLevel(i),
      })
    );
    this.syncLevelBtns();
  }

  private syncLevelBtns(): void {
    this.levelBtns.forEach((b, i) => {
      this.tweens.killTweensOf(b);
      b.setScale(1);
      b.setAlpha(i === this.activeLevel ? 1 : 0.72);
      if (i === this.activeLevel) b.pulse();
    });
  }

  /* ---------------- dealing ---------------- */

  private startLevel(levelIndex: number): void {
    if (this.over || !this.stage || !this.boardGroup) return;
    const lv = LEVELS[levelIndex];
    this.activeLevel = levelIndex;
    this.syncLevelBtns();
    this.clearBoard();

    this.pairs = lv.pairs;
    this.moves = 0;
    this.matched = 0;
    this.score = 0;
    this.elapsed = 0;
    this.lastSec = -1;
    this.first = null;
    this.second = null;
    this.lock = false;
    this.started = true;
    this.movesPill.set('MOVES 0');
    this.timerPill.set('⏱ 0s');
    this.hud?.setScore(0);
    audio.play('whoosh');

    const deck = Phaser.Utils.Array.Shuffle([...EMOJI_POOL]).slice(0, lv.pairs);
    const doubled = Phaser.Utils.Array.Shuffle([...deck, ...deck]);

    const rows = Math.ceil(doubled.length / COLS);
    const cardH = Math.min(MAX_H, (AVAIL_H - (rows - 1) * GAP_Y) / rows);
    const boardW = COLS * CARD_W + (COLS - 1) * GAP_X;
    const boardH = rows * cardH + (rows - 1) * GAP_Y;
    const left = -boardW / 2;
    const gen = this.boardGen;

    this.buildFixture(rows, cardH, boardW, boardH);

    doubled.forEach((emoji, i) => {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const x = left + c * (CARD_W + GAP_X) + CARD_W / 2;
      const yTop = boardH - r * (cardH + GAP_Y);
      this.cards.push(this.makeCard(this.cards.length, x, yTop - cardH, cardH, emoji, gen));
    });
  }

  /**
   * A wooden card rack: two posts slotted into the table plus one felt shelf
   * and back lip per row, so every row of upright cards is visibly supported.
   */
  private buildFixture(rows: number, cardH: number, boardW: number, boardH: number): void {
    const g = new THREE.Group();
    const wood = matteMat(0xb2793f);
    const felt = matteMat(0x3aa35f);
    const postX = boardW / 2 + 0.45;
    const base = -0.3;
    const postH = boardH + 0.7;

    const postGeo = GEO.box(0.26, postH, 0.4);
    const capGeo = GEO.sphere(0.19);
    for (const sx of [-postX, postX]) {
      const post = mesh(postGeo, wood);
      post.position.set(sx, base + postH / 2, -0.12);
      g.add(post);
      const cap = mesh(capGeo, toyMat(0xffd93d));
      cap.position.set(sx, base + postH, -0.12);
      g.add(cap);
    }

    const shelfW = postX * 2;
    for (let r = 0; r < rows; r++) {
      const rowBottom = boardH - r * (cardH + GAP_Y) - cardH;
      const shelf = mesh(GEO.box(shelfW, 0.14, 0.42), felt);
      shelf.position.set(0, rowBottom - 0.07, -0.12);
      g.add(shelf);
      const lip = mesh(GEO.box(shelfW, 0.34, 0.08), wood);
      lip.position.set(0, rowBottom + 0.17, -0.151);
      g.add(lip);
    }

    this.fixture = g;
    this.boardGroup?.add(g);
  }

  private clearBoard(): void {
    this.boardGen++;
    for (const c of this.cards) {
      this.interact?.remove(c.root);
      c.root.removeFromParent();
    }
    this.cards = [];
    if (this.fixture) {
      this.fixture.removeFromParent();
      this.fixture = null;
    }
  }

  private makeCard(id: number, x: number, baseY: number, h: number, emoji: string, gen: number): Card {
    const stage = this.stage!;
    const root = new THREE.Group();
    root.position.set(x, baseY, 0);
    root.rotation.x = CARD_TILT;

    const flipper = new THREE.Group();
    root.add(flipper);

    const body = mesh(GEO.roundedBox(CARD_W, h, CARD_D, 0.05), toyMat(0xfff6e3));
    body.position.y = h / 2;
    flipper.add(body);

    const half = CARD_D / 2 + 0.006;
    const aspect = h / CARD_W;
    const back = mesh(GEO.plane(CARD_W, h), faceMaterial(cardTexture('back', '', aspect)), {
      cast: false,
      receive: false,
    });
    back.position.set(0, h / 2, half);
    flipper.add(back);

    const front = mesh(GEO.plane(CARD_W, h), faceMaterial(cardTexture('front', emoji, aspect)), {
      cast: false,
      receive: false,
    });
    front.position.set(0, h / 2, -half);
    front.rotation.y = Math.PI;
    flipper.add(front);

    const card: Card = {
      id,
      emoji,
      h,
      baseY,
      root,
      flipper,
      anchor: new THREE.Vector3(0, h / 2, 0),
      faceUp: false,
      matched: false,
      ready: false,
      flipGen: 0,
    };

    root.scale.setScalar(0.001);
    (this.boardGroup as THREE.Group).add(root);
    this.interact!.add(root, { kind: 'tap', onTap: () => this.onCardTap(card) });

    stage.delay(id * 45, () => {
      if (gen !== this.boardGen) return;
      stage.tween({
        dur: 340,
        ease: outBack,
        onUpdate: (t) => {
          if (gen !== this.boardGen) return;
          root.scale.setScalar(Math.max(0.001, t));
        },
        onComplete: () => {
          if (gen !== this.boardGen) return;
          root.scale.setScalar(1);
          card.ready = true;
        },
      });
    });

    return card;
  }

  /* ---------------- tapping / flipping ---------------- */

  private onCardTap(card: Card): void {
    if (this.lock || this.over || card.faceUp || card.matched) return;
    audio.resumeAfterGesture();

    if (this.moves === 0 && this.matched === 0) this.started = true;

    // flip open - a real 180 degree rotation about the card's own Y axis
    card.faceUp = true;
    audio.play('flip');
    this.flipCard(card, true);

    if (!this.first) {
      this.first = card;
      return;
    }

    this.second = card;
    this.moves++;
    this.movesPill.set(`MOVES ${this.moves}`);

    if (this.first.emoji === this.second.emoji) {
      this.resolveMatch();
    } else {
      this.resolveMiss();
    }
  }

  private flipCard(card: Card, up: boolean, dur = FLIP_MS): void {
    const stage = this.stage;
    if (!stage) return;
    const gen = ++card.flipGen;
    const from = card.flipper.rotation.y;
    const to = up ? Math.PI : 0;
    stage.tween({
      dur,
      ease: smooth,
      onUpdate: (t) => {
        if (card.flipGen !== gen) return;
        card.flipper.rotation.y = from + (to - from) * t;
      },
      onComplete: () => {
        if (card.flipGen !== gen) return;
        card.flipper.rotation.y = to;
      },
    });
  }

  private worldOf(card: Card): THREE.Vector3 {
    card.root.updateWorldMatrix(true, false);
    return card.anchor.clone().applyMatrix4(card.root.matrixWorld);
  }

  private resolveMatch(): void {
    const a = this.first as Card;
    const b = this.second as Card;
    a.matched = true;
    b.matched = true;
    this.first = null;
    this.second = null;
    this.matched++;
    this.score += 100 + Math.max(0, 40 - this.moves * 2);
    this.hud?.setScore(this.score);
    audio.play('match');

    const gen = this.boardGen;
    this.time.delayedCall(220, () => {
      if (!this.scene.isActive() || gen !== this.boardGen) return;
      [a, b].forEach((cd, idx) => {
        const world = this.worldOf(cd);
        const p = this.stage?.project(world.x, world.y, world.z);
        if (p) sparkles(this, p.x, p.y, idx === 0 ? 0xffd93d : 0x6bcb77, 8);
        if (this.fx) {
          sparkleBurst(this.fx, world, { count: 16, speed: 3.6, life: 0.85, size: 0.42 });
          confettiBurst(this.fx, world, { count: 16, speed: 4.2, life: 1.1, size: 0.3 });
        }
        this.interact?.remove(cd.root);
        this.sinkCard(cd, gen);
      });
    });

    if (this.matched === this.pairs) {
      this.time.delayedCall(600, () => {
        if (gen === this.boardGen) this.win();
      });
    }
  }

  private resolveMiss(): void {
    this.lock = true;
    const a = this.first as Card;
    const b = this.second as Card;
    this.first = null;
    this.second = null;
    const gen = this.boardGen;

    const mid = this.worldOf(a).add(this.worldOf(b)).multiplyScalar(0.5);
    wrongFx(this.fx, mid);
    this.wobble(a, gen);
    this.wobble(b, gen);

    this.time.delayedCall(820, () => {
      if (!this.scene.isActive() || gen !== this.boardGen) return;
      this.flipCard(a, false, FLIP_BACK_MS);
      this.flipCard(b, false, FLIP_BACK_MS);
      this.lock = false;
      this.stage?.delay(FLIP_BACK_MS / 2, () => {
        if (gen !== this.boardGen) return;
        a.faceUp = false;
        b.faceUp = false;
      });
    });
  }

  private wobble(card: Card, gen: number): void {
    const stage = this.stage;
    if (!stage) return;
    stage.tween({
      dur: 460,
      ease: (t) => t,
      onUpdate: (t) => {
        if (gen !== this.boardGen) return;
        card.root.rotation.z = Math.sin(t * Math.PI * 3) * 0.09 * (1 - t);
      },
      onComplete: () => {
        if (gen !== this.boardGen) return;
        card.root.rotation.z = 0;
      },
    });
  }

  /** Celebrate a match: pop, then sink the pair into the tabletop. */
  private sinkCard(card: Card, gen: number): void {
    const stage = this.stage;
    if (!stage) return;
    const drop = Math.min(0.55, card.h * 0.42);
    stage.tween({
      dur: 760,
      ease: (t) => t,
      onUpdate: (t) => {
        if (gen !== this.boardGen) return;
        const pop = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) * 0.13 : 0;
        card.root.scale.setScalar(1 + pop);
        card.root.position.y = card.baseY - Math.max(0, (t - 0.25) / 0.75) * drop;
      },
      onComplete: () => {
        if (gen !== this.boardGen) return;
        card.root.scale.setScalar(1);
        card.root.position.y = card.baseY - drop;
      },
    });
  }

  /* ---------------- win ---------------- */

  private win(): void {
    if (this.over || !this.scene.isActive()) return;
    this.over = true;
    this.gameplayReady = false;
    progress.track('memory_wins', 1);
    audio.play('success');
    confetti(this, 2000);
    if (this.fx) {
      const center = new THREE.Vector3(0, 4.4, 0.5);
      confettiBurst(this.fx, center, { count: 60, speed: 7, life: 1.8, radius: 3.4 });
      victoryFireworks(this.fx, center, 4);
    }
    const timeBonus = Math.max(0, 600 - Math.floor(this.elapsed) * 10);
    this.score += timeBonus;
    this.hud?.setScore(this.score);
    const stars = this.moves <= this.pairs * 1.6 ? 3 : this.moves <= this.pairs * 2.4 ? 2 : 1;
    toast(this, '🎉 ALL PAIRS FOUND!', { color: 0x2f9e44, duration: 1400 });
    this.time.delayedCall(900, () => {
      if (!this.scene.isActive()) return;
      this.finish({
        score: this.score,
        stars,
        win: true,
        subtitle: `Solved in ${this.moves} moves!`,
        lines: [
          { icon: '🔀', label: 'Moves', value: String(this.moves) },
          { icon: '⏱', label: 'Time', value: `${Math.floor(this.elapsed)}s` },
        ],
      });
    });
  }

  /* ---------------- E2E helpers ---------------- */

  private probeCard(): { x: number; y: number; label?: string } | null {
    const stage = this.stage;
    if (!stage || !this.gameplayReady || this.lock || this.over) return null;
    for (const c of this.cards) {
      if (c.matched || c.faceUp || !c.ready) continue;
      const w = this.worldOf(c);
      const p = stage.project(w.x, w.y, w.z);
      if (!p) continue;
      if (p.x < 240 || p.x > 1040 || p.y < 150 || p.y > 570) continue;
      return { x: p.x, y: p.y, label: `card-${c.id}` };
    }
    return null;
  }
}
