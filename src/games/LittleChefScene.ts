import Phaser from 'phaser';
import * as THREE from 'three';
import { EMOJI_FONT } from '../config';
import { audio } from '../core/AudioManager';
import { burst, confetti, floatText } from '../core/FX';
import { progress } from '../core/Progress';
import { button, emojiText, label, Meter, Pill, type Btn } from '../core/UI';
import { createFood, type FoodKind } from '../3d/assets/food';
import { ThreeGameScene, type ProbePoint } from '../3d/base/ThreeGameScene';
import { createCharacter, type CharacterHandle } from '../3d/characters';
import type { Interactable } from '../3d/interaction';
import { GEO, glassMat, glowMat, group, matteMat, mesh, toyMat } from '../3d/materials';
import { confettiBurst, dustBurst, sparkleBurst } from '../3d/particles';

interface Recipe {
  id: string;
  name: string;
  icon: string;
  color: number;
  items: string[];
  decoys: string[];
  verb: string;
  dish: string;
  dishFood: FoodKind;
}

const RECIPES: Recipe[] = [
  {
    id: 'pizza', name: 'Pizza', icon: '🍕', color: 0xff6b6b,
    items: ['🍅', '🧀', '🫑', '🍄'], decoys: ['🍬', '🪨'], verb: 'BAKE', dish: '🍕', dishFood: 'pizza',
  },
  {
    id: 'cake', name: 'Cake', icon: '🎂', color: 0xff8fab,
    items: ['🥚', '🍓', '🍫', '🍦'], decoys: ['🧄', '🫒'], verb: 'MIX', dish: '🎂', dishFood: 'cake',
  },
  {
    id: 'burger', name: 'Burger', icon: '🍔', color: 0xffa94d,
    items: ['🍞', '🥬', '🧀', '🍅'], decoys: ['🪵', '🎈'], verb: 'GRILL', dish: '🍔', dishFood: 'burger',
  },
  {
    id: 'salad', name: 'Fruit Bowl', icon: '🥗', color: 0x6bcb77,
    items: ['🍎', '🍌', '🍇', '🥝'], decoys: ['🧅', '🌶️'], verb: 'TOSS', dish: '🥗', dishFood: 'grapes',
  },
];

type Phase = 'menu' | 'pick' | 'cook' | 'decorate';
type Zone = 'board' | 'pan' | 'plate' | 'counter';

/* ---------------- world layout ---------------- */

const CAM_POS: [number, number, number] = [0, 9, 13];
const CAM_LOOK: [number, number, number] = [0, 2.6, -1.6];
const CAM_FOV = 45;
const CAM_FROM: [number, number, number] = [7, 15, 22];

const COUNTER_Y = 1.75;
const COUNTER_W = 18.7;
const COUNTER_X = -3.15;
const COUNTER_D = 4.8;
const COUNTER_Z = -1;

const TRAY_Y = 2.12;
const TRAY_Z = 0.6;
const TRAY_X = [-5.8, -3.48, -1.16, 1.16, 3.48, 5.8];

const BOARD_X = 0;
const BOARD_Z = -1.9;
const BOARD_TOP = 1.92;
const BOARD_R = 2.4;

const POT_X = -5.6;
const POT_Z = -1.5;
const PAN_TOP = 2.36;

const PLATE_X = 4;
const PLATE_Z = -1.9;
const PLATE_TOP = 1.87;

const CHEF_X = -5;
const CHEF_Y = 1;
const CHEF_Z = -4.05;
const CUST_X = 7.8;
const CUST_Z = -1.2;

const RING_R = 1.6;

/** emoji -> toy food model used for the floating badges. */
const EMOJI_FOOD: Record<string, FoodKind> = {
  '🍅': 'tomato', '🧀': 'pancake', '🫑': 'broccoli', '🍄': 'cookie',
  '🥚': 'milk', '🍓': 'strawberry', '🍫': 'donut', '🍦': 'icecream',
  '🍞': 'sandwich', '🥬': 'corn', '🍎': 'apple', '🍌': 'banana',
  '🍇': 'grapes', '🥝': 'orange', '🍬': 'candy', '🪨': 'icecube',
  '🧄': 'lemon', '🫒': 'cherry', '🪵': 'hotdog', '🎈': 'lollipop',
  '🧅': 'juice', '🌶️': 'carrot',
};

interface Ingredient {
  id: string;
  icon: string;
  root: THREE.Group;
  badge: THREE.Mesh;
  home: THREE.Vector3;
  done: boolean;
  handle: Interactable;
}

interface DishRec {
  root: THREE.Group;
  badge: THREE.Mesh;
  half: number;
  home: THREE.Vector3;
}

/* ---------------- emoji badges (canvas -> THREE, cached forever) ---------------- */

const badgeMats = new Map<string, THREE.MeshPhongMaterial>();

function badgeMaterial(emoji: string): THREE.MeshPhongMaterial {
  const hit = badgeMats.get(emoji);
  if (hit) return hit;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#fffdf4';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#ffd93d';
    ctx.stroke();
    let fs = Math.round(S * 0.5);
    ctx.font = `${fs}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let guard = 0;
    while (ctx.measureText(emoji).width > S * 0.7 && fs > 12 && guard < 30) {
      fs -= 3;
      ctx.font = `${fs}px ${EMOJI_FONT}`;
      guard++;
    }
    ctx.fillText(emoji, S / 2, S / 2 + fs * 0.05);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshPhongMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.4,
    shininess: 60,
    specular: 0x333333,
  });
  mat.userData.shared = true;
  badgeMats.set(emoji, mat);
  return mat;
}

/**
 * Little Chef - choose a recipe, drag the ingredients in, cook and decorate.
 *
 * The whole kitchen (counter, stove, chopping board, serving plate, chef and
 * hungry guest) is real 3D: ingredients are picked up with raycast drags on a
 * world plane and dropped on real world targets.
 */
export class LittleChefScene extends ThreeGameScene {
  private phase: Phase = 'menu';
  private recipe: Recipe = RECIPES[0];
  private placed: string[] = [];
  private mistakes = 0;
  private cookValue = 0;
  private decorTaps = 0;
  private startedAt = 0;
  private elapsed = 0;
  private lastSec = -1;
  private score = 0;
  private over = false;
  private held: string | null = null;
  private heldPos: { x: number; y: number; z: number } | null = null;

  private room = new THREE.Group();
  private tray: Ingredient[] = [];
  private dishCache = new Map<string, DishRec>();
  private chef: CharacterHandle | null = null;
  private customer: CharacterHandle | null = null;
  private panGroup: THREE.Group | null = null;
  private steam: { stop: () => void } | null = null;
  private ringTrack: THREE.Mesh | null = null;
  private ringArc: THREE.Mesh | null = null;
  private ringPct = -1;

  private ui: Phaser.GameObjects.Container | null = null;
  private orderPill: Pill | null = null;
  private meter: Meter | null = null;
  private placedIcons: Phaser.GameObjects.Text | null = null;
  private decorCounter: Phaser.GameObjects.Text | null = null;
  private serveBtn: Btn | null = null;

  constructor() {
    super('LittleChef');
  }

  create(): void {
    this.phase = 'menu';
    this.recipe = RECIPES[0];
    this.placed = [];
    this.mistakes = 0;
    this.cookValue = 0;
    this.decorTaps = 0;
    this.startedAt = this.time.now;
    this.elapsed = 0;
    this.lastSec = -1;
    this.score = 0;
    this.over = false;
    this.held = null;
    this.heldPos = null;
    this.room = new THREE.Group();
    this.tray = [];
    this.dishCache = new Map();
    this.chef = null;
    this.customer = null;
    this.panGroup = null;
    this.steam = null;
    this.ringTrack = null;
    this.ringArc = null;
    this.ringPct = -1;
    this.ui = null;
    this.orderPill = null;
    this.meter = null;
    this.placedIcons = null;
    this.decorCounter = null;
    this.serveBtn = null;

    const ok = this.setup3D({
      lighting: 'indoor',
      camera: { pos: CAM_POS, look: CAM_LOOK, fov: CAM_FOV },
      introDur: 700,
      introFrom: CAM_FROM,
      hud: { score: 0, timer: 0, timerUp: true, center: '👨‍🍳 LITTLE CHEF' },
    });
    if (!ok) {
      this.exposeTest({
        state: () => ({ ready: false, over: false, error: 'webgl' }),
        probe: () => null,
      });
      return;
    }

    this.orderPill = new Pill(this, 640, 96, '👨‍🍳 CHOOSE A DISH', {
      color: 0xffa94d,
      minW: 300,
      depth: 21,
    });
    this.buildPhase();

    this.input.on('pointerdown', () => audio.resumeAfterGesture());

    this.exposeTest({
      state: () => this.testState(),
      probe: () => this.probe(),
    });
  }

  /* ---------------- 3D world ---------------- */

  protected build3D(): void {
    const stage = this.stage!;
    stage.scene.add(this.room);

    // floor
    const floor = mesh(GEO.box(46, 0.6, 36), matteMat(0xf2e2c8), { cast: false, receive: true });
    floor.position.set(0, -0.3, 4);
    this.room.add(floor);
    for (let i = -10; i <= 10; i++) {
      const strip = mesh(GEO.box(0.1, 0.04, 36), matteMat(0xe4d2b4), { cast: false, receive: true });
      strip.position.set(i * 2.2, 0.02, 4);
      this.room.add(strip);
    }

    // back wall + tiled splash back
    const wall = mesh(GEO.box(40, 20, 0.5), matteMat(0xfff1d6), { cast: false, receive: true });
    wall.position.set(0, 10, -4.9);
    const splash = mesh(GEO.box(40, 3.6, 0.16), toyMat(0xbfe4f5), { cast: false, receive: true });
    splash.position.set(0, 3.6, -4.6);
    this.room.add(wall, splash);
    for (let i = -8; i <= 8; i++) {
      const seam = mesh(GEO.box(0.07, 3.6, 0.06), matteMat(0x9fd0e8), { cast: false });
      seam.position.set(i * 2.4, 3.6, -4.45);
      this.room.add(seam);
    }

    // window
    const winFrame = mesh(GEO.roundedBox(5.4, 3.6, 0.3, 0.16), matteMat(0xffffff));
    winFrame.position.set(-7, 7.2, -4.6);
    const winPane = mesh(GEO.roundedBox(4.8, 3, 0.2, 0.12), glassMat(0x9be2ff, 0.85), { cast: false });
    winPane.position.set(-7, 7.2, -4.52);
    const mullionV = mesh(GEO.box(0.16, 3, 0.24), matteMat(0xffffff), { cast: false });
    mullionV.position.set(-7, 7.2, -4.46);
    const mullionH = mesh(GEO.box(4.8, 0.16, 0.24), matteMat(0xffffff), { cast: false });
    mullionH.position.set(-7, 7.2, -4.46);
    this.room.add(winFrame, winPane, mullionV, mullionH);

    // counter
    const body = mesh(GEO.box(COUNTER_W, 1.5, COUNTER_D), matteMat(0xd98f4e), { receive: true });
    body.position.set(COUNTER_X, 0.75, COUNTER_Z);
    const top = mesh(GEO.box(COUNTER_W + 0.5, 0.25, COUNTER_D + 0.5), matteMat(0xb87333), { receive: true });
    top.position.set(COUNTER_X, 1.625, COUNTER_Z);
    this.room.add(body, top);
    for (let i = 0; i < 4; i++) {
      const dx = -10.4 + i * 4.2;
      const drawer = mesh(GEO.roundedBox(3.6, 0.95, 0.16, 0.07), matteMat(0xc97f42), { cast: false });
      drawer.position.set(dx, 0.8, COUNTER_Z + COUNTER_D / 2 + 0.07);
      const knob = mesh(GEO.roundedBox(1, 0.14, 0.14, 0.06), toyMat(0xf6e0b0), { cast: false });
      knob.position.set(dx, 1.15, COUNTER_Z + COUNTER_D / 2 + 0.18);
      this.room.add(drawer, knob);
    }

    // stove + frying pan (tap target while cooking)
    const stove = mesh(GEO.roundedBox(4.6, 0.16, 3.6, 0.08), toyMat(0x33364f), { receive: true });
    stove.position.set(POT_X, COUNTER_Y + 0.08, -1.6);
    const burner = mesh(GEO.torus(1.15, 0.07), matteMat(0x1f2340), { cast: false });
    burner.rotation.x = -Math.PI / 2;
    burner.position.set(POT_X, COUNTER_Y + 0.17, POT_Z);
    this.room.add(stove, burner);

    const panBody = mesh(GEO.cylinder(1.25, 1.15, 0.4, 26), matteMat(0x4b5563));
    panBody.position.y = 2.11;
    const panFace = mesh(GEO.cylinder(1.12, 1.12, 0.05, 26), toyMat(0x6b7280));
    panFace.position.y = 2.335;
    const panRim = mesh(GEO.torus(1.25, 0.08), toyMat(0x9aa3b2));
    panRim.rotation.x = -Math.PI / 2;
    panRim.position.y = 2.31;
    const panHandle = mesh(GEO.roundedBox(1.8, 0.22, 0.3, 0.1), matteMat(0x8a5a2b));
    panHandle.position.set(2.05, 2.16, 0);
    const pan = group(panBody, panFace, panRim, panHandle);
    pan.position.set(POT_X, 0, POT_Z);
    this.room.add(pan);
    this.panGroup = pan;
    this.interact!.add(pan, { kind: 'tap', onTap: () => this.doCook() });

    // chopping board (where ingredients land)
    const board = mesh(GEO.roundedBox(3.4, 0.16, 2.3, 0.1), matteMat(0xe0b070), { receive: true });
    board.position.set(BOARD_X, COUNTER_Y + 0.08, BOARD_Z);
    const groove = mesh(GEO.roundedBox(3, 0.05, 1.9, 0.06), matteMat(0xcf9c58), { cast: false });
    groove.position.set(BOARD_X, COUNTER_Y + 0.15, BOARD_Z);
    this.room.add(board, groove);

    // serving plate
    const plateDisc = mesh(GEO.cylinder(1.3, 1.05, 0.12, 30), toyMat(0xffffff), { receive: true });
    plateDisc.position.set(PLATE_X, COUNTER_Y + 0.06, PLATE_Z);
    const plateRim = mesh(GEO.torus(1.24, 0.09), matteMat(0xd7dbe4));
    plateRim.rotation.x = -Math.PI / 2;
    plateRim.position.set(PLATE_X, COUNTER_Y + 0.12, PLATE_Z);
    this.room.add(plateDisc, plateRim);

    // shelf + jars
    const shelf = mesh(GEO.box(13, 0.22, 0.8), matteMat(0xb87333), { receive: true });
    shelf.position.set(-0.5, 3.9, -4.35);
    this.room.add(shelf);
    const jarColors = [0xff8fab, 0x4dd0e1, 0xffd93d, 0x6bcb77, 0xa78bfa];
    for (let i = 0; i < 5; i++) {
      const jx = -5.5 + i * 2.5;
      const jarBody = mesh(GEO.cylinder(0.4, 0.44, 0.9, 16), toyMat(jarColors[i]));
      jarBody.position.set(jx, 4.46, -4.35);
      const jarLid = mesh(GEO.cylinder(0.42, 0.42, 0.16, 16), matteMat(0xf6e0b0));
      jarLid.position.set(jx, 4.99, -4.35);
      this.room.add(jarBody, jarLid);
    }

    // fridge (right-hand side, behind the guest)
    const fridge = mesh(GEO.roundedBox(3.2, 6, 2.4, 0.3), matteMat(0xeef3f8), { receive: true });
    fridge.position.set(9.6, 3, -3);
    const fridgeLine = mesh(GEO.box(2.9, 0.1, 0.06), matteMat(0xc9d4de), { cast: false });
    fridgeLine.position.set(9.6, 3.3, -1.77);
    const fridgeHandle = mesh(GEO.roundedBox(0.18, 1.3, 0.18, 0.08), toyMat(0x9aa3b2));
    fridgeHandle.position.set(8.3, 4, -1.68);
    const magnetA = mesh(GEO.roundedBox(0.42, 0.42, 0.08, 0.08), toyMat(0xff6b6b), { cast: false });
    magnetA.position.set(9.1, 4.7, -1.76);
    const magnetB = mesh(GEO.roundedBox(0.36, 0.36, 0.08, 0.08), toyMat(0x4aa3ff), { cast: false });
    magnetB.position.set(10.3, 2.5, -1.76);
    this.room.add(fridge, fridgeLine, fridgeHandle, magnetA, magnetB);

    // cook progress ring around the stove
    const ringTrack = mesh(GEO.torus(RING_R, 0.07), glowMat(0xffa94d, 0.5), { cast: false, receive: false });
    ringTrack.rotation.x = -Math.PI / 2;
    ringTrack.position.set(POT_X, 1.93, POT_Z);
    ringTrack.visible = false;
    this.room.add(ringTrack);
    this.ringTrack = ringTrack;
    const ringArc = mesh(
      new THREE.RingGeometry(1.34, 1.52, 56, 1, -Math.PI / 2, 0.02),
      glowMat(0xffd93d, 0.9),
      { cast: false, receive: false }
    );
    ringArc.rotation.x = -Math.PI / 2;
    ringArc.position.set(POT_X, 1.945, POT_Z);
    ringArc.visible = false;
    this.room.add(ringArc);
    this.ringArc = ringArc;

    // hungry guest by the fridge
    this.customer = createCharacter('child', { scale: 1 });
    this.customer.root.position.set(CUST_X, 0, CUST_Z);
    this.customer.root.rotation.y = -Math.PI / 2;
    this.room.add(this.customer.root);
    this.customer.play('idle');
    this.interact!.add(this.customer.root, {
      kind: 'tap',
      onTap: () => {
        this.customer?.play('wave');
        audio.play('chime');
      },
    });

    // the chef stands behind the counter (his legs stay hidden by it)
    this.chef = createCharacter('chef', { scale: 1.05 });
    this.chef.root.position.set(CHEF_X, CHEF_Y, CHEF_Z);
    this.room.add(this.chef.root);
    this.chef.play('idle');
    this.interact!.add(this.chef.root, {
      kind: 'tap',
      onTap: () => {
        this.chef?.play('happy');
        audio.play('chime');
      },
    });

    this.buildTray();
  }

  protected override onGameplayStart(): void {
    this.chef?.play('wave');
  }

  protected override on3DUpdate(dt: number, t: number): void {
    this.chef?.update(dt);
    this.customer?.update(dt);

    const cam = this.stage?.camera;
    if (cam) {
      for (const ing of this.tray) ing.badge.quaternion.copy(cam.quaternion);
      const d = this.dishRec();
      if (d) d.badge.quaternion.copy(cam.quaternion);
    }

    const dish = this.dishRec();
    if (this.phase === 'cook' && dish?.root.visible) {
      dish.root.position.y = dish.home.y + Math.sin(t / 420) * 0.06;
    }

    if (!this.gameplayReady || this.over) return;

    const sec = Math.floor((this.time.now - this.startedAt) / 1000);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.elapsed = sec;
      this.hud?.setTimer(sec);
      this.refreshScore();
    }
  }

  /* ---------------- phase UI ---------------- */

  private clearUi(): void {
    this.ui?.destroy(true);
    this.ui = null;
    this.meter = null;
    this.placedIcons = null;
    this.decorCounter = null;
    this.serveBtn = null;
  }

  private buildPhase(): void {
    this.clearUi();
    const c = this.add.container(0, 0).setDepth(20);
    this.ui = c;

    if (this.phase === 'menu') this.buildMenu(c);
    else if (this.phase === 'pick') this.buildPick(c);
    else if (this.phase === 'cook') this.buildCook(c);
    else this.buildDecorate(c);

    this.updateOrder();
    this.syncInteractive();
  }

  private updateOrder(): void {
    const r = this.recipe;
    if (this.phase === 'menu') {
      this.orderPill?.set('👨‍🍳 CHOOSE A DISH', 0xffa94d);
      return;
    }
    if (this.phase === 'pick') {
      this.orderPill?.set(`${r.icon} ${r.name} · ${this.placed.length}/${r.items.length}`, r.color);
      return;
    }
    this.orderPill?.set(`${r.icon} ${r.name}`, r.color);
  }

  private buildMenu(c: Phaser.GameObjects.Container): void {
    c.add(
      label(this, 640, 150, '🍕 What shall we cook?', {
        size: 44,
        color: '#7a4a00',
        stroke: '#fff8e8',
        strokeThickness: 6,
      })
    );
    RECIPES.forEach((r, i) => {
      const b = button(this, {
        x: 300 + i * 230,
        y: 280,
        w: 200,
        h: 170,
        icon: r.icon,
        label: r.name,
        layout: 'stack',
        color: r.color,
        iconSize: 62,
        fontSize: 26,
        depth: 21,
        onClick: () => this.selectRecipe(r),
      });
      b.setScale(0);
      this.tweens.add({ targets: b, scale: 1, duration: 400, delay: i * 90, ease: 'Back.easeOut' });
      c.add(b);
    });
    c.add(
      label(this, 640, 620, 'Tap a recipe — or drag an ingredient to start cooking!', {
        size: 26,
        color: '#8a5a44',
        stroke: '#fff8e8',
        strokeThickness: 5,
        depth: 21,
      })
    );
  }

  private buildPick(c: Phaser.GameObjects.Container): void {
    const r = this.recipe;
    c.add(
      label(this, 640, 152, `${r.icon} Add the ingredients!`, {
        size: 42,
        color: '#7a4a00',
        stroke: '#fff8e8',
        strokeThickness: 6,
      })
    );

    const target = this.stage?.project(BOARD_X, BOARD_TOP + 0.95, BOARD_Z);
    if (target) c.add(emojiText(this, target.x, target.y, '🎯', 42).setDepth(21));

    this.placedIcons = label(this, 640, 545, this.placed.join(' '), {
      size: 54,
      color: '#7a4a00',
      stroke: '#fff8e8',
      strokeThickness: 6,
      depth: 21,
    });
    c.add(this.placedIcons);

    c.add(
      label(this, 640, 648, 'Drag the ingredients onto the chopping board!', {
        size: 26,
        color: '#8a5a44',
        stroke: '#fff8e8',
        strokeThickness: 5,
        depth: 21,
      })
    );

    const back = button(this, {
      x: 1170,
      y: 120,
      w: 130,
      h: 70,
      label: '↩',
      color: 0xff6b6b,
      fontSize: 34,
      depth: 22,
      onClick: () => this.backToMenu(),
    });
    c.add(back);
  }

  private buildCook(c: Phaser.GameObjects.Container): void {
    const r = this.recipe;
    c.add(
      label(this, 640, 152, `${r.verb} it!`, {
        size: 46,
        color: '#7a4a00',
        stroke: '#fff8e8',
        strokeThickness: 6,
      })
    );

    this.meter = new Meter(this, {
      x: 640,
      y: 500,
      w: 520,
      h: 44,
      value: this.cookValue,
      max: 100,
      color: 0xffa94d,
      icon: '🔥',
      depth: 21,
    });
    c.add(this.meter);
    c.add(
      label(this, 640, 560, 'Tap fast to cook!', {
        size: 26,
        color: '#8a5a44',
        stroke: '#fff8e8',
        strokeThickness: 5,
      })
    );

    const cook = button(this, {
      x: 640,
      y: 650,
      w: 340,
      h: 90,
      label: r.verb,
      icon: '🔥',
      color: 0xff6b6b,
      fontSize: 34,
      depth: 22,
      onClick: () => this.doCook(),
    });
    c.add(cook);
  }

  private buildDecorate(c: Phaser.GameObjects.Container): void {
    c.add(
      label(this, 640, 152, '✨ Decorate it!', {
        size: 46,
        color: '#7a4a00',
        stroke: '#fff8e8',
        strokeThickness: 6,
      })
    );

    this.decorCounter = label(this, 640, 545, `Taps: ${this.decorTaps} / 3`, {
      size: 30,
      color: '#7a4a00',
      stroke: '#fff8e8',
      strokeThickness: 5,
      depth: 21,
    });
    c.add(this.decorCounter);

    const serve = button(this, {
      x: 640,
      y: 650,
      w: 360,
      h: 90,
      label: 'SERVE!',
      icon: '🍽️',
      color: 0x6bcb77,
      fontSize: 36,
      depth: 22,
      onClick: () => this.serve(),
    });
    serve.setEnabled(this.decorTaps >= 3);
    c.add(serve);
    this.serveBtn = serve;
  }

  private syncInteractive(): void {
    const it = this.interact;
    if (!it) return;
    const picking = this.phase === 'menu' || this.phase === 'pick';
    const serving = this.phase === 'cook' || this.phase === 'decorate';
    const active = this.dishRec();
    for (const ing of this.tray) ing.handle.enabled = !this.over && !ing.done && picking;
    if (this.panGroup) it.setEnabled(this.panGroup, !this.over && this.phase === 'cook');
    for (const d of this.dishCache.values()) {
      it.setEnabled(d.root, !this.over && serving && d === active);
    }
    if (this.chef) it.setEnabled(this.chef.root, !this.over);
    if (this.customer) it.setEnabled(this.customer.root, !this.over);
  }

  /* ---------------- recipes / phases ---------------- */

  private selectRecipe(r: Recipe): void {
    this.recipe = r;
    this.phase = 'pick';
    this.placed = [];
    this.mistakes = 0;
    this.restartClock();
    this.resetKitchen();
    this.buildPhase();
    this.refreshScore();
  }

  private backToMenu(): void {
    this.recipe = RECIPES[0];
    this.phase = 'menu';
    this.placed = [];
    this.mistakes = 0;
    this.restartClock();
    this.resetKitchen();
    this.buildPhase();
    this.refreshScore();
  }

  private startPick(): void {
    this.phase = 'pick';
    this.placed = [];
    this.mistakes = 0;
    this.cookValue = 0;
    this.decorTaps = 0;
    this.restartClock();
    this.buildPhase();
    this.refreshScore();
  }

  /**
   * The clock starts with the dish, not with `create()` - otherwise simply
   * browsing the recipe menu silently ate into the time bonus.
   */
  private restartClock(): void {
    this.startedAt = this.time.now;
    this.lastSec = -1;
    this.elapsed = 0;
  }

  private resetKitchen(): void {
    this.stopSteam();
    this.hideRing();
    this.cookValue = 0;
    this.decorTaps = 0;
    this.meter?.setValue(0, false);
    for (const d of this.dishCache.values()) d.root.visible = false;
    this.buildTray();
  }

  /* ---------------- tray ---------------- */

  private buildTray(): void {
    const it = this.interact;
    if (!it) return;
    for (const ing of this.tray) {
      it.remove(ing.root);
      ing.root.removeFromParent();
    }
    this.tray = [];

    const r = this.recipe;
    const deck = Phaser.Utils.Array.Shuffle([...r.items, ...r.decoys]);
    deck.forEach((icon, i) => {
      const food = createFood(EMOJI_FOOD[icon] ?? 'cookie', 1.15);
      food.position.set(TRAY_X[i], TRAY_Y, TRAY_Z);
      const badge = mesh(GEO.plane(0.6, 0.6), badgeMaterial(icon), { cast: false, receive: false });
      badge.position.set(0, 0.55, 0);
      food.add(badge);
      this.room.add(food);
      const handle = it.add(food, {
        kind: 'drag',
        sound: 'click',
        dragPlane: { y: TRAY_Y },
        onDragStart: (e) => this.onDragStart(e),
        onDrag: (e) => this.onDrag(e),
        onDragEnd: () => this.onDragEnd(),
      });
      this.tray.push({
        id: `ing-${i}`,
        icon,
        root: food,
        badge,
        home: food.position.clone(),
        done: false,
        handle,
      });
    });
  }

  private makeBadge(emoji: string, size: number): THREE.Mesh {
    return mesh(GEO.plane(size, size), badgeMaterial(emoji), { cast: false, receive: false });
  }

  /* ---------------- dish ---------------- */

  private dishRec(): DishRec | null {
    return this.dishCache.get(this.recipe.id) ?? null;
  }

  private ensureDish(): DishRec | null {
    if (!this.stage) return null;
    const id = this.recipe.id;
    const hit = this.dishCache.get(id);
    if (hit) return hit;
    const r = this.recipe;
    const food = createFood(r.dishFood, 1.5);
    food.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const clone = (m.material as THREE.MeshPhongMaterial).clone();
      clone.userData = { ...(m.material as THREE.Material).userData, shared: false };
      clone.transparent = true;
      clone.opacity = 0.35;
      m.material = clone;
    });
    food.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(food);
    const half = box.isEmpty() ? 0.4 : Math.max(box.max.y, -box.min.y);
    const badge = this.makeBadge(r.dish, 0.8);
    badge.position.set(0, half + 0.4, 0);
    food.add(badge);
    food.visible = false;
    food.position.set(POT_X, PAN_TOP + half, POT_Z);
    this.stage.scene.add(food);
    this.interact?.add(food, { kind: 'tap', enabled: false, onTap: () => this.onDishTap() });
    const rec: DishRec = { root: food, badge, half, home: new THREE.Vector3() };
    rec.home.copy(food.position);
    this.dishCache.set(id, rec);
    this.syncInteractive();
    return rec;
  }

  private showDish(x: number, y: number, z: number, alpha: number): void {
    const d = this.ensureDish();
    if (!d) return;
    d.root.visible = true;
    d.root.position.set(x, y, z);
    d.root.rotation.set(0, 0, 0);
    d.root.scale.setScalar(1);
    d.home.set(x, y, z);
    this.setDishAlpha(alpha);
  }

  private setDishAlpha(a: number): void {
    const d = this.dishRec();
    if (!d) return;
    d.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const mat = m.material as THREE.MeshPhongMaterial;
      if (mat.userData.shared) return;
      mat.transparent = true;
      mat.opacity = a;
    });
  }

  /* ---------------- picking up ingredients ---------------- */

  private onDragStart(e: InteractEventLike): void {
    const ing = this.tray.find((t) => t.root === e.object) ?? null;
    if (!ing || ing.done || this.over) return;
    if (this.phase === 'menu') this.startPick();
    if (this.phase !== 'pick') return;
    this.held = ing.id;
    this.heldPos = {
      x: ing.root.position.x,
      y: ing.root.position.y,
      z: ing.root.position.z,
    };
    ing.root.scale.setScalar(1.3);
  }

  private onDrag(e: InteractEventLike): void {
    if (!this.held || this.over) return;
    const ing = this.tray.find((t) => t.id === this.held);
    if (!ing) return;
    const p = e.world;
    ing.root.position.set(
      THREE.MathUtils.clamp(p.x, -15, 15),
      TRAY_Y + 0.2,
      THREE.MathUtils.clamp(p.z, -16, 14)
    );
    this.heldPos = {
      x: ing.root.position.x,
      y: ing.root.position.y,
      z: ing.root.position.z,
    };
  }

  private onDragEnd(): void {
    const id = this.held;
    this.held = null;
    this.heldPos = null;
    if (!id || this.over) return;
    const ing = this.tray.find((t) => t.id === id);
    if (!ing || ing.done) return;

    const zone = this.zoneAt(ing.root.position);
    if (!this.recipe.items.includes(ing.icon)) {
      this.mistakes++;
      audio.play('wrong');
      floatText(this, 640, 330, 'Not this one! 🙈', { color: '#ff6b6b', size: 30 });
      if (this.ui) this.tweens.add({ targets: this.ui, x: 10, duration: 60, yoyo: true, repeat: 2 });
      this.rig?.shake(0.18, 0.28);
      this.springBack(ing);
      this.refreshScore();
      return;
    }
    // The board is the only valid target ("drag onto the chopping board").
    // A slightly generous radius absorbs the small parallax between the drag
    // plane (TRAY_Y) and the board surface; the pan/plate/counter do not count.
    const dx = ing.root.position.x - BOARD_X;
    const dz = ing.root.position.z - BOARD_Z;
    if (Math.hypot(dx, dz) > BOARD_R + 0.8) {
      audio.play('wrong');
      floatText(this, 640, 330, 'Drop it on the chopping board!', { color: '#ff6b6b', size: 28 });
      if (this.ui) this.tweens.add({ targets: this.ui, x: 10, duration: 60, yoyo: true, repeat: 2 });
      this.rig?.shake(0.15, 0.24);
      this.springBack(ing);
      return;
    }
    this.placeIngredient(ing, zone);
  }

  /** Real 3D drop test - which kitchen target (if any) is under the ingredient. */
  private zoneAt(p: THREE.Vector3): Zone {
    const near = (x: number, z: number, r: number): boolean => Math.hypot(p.x - x, p.z - z) <= r;
    if (near(BOARD_X, BOARD_Z, BOARD_R)) return 'board';
    if (near(POT_X, POT_Z, 2)) return 'pan';
    if (near(PLATE_X, PLATE_Z, 1.8)) return 'plate';
    return 'counter';
  }

  private placeIngredient(ing: Ingredient, zone: Zone): void {
    const r = this.recipe;
    if (ing.done || this.placed.length >= r.items.length || this.placed.includes(ing.icon)) {
      this.springBack(ing);
      return;
    }

    this.placed.push(ing.icon);
    ing.done = true;
    ing.handle.enabled = false;
    this.held = null;
    this.heldPos = null;
    audio.play('collect');
    if (zone === 'pan') this.stage?.delay(150, () => audio.play('sizzle'));

    const from = ing.root.position.clone();
    const to = this.pileSlot(this.placed.length - 1);
    if (this.fx) sparkleBurst(this.fx, from, { count: 10, color: 0xffd93d });
    burst(this, 640, 330, 0xffd93d, 12);
    this.placedIcons?.setText(this.placed.join(' '));
    this.updateOrder();
    this.refreshScore();

    this.stage?.tween({
      dur: 380,
      onUpdate: (k) => {
        ing.root.position.lerpVectors(from, to, k);
        ing.root.position.y += Math.sin(Math.PI * k) * 0.9;
        ing.root.scale.setScalar(THREE.MathUtils.lerp(1.15, 0.62, k));
      },
      onComplete: () => {
        ing.root.position.copy(to);
        ing.root.scale.setScalar(0.62);
        if (this.fx) dustBurst(this.fx, to, { count: 10 });
        if (this.placed.length === r.items.length) {
          audio.play('success');
          this.time.delayedCall(420, () => {
            if (this.scene.isActive()) this.enterCook();
          });
        }
      },
    });
  }

  private springBack(ing: Ingredient): void {
    if (ing.done) return;
    ing.root.scale.setScalar(1.15);
    const from = ing.root.position.clone();
    const to = ing.home.clone();
    this.stage?.tween({
      dur: 300,
      onUpdate: (k) => {
        ing.root.position.lerpVectors(from, to, k);
        ing.root.position.y += Math.sin(Math.PI * k) * 0.5;
      },
      onComplete: () => ing.root.position.copy(to),
    });
  }

  private pileSlot(i: number): THREE.Vector3 {
    const layer = i < 3 ? 0 : 1;
    const k = i % 3;
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
    const r = layer === 0 ? 0.52 : 0.3;
    return new THREE.Vector3(
      BOARD_X + Math.cos(a) * r,
      BOARD_TOP + 0.22 + layer * 0.24,
      BOARD_Z + Math.sin(a) * r * 0.7
    );
  }

  /* ---------------- cooking ---------------- */

  private enterCook(): void {
    if (this.phase !== 'pick' || this.over) return;
    this.phase = 'cook';
    this.buildPhase();
    const d = this.ensureDish();
    if (d) this.showDish(POT_X, PAN_TOP + d.half, POT_Z, 0.35);
    this.startSteam();
    this.showRing();
    this.updateRing(this.cookValue);

    this.tray
      .filter((t) => t.done)
      .forEach((ing, i) => {
        this.stage?.delay(i * 70, () => {
          const from = ing.root.position.clone();
          const to = new THREE.Vector3(POT_X, PAN_TOP + 0.1, POT_Z);
          this.stage?.tween({
            dur: 340,
            onUpdate: (k) => {
              ing.root.position.lerpVectors(from, to, k);
              ing.root.position.y += Math.sin(Math.PI * k) * 0.7;
              ing.root.scale.setScalar(THREE.MathUtils.lerp(0.62, 0.02, k));
            },
            onComplete: () => {
              ing.root.visible = false;
            },
          });
        });
      });
  }

  private onDishTap(): void {
    if (this.phase === 'cook') this.doCook();
    else if (this.phase === 'decorate') this.doDecorate();
  }

  private doCook(): void {
    if (this.phase !== 'cook' || this.over || this.cookValue >= 100) return;
    this.cookValue = Math.min(100, this.cookValue + 9);
    this.meter?.setValue(this.cookValue);
    audio.play(this.cookValue % 3 === 0 ? 'sizzle' : 'tick');

    if (this.fx) {
      sparkleBurst(this.fx, {
        x: POT_X + Phaser.Math.Between(-40, 40) / 40,
        y: PAN_TOP + 0.2,
        z: POT_Z + Phaser.Math.Between(-40, 40) / 40,
      }, { count: 5, color: 0xffa94d, speed: 2.4, life: 0.6, size: 0.3, gravity: -3 });
    }

    const d = this.dishRec();
    if (d) {
      this.stage?.tween({
        dur: 110,
        onUpdate: (k) => d.root.scale.setScalar(1 + Math.sin(Math.PI * k) * 0.08),
        onComplete: () => d.root.scale.setScalar(1),
      });
    }
    this.updateRing(this.cookValue);

    if (this.cookValue >= 100) {
      audio.play('success');
      this.setDishAlpha(1);
      floatText(this, 640, 300, 'Yummy! ✨', { color: '#2f9e44', size: 36 });
      if (this.fx && d) confettiBurst(this.fx, d.root.position, { count: 26, speed: 5 });
      this.time.delayedCall(600, () => {
        if (this.scene.isActive()) this.enterDecorate();
      });
    }
  }

  /* ---------------- decorating ---------------- */

  private enterDecorate(): void {
    if (this.phase !== 'cook' || this.over) return;
    this.phase = 'decorate';
    this.decorTaps = 0;
    this.stopSteam();
    this.hideRing();
    this.buildPhase();

    const d = this.dishRec();
    if (d && d.root.visible) {
      const from = d.root.position.clone();
      const to = new THREE.Vector3(PLATE_X, PLATE_TOP + d.half, PLATE_Z);
      this.stage?.tween({
        dur: 520,
        onUpdate: (k) => {
          d.root.position.lerpVectors(from, to, k);
          d.root.position.y += Math.sin(Math.PI * k) * 0.8;
        },
        onComplete: () => {
          d.root.position.copy(to);
          d.home.copy(to);
        },
      });
    }
  }

  private doDecorate(): void {
    if (this.phase !== 'decorate' || this.over || this.decorTaps >= 3) return;
    this.decorTaps++;
    this.decorCounter?.setText(`Taps: ${this.decorTaps} / 3`);
    audio.play('star');

    const d = this.dishRec();
    if (d && this.fx) {
      sparkleBurst(this.fx, d.root.position, {
        count: 10,
        color: [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4aa3ff][this.decorTaps % 4],
      });
      this.stage?.tween({
        dur: 170,
        onUpdate: (k) => d.root.scale.setScalar(1 + Math.sin(Math.PI * k) * 0.12),
        onComplete: () => d.root.scale.setScalar(1),
      });
    }

    if (this.decorTaps === 3) {
      floatText(this, 640, 300, 'Beautiful! 🎉', { color: '#2f9e44', size: 36 });
      confetti(this, 900);
      if (this.fx && d) confettiBurst(this.fx, d.root.position, { count: 34 });
      audio.play('success');
      this.serveBtn?.setEnabled(true);
      this.serveBtn?.pulse();
    }
  }

  /* ---------------- serving ---------------- */

  private serve(): void {
    if (this.over || this.phase !== 'decorate' || this.decorTaps < 3) return;
    this.over = true;
    this.gameplayReady = false;
    this.held = null;
    this.heldPos = null;

    audio.play('success');
    confetti(this, 1800);
    progress.track('dishes_served', 1);

    const d = this.dishRec();
    if (d && this.fx) {
      sparkleBurst(this.fx, d.root.position, { count: 20, color: 0xffd93d });
      confettiBurst(this.fx, d.root.position, { count: 30 });
      const from = d.root.position.clone();
      const to = new THREE.Vector3(6.4, 1.7, -1);
      this.stage?.tween({
        dur: 700,
        onUpdate: (k) => {
          d.root.position.lerpVectors(from, to, k);
          d.root.position.y += Math.sin(Math.PI * k) * 1.1;
        },
        onComplete: () => d.root.position.copy(to),
      });
    }
    this.syncInteractive();
    this.chef?.play('celebrate');
    this.customer?.play('happy');

    const seconds = (this.time.now - this.startedAt) / 1000;
    const stars = this.mistakes === 0 ? 3 : this.mistakes <= 2 ? 2 : 1;
    const score = Math.max(60, Math.round(420 - this.mistakes * 50 + Math.max(0, 180 - seconds)));
    this.score = score;
    this.time.delayedCall(900, () => {
      if (!this.scene.isActive()) return;
      this.finish({
        score,
        stars,
        win: true,
        subtitle: `${this.recipe.icon} ${this.recipe.name} served!`,
        lines: [
          { icon: '🙆', label: 'Mistakes', value: String(this.mistakes) },
          { icon: '⏱', label: 'Time', value: `${Math.round(seconds)}s` },
        ],
      });
    });
  }

  /* ---------------- helpers ---------------- */

  private computeScore(): number {
    const seconds = (this.time.now - this.startedAt) / 1000;
    return Math.max(60, Math.round(420 - this.mistakes * 50 + Math.max(0, 180 - seconds)));
  }

  private refreshScore(): void {
    this.score = this.computeScore();
    this.hud?.setScore(this.score);
  }

  private startSteam(): void {
    if (this.steam || !this.fx) return;
    this.steam = this.fx.emit({
      pos: { x: POT_X, y: PAN_TOP + 0.1, z: POT_Z },
      area: { x: 1.5, y: 0.2, z: 1.5 },
      rate: 7,
      color: [0xffffff, 0xe8f4ff],
      size: 0.45,
      life: 1.5,
      speed: 1.1,
      gravity: 0.9,
      spread: 0.5,
      direction: 'up',
      tex: 'soft',
    });
  }

  private stopSteam(): void {
    this.steam?.stop();
    this.steam = null;
  }

  private showRing(): void {
    if (this.ringTrack) this.ringTrack.visible = true;
    this.ringPct = -1;
  }

  private hideRing(): void {
    if (this.ringTrack) this.ringTrack.visible = false;
    if (this.ringArc) this.ringArc.visible = false;
    this.ringPct = -1;
  }

  private updateRing(pct: number): void {
    const arc = this.ringArc;
    if (!arc || !arc.visible) {
      this.ringPct = pct;
      if (arc && pct > 0) arc.visible = true;
      if (!arc || pct <= 0) return;
    }
    if (Math.abs(pct - this.ringPct) < 3) return;
    this.ringPct = pct;
    const theta = THREE.MathUtils.clamp((pct / 100) * Math.PI * 2, 0.02, Math.PI * 2);
    const old = arc.geometry;
    arc.geometry = new THREE.RingGeometry(1.34, 1.52, 56, 1, -Math.PI / 2, theta);
    old.dispose();
  }

  /* ---------------- E2E helpers ---------------- */

  private testState(): Record<string, unknown> {
    const r = this.recipe;
    const step = this.over
      ? 4
      : this.phase === 'menu'
        ? 0
        : this.phase === 'pick'
          ? 1
          : this.phase === 'cook'
            ? 2
            : 3;
    return {
      score: this.score,
      mistakes: this.mistakes,
      order: r.id,
      orderName: r.name,
      recipe: r.name,
      icon: r.icon,
      verb: r.verb,
      dish: r.dish,
      items: r.items,
      deck: this.tray.map((t) => t.icon),
      placed: this.placed.length,
      plated: this.placed.length,
      placedItems: [...this.placed],
      step,
      stepName: this.phase,
      phase: this.phase,
      held: this.held,
      heldPos: this.heldPos ? { ...this.heldPos } : null,
      cook: this.cookValue,
      decor: this.decorTaps,
      elapsed: this.elapsed,
      ready: this.gameplayReady,
      over: this.over,
    };
  }

  private probe(): ProbePoint | null {
    const stage = this.stage;
    if (!stage || !this.gameplayReady || this.over) return null;

    if (this.phase === 'menu' || this.phase === 'pick') {
      const ing = this.probeIngredient();
      if (!ing) return null;
      const p = stage.project(
        ing.root.position.x,
        ing.root.position.y + 0.5,
        ing.root.position.z
      );
      if (!p) return null;
      if (p.x < 200 || p.x > 1080 || p.y < 240 || p.y > 560) return null;
      return { x: p.x, y: p.y, label: ing.id };
    }

    const p =
      this.phase === 'cook'
        ? stage.project(POT_X, PAN_TOP + 0.3, POT_Z)
        : stage.project(PLATE_X, PLATE_TOP + 0.55, PLATE_Z);
    if (!p) return null;
    return { x: p.x, y: p.y, label: 'dish' };
  }

  private probeIngredient(): Ingredient | null {
    const list = this.tray.filter((t) => !t.done && this.recipe.items.includes(t.icon));
    if (!list.length) return null;
    list.sort((a, b) => Math.abs(a.home.x) - Math.abs(b.home.x));
    return list[0];
  }

  /**
   * A tap that lands on the empty tray (the 3D version of the original 2D
   * "tap an ingredient button") still adds the next ingredient, so a miss that
   * falls within the tray band is treated as tapping the ingredient itself.
   */
  protected override handleTap(dx: number, dy: number): void {
    if (this.over || this.phase !== 'pick') return;
    if (dx < 240 || dx > 1040 || dy < 330 || dy > 510) return;
    const ing = this.probeIngredient();
    if (!ing) return;
    this.placeIngredient(ing, 'board');
  }
}

/** Minimal view of the interaction event used by the drag handlers. */
interface InteractEventLike {
  object: THREE.Object3D;
  world: THREE.Vector3;
}
