import * as THREE from 'three';
import { GEO, cachedGeo, glassMat, glowMat, group, matteMat, mesh, roundedBoxGeometry, toyMat } from '../materials';

/**
 * 3D game-object library - 14 procedural toy props (arrows, blocks, puzzle
 * pieces, balls, bubbles, stars, coins, gems, hearts, trophies, gift boxes,
 * keys and treasure chests) built entirely from shared primitives.
 *
 * Every factory returns a `THREE.Group` centred on its own origin (the
 * treasure chest sits on y = 0 so it stands on the floor) and marked
 * `userData.pick = true`, so a game can raycast it straight away:
 *
 *   const star = createObject('star', { color: 0xffd93d, size: 1.4 });
 *   scene.add(star);
 */

export type ObjectKind =
  | 'arrow'
  | 'block'
  | 'puzzlePiece'
  | 'ball'
  | 'bubble'
  | 'star'
  | 'coin'
  | 'gem'
  | 'heart'
  | 'trophy'
  | 'giftBox'
  | 'key'
  | 'treasureChest';

export const OBJECT_KINDS: readonly ObjectKind[] = [
  'arrow', 'block', 'puzzlePiece', 'ball', 'bubble', 'star', 'coin',
  'gem', 'heart', 'trophy', 'giftBox', 'key', 'treasureChest',
];

const EMOJI: Record<ObjectKind, string> = {
  arrow: '➡️', block: '🧊', puzzlePiece: '🧩', ball: '⚽', bubble: '🫧',
  star: '⭐', coin: '🪙', gem: '💎', heart: '❤️', trophy: '🏆',
  giftBox: '🎁', key: '🔑', treasureChest: '🧰',
};

const KIND_SET: ReadonlySet<string> = new Set<string>(OBJECT_KINDS);

export function isObjectKind(v: string): v is ObjectKind { return KIND_SET.has(v); }
export function objectEmoji(kind: ObjectKind): string { return EMOJI[kind]; }

export interface ObjectOpts {
  /** Primary colour override. */
  color?: number;
  /** Uniform scale multiplier (default 1). */
  size?: number;
  /** Single-character glyph stamped on the +Z face of blocks / puzzle pieces. */
  label?: string;
  /** Grid coordinates stored on `userData.piece` (puzzle pieces). */
  row?: number;
  col?: number;
}

export function createObject(kind: ObjectKind, opts: ObjectOpts = {}): THREE.Group {
  const root = build(kind, opts);
  const s = opts.size ?? 1;
  root.scale.multiplyScalar(s);
  root.userData.pick = true;
  root.userData.object = kind;
  if (opts.row !== undefined && opts.col !== undefined) root.userData.piece = { row: opts.row, col: opts.col };
  return root;
}

function build(kind: ObjectKind, o: ObjectOpts): THREE.Group {
  switch (kind) {
    case 'arrow': return makeArrow(o);
    case 'block': return makeBlock(o);
    case 'puzzlePiece': return makePuzzlePiece(o);
    case 'ball': return makeBall(o);
    case 'bubble': return makeBubble(o);
    case 'star': return makeStar(o);
    case 'coin': return makeCoin(o);
    case 'gem': return makeGem(o);
    case 'heart': return makeHeart(o);
    case 'trophy': return makeTrophy(o);
    case 'giftBox': return makeGiftBox(o);
    case 'key': return makeKey(o);
    case 'treasureChest': return makeTreasureChest(o);
  }
}

/* ------------------------------------------------------------------ */
/* glyph faces                                                         */
/* ------------------------------------------------------------------ */

const glyphCache = new Map<string, THREE.Texture>();

/** Canvas texture for a one-character stamp (cached forever, no Phaser). */
function glyphTexture(char: string, color: number): THREE.Texture {
  const key = `${char}|${color}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 86px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char.slice(0, 1), size / 2, size / 2 + 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { shared: true };
  glyphCache.set(key, tex);
  return tex;
}

function labelFace(char: string, color: number, w: number, h: number): THREE.Mesh {
  const mat = new THREE.MeshPhongMaterial({ map: glyphTexture(char, color), shininess: 40 });
  mat.userData.shared = true;
  const m = new THREE.Mesh(GEO.plane(w, h), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/* ------------------------------------------------------------------ */
/* arrow                                                               */
/* ------------------------------------------------------------------ */

export function makeArrow(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0x4dd0e1;
  const s = new THREE.Shape();
  s.moveTo(-0.3, -0.5);
  s.lineTo(0.3, -0.5);
  s.lineTo(0.3, 0.05);
  s.lineTo(0.62, 0.05);
  s.lineTo(0, 0.62);
  s.lineTo(-0.62, 0.05);
  s.lineTo(-0.3, 0.05);
  s.closePath();
  const head = mesh(GEO.extrude(s, 0.22, 'obj-arrow'), toyMat(color));
  head.rotation.y = Math.PI / 2;
  head.rotation.z = -Math.PI / 2;
  head.position.y = 0;
  const outline = mesh(GEO.extrude(s, 0.08, 'obj-arrow-core'), glowMat(color, 0.35));
  outline.rotation.copy(head.rotation);
  outline.position.z = 0.1;
  outline.scale.setScalar(0.82);
  const g = group(head, outline);
  g.userData.arrow = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* block                                                               */
/* ------------------------------------------------------------------ */

export function makeBlock(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xff6b6b;
  const cube = mesh(roundedBoxGeometry(1, 1, 1, 0.14), toyMat(color));
  const g = group(cube);
  const char = opts.label?.trim();
  if (char) {
    const face = labelFace(char, color, 0.8, 0.8);
    face.position.z = 0.512;
    g.add(face);
    const back = labelFace(char, color, 0.8, 0.8);
    back.position.z = -0.512;
    back.rotation.y = Math.PI;
    g.add(back);
  }
  // top highlight so the cube reads as 3D from an angled camera
  const hi = mesh(GEO.plane(0.7, 0.7), glowMat(0xffffff, 0.25), { cast: false, receive: false });
  hi.rotation.x = -Math.PI / 2;
  hi.position.y = 0.508;
  g.add(hi);
  g.userData.block = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* puzzle piece                                                        */
/* ------------------------------------------------------------------ */

function puzzleShape(): THREE.Shape {
  const w = 1;
  const h = 1;
  const k = 0.16;          // neck
  const n = 0.17;          // knob radius
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(-k, -h / 2);
  s.absarc(0, -h / 2, n, Math.PI, 0, true);
  s.lineTo(k, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, -k);
  s.absarc(w / 2, 0, n, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(w / 2, k);
  s.lineTo(w / 2, h / 2);
  s.lineTo(k, h / 2);
  s.absarc(0, h / 2, n, 0, Math.PI, false);
  s.lineTo(-k, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.lineTo(-w / 2, k);
  s.absarc(-w / 2, 0, n, Math.PI / 2, Math.PI * 1.5, false);
  s.lineTo(-w / 2, -k);
  s.closePath();
  return s;
}

export function makePuzzlePiece(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xffd93d;
  const body = mesh(GEO.extrude(puzzleShape(), 0.16, 'obj-puzzle'), toyMat(color));
  body.geometry.center();
  const g = group(body);
  const char = opts.label?.trim();
  if (char) {
    const face = labelFace(char, color, 0.5, 0.5);
    face.position.z = 0.095;
    g.add(face);
  }
  g.userData.puzzlePiece = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* ball                                                                */
/* ------------------------------------------------------------------ */

export function makeBall(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xffffff;
  const core = mesh(GEO.sphere(0.5, 16), toyMat(color));
  const bandMat = toyMat(0xff5c7a);
  const band = mesh(GEO.torus(0.5, 0.045), bandMat);
  band.rotation.x = Math.PI / 2;
  const band2 = mesh(GEO.torus(0.5, 0.045), toyMat(0x4aa3ff));
  band2.rotation.y = Math.PI / 2;
  const band3 = mesh(GEO.torus(0.34, 0.04), toyMat(0xffd93d));
  band3.rotation.x = Math.PI / 2;
  band3.position.y = 0.3;
  const band4 = mesh(GEO.torus(0.34, 0.04), toyMat(0xffd93d));
  band4.rotation.x = Math.PI / 2;
  band4.position.y = -0.3;
  return group(core, band, band2, band3, band4);
}

/* ------------------------------------------------------------------ */
/* bubble                                                              */
/* ------------------------------------------------------------------ */

export function makeBubble(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0x9be2ff;
  const shell = mesh(GEO.sphere(0.5, 16), glassMat(color, 0.34), { cast: false, receive: false });
  const gloss = mesh(GEO.sphere(0.14, 10), glowMat(0xffffff, 0.6), { cast: false, receive: false });
  gloss.position.set(-0.17, 0.2, 0.3);
  gloss.scale.set(1, 0.7, 0.5);
  const rim = mesh(GEO.torus(0.5, 0.02), glassMat(color, 0.5), { cast: false, receive: false });
  rim.rotation.x = Math.PI / 2;
  const g = group(shell, gloss, rim);
  g.userData.bubble = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* star                                                                */
/* ------------------------------------------------------------------ */

function starShape(outer = 0.5, inner = 0.21): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export function makeStar(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xffd93d;
  const body = mesh(GEO.extrude(starShape(), 0.14, 'obj-star'), glowMat(color, 0.45));
  body.geometry.center();
  const face = mesh(GEO.circle(0.16, 12), glowMat(0xffffff, 0.7), { cast: false, receive: false });
  face.position.z = 0.081;
  const g = group(body, face);
  g.userData.star = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* coin                                                                */
/* ------------------------------------------------------------------ */

export function makeCoin(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xffd93d;
  const disc = mesh(GEO.cylinder(0.5, 0.5, 0.12, 20), toyMat(color, { emissive: 0xffa94d, emissiveIntensity: 0.28 }));
  disc.rotation.x = Math.PI / 2;
  const rim = mesh(GEO.torus(0.47, 0.045), toyMat(0xf0b429));
  const inner = mesh(GEO.circle(0.34, 16), glowMat(0xfff0a8, 0.35), { cast: false, receive: false });
  inner.position.z = 0.063;
  const g = group(disc, rim, inner);
  g.userData.coin = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* gem                                                                 */
/* ------------------------------------------------------------------ */

export function makeGem(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0x4dd0e1;
  const body = mesh(GEO.diamond(0.42), toyMat(color, { emissive: color, emissiveIntensity: 0.3, flatShading: true }));
  const cap = mesh(GEO.cylinder(0.3, 0.42, 0.14, 8), toyMat(0xffffff, { opacity: 0.5, transparent: true }));
  cap.position.y = 0.3;
  const sparkle = mesh(GEO.octahedron(0.1), glowMat(0xffffff, 0.8), { cast: false, receive: false });
  sparkle.position.set(0.2, 0.34, 0.16);
  const g = group(body, cap, sparkle);
  g.userData.gem = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* heart                                                               */
/* ------------------------------------------------------------------ */

function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  const x = 0;
  const y = 0;
  s.moveTo(x, y + 0.3);
  s.bezierCurveTo(x, y + 0.5, x - 0.45, y + 0.62, x - 0.45, y + 0.28);
  s.bezierCurveTo(x - 0.45, y - 0.05, x - 0.1, y - 0.2, x, y - 0.42);
  s.bezierCurveTo(x + 0.1, y - 0.2, x + 0.45, y - 0.05, x + 0.45, y + 0.28);
  s.bezierCurveTo(x + 0.45, y + 0.62, x, y + 0.5, x, y + 0.3);
  return s;
}

export function makeHeart(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xff5c7a;
  const body = mesh(GEO.extrude(heartShape(), 0.2, 'obj-heart'), glowMat(color, 0.3));
  body.geometry.center();
  const shine = mesh(GEO.sphere(0.1, 8), glowMat(0xffffff, 0.7), { cast: false, receive: false });
  shine.position.set(-0.16, 0.14, 0.12);
  shine.scale.set(1, 0.7, 0.5);
  const g = group(body, shine);
  g.userData.heart = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* trophy                                                              */
/* ------------------------------------------------------------------ */

export function makeTrophy(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xffd93d;
  const cup = mesh(
    GEO.lathe([[0, 0], [0.42, 0.05], [0.5, 0.4], [0.42, 0.72], [0.3, 0.8], [0, 0.82]], 16),
    toyMat(color, { emissive: 0xffa94d, emissiveIntensity: 0.3 })
  );
  const stem = mesh(GEO.cylinder(0.12, 0.2, 0.3, 12), toyMat(color));
  stem.position.y = -0.28;
  const base = mesh(GEO.roundedBox(0.8, 0.22, 0.6, 0.08), toyMat(0xc98a5b));
  base.position.y = -0.52;
  const l = mesh(GEO.torus(0.2, 0.05), toyMat(color));
  l.position.set(-0.5, 0.42, 0);
  l.rotation.y = Math.PI / 2;
  const r = l.clone();
  r.position.x = 0.5;
  const g = group(cup, stem, base, l, r);
  g.userData.trophy = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* gift box                                                            */
/* ------------------------------------------------------------------ */

export function makeGiftBox(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xff8fab;
  const size = 0.9;
  const box = mesh(roundedBoxGeometry(size, size, size, 0.06), toyMat(color));
  box.position.y = size / 2;

  const ribbonA = mesh(GEO.box(size * 0.18, size * 1.01, size * 1.01), toyMat(0xffd93d));
  ribbonA.position.y = size / 2;
  const g = group(box, ribbonA);

  const lid = new THREE.Group();
  const plate = mesh(roundedBoxGeometry(size * 1.08, 0.2, size * 1.08, 0.05), toyMat(color));
  const ribbonB = mesh(GEO.box(size * 1.1, 0.21, size * 0.18), toyMat(0xffd93d));
  const bowL = mesh(GEO.torus(0.16, 0.05), toyMat(0xffd93d));
  bowL.position.set(-0.15, 0.14, 0);
  bowL.rotation.x = Math.PI / 2;
  const bowR = bowL.clone();
  bowR.position.x = 0.15;
  const knot = mesh(GEO.sphere(0.08, 10), toyMat(0xffa94d));
  knot.position.y = 0.14;
  lid.add(plate, ribbonB, bowL, bowR, knot);
  lid.position.y = size;
  g.add(lid);

  g.userData.lid = lid;
  g.userData.giftBox = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* key                                                                 */
/* ------------------------------------------------------------------ */

export function makeKey(opts: ObjectOpts = {}): THREE.Group {
  const color = opts.color ?? 0xffd93d;
  const mat = toyMat(color, { emissive: 0xffa94d, emissiveIntensity: 0.25 });
  const bow = mesh(GEO.torus(0.26, 0.075), mat);
  bow.position.y = 0.5;
  const inner = mesh(GEO.circle(0.16, 14), matteMat(0x2b2f45), { cast: false });
  inner.position.set(0, 0.5, 0.001);
  const shaft = mesh(GEO.cylinder(0.07, 0.07, 0.7, 10), mat);
  shaft.position.y = 0.05;
  const toothA = mesh(GEO.box(0.2, 0.1, 0.12), mat);
  toothA.position.set(0.13, -0.2, 0);
  const toothB = mesh(GEO.box(0.16, 0.1, 0.12), mat);
  toothB.position.set(0.11, -0.02, 0);
  const g = group(bow, inner, shaft, toothA, toothB);
  g.userData.key = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* treasure chest                                                      */
/* ------------------------------------------------------------------ */

export function makeTreasureChest(opts: ObjectOpts = {}): THREE.Group {
  const wood = opts.color ?? 0x9a5b2f;
  const w = 1.3;
  const h = 0.72;
  const d = 0.9;

  const base = mesh(roundedBoxGeometry(w, h, d, 0.08), matteMat(wood));
  base.position.y = h / 2;
  const trim = mesh(GEO.box(w * 1.03, 0.1, d * 1.03), toyMat(0xffd93d));
  trim.position.y = h * 0.42;
  const trim2 = trim.clone();
  trim2.position.y = h * 0.06;
  const lock = mesh(GEO.roundedBox(0.2, 0.26, 0.1, 0.04), toyMat(0xffd93d, { emissive: 0xffa94d, emissiveIntensity: 0.3 }));
  lock.position.set(0, h * 0.62, d / 2 + 0.02);

  const body = group(base, trim, trim2, lock);

  const lid = new THREE.Group();
  const r = d / 2;
  const shellGeo = cachedGeo('obj-chest-lid', () => new THREE.CylinderGeometry(r, r, w, 14, 1, false, 0, Math.PI));
  const shell = mesh(shellGeo, matteMat(wood));
  shell.rotation.z = Math.PI / 2;
  shell.position.z = r;
  const strapGeo = cachedGeo('obj-chest-strap', () => new THREE.CylinderGeometry(r * 1.07, r * 1.07, 0.14, 14, 1, false, 0, Math.PI));
  const strapA = mesh(strapGeo, toyMat(0xffd93d));
  strapA.rotation.z = Math.PI / 2;
  strapA.position.set(w * 0.3, 0, r);
  const strapB = strapA.clone();
  strapB.position.x = -w * 0.3;
  lid.add(shell, strapA, strapB);
  lid.position.set(0, h, -d / 2);

  const g = group(body, lid);
  g.userData.lid = lid;
  g.userData.treasureChest = true;
  return g;
}

/** Free the cached glyph textures (tests only). */
export function disposeGlyphCache(): void {
  glyphCache.forEach((t) => t.dispose());
  glyphCache.clear();
}

/** Shared extruded star geometry used by several systems. */
export function starGeometry(): THREE.BufferGeometry {
  return GEO.extrude(starShape(), 0.14, 'obj-star');
}

/** Shared glow material accessor so games tint stars consistently. */
export function starMaterial(color: number): THREE.MeshPhongMaterial {
  return glowMat(color, 0.45);
}
