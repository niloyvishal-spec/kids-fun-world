import Phaser from 'phaser';
import * as THREE from 'three';
import { audio } from '../core/AudioManager';
import { confetti, floatText, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { button, label, Pill, toast, type Btn } from '../core/UI';
import { ThreeGameScene, type ProbePoint } from '../3d/base/ThreeGameScene';
import type { InteractEvent } from '../3d/interaction';
import { GEO, matteMat, mesh, toyMat } from '../3d/materials';
import { sparkleBurst } from '../3d/particles';
import { PICTURES, type PictureDef } from './pictures';

/**
 * Color Studio - a real 3D art studio.
 *
 * The picture lives on an extruded canvas standing on a wooden easel: every
 * colouring region is its own bevelled 3D mesh (the bevel reads as the dark
 * pencil outline, the cap is the paint). Twelve physical paint pots sit on the
 * workbench to the right - tap one to pick a colour, then tap the canvas.
 */

const WHITE = 0xffffff;

const SWATCHES = [
  0xff6b6b, 0xff922b, 0xffd43b, 0x69db7c, 0x38d9a9, 0x4dabf7,
  0x748ffc, 0xb197fc, 0xf783ac, 0xe64980, 0x12b886, 0x495057,
];

/* ---- studio layout (world units) ---- */
const CANVAS_W = 11.5;
const CANVAS_H = (CANVAS_W * 470) / 640;
const CANVAS_X = -3.4;
const CANVAS_Y = 5.3;
const CANVAS_YAW = 0.16;
const SCALE = CANVAS_W / 640;

const BOARD_D = 0.3;
const FRAME_D = 0.06;
const PAGE_D = 0.06;
const PAGE_Z = 0.135;
const REGION_STEP = 0.008;
const REGION_DEPTH = 0.05;
const REGION_BEVEL_T = 0.012;
const REGION_BEVEL_S = 4 * SCALE;
/** Local z of the extrusion base for region 0 (its bevel sits on the page). */
const REGION_Z0 = PAGE_Z + PAGE_D - REGION_BEVEL_T;
const OUTLINE = 0x33364f;
/** Flat self-lit lift so paper reads white and paint reads vivid indoors. */
const PAPER_GLOW = 0.34;
const FILL_GLOW = 0.26;

/* ---- workbench ---- */
const POT_R = 0.4;
const POT_X0 = 4.4;
const POT_DX = 1.02;
const BACK_Y = 3.2;
const BACK_Z = 1.15;
const FRONT_Y = 2.1;
const FRONT_Z = 3.4;
const TABLE_X = 7.0;

interface Pot {
  color: number;
  root: THREE.Group;
  base: THREE.Vector3;
  lift: number;
  phase: number;
}

/** Tap-to-colour art studio with seven pictures, eraser, undo and saving. */
export class ColorStudioScene extends ThreeGameScene {
  private picture: PictureDef | null = null;
  private colors: number[] = [];
  private selected = SWATCHES[0];
  private erase = false;
  private undoStack: { i: number; prev: number }[] = [];
  private celebrated = false;
  private over = false;
  private taps = 0;

  private menuBox: Phaser.GameObjects.Container | null = null;
  private editBox: Phaser.GameObjects.Container | null = null;
  private progressPill: Pill | null = null;
  private eraseBtn: Btn | null = null;
  private doneBtn: Btn | null = null;

  private easel: THREE.Group | null = null;
  private board: THREE.Group | null = null;
  private regionMeshes: THREE.Mesh[] = [];
  private regionMats: THREE.MeshPhongMaterial[] = [];
  private wetGen: number[] = [];

  private pots: Pot[] = [];
  private selectedPot: Pot | null = null;
  private halo: THREE.Mesh | null = null;
  private sparkleAcc = 0;

  constructor() {
    super('ColorStudio');
  }

  create(): void {
    this.picture = null;
    this.colors = [];
    this.erase = false;
    this.undoStack = [];
    this.celebrated = false;
    this.over = false;
    this.taps = 0;
    this.sparkleAcc = 0;
    this.menuBox = null;
    this.editBox = null;
    this.progressPill = null;
    this.eraseBtn = null;
    this.doneBtn = null;
    this.easel = null;
    this.board = null;
    this.regionMeshes = [];
    this.regionMats = [];
    this.wetGen = [];
    this.pots = [];
    this.selectedPot = null;
    this.halo = null;
    this.selected = SWATCHES[0];

    const ok = this.setup3D({
      lighting: 'indoor',
      camera: { pos: [1.6, 7.6, 19.5], look: [0.2, 4.4, 0.5], fov: 44 },
      introDur: 700,
      introFrom: [7.5, 13.5, 27],
      hud: { score: 0, center: '🎨 COLOR STUDIO' },
    });
    if (!ok) {
      this.exposeTest({
        state: () => ({ ready: false, over: true, error: 'webgl', phase: 'menu' }),
        probe: () => null,
      });
      return;
    }

    this.input.on('pointerdown', () => audio.resumeAfterGesture());
    this.showMenu();

    this.exposeTest({
      state: () => this.testState(),
      probe: () => this.probePoint(),
    });
  }

  /* ---------------- 3D world ---------------- */

  protected build3D(): void {
    const stage = this.stage;
    if (!stage) return;

    this.buildRoom();
    this.buildEasel();
    this.buildBench();

    this.fx?.emit({
      pos: { x: TABLE_X, y: 3.6, z: 2.4 },
      area: { x: 6.4, y: 1.6, z: 2.8 },
      rate: 1.6,
      count: 1,
      color: [0xfff2a8, 0xffffff, 0xffd93d],
      speed: 0.45,
      life: 1.7,
      size: 0.24,
      tex: 'star',
      additive: true,
      gravity: -0.3,
      drag: 0.7,
      spread: 0.7,
    });
  }

  private buildRoom(): void {
    const stage = this.stage;
    if (!stage) return;

    const floor = mesh(GEO.box(70, 0.5, 44), matteMat(0xe8d7b6), { cast: false, receive: true });
    floor.position.set(0, -0.25, 6);

    const wall = mesh(GEO.box(70, 34, 0.6), matteMat(0xfdeef3, { emissive: 0xfdeef3, emissiveIntensity: 0.14 }), {
      cast: false,
      receive: false,
    });
    wall.position.set(0, 11, -6.6);

    const skirt = mesh(GEO.box(70, 0.9, 0.16), matteMat(0xffffff), { cast: false, receive: false });
    skirt.position.set(0, 0.45, -6.22);

    const rug = mesh(GEO.circle(6.5, 30), matteMat(0xf7d9a8), { cast: false, receive: true });
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(CANVAS_X, 0.02, 2.5);
    const rugIn = mesh(GEO.circle(5.3, 30), matteMat(0xffe9c6), { cast: false, receive: true });
    rugIn.rotation.x = -Math.PI / 2;
    rugIn.position.set(CANVAS_X, 0.03, 2.5);

    stage.scene.add(floor, wall, skirt, rug, rugIn);

    // framed child-art on the left wall
    const art = new THREE.Group();
    const artFrame = mesh(GEO.box(3.2, 2.6, 0.2), toyMat(0xffd93d), { cast: false, receive: false });
    const artPaper = mesh(GEO.box(2.8, 2.2, 0.1), matteMat(0xfff7e6), { cast: false, receive: false });
    artPaper.position.z = 0.12;
    art.add(artFrame, artPaper);
    [[-0.7, 0.4, 0xff6b6b], [0.5, 0.2, 0x4dabf7], [-0.1, -0.5, 0x69db7c]].forEach((c) => {
      const dot = mesh(GEO.circle(0.34, 18), matteMat(c[2] as number), { cast: false, receive: false });
      dot.position.set(c[0] as number, c[1] as number, 0.19);
      art.add(dot);
    });
    art.position.set(-16, 5.8, -6.15);
    stage.scene.add(art);

    // shelf + jars + a big drawing on the right wall
    const shelf = mesh(GEO.box(7.0, 0.24, 0.85), toyMat(0xd9a066), { cast: true, receive: false });
    shelf.position.set(11.5, 4.0, -5.85);
    stage.scene.add(shelf);
    [0, 3, 5, 8].forEach((s, i) => {
      const jar = mesh(GEO.cylinder(0.34, 0.3, 0.7, 16), matteMat(0xf2f5fa), { cast: true, receive: false });
      jar.position.set(9.0 + i * 1.7, 4.47, -5.85);
      const paint = mesh(GEO.cylinder(0.3, 0.3, 0.1, 16), toyMat(SWATCHES[s]), { cast: false, receive: false });
      paint.position.set(9.0 + i * 1.7, 4.87, -5.85);
      stage.scene.add(jar, paint);
    });

    const bigFrame = mesh(GEO.box(5.0, 3.6, 0.2), toyMat(0x4dd0e1), { cast: false, receive: false });
    bigFrame.position.set(11.5, 7.7, -6.15);
    const bigPaper = mesh(GEO.box(4.6, 3.2, 0.1), matteMat(0xfff7e6), { cast: false, receive: false });
    bigPaper.position.set(11.5, 7.7, -6.05);
    stage.scene.add(bigFrame, bigPaper);
    [[-1.4, 0.6, 0xffd93d], [0.2, 0.9, 0xff6b6b], [1.5, -0.4, 0xb197fc], [-0.6, -0.8, 0x38d9a9]].forEach((c) => {
      const dot = mesh(GEO.circle(0.5, 20), matteMat(c[2] as number), { cast: false, receive: false });
      dot.position.set(11.5 + (c[0] as number), 7.7 + (c[1] as number), -5.98);
      stage.scene.add(dot);
    });
  }

  private buildEasel(): void {
    const stage = this.stage;
    if (!stage) return;

    const easel = new THREE.Group();
    easel.position.set(CANVAS_X, 0, 0);
    easel.rotation.y = CANVAS_YAW;
    stage.scene.add(easel);
    this.easel = easel;

    const half = CANVAS_W / 2;

    // A-frame legs (feet splay out, tops hug the canvas)
    const legGeo = GEO.box(0.32, 10, 0.32);
    const legMat = toyMat(0x9a6b45);
    const left = mesh(legGeo, legMat, { cast: true, receive: true });
    left.position.set(-half - 0.1, 5, -0.36);
    left.rotation.z = -0.035;
    const right = mesh(legGeo, legMat, { cast: true, receive: true });
    right.position.set(half + 0.1, 5, -0.36);
    right.rotation.z = 0.035;
    const back = mesh(legGeo, legMat, { cast: true, receive: true });
    back.position.set(0, 4.95, -1.6);
    back.rotation.x = -0.18;

    const cross = mesh(GEO.box(CANVAS_W + 0.6, 0.24, 0.24), legMat, { cast: true, receive: true });
    cross.position.set(0, 0.72, -0.36);

    const ledge = mesh(GEO.box(CANVAS_W + 0.9, 0.26, 0.8), toyMat(0xb08054), { cast: true, receive: true });
    ledge.position.set(0, CANVAS_Y - CANVAS_H / 2 - 0.14, 0.28);

    const clamp = mesh(GEO.box(1.7, 0.5, 0.5), legMat, { cast: true, receive: true });
    clamp.position.set(0, CANVAS_Y + CANVAS_H / 2 + 0.22, 0.16);

    easel.add(left, right, back, cross, ledge, clamp);

    // canvas assembly
    const board = new THREE.Group();
    board.position.y = CANVAS_Y;
    easel.add(board);
    this.board = board;

    const plate = mesh(GEO.box(CANVAS_W + 0.7, CANVAS_H + 0.7, BOARD_D), toyMat(0x8d6244), {
      cast: true,
      receive: false,
    });
    plate.position.z = -0.1;

    const frame = mesh(GEO.box(CANVAS_W + 0.16, CANVAS_H + 0.16, FRAME_D), matteMat(OUTLINE), {
      cast: false,
      receive: false,
    });
    frame.position.z = 0.07;

    const page = mesh(
      GEO.box(CANVAS_W, CANVAS_H, PAGE_D),
      matteMat(0xffffff, { emissive: 0xffffff, emissiveIntensity: PAPER_GLOW }),
      { cast: false, receive: false }
    );
    page.position.z = PAGE_Z;

    board.add(plate, frame, page);
  }

  private buildBench(): void {
    const stage = this.stage;
    if (!stage) return;

    const top = mesh(GEO.box(7.4, 0.3, 4.2), matteMat(0xd9a86c), { cast: true, receive: true });
    top.position.set(TABLE_X, 1.95, 2.4);
    const riser = mesh(GEO.box(7.0, 1.1, 1.9), matteMat(0xc9955f), { cast: true, receive: true });
    riser.position.set(TABLE_X, 2.65, 1.15);
    stage.scene.add(top, riser);

    for (const dx of [-3.3, 3.3]) {
      for (const dz of [-1.7, 1.7]) {
        const leg = mesh(GEO.box(0.3, 1.8, 0.3), matteMat(0xa9764a), { cast: true, receive: false });
        leg.position.set(TABLE_X + dx, 0.9, 2.4 + dz);
        stage.scene.add(leg);
      }
    }

    for (let i = 0; i < SWATCHES.length; i++) {
      const back = i < 6;
      this.pots.push(
        this.makePot(SWATCHES[i], POT_X0 + (i % 6) * POT_DX, back ? BACK_Y : FRONT_Y, back ? BACK_Z : FRONT_Z)
      );
    }

    this.buildBrushJar();
    this.buildHalo();
  }

  private makePot(color: number, x: number, y: number, z: number): Pot {
    const root = new THREE.Group();
    const body = mesh(GEO.cylinder(POT_R, POT_R - 0.04, 0.5, 18), toyMat(0xf2f5fa), { cast: true, receive: true });
    body.position.y = 0.25;
    const band = mesh(GEO.cylinder(POT_R + 0.01, POT_R + 0.01, 0.17, 18), toyMat(color), {
      cast: false,
      receive: false,
    });
    band.position.y = 0.16;
    const rim = mesh(GEO.torus(POT_R, 0.055), toyMat(0xd7dbe4), { cast: false, receive: false });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.5;
    const paint = mesh(GEO.cylinder(POT_R - 0.05, POT_R - 0.05, 0.07, 18), toyMat(color), {
      cast: false,
      receive: false,
    });
    paint.position.y = 0.5;
    root.add(body, band, rim, paint);
    root.position.set(x, y, z);
    root.scale.setScalar(0.72);
    this.stage?.scene.add(root);

    const pot: Pot = { color, root, base: new THREE.Vector3(x, y, z), lift: 0, phase: Math.random() * 6.28 };
    this.interact?.add(root, {
      kind: 'tap',
      onTap: () => this.tapPot(pot),
    });
    return pot;
  }

  private buildBrushJar(): void {
    const stage = this.stage;
    if (!stage) return;
    const jar = new THREE.Group();
    const cup = mesh(GEO.cylinder(0.42, 0.36, 0.8, 18), toyMat(0x4dd0e1), { cast: true, receive: true });
    cup.position.y = 0.4;
    const lip = mesh(GEO.torus(0.42, 0.05), toyMat(0xd7dbe4), { cast: false, receive: false });
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.8;
    jar.add(cup, lip);

    [
      { c: SWATCHES[0], rz: 0.16, rx: 0.1 },
      { c: SWATCHES[4], rz: -0.13, rx: -0.16 },
      { c: SWATCHES[6], rz: 0.05, rx: -0.06 },
    ].forEach((b) => {
      const g = new THREE.Group();
      const handle = mesh(GEO.cylinder(0.06, 0.06, 1.3, 10), toyMat(0x8d6244), { cast: true, receive: false });
      handle.position.y = 0.65;
      const ferrule = mesh(GEO.cylinder(0.075, 0.075, 0.2, 10), toyMat(0xd7dbe4), { cast: false, receive: false });
      ferrule.position.y = 1.32;
      const tip = mesh(GEO.cone(0.13, 0.44, 12), toyMat(b.c), { cast: false, receive: false });
      tip.position.y = 1.6;
      g.add(handle, ferrule, tip);
      g.rotation.set(b.rx, 0, b.rz);
      jar.add(g);
    });

    jar.position.set(3.8, FRONT_Y, 4.1);
    stage.scene.add(jar);
  }

  private buildHalo(): void {
    const halo = mesh(
      GEO.ring(POT_R + 0.12, POT_R + 0.26, 28),
      new THREE.MeshPhongMaterial({
        color: 0xfff3b0,
        emissive: 0xffd93d,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.92,
        shininess: 30,
        depthWrite: false,
      }),
      { cast: false, receive: false }
    );
    halo.rotation.x = -Math.PI / 2;
    halo.visible = false;
    this.stage?.scene.add(halo);
    this.halo = halo;
  }

  /* ---------------- picture meshes ---------------- */

  private buildPicture(): void {
    const pic = this.picture;
    const board = this.board;
    if (!pic || !board) return;

    for (let i = 0; i < pic.regions.length; i++) {
      const pts = pic.regions[i];
      const shape = new THREE.Shape();
      shape.moveTo((pts[0] - 320) * SCALE, (235 - pts[1]) * SCALE);
      for (let k = 2; k < pts.length; k += 2) {
        shape.lineTo((pts[k] - 320) * SCALE, (235 - pts[k + 1]) * SCALE);
      }
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: REGION_DEPTH,
        bevelEnabled: true,
        bevelThickness: REGION_BEVEL_T,
        bevelSize: REGION_BEVEL_S,
        bevelSegments: 1,
        curveSegments: 2,
      });
      geo.translate(0, 0, REGION_Z0 + i * REGION_STEP);

      const col = this.colors[i] ?? WHITE;
      const fill = new THREE.MeshPhongMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: FILL_GLOW,
        shininess: 26,
        specular: 0x2a2a2a,
      });
      const m = new THREE.Mesh(geo, [fill, matteMat(OUTLINE)]);
      m.castShadow = false;
      m.receiveShadow = false;
      m.userData.regionIndex = i;
      board.add(m);
      this.regionMeshes.push(m);
      this.regionMats.push(fill);
      this.wetGen.push(0);
      this.interact?.add(m, { kind: 'tap', onTap: (e) => this.tapRegion(e) });
    }
  }

  private clearPicture(): void {
    for (const m of this.regionMeshes) {
      this.interact?.remove(m);
      m.geometry.dispose();
      const fill = Array.isArray(m.material) ? m.material[0] : m.material;
      (fill as THREE.Material).dispose();
      m.removeFromParent();
    }
    this.regionMeshes = [];
    this.regionMats = [];
    this.wetGen = [];
  }

  private paintRegion(i: number): void {
    const mat = this.regionMats[i];
    if (!mat) return;
    const col = this.colors[i] ?? WHITE;
    mat.color.setHex(col);
    mat.emissive.setHex(col);
    mat.emissiveIntensity = FILL_GLOW + 0.6;
    const gen = (this.wetGen[i] ?? 0) + 1;
    this.wetGen[i] = gen;
    this.stage?.tween({
      dur: 480,
      onUpdate: (k) => {
        if (this.wetGen[i] !== gen) return;
        mat.emissiveIntensity = FILL_GLOW + 0.6 * (1 - k);
      },
      onComplete: () => {
        if (this.wetGen[i] === gen) mat.emissiveIntensity = FILL_GLOW;
      },
    });
  }

  private repaint(): void {
    for (let i = 0; i < this.regionMats.length; i++) {
      const mat = this.regionMats[i];
      const col = this.colors[i] ?? WHITE;
      mat.color.setHex(col);
      mat.emissive.setHex(col);
      mat.emissiveIntensity = FILL_GLOW;
      this.wetGen[i] = (this.wetGen[i] ?? 0) + 1;
    }
  }

  /* ---------------- menu ---------------- */

  private showMenu(): void {
    const box = this.add.container(0, 0).setDepth(10);
    this.menuBox = box;
    box.add(
      label(this, 640, 150, 'Pick a picture to color!', {
        size: 44,
        color: '#7a4a00',
        stroke: '#fffaf0',
        strokeThickness: 9,
      })
    );

    PICTURES.forEach((pic, i) => {
      const done = this.isPictureFull(pic.id);
      const b = button(this, {
        x: 250 + (i % 4) * 260,
        y: 320 + Math.floor(i / 4) * 200,
        w: 230,
        h: 170,
        icon: pic.icon,
        label: pic.name,
        sub: done ? '✅ colored' : 'not colored',
        layout: 'stack',
        color: pic.color,
        iconSize: 62,
        fontSize: 28,
        subSize: 17,
        depth: 10,
        onClick: () => this.startPicture(pic),
      });
      box.add(b);
      b.setScale(0);
      this.tweens.add({ targets: b, scale: 1, duration: 380, delay: i * 70, ease: 'Back.easeOut' });
    });

    box.add(
      label(this, 640, 660, 'Tap a color, then tap the picture!', {
        size: 24,
        color: '#8a5a44',
        stroke: '#fffaf0',
        strokeThickness: 7,
      })
    );
  }

  private isPictureFull(id: string): boolean {
    const saved = progress.data.art[id];
    return Array.isArray(saved) && saved.length > 0 && saved.every((c) => c !== WHITE);
  }

  /* ---------------- editor ---------------- */

  private startPicture(pic: PictureDef): void {
    audio.play('click');
    if (this.menuBox) {
      this.menuBox.list.forEach((c) => this.tweens.killTweensOf(c));
      this.menuBox.destroy(true);
    }
    this.menuBox = null;
    this.picture = pic;
    this.undoStack = [];
    this.celebrated = false;
    this.erase = false;
    this.selected = SWATCHES[0];
    this.taps = 0;

    const saved = progress.data.art[pic.id];
    this.colors =
      Array.isArray(saved) && saved.length === pic.regions.length ? [...saved] : pic.regions.map(() => WHITE);

    this.buildPicture();
    this.buildEditorUi();
    this.refreshSelection();
    this.refreshTools();
    this.refreshProgress();
    this.checkComplete(false);
  }

  private buildEditorUi(): void {
    const box = this.add.container(0, 0).setDepth(12);
    this.editBox = box;

    this.progressPill = new Pill(this, 330, 44, '🖌️ 0 / 0 colored', { color: 0xa78bfa, minW: 300, depth: 20 });
    box.add(this.progressPill);

    box.add(
      label(this, 640, 600, '🎨 Tap a paint pot, then tap the picture!', {
        size: 24,
        color: '#ffffff',
        stroke: '#33364f',
        strokeThickness: 7,
      })
    );

    const back = button(this, {
      x: 100, y: 664, w: 150, h: 76, label: '↩', color: 0xffa94d, fontSize: 34, depth: 6,
      onClick: () => this.backToMenu(),
    });
    const eraser = button(this, {
      x: 275, y: 664, w: 170, h: 76, icon: '🧽', label: 'ERASE', layout: 'stack', color: 0x4dd0e1,
      iconSize: 30, fontSize: 20, depth: 6,
      onClick: () => {
        this.erase = !this.erase;
        audio.play('click');
        this.refreshTools();
      },
    });
    const undo = button(this, {
      x: 465, y: 664, w: 170, h: 76, icon: '↩️', label: 'UNDO', layout: 'stack', color: 0xa78bfa,
      iconSize: 30, fontSize: 20, depth: 6,
      onClick: () => this.undo(),
    });
    const clear = button(this, {
      x: 655, y: 664, w: 170, h: 76, icon: '🗑️', label: 'CLEAR', layout: 'stack', color: 0xff6b6b,
      iconSize: 30, fontSize: 20, depth: 6,
      onClick: () => this.clearAll(),
    });
    const done = button(this, {
      x: 1010, y: 664, w: 340, h: 76, label: 'ALL DONE!', icon: '✅', color: 0x6bcb77, fontSize: 30,
      depth: 6,
      onClick: () => this.done(),
    });

    this.eraseBtn = eraser;
    this.doneBtn = done;
    box.add([back, eraser, undo, clear, done]);
  }

  private backToMenu(): void {
    audio.play('click');
    this.clearPicture();
    this.picture = null;
    this.colors = [];
    this.undoStack = [];
    this.erase = false;
    this.over = false;
    this.celebrated = false;
    this.taps = 0;
    this.editBox?.destroy(true);
    this.editBox = null;
    this.progressPill = null;
    this.eraseBtn = null;
    this.doneBtn = null;
    this.hud?.setScore(0);
    this.showMenu();
  }

  private refreshTools(): void {
    this.eraseBtn?.setColor(this.erase ? 0xffd93d : 0x4dd0e1);
    this.doneBtn?.setEnabled(this.colors.length > 0 && this.colors.some((c) => c !== WHITE));
  }

  private refreshProgress(): void {
    const done = this.colors.filter((c) => c !== WHITE).length;
    this.progressPill?.set(`🖌️ ${done} / ${this.colors.length} colored`);
    this.hud?.setScore(done * 25);
  }

  private refreshSelection(): void {
    this.selectedPot = this.pots.find((p) => p.color === this.selected) ?? null;
  }

  /* ---------------- interaction ---------------- */

  private tapPot(pot: Pot): void {
    if (this.over) return;
    this.selected = pot.color;
    this.erase = false;
    this.taps++;
    this.refreshSelection();
    this.refreshTools();
    audio.play('click');
    if (this.fx) {
      sparkleBurst(
        this.fx,
        { x: pot.base.x, y: pot.base.y + 0.6, z: pot.base.z },
        { count: 7, color: pot.color, speed: 1.9, life: 0.5, size: 0.26, gravity: -1.6 }
      );
    }
  }

  private tapRegion(e: InteractEvent): void {
    const pic = this.picture;
    if (!pic || this.over) return;
    const idx = e.object.userData.regionIndex as number | undefined;
    if (idx === undefined || idx < 0 || idx >= this.colors.length) return;

    this.taps++;
    const next = this.erase ? WHITE : this.selected;
    if (this.colors[idx] === next) {
      audio.play('click');
      return;
    }

    const wasBlank = this.colors[idx] === WHITE;
    this.undoStack.push({ i: idx, prev: this.colors[idx] });
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.colors[idx] = next;
    this.paintRegion(idx);
    this.refreshProgress();
    this.save();
    audio.play(this.erase ? 'erase' : 'pop');

    if (this.fx) {
      sparkleBurst(
        this.fx,
        e.world,
        this.erase
          ? { count: 7, color: 0xd7dbe4, speed: 2.2, life: 0.5, size: 0.3, gravity: -2.5 }
          : { count: 11, color: this.selected, speed: 2.8, life: 0.6, size: 0.34, gravity: -2.2 }
      );
    }
    if (wasBlank && !this.erase) {
      const s = this.stage?.project(e.world.x, e.world.y, e.world.z);
      if (s) floatText(this, s.x, s.y, '+25', { color: '#ffd93d', size: 32 });
    }
    this.checkComplete(true);
  }

  private undo(): void {
    if (this.over) return;
    const last = this.undoStack.pop();
    if (!last) {
      audio.play('wrong');
      toast(this, 'Nothing to undo', { icon: '↩️', color: 0xa78bfa, duration: 900 });
      return;
    }
    audio.play('click');
    this.colors[last.i] = last.prev;
    this.repaint();
    this.refreshProgress();
    this.refreshTools();
    this.save();
  }

  private clearAll(): void {
    if (this.over) return;
    this.colors.forEach((c, i) => {
      if (c !== WHITE) this.undoStack.push({ i, prev: c });
    });
    this.colors = this.colors.map(() => WHITE);
    audio.play('erase');
    this.repaint();
    this.refreshProgress();
    this.refreshTools();
    this.save();
    toast(this, 'Picture cleared', { icon: '🗑️', color: 0xff6b6b, duration: 900 });
  }

  private save(): void {
    if (!this.picture) return;
    progress.data.art[this.picture.id] = [...this.colors];
    progress.flush();
  }

  private checkComplete(celebrate: boolean): void {
    if (!this.picture) return;
    const full = this.colors.every((c) => c !== WHITE);
    // A picture that is ALREADY complete when opened must count as celebrated,
    // otherwise re-colouring one region farms the +10 star reward every visit.
    if (full && !celebrate) {
      this.celebrated = true;
    }
    if (full && celebrate && !this.celebrated) {
      this.celebrated = true;
      progress.track('pictures_done', 1);
      progress.addStars(10);
      audio.play('reward');
      confetti(this, 2400);
      sparkles(this, 640, 360, 0xffd93d, 24);
      toast(this, '🎨 Beautiful! ⭐ +10', { color: 0x2f9e44, duration: 2400 });
      this.celebrate3D();
    }
    this.doneBtn?.setEnabled(this.colors.some((c) => c !== WHITE));
    if (full) this.doneBtn?.pulse();
  }

  private celebrate3D(): void {
    if (!this.fx || !this.board) return;
    this.board.updateMatrixWorld(true);
    const spots: [number, number][] = [
      [-3, 2], [0, 0.5], [3, 2.4], [-2, -2.4], [2.4, -1.8], [0, 3.2],
    ];
    spots.forEach((s, i) => {
      const p = this.canvasToWorld(320 + s[0] * 40, 235 - s[1] * 40, REGION_Z0 + 0.2);
      this.stage?.delay(i * 90, () => {
        if (this.fx) sparkleBurst(this.fx, p, { count: 14, speed: 4.2, life: 1, size: 0.45 });
      });
    });
  }

  private done(): void {
    if (!this.picture || this.over) return;
    this.over = true;
    const pic = this.picture;
    const total = this.colors.length;
    const done = this.colors.filter((c) => c !== WHITE).length;
    const ratio = total > 0 ? done / total : 0;
    const full = ratio >= 1;
    audio.play(full ? 'success' : 'click');
    if (full) {
      confetti(this, 1800);
      this.rig?.shake(0.25, 0.3);
    }
    const stars = full ? 3 : ratio >= 0.6 ? 2 : 1;
    this.time.delayedCall(full ? 800 : 200, () => {
      // BACK can return to the menu while this timer is pending - never
      // dereference the (possibly destroyed) picture in that case.
      if (!this.scene.isActive() || !pic) return;
      this.finish({
        score: Math.round(done * 25 + (full ? 250 : 0)),
        stars,
        win: full,
        subtitle: `${pic.icon} ${pic.name}`,
        lines: [{ icon: '🖌️', label: 'Colored', value: `${done}/${total}` }],
      });
    });
  }

  /* ---------------- frame ---------------- */

  protected override on3DUpdate(dt: number, t: number): void {
    if (this.easel) {
      this.easel.rotation.y = CANVAS_YAW + Math.sin(t * 0.00055) * 0.012;
    }

    for (const p of this.pots) {
      const target = p === this.selectedPot && this.gameplayReady && !this.over ? 0.34 : 0;
      p.lift += (target - p.lift) * Math.min(1, dt * 8);
      p.root.position.y = p.base.y + p.lift + Math.sin(t * 0.0016 + p.phase) * 0.02;
      p.root.rotation.y = Math.sin(t * 0.0011 + p.phase) * 0.18;
    }

    const halo = this.halo;
    const pot = this.selectedPot;
    if (halo) {
      if (pot) {
        halo.visible = true;
        halo.position.set(pot.base.x, pot.base.y + 0.035, pot.base.z);
        const s = 1 + Math.sin(t * 0.006) * 0.09;
        halo.scale.set(s, s, 1);
        halo.rotation.z = t * 0.0009;
      } else {
        halo.visible = false;
      }
    }

    if (this.gameplayReady && !this.over) {
      this.sparkleAcc += dt;
      if (this.sparkleAcc > 2.6 && this.fx && this.regionMeshes.length > 0) {
        this.sparkleAcc = 0;
        const i = Math.floor(Math.random() * this.regionMeshes.length);
        const p = this.canvasToWorld(320 + (Math.random() - 0.5) * 420, 235 + (Math.random() - 0.5) * 300, REGION_Z0 + i * REGION_STEP + 0.14);
        sparkleBurst(this.fx, p, { count: 3, speed: 1.1, life: 1.1, size: 0.22, gravity: -0.4 });
      }
    }
  }

  protected override onGameplayStart(): void {
    if (!this.gameplayReady) return;
    this.pots.forEach((p, i) => {
      this.stage?.delay(i * 40, () => {
        this.stage?.tween({
          dur: 340,
          ease: (k) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2),
          onUpdate: (k) => p.root.scale.setScalar(0.72 + 0.28 * Math.max(0, k)),
          onComplete: () => p.root.scale.setScalar(1),
        });
      });
    });
    this.refreshSelection();
  }

  /* ---------------- e2e bridge ---------------- */

  private testState(): Record<string, unknown> {
    const done = this.colors.filter((c) => c !== WHITE).length;
    return {
      phase: this.picture ? 'edit' : 'menu',
      ready: this.gameplayReady,
      over: this.over,
      picture: this.picture ? this.picture.id : null,
      pictureName: this.picture ? this.picture.name : null,
      icon: this.picture ? this.picture.icon : null,
      colored: done,
      total: this.colors.length,
      progress: `${done}/${this.colors.length}`,
      finished: this.colors.length > 0 && done === this.colors.length,
      celebrated: this.celebrated,
      score: done * 25,
      selected: this.selected,
      erase: this.erase,
      undo: this.undoStack.length,
      taps: this.taps,
      colors: [...this.colors],
    };
  }

  private probePoint(): ProbePoint | null {
    if (this.over || !this.stage) return null;
    if (!this.picture) {
      const first = PICTURES[0];
      return { x: 250, y: 320, label: `picture-${first.id}` };
    }
    const region = this.probeRegion();
    if (region) return region;

    const pot = this.pots.find((p) => p.color !== this.selected) ?? this.selectedPot ?? this.pots[0];
    if (!pot) return null;
    const s = this.stage.project(pot.base.x, pot.base.y + 0.45, pot.base.z);
    return s ? { x: Math.round(s.x), y: Math.round(s.y), label: 'pot' } : null;
  }

  private probeRegion(): ProbePoint | null {
    const pic = this.picture;
    const stage = this.stage;
    if (!pic || !stage || !this.board) return null;

    const next = this.erase ? WHITE : this.selected;
    const order: number[] = [];
    if (this.erase) {
      for (let i = 0; i < pic.regions.length; i++) if (this.colors[i] !== WHITE) order.push(i);
    } else {
      for (let i = 0; i < pic.regions.length; i++) if (this.colors[i] === WHITE) order.push(i);
      for (let i = 0; i < pic.regions.length; i++) {
        if (this.colors[i] !== WHITE && this.colors[i] !== next) order.push(i);
      }
    }

    for (const i of order) {
      const hit = this.regionProbe(pic, i);
      if (hit) return hit;
    }
    return null;
  }

  private regionProbe(pic: PictureDef, i: number): ProbePoint | null {
    const stage = this.stage;
    const pts = pic.regions[i];
    if (!stage) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < pts.length; k += 2) {
      minX = Math.min(minX, pts[k]);
      maxX = Math.max(maxX, pts[k]);
      minY = Math.min(minY, pts[k + 1]);
      maxY = Math.max(maxY, pts[k + 1]);
    }
    const stepX = Math.max(6, (maxX - minX) / 7);
    const stepY = Math.max(6, (maxY - minY) / 7);

    for (let x = minX + stepX * 0.5; x <= maxX; x += stepX) {
      for (let y = minY + stepY * 0.5; y <= maxY; y += stepY) {
        if (signedDepth(pts, x, y) < 5) continue;
        let clear = true;
        for (let j = i + 1; j < pic.regions.length; j++) {
          if (signedDepth(pic.regions[j], x, y) > -5) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        const w = this.canvasToWorld(x, y, REGION_Z0 + i * REGION_STEP + REGION_DEPTH + REGION_BEVEL_T);
        const s = stage.project(w.x, w.y, w.z);
        if (!s) continue;
        if (s.x < 45 || s.x > 1235 || s.y < 95 || s.y > 605) continue;
        return { x: Math.round(s.x), y: Math.round(s.y), label: `region-${i}` };
      }
    }
    return null;
  }

  private canvasToWorld(u: number, v: number, z: number): THREE.Vector3 {
    const vec = new THREE.Vector3((u - 320) * SCALE, (235 - v) * SCALE, z);
    const board = this.board;
    if (!board) return vec;
    this.easel?.updateMatrixWorld(true);
    return board.localToWorld(vec);
  }
}

function pointInPoly(pts: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Signed distance to the polygon border: positive inside, negative outside. */
function signedDepth(pts: number[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const x1 = pts[j];
    const y1 = pts[j + 1];
    const x2 = pts[i];
    const y2 = pts[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    let k = len > 0 ? ((x - x1) * dx + (y - y1) * dy) / len : 0;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    const ex = x1 + k * dx - x;
    const ey = y1 + k * dy - y;
    d = Math.min(d, Math.hypot(ex, ey));
  }
  return pointInPoly(pts, x, y) ? d : -d;
}
