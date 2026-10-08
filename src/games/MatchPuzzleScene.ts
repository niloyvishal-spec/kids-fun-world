import Phaser from 'phaser';
import { EMOJI_FONT } from '../config';
import { audio } from '../core/AudioManager';
import { burst, confetti, floatText, shakeCamera, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { button, emojiText, label, Pill, toast } from '../core/UI';
import { wait } from '../core/util';
import { ThreeGameScene, type ProbePoint } from '../3d/base/ThreeGameScene';
import { createGardenWorld, makeRock, type World } from '../3d/environments';
import { wrongFx } from '../3d/feedback';
import { GEO, matteMat, mesh, toyMat } from '../3d/materials';
import { createObject } from '../3d/objects';
import { confettiBurst, sparkleBurst } from '../3d/particles';
import * as THREE from 'three';

/**
 * Match-3 puzzle - now genuinely 3D.
 *
 * Every gem is a real rounded-box tile sitting in a recessed cell on a chunky
 * toy board that rests on the lawn of the Garden World. Swapping slides two
 * tiles along the board with an arc, matches pop into 3D sparkles, and the
 * columns above collapse while fresh gems rain in with a bounce.
 *
 * Every original rule is unchanged: 8x8 grid, five gems, 25 moves, goal 400 x
 * level, +20 moves and doubled goal per level, combo scoring (matches * 10 *
 * combo), cascade detection, reshuffle when no move exists, hint button,
 * mascot/subtitles and the same result screen lines, stars and progress
 * tracking.
 */

const COLS = 8;
const ROWS = 8;
const GEMS = ['🍓', '🍇', '🍊', '🍋', '🍒'];
const GEM_COLORS = [0xff5c7a, 0xa78bfa, 0xffa94d, 0xffd93d, 0xe0344e];

const PITCH = 1.05;
const TILE = 0.96;
const TILE_H = 0.55;
const SLAB_W = 9.5;
const SLAB_H = 0.4;
const TRIM_W = 10.1;
const TRIM_H = 0.3;
const GROUND_Y = -0.7;

const SWAP_MS = 170;
const POP_MS = 220;
const FALL_MS = 280;
const SWIPE_PX = 34;

const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
const outBack = (t: number): number =>
  1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const bounceOut = (t: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};

/* ------------------------------------------------------------------ */
/* gem face texture (canvas -> THREE.Texture, cached per gem type)     */
/* ------------------------------------------------------------------ */

const faceTexCache = new Map<number, THREE.Texture>();
const faceMatCache = new Map<number, THREE.MeshPhongMaterial>();

function gemTexture(type: number): THREE.Texture {
  const hit = faceTexCache.get(type);
  if (hit) return hit;
  const S = 160;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, S, S);
    ctx.font = `${Math.round(S * 0.8)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(GEMS[type], S / 2, S / 2 + S * 0.04);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceTexCache.set(type, tex);
  return tex;
}

function gemMaterial(type: number): THREE.MeshPhongMaterial {
  const hit = faceMatCache.get(type);
  if (hit) return hit;
  const m = new THREE.MeshPhongMaterial({
    map: gemTexture(type),
    transparent: false,
    alphaTest: 0.35,
    shininess: 40,
    specular: 0x111111,
  });
  m.userData.shared = true;
  faceMatCache.set(type, m);
  return m;
}

interface Tile {
  type: number;
  c: number;
  r: number;
  root: THREE.Group;
  body: THREE.Mesh;
  face: THREE.Mesh;
  /** bumped by every new tween so stale animations let go */
  gen: number;
}

export class MatchPuzzleScene extends ThreeGameScene {
  private grid: (Tile | null)[][] = [];
  private score = 0;
  private moves = 25;
  private level = 1;
  private target = 400;
  private combo = 0;
  private bestCombo = 0;
  private busy = false;
  private over = false;
  private selected: Tile | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private boardGen = 0;
  private world: World | null = null;
  private boardGroup: THREE.Group | null = null;
  private ringMesh: THREE.Mesh | null = null;
  private levelPill!: Pill;
  private movesPill!: Pill;
  private targetPill!: Pill;
  private comboTxt!: Phaser.GameObjects.Text;
  private mascot!: Phaser.GameObjects.Text;

  constructor() {
    super('MatchPuzzle');
  }

  create(): void {
    this.score = 0;
    this.moves = 25;
    this.level = 1;
    this.target = 400;
    this.combo = 0;
    this.bestCombo = 0;
    this.busy = false;
    this.over = false;
    this.selected = null;
    this.dragStart = null;
    this.boardGen = 0;
    this.world = null;
    this.boardGroup = null;
    this.ringMesh = null;

    const ok = this.setup3D({
      lighting: 'day',
      camera: { pos: [0, 28.9, 18.1], look: [-0.75, 0.42, 0], fov: 18 },
      introDur: 700,
      introFrom: [7, 38, 30],
      hud: false,
    });
    if (!ok) return;

    // left info column
    this.levelPill = new Pill(this, 190, 160, 'LEVEL 1', { color: 0xa78bfa, minW: 240, depth: 20 });
    this.movesPill = new Pill(this, 190, 230, 'MOVES 25', { color: 0x4aa3ff, minW: 240, depth: 20 });
    this.targetPill = new Pill(this, 190, 300, 'GOAL 400', { color: 0x6bcb77, minW: 240, depth: 20 });

    this.comboTxt = label(this, 190, 385, ' ', { size: 34, color: '#ff6b6b' });
    label(this, 190, 425, 'Match 3 or more!', { size: 20, color: '#4a5578' });

    button(this, {
      x: 190, y: 505, w: 240, h: 70, label: 'HINT', icon: '💡', color: 0xffd93d, textColor: '#7a4a00',
      fontSize: 30, depth: 20,
      onClick: () => this.showHint(),
    });

    // mascot
    this.mascot = emojiText(this, 1135, 520, '🐻', 130).setDepth(10);
    this.tweens.add({ targets: this.mascot, y: 505, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    label(this, 1135, 620, 'Bear says: swap me!', { size: 20, color: '#4a5578' });

    this.showHud({ score: 0, center: '🧩 MATCH PUZZLE' });
    this.refreshPills();

    this.buildInitialGrid();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.resumeAfterGesture();
      this.dragStart = { x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || this.busy || !this.selected) return;
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;
      const dir =
        Math.abs(dx) > Math.abs(dy)
          ? { c: dx > 0 ? 1 : -1, r: 0 }
          : { c: 0, r: dy > 0 ? 1 : -1 };
      const from = this.selected;
      this.dragStart = null;
      this.setSelected(null);
      const nc = from.c + dir.c;
      const nr = from.r + dir.r;
      if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
        const other = this.grid[nr][nc];
        if (other) void this.attemptSwap(from, other);
      }
    });
    this.input.on('pointerup', () => {
      this.dragStart = null;
    });

    // idle ambient sparkle over the board
    this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => this.ambientSparkle(),
    });

    this.exposeTest({
      state: () => ({
        score: this.score,
        moves: this.moves,
        level: this.level,
        target: this.target,
        combo: this.combo,
        busy: this.busy,
        over: this.over,
        selected: this.selected ? this.selected.r * COLS + this.selected.c : null,
        grid: this.grid.flatMap((row) => row.map((t) => (t ? t.type : -1))),
        ready: this.gameplayReady,
      }),
      probe: () => this.probeTile(),
    });
  }

  /* ---------------- 3D world ---------------- */

  protected build3D(): void {
    const stage = this.stage!;

    this.world = createGardenWorld(stage, { seed: 5, size: 24 });
    this.world.root.position.y = GROUND_Y;
    this.clearBoardFootprint(this.world.root);

    // decorations on the lawn around the board (positions verified on screen)
    const props = new THREE.Group();
    props.position.y = GROUND_Y;
    stage.scene.add(props);
    props.add(this.makeBush(-7.7, 3.9), this.makeBush(7.1, -1.0));
    for (const [x, z, s] of [
      [-6.3, 4.3, 0.55],
      [6.4, -5.8, 0.6],
    ] as [number, number, number][]) {
      const rock = makeRock(s);
      rock.position.set(x, 0.42 * s, z);
      props.add(rock);
    }
    const gemProp = createObject('gem', { size: 0.95 });
    gemProp.position.set(6.7, 0.72, -3.0);
    gemProp.rotation.y = 0.4;
    props.add(gemProp);
    const starProp = createObject('star', { size: 1.15 });
    starProp.rotation.x = -Math.PI / 2;
    starProp.position.set(-6.0, 0.06, -6.5);
    props.add(starProp);

    // the board: white trim lip, navy slab, 64 recessed cells
    this.boardGroup = new THREE.Group();
    stage.scene.add(this.boardGroup);

    const trim = mesh(GEO.roundedBox(TRIM_W, TRIM_H, TRIM_W, 0.14), matteMat(0xf6f8ff));
    trim.position.y = -SLAB_H - TRIM_H / 2;
    const slab = mesh(GEO.roundedBox(SLAB_W, SLAB_H, SLAB_W, 0.16), matteMat(0x1f2340));
    slab.position.y = -SLAB_H / 2;
    this.boardGroup.add(trim, slab);

    const padGeo = GEO.roundedBox(TILE + 0.1, 0.05, TILE + 0.1, 0.1);
    const padA = matteMat(0x2c3366);
    const padB = matteMat(0x242a54);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pad = mesh(padGeo, (r + c) % 2 === 0 ? padA : padB, { cast: false });
        pad.position.set(this.cellX(c), 0.005, this.cellZ(r));
        this.boardGroup.add(pad);
      }
    }

    // shared selection ring (moved to the selected cell every frame)
    const ring = new THREE.Mesh(
      GEO.ring(TILE * 0.42, TILE * 0.5, 40),
      new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
        shininess: 60,
        transparent: true,
        opacity: 0.95,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = TILE_H + 0.03;
    ring.visible = false;
    this.boardGroup.add(ring);
    this.ringMesh = ring;
  }

  protected override on3DUpdate(dt: number, t: number): void {
    this.world?.update(dt, t / 1000);
    const ring = this.ringMesh;
    if (!ring) return;
    const sel = this.selected;
    if (!sel) {
      ring.visible = false;
      return;
    }
    ring.visible = true;
    ring.position.set(
      sel.root.position.x,
      sel.root.position.y + TILE_H + 0.03,
      sel.root.position.z
    );
    ring.scale.setScalar(1 + Math.sin(t / 260) * 0.05);
  }

  private makeBush(x: number, z: number): THREE.Group {
    const g = new THREE.Group();
    const a = matteMat(0x3f9b3f);
    const b = matteMat(0x54b24f);
    const b1 = mesh(GEO.sphere(0.6), a);
    b1.position.y = 0.38;
    const b2 = mesh(GEO.sphere(0.42), b);
    b2.position.set(0.5, 0.28, 0.2);
    const b3 = mesh(GEO.sphere(0.34), a);
    b3.position.set(-0.42, 0.24, -0.26);
    g.add(b1, b2, b3);
    g.position.set(x, 0, z);
    return g;
  }

  /** Nothing may grow through the board footprint; clouds/bees never drift over it. */
  private clearBoardFootprint(root: THREE.Group): void {
    const KEEP = 7.6;
    for (const child of [...root.children]) {
      if ((child as THREE.Mesh).isMesh) continue; // keep the lawn disc
      const wings = child.children.filter((o) => !(o as THREE.Mesh).isMesh).length;
      // clouds sit at y 9..14 and would swell over the board from this camera
      if (child.position.y > 5 || wings >= 2 || Math.hypot(child.position.x, child.position.z) < KEEP) {
        root.remove(child);
      }
    }
  }

  /* ---------------- helpers ---------------- */

  private cellX(c: number): number {
    return (c - (COLS - 1) / 2) * PITCH;
  }

  private cellZ(r: number): number {
    return (r - (ROWS - 1) / 2) * PITCH;
  }

  private centerOf(t: Tile): THREE.Vector3 {
    return new THREE.Vector3(
      t.root.position.x,
      t.root.position.y + TILE_H * 0.5,
      t.root.position.z
    );
  }

  private refreshPills(): void {
    this.levelPill.set(`LEVEL ${this.level}`);
    this.movesPill.set(`MOVES ${this.moves}`, this.moves <= 5 ? 0xff6b6b : 0x4aa3ff);
    this.targetPill.set(`GOAL ${this.target}`);
    this.hud?.setScore(this.score);
  }

  private setTileType(tile: Tile, type: number): void {
    tile.type = type;
    tile.body.material = toyMat(GEM_COLORS[type]);
    tile.face.material = gemMaterial(type);
  }

  private makeTile(c: number, r: number, type: number, animate: boolean): Tile {
    const root = new THREE.Group();
    root.position.set(this.cellX(c), 0, this.cellZ(r));

    const body = mesh(GEO.roundedBox(TILE, TILE_H, TILE, 0.12), toyMat(GEM_COLORS[type]));
    body.position.y = TILE_H / 2;
    root.add(body);

    const face = new THREE.Mesh(GEO.plane(TILE * 0.94, TILE * 0.94), gemMaterial(type));
    face.rotation.x = -Math.PI / 2;
    face.position.y = TILE_H + 0.01;
    root.add(face);

    const tile: Tile = { type, c, r, root, body, face, gen: 0 };
    this.boardGroup?.add(root);
    this.interact?.add(root, {
      kind: 'tap',
      // Select on press so a single press-drag gesture can swipe a match,
      // not only "tap to select, then swipe" (the tap path still works).
      onDown: () => this.onTileDown(tile),
      onTap: () => this.onTileTap(tile),
    });

    if (animate) {
      root.scale.setScalar(0.001);
      const gen = this.boardGen;
      this.stage?.delay((r + c) * 16, () => {
        const stage = this.stage;
        if (!stage || gen !== this.boardGen) return;
        const tg = ++tile.gen;
        stage.tween({
          dur: 300,
          ease: outBack,
          onUpdate: (u) => {
            if (tile.gen !== tg) return;
            root.scale.setScalar(Math.max(0.001, u));
          },
          onComplete: () => {
            if (tile.gen !== tg) return;
            root.scale.setScalar(1);
          },
        });
      });
    }
    return tile;
  }

  private buildInitialGrid(): void {
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row: (Tile | null)[] = [];
      for (let c = 0; c < COLS; c++) {
        let type = 0;
        let guard = 0;
        do {
          type = Math.floor(Math.random() * GEMS.length);
          guard++;
        } while (guard < 30 && this.wouldMatch(c, r, type));
        row.push(this.makeTile(c, r, type, true));
      }
      this.grid.push(row);
    }
    if (!this.findFirstMove()) {
      // extremely unlikely: rebuild once
      this.destroyTiles();
      this.buildInitialGrid();
    }
  }

  private wouldMatch(c: number, r: number, type: number): boolean {
    const at = (cc: number, rr: number): number | null => {
      const t = this.grid[rr]?.[cc];
      return t ? t.type : null;
    };
    if (c >= 2 && at(c - 1, r) === type && at(c - 2, r) === type) return true;
    if (r >= 2 && at(c, r - 1) === type && at(c, r - 2) === type) return true;
    return false;
  }

  private destroyTiles(): void {
    this.boardGen++;
    for (const row of this.grid) {
      for (const t of row) {
        if (!t) continue;
        this.interact?.remove(t.root);
        t.root.removeFromParent();
      }
    }
    this.grid = [];
  }

  private onTileDown(tile: Tile): void {
    if (this.busy || this.over || !this.gameplayReady) return;
    audio.resumeAfterGesture();
    this.setSelected(tile);
    this.dragStart = { x: this.input.activePointer.x, y: this.input.activePointer.y };
  }

  private onTileTap(tile: Tile): void {
    if (this.busy || this.over || !this.gameplayReady) return;
    audio.resumeAfterGesture();
    if (this.selected && this.selected !== tile && this.isAdjacent(this.selected, tile)) {
      const from = this.selected;
      this.setSelected(null);
      void this.attemptSwap(from, tile);
      return;
    }
    this.setSelected(tile);
    audio.play('tick');
    this.dragStart = { x: this.input.activePointer.x, y: this.input.activePointer.y };
  }

  private setSelected(tile: Tile | null): void {
    if (this.selected) this.interact?.highlight(this.selected.root, false);
    this.selected = tile;
    if (tile) this.interact?.highlight(tile.root, true);
    if (this.ringMesh) this.ringMesh.visible = tile !== null;
  }

  private isAdjacent(a: Tile, b: Tile): boolean {
    return Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;
  }

  /* ---------------- matching ---------------- */

  private findMatches(): Set<Tile> {
    const found = new Set<Tile>();
    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        const prev = this.grid[r][c - 1];
        const cur = c < COLS ? this.grid[r][c] : null;
        if (cur && prev && cur.type === prev.type) {
          run++;
        } else {
          if (run >= 3 && prev) for (let k = 1; k <= run; k++) found.add(this.grid[r][c - k] as Tile);
          run = 1;
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        const prev = this.grid[r - 1][c];
        const cur = r < ROWS ? this.grid[r][c] : null;
        if (cur && prev && cur.type === prev.type) {
          run++;
        } else {
          if (run >= 3 && prev) for (let k = 1; k <= run; k++) found.add(this.grid[r - k][c] as Tile);
          run = 1;
        }
      }
    }
    return found;
  }

  private wouldSwapMatch(a: Tile, b: Tile): boolean {
    this.swapInGrid(a, b);
    const ok = this.findMatches().size > 0;
    this.swapInGrid(a, b);
    return ok;
  }

  private swapInGrid(a: Tile, b: Tile): void {
    const ar = a.r;
    const ac = a.c;
    const br = b.r;
    const bc = b.c;
    this.grid[ar][ac] = b;
    this.grid[br][bc] = a;
    a.r = br;
    a.c = bc;
    b.r = ar;
    b.c = ac;
  }

  private findFirstMove(): [Tile, Tile] | null {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = this.grid[r][c];
        if (!a) continue;
        const right = c + 1 < COLS ? this.grid[r][c + 1] : null;
        const down = r + 1 < ROWS ? this.grid[r + 1][c] : null;
        if (right && this.wouldSwapMatch(a, right)) return [a, right];
        if (down && this.wouldSwapMatch(a, down)) return [a, down];
      }
    }
    return null;
  }

  private async attemptSwap(a: Tile, b: Tile): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    audio.play('swap');
    this.swapInGrid(a, b);
    this.slideTo(a);
    this.slideTo(b);
    await wait(this, SWAP_MS + 20);
    if (!this.scene.isActive()) return;

    if (this.findMatches().size === 0) {
      const mid = this.centerOf(a).add(this.centerOf(b)).multiplyScalar(0.5);
      wrongFx(this.fx, mid);
      shakeCamera(this, 0.004, 160);
      this.rig?.shake(0.3, 0.22);
      this.swapInGrid(a, b);
      this.slideTo(a);
      this.slideTo(b);
      await wait(this, SWAP_MS + 20);
      if (!this.scene.isActive()) return;
      this.busy = false;
      return;
    }

    this.moves--;
    this.refreshPills();
    await this.resolve();
    if (!this.scene.isActive()) return;
    this.busy = false;
    this.afterSettle();
  }

  /** Slide a tile to its cell along a shallow arc. */
  private slideTo(t: Tile): void {
    const stage = this.stage;
    if (!stage) return;
    const gx = this.cellX(t.c);
    const gz = this.cellZ(t.r);
    const sx = t.root.position.x;
    const sz = t.root.position.z;
    const gen = ++t.gen;
    stage.tween({
      dur: SWAP_MS,
      ease: easeOutQuad,
      onUpdate: (u) => {
        if (t.gen !== gen) return;
        t.root.position.set(
          sx + (gx - sx) * u,
          Math.sin(u * Math.PI) * 0.4,
          sz + (gz - sz) * u
        );
      },
      onComplete: () => {
        if (t.gen !== gen) return;
        t.root.position.set(gx, 0, gz);
        t.root.scale.setScalar(1);
      },
    });
  }

  private async resolve(): Promise<void> {
    this.combo = 0;
    for (;;) {
      const matches = this.findMatches();
      if (matches.size === 0) break;
      this.combo++;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      const gained = matches.size * 10 * this.combo;
      this.score += gained;
      this.hud?.addScore(gained);
      progress.track('matches', matches.size);

      const list = [...matches];
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (const t of list) {
        const p = this.centerOf(t);
        mx += p.x;
        my += p.y;
        mz += p.z;
      }
      const mid = new THREE.Vector3(mx / list.length, my / list.length, mz / list.length);
      const screen = this.stage?.project(mid.x, mid.y, mid.z) ?? null;
      if (screen) floatText(this, screen.x, screen.y, `+${gained}`, { color: '#ffd93d', size: 34 });
      if (this.combo > 1) {
        this.comboTxt.setText(`COMBO x${this.combo}!`);
        sparkles(this, 190, 385, 0xff6b6b, 8);
        confetti(this, 700);
        if (this.fx) confettiBurst(this.fx, mid, { count: 26, speed: 6, life: 1.4, radius: 2.4 });
      }
      this.mascot.setText(this.combo > 2 ? '🤩' : '😄');
      audio.play('match');
      if (this.fx) sparkleBurst(this.fx, mid, { count: 18, speed: 4.4, size: 0.44 });
      if (screen) burst(this, screen.x, screen.y, 0xffd93d, 14);

      for (const t of list) {
        this.grid[t.r][t.c] = null;
        this.popOut(t);
      }

      await wait(this, 240);
      if (!this.scene.isActive()) return;
      this.collapse();
      await wait(this, 300);
      if (!this.scene.isActive()) return;
    }
    this.time.delayedCall(900, () => {
      if (this.scene.isActive()) {
        this.comboTxt.setText(' ');
        this.mascot.setText('🐻');
      }
    });
  }

  /** Pop a matched gem: spin, shrink, sparkle, then leave the board. */
  private popOut(t: Tile): void {
    this.interact?.remove(t.root);
    if (this.fx) sparkleBurst(this.fx, this.centerOf(t), { count: 14, speed: 4, size: 0.4 });
    const stage = this.stage;
    if (!stage) {
      t.root.removeFromParent();
      return;
    }
    const gen = ++t.gen;
    stage.tween({
      dur: POP_MS,
      ease: (u) => u,
      onUpdate: (u) => {
        if (t.gen !== gen) return;
        t.root.scale.setScalar(Math.max(0.001, 1 - u));
        t.root.rotation.y = u * Math.PI * 1.5;
        t.root.position.y = u * 0.55;
      },
      onComplete: () => {
        if (t.gen !== gen) return;
        t.root.removeFromParent();
      },
    });
  }

  private collapse(): void {
    for (let c = 0; c < COLS; c++) {
      const col: Tile[] = [];
      for (let r = 0; r < ROWS; r++) {
        const t = this.grid[r][c];
        if (t) col.push(t);
        this.grid[r][c] = null;
      }
      let r = ROWS - 1;
      for (let i = col.length - 1; i >= 0; i--) {
        const t = col[i];
        t.r = r;
        this.grid[r][c] = t;
        this.dropTo(t, SWAP_MS);
        r--;
      }
      for (let rr = r; rr >= 0; rr--) {
        const type = Math.floor(Math.random() * GEMS.length);
        const t = this.makeTile(c, rr, type, false);
        this.grid[rr][c] = t;
        this.dropIn(t, (r - rr + 1) * PITCH + 1.4);
      }
    }
  }

  /** Existing gem falling into a newly emptied cell. */
  private dropTo(t: Tile, dur: number): void {
    const stage = this.stage;
    if (!stage) return;
    const gx = this.cellX(t.c);
    const gz = this.cellZ(t.r);
    const s = t.root.position.clone();
    const e = new THREE.Vector3(gx, 0, gz);
    const gen = ++t.gen;
    stage.tween({
      dur,
      ease: easeOutQuad,
      onUpdate: (u) => {
        if (t.gen !== gen) return;
        t.root.position.lerpVectors(s, e, u);
      },
      onComplete: () => {
        if (t.gen !== gen) return;
        t.root.position.set(gx, 0, gz);
        t.root.scale.setScalar(1);
      },
    });
  }

  /** Fresh gem raining in from above the board. */
  private dropIn(t: Tile, fromY: number): void {
    const stage = this.stage;
    if (!stage) return;
    t.root.position.set(this.cellX(t.c), fromY, this.cellZ(t.r));
    t.root.scale.setScalar(0.8);
    const gen = ++t.gen;
    stage.tween({
      dur: FALL_MS,
      ease: bounceOut,
      onUpdate: (u) => {
        if (t.gen !== gen) return;
        t.root.position.y = fromY * (1 - u);
        t.root.scale.setScalar(0.8 + 0.2 * u);
      },
      onComplete: () => {
        if (t.gen !== gen) return;
        t.root.position.y = 0;
        t.root.scale.setScalar(1);
      },
    });
  }

  private afterSettle(): void {
    if (!this.findFirstMove()) {
      toast(this, 'Shuffling! 🔀', { color: 0xa78bfa });
      void this.reshuffle();
      return;
    }
    if (this.score >= this.target) {
      void this.levelComplete();
      return;
    }
    if (this.moves <= 0) {
      this.endGame();
    }
  }

  private async levelComplete(): Promise<void> {
    this.busy = true;
    progress.track('puzzle_levels', 1);
    audio.play('success');
    confetti(this, 1600);
    if (this.fx) {
      confettiBurst(this.fx, { x: 0, y: 2.6, z: 0 }, { count: 64, speed: 7, life: 1.8, radius: 4 });
      sparkleBurst(this.fx, { x: 0, y: 1.8, z: 0 }, { count: 30, speed: 5, size: 0.5 });
    }
    toast(this, `LEVEL ${this.level} COMPLETE! ⭐`, { color: 0x2f9e44, duration: 1800 });
    this.level++;
    this.target = 400 * this.level;
    this.moves += 20;
    this.refreshPills();
    await wait(this, 1500);
    if (!this.scene.isActive()) return;
    this.busy = false;
    if (!this.findFirstMove()) void this.reshuffle();
  }

  private async reshuffle(): Promise<void> {
    this.busy = true;
    const types: number[] = [];
    for (const row of this.grid) for (const t of row) if (t) types.push(t.type);
    let guard = 0;
    do {
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      let k = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const t = this.grid[r][c];
          if (t) this.setTileType(t, types[k++]);
        }
      guard++;
    } while ((this.findMatches().size > 0 || !this.findFirstMove()) && guard < 60);

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r][c];
        if (!t) continue;
        const gen = ++t.gen;
        t.root.scale.setScalar(0.2);
        this.stage?.delay((r + c) * 18, () => {
          const stage = this.stage;
          if (!stage || t.gen !== gen) return;
          stage.tween({
            dur: 260,
            ease: outBack,
            onUpdate: (u) => {
              if (t.gen !== gen) return;
              t.root.scale.setScalar(0.2 + 0.8 * u);
            },
            onComplete: () => {
              if (t.gen !== gen) return;
              t.root.scale.setScalar(1);
            },
          });
        });
      }
    await wait(this, 700);
    if (!this.scene.isActive()) return;
    this.busy = false;
  }

  private showHint(): void {
    if (this.busy) return;
    const move = this.findFirstMove();
    if (!move) {
      void this.reshuffle();
      return;
    }
    audio.play('collect');
    for (const t of move) {
      this.pulseTile(t);
      const p = this.centerOf(t);
      const screen = this.stage?.project(p.x, p.y, p.z);
      if (screen) sparkles(this, screen.x, screen.y, 0xffd93d, 6);
      if (this.fx) sparkleBurst(this.fx, p, { count: 8, speed: 2.4, life: 0.6, size: 0.34 });
    }
  }

  private pulseTile(t: Tile): void {
    const stage = this.stage;
    if (!stage) return;
    const gen = ++t.gen;
    stage.tween({
      dur: 960,
      ease: (u) => u,
      onUpdate: (u) => {
        if (t.gen !== gen) return;
        t.root.scale.setScalar(1 + Math.abs(Math.sin(u * Math.PI * 4)) * 0.5);
      },
      onComplete: () => {
        if (t.gen !== gen) return;
        t.root.scale.setScalar(1);
      },
    });
  }

  private ambientSparkle(): void {
    const stage = this.stage;
    if (!stage || this.over) return;
    const tiles: Tile[] = [];
    for (const row of this.grid) for (const t of row) if (t) tiles.push(t);
    if (!tiles.length) return;
    const t = tiles[Math.floor(Math.random() * tiles.length)];
    const p = this.centerOf(t);
    const screen = stage.project(p.x, p.y, p.z);
    if (screen) sparkles(this, screen.x, screen.y, 0xffffff, 3);
    if (this.fx) sparkleBurst(this.fx, p, { count: 5, speed: 1.6, life: 0.6, size: 0.3 });
  }

  private endGame(): void {
    this.busy = true;
    this.over = true;
    this.gameplayReady = false;
    audio.play('fail');
    const stars = Math.min(3, Math.max(1, this.level));
    this.finish({
      score: this.score,
      stars,
      win: this.level > 1,
      subtitle: this.level > 1 ? `You reached level ${this.level}!` : 'The bear believes in you!',
      lines: [
        { icon: '🧩', label: 'Level', value: String(this.level) },
        { icon: '🔥', label: 'Best combo', value: `x${Math.max(1, this.bestCombo)}` },
      ],
    });
  }

  /* ---------------- E2E helpers ---------------- */

  private probeTile(): ProbePoint | null {
    const stage = this.stage;
    if (!stage || !this.gameplayReady || this.busy || this.over) return null;
    const sel = this.selected ? this.selected.r * COLS + this.selected.c : -1;
    const found: ProbePoint[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (idx === sel) continue;
        if (!this.grid[r][c]) continue;
        const p = stage.project(this.cellX(c), TILE_H, this.cellZ(r));
        if (!p) continue;
        if (p.x < 345 || p.x > 1040 || p.y < 130 || p.y > 690) continue;
        found.push({ x: p.x, y: p.y, label: String(idx) });
      }
    }
    if (!found.length) return null;
    return found[Math.floor(found.length / 2)];
  }
}
