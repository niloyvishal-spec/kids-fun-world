import * as THREE from 'three';
import { GEO, glassMat, glowMat, group, matteMat, mesh, toyMat } from '../../materials';

/**
 * 3D cartoon food library - 28 procedural toy-style props built from shared
 * primitives (no external models or fonts), roughly 0.5-1.0 units across at
 * `scale = 1`, centred on their own origin and marked `userData.pick` so games
 * can raycast them directly: `createFood('apple', 1.4).userData.food === 'apple'`
 */

export type FoodKind =
  | 'apple' | 'banana' | 'strawberry' | 'grapes' | 'orange' | 'watermelon' | 'cherry' | 'lemon'
  | 'carrot' | 'tomato' | 'broccoli' | 'corn'
  | 'cake' | 'donut' | 'cookie' | 'candy' | 'icecream' | 'cupcake' | 'lollipop'
  | 'pizza' | 'burger' | 'sandwich' | 'hotdog' | 'pancake' | 'sushi'
  | 'juice' | 'milk' | 'icecube';

export const FOOD_KINDS: readonly FoodKind[] = [
  'apple', 'banana', 'strawberry', 'grapes', 'orange', 'watermelon', 'cherry', 'lemon',
  'carrot', 'tomato', 'broccoli', 'corn', 'cake', 'donut', 'cookie', 'candy', 'icecream',
  'cupcake', 'lollipop', 'pizza', 'burger', 'sandwich', 'hotdog', 'pancake', 'sushi',
  'juice', 'milk', 'icecube',
];

const EMOJI: Record<FoodKind, string> = {
  apple: '🍎', banana: '🍌', strawberry: '🍓', grapes: '🍇', orange: '🍊', watermelon: '🍉',
  cherry: '🍒', lemon: '🍋', carrot: '🥕', tomato: '🍅', broccoli: '🥦', corn: '🌽',
  cake: '🎂', donut: '🍩', cookie: '🍪', candy: '🍬', icecream: '🍦', cupcake: '🧁',
  lollipop: '🍭', pizza: '🍕', burger: '🍔', sandwich: '🥪', hotdog: '🌭', pancake: '🥞',
  sushi: '🍣', juice: '🧃', milk: '🥛', icecube: '🧊',
};

const KIND_SET: ReadonlySet<string> = new Set<string>(FOOD_KINDS);

export function isFoodKind(v: string): v is FoodKind { return KIND_SET.has(v); }
export function foodEmoji(kind: FoodKind): string { return EMOJI[kind]; }

export function createFood(kind: FoodKind, scale = 1): THREE.Group {
  const root = centred(build(kind));
  root.scale.setScalar(scale);
  root.userData.pick = true;
  root.userData.food = kind;
  return root;
}

/* palette + tiny helpers ------------------------------------------------ */

const P = {
  red: 0xe23b32, deepRed: 0xc02f28, pink: 0xff7ba6, softPink: 0xffa8c0,
  white: 0xfcfcf8, cream: 0xfff0cf, green: 0x54b948, darkGreen: 0x2f7d36,
  leaf: 0x63c44f, stalk: 0x9ec96a, brown: 0x8a5a2b, dough: 0xdfa55a,
  tan: 0xd9a45f, yellow: 0xf7d14a, gold: 0xf3c22a, orange: 0xff8c1a,
  grape: 0x7b4fc4, cheese: 0xf6c53f, chocolate: 0x6b4226, salmon: 0xff8a55,
  nori: 0x2b3a2e, blue: 0x53a9e8, ice: 0xbfe6ff,
} as const;

/** Position + euler rotation in one call. */
function place(o: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Object3D {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

/** Squashed / stretched sphere - the workhorse of cartoon shapes. */
function blob(r: number, color: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const m = mesh(GEO.sphere(r), toyMat(color));
  m.scale.set(sx, sy, sz);
  return m;
}

/** Horizontal ring around a cylinder (frosting, rims, rinds). */
function hoop(r: number, tube: number, color: number, y: number): THREE.Mesh {
  const m = mesh(GEO.torus(r, tube), toyMat(color));
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  return m;
}

function leaf(): THREE.Mesh {
  const m = mesh(GEO.sphere(1), toyMat(P.leaf));
  m.scale.set(0.13, 0.03, 0.07);
  return m;
}

function twig(): THREE.Mesh { return mesh(GEO.cylinder(0.024, 0.034, 0.13, 8), matteMat(P.brown)); }

/** Triangle with a flat base at y = 0 (sandwich + carton roof). */
function triShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  return s;
}

/** Shift the prop so its bounding-box centre sits on the origin. */
function centred(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return root;
  const c = box.getCenter(new THREE.Vector3());
  root.children.forEach((child) => child.position.sub(c));
  return root;
}

/* fruits ---------------------------------------------------------------- */

function apple(): THREE.Group {
  const dimple = mesh(GEO.sphere(0.1), matteMat(P.deepRed));
  dimple.scale.set(1, 0.4, 1);
  return group(blob(0.32, P.red, 1, 0.94, 1), dimple,
    place(twig(), 0.03, 0.3, 0, 0, 0, -0.3), place(leaf(), 0.15, 0.29, 0, 0, 0, -0.45));
}

function banana(): THREE.Group {
  const g = group();
  const R = 0.4;
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const a = (t - 0.5) * Math.PI * 1.1;
    const seg = mesh(GEO.capsule(0.055 + 0.05 * Math.sin(t * Math.PI), 0.22), toyMat(P.yellow));
    seg.rotation.z = -(a + Math.PI / 2);
    seg.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
    g.add(seg);
  }
  for (const e of [-0.55, 0.55]) {
    g.add(place(mesh(GEO.sphere(0.05), matteMat(P.brown)), Math.sin(e * Math.PI) * R, Math.cos(e * Math.PI) * R, 0));
  }
  return g;
}

function strawberry(): THREE.Group {
  const tip = mesh(GEO.cone(0.29, 0.44, 16), toyMat(P.red));
  tip.rotation.x = Math.PI;
  tip.position.y = -0.2;
  const parts: THREE.Object3D[] = [blob(0.3, P.red, 1, 1.05, 1), tip];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.39996;
    const y = 0.27 - (i / 11) * 0.29;
    const rr = 0.3 * Math.sqrt(Math.max(0, 1 - (y * y) / 0.099));
    parts.push(place(mesh(GEO.sphere(0.022), toyMat(P.cream)), Math.cos(a) * rr, y, Math.sin(a) * rr));
  }
  parts.push(place(mesh(GEO.cone(0.14, 0.1, 12), toyMat(P.darkGreen)), 0, 0.33, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(place(mesh(GEO.roundedBox(0.2, 0.025, 0.07, 0.012), toyMat(P.green)),
      Math.cos(a) * 0.1, 0.3, -Math.sin(a) * 0.1, 0, a, 0));
  }
  return group(...parts);
}

function grapes(): THREE.Group {
  const g = group();
  const rows: Array<[number, number, number]> = [[0.17, 0.11, 4], [0, 0.17, 5], [-0.17, 0.13, 4]];
  g.add(place(mesh(GEO.sphere(0.095), toyMat(P.grape)), 0, 0.17, 0));
  for (const [y, ring, n] of rows) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + y * 3;
      g.add(place(mesh(GEO.sphere(0.095), toyMat(P.grape)), Math.cos(a) * ring, y, Math.sin(a) * ring));
    }
  }
  g.add(place(mesh(GEO.sphere(0.095), toyMat(P.grape)), 0, -0.29, 0), place(twig(), 0, 0.34, 0));
  g.add(place(leaf(), 0.13, 0.34, 0.03, 0, 0.4, -0.3));
  return g;
}

function orangeFruit(): THREE.Group {
  return group(
    mesh(GEO.sphere(0.31), toyMat(P.orange)),
    place(mesh(GEO.cylinder(0.05, 0.06, 0.05, 8), matteMat(P.darkGreen)), 0, 0.3, 0),
    place(leaf(), 0.12, 0.3, 0.04, 0, 0.5, -0.35));
}

function watermelon(): THREE.Group {
  const g = group(mesh(GEO.sphere(0.33), toyMat(P.green)));
  for (let i = 0; i < 4; i++) {
    const stripe = mesh(GEO.torus(0.333, 0.022), matteMat(P.darkGreen));
    stripe.rotation.y = (i / 4) * Math.PI;
    g.add(stripe);
  }
  g.add(place(twig(), 0, 0.34, 0));
  return g;
}

function cherry(): THREE.Group {
  return group(
    place(mesh(GEO.sphere(0.14), toyMat(P.deepRed)), -0.17, -0.16, 0.02),
    place(mesh(GEO.sphere(0.13), toyMat(P.red)), 0.17, -0.14, -0.04),
    place(mesh(GEO.sphere(0.032), toyMat(P.white)), -0.21, -0.11, 0.13),
    place(mesh(GEO.sphere(0.03), toyMat(P.white)), 0.13, -0.09, 0.06),
    place(mesh(GEO.cylinder(0.016, 0.02, 0.42, 8), matteMat(P.brown)), -0.09, 0.08, 0, 0, 0, -0.4),
    place(mesh(GEO.cylinder(0.016, 0.02, 0.42, 8), matteMat(P.brown)), 0.09, 0.1, -0.02, 0, 0, 0.4),
    place(leaf(), 0.05, 0.3, 0.03, 0, 0.3, -0.4));
}

function lemon(): THREE.Group {
  return group(
    blob(0.3, P.yellow, 1.2, 0.9, 0.9),
    place(mesh(GEO.cone(0.06, 0.12, 10), toyMat(P.yellow)), 0.36, 0, 0, 0, 0, -Math.PI / 2),
    place(mesh(GEO.cone(0.06, 0.12, 10), toyMat(P.yellow)), -0.36, 0, 0, 0, 0, Math.PI / 2),
    place(leaf(), 0.1, 0.27, 0.05, 0, 0.4, -0.4));
}

/* vegetables ------------------------------------------------------------ */

function carrot(): THREE.Group {
  const parts: THREE.Object3D[] = [place(mesh(GEO.cone(0.17, 0.56, 14), toyMat(P.orange)), 0, 0, 0, Math.PI, 0, 0)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = place(mesh(GEO.cone(0.05, 0.24, 8), matteMat(P.green)), Math.cos(a) * 0.05, 0.38, Math.sin(a) * 0.05);
    blade.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    parts.push(blade);
  }
  return group(...parts);
}

function tomato(): THREE.Group {
  const st = place(mesh(GEO.cylinder(0.026, 0.034, 0.1, 8), matteMat(P.green)), 0, 0.3, 0);
  const parts: THREE.Object3D[] = [
    blob(0.3, 0xe8483a, 1, 0.78, 1),
    place(mesh(GEO.cone(0.15, 0.1, 12), toyMat(P.darkGreen)), 0, 0.23, 0),
    st,
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(place(mesh(GEO.roundedBox(0.19, 0.02, 0.06, 0.01), toyMat(P.green)),
      Math.cos(a) * 0.09, 0.22, -Math.sin(a) * 0.09, 0, a, 0));
  }
  return group(...parts);
}

function broccoli(): THREE.Group {
  const g = group(place(mesh(GEO.cylinder(0.1, 0.14, 0.3, 10), matteMat(P.stalk)), 0, -0.16, 0));
  const florets: Array<[number, number, number, number]> = [[0, 0.2, 0, 0.15]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    florets.push([Math.cos(a) * 0.16, 0.1, Math.sin(a) * 0.16, 0.13]);
    florets.push([Math.cos(a + 0.5) * 0.2, -0.01, Math.sin(a + 0.5) * 0.2, 0.11]);
  }
  for (const [x, y, z, r] of florets) g.add(place(mesh(GEO.sphere(r), matteMat(0x3f9e4a)), x, y, z));
  return g;
}

function corn(): THREE.Group {
  const g = group(mesh(GEO.cylinder(0.09, 0.13, 0.5, 12), toyMat(0xe8b21c)));
  g.add(place(blob(0.09, 0xe8b21c, 1, 0.7, 1), 0, 0.24, 0));
  for (const y of [-0.17, -0.06, 0.06, 0.17]) {
    const rr = 0.13 + (0.09 - 0.13) * ((y + 0.25) / 0.5) + 0.028;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + (y > 0 ? 0.45 : 0);
      g.add(place(mesh(GEO.sphere(0.04), toyMat(P.gold)), Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
  }
  for (const s of [-1, 1]) {
    const husk = mesh(GEO.cone(0.14, 0.44, 10), matteMat(0x69b14b));
    husk.scale.set(1, 1, 0.45);
    husk.position.set(s * 0.14, -0.2, 0);
    husk.rotation.z = s * -0.45;
    g.add(husk);
  }
  return g;
}

/* sweets + bakery ------------------------------------------------------- */

function cake(): THREE.Group {
  const g = group();
  g.add(place(mesh(GEO.cylinder(0.36, 0.36, 0.18, 20), matteMat(P.dough)), 0, 0.09, 0), hoop(0.35, 0.05, P.softPink, 0.18));
  g.add(place(mesh(GEO.cylinder(0.28, 0.28, 0.16, 20), matteMat(P.cream)), 0, 0.26, 0), hoop(0.27, 0.045, P.pink, 0.34));
  g.add(place(mesh(GEO.cylinder(0.2, 0.2, 0.14, 18), matteMat(P.dough)), 0, 0.41, 0), hoop(0.19, 0.04, P.softPink, 0.48));
  g.add(place(mesh(GEO.sphere(0.07), toyMat(P.deepRed)), 0, 0.55, 0));
  return g;
}

function donut(): THREE.Group {
  const g = group();
  const dough = mesh(GEO.torus(0.3, 0.13), toyMat(P.dough));
  const icing = mesh(GEO.torus(0.3, 0.105), toyMat(P.pink));
  for (const m of [dough, icing]) {
    m.rotation.x = -Math.PI / 2;
    g.add(m);
  }
  icing.position.y = 0.05;
  const colors = [P.white, P.red, P.blue, P.yellow, P.green];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const bit = mesh(GEO.box(0.055, 0.02, 0.02), toyMat(colors[i % colors.length]));
    bit.position.set(Math.cos(a) * 0.3, 0.13, Math.sin(a) * 0.3);
    bit.rotation.set(0, a, (i % 3) * 0.5);
    g.add(bit);
  }
  return g;
}

function cookie(): THREE.Group {
  const g = group(mesh(GEO.cylinder(0.3, 0.3, 0.1, 20), matteMat(P.tan)));
  g.add(place(blob(0.29, P.tan, 1, 0.22, 1), 0, 0.05, 0));
  for (let i = 0; i < 8; i++) {
    const a = i * 2.39996;
    const rr = i === 0 ? 0 : 0.09 + (i / 8) * 0.14;
    g.add(place(mesh(GEO.sphere(0.036), toyMat(P.chocolate)), Math.cos(a) * rr, 0.09, Math.sin(a) * rr));
  }
  return g;
}

function candy(): THREE.Group {
  return group(
    mesh(GEO.roundedBox(0.3, 0.26, 0.26, 0.11), toyMat(P.pink)),
    place(mesh(GEO.cone(0.14, 0.2, 12), toyMat(P.softPink)), 0.27, 0, 0, 0, 0, -Math.PI / 2),
    place(mesh(GEO.cone(0.14, 0.2, 12), toyMat(P.softPink)), -0.27, 0, 0, 0, 0, Math.PI / 2),
    place(mesh(GEO.torus(0.14, 0.03), toyMat(P.white)), 0.06, 0, 0, 0, Math.PI / 2, 0),
    place(mesh(GEO.sphere(0.03), glowMat(0xffffff, 0.9)), 0.2, 0.2, 0.1),
    place(mesh(GEO.sphere(0.022), glowMat(0xffffff, 0.9)), -0.24, 0.17, 0.06));
}

function icecream(): THREE.Group {
  return group(
    place(mesh(GEO.cone(0.2, 0.44, 14), matteMat(0xe6b86e)), 0, -0.04, 0, Math.PI, 0, 0),
    hoop(0.19, 0.028, 0xd7a355, 0.17),
    place(mesh(GEO.sphere(0.2), toyMat(P.cream)), 0, 0.2, 0),
    place(mesh(GEO.sphere(0.17), toyMat(P.softPink)), 0, 0.43, 0));
}

function cupcake(): THREE.Group {
  const g = group(place(mesh(GEO.cylinder(0.18, 0.26, 0.24, 16), toyMat(0xf2789f)), 0, -0.1, 0));
  g.add(hoop(0.25, 0.03, 0xe05a88, -0.21));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(place(mesh(GEO.box(0.02, 0.2, 0.02), matteMat(0xe05a88)), Math.cos(a) * 0.21, -0.1, Math.sin(a) * 0.21, 0, -a, 0));
  }
  g.add(
    place(mesh(GEO.sphere(0.19), toyMat(P.pink)), 0, 0.1, 0),
    place(mesh(GEO.sphere(0.15), toyMat(P.softPink)), 0, 0.25, 0),
    place(mesh(GEO.sphere(0.1), toyMat(P.pink)), 0, 0.37, 0),
    place(mesh(GEO.sphere(0.06), toyMat(P.deepRed)), 0, 0.46, 0));
  return g;
}

function lollipop(): THREE.Group {
  return group(
    place(mesh(GEO.cylinder(0.022, 0.022, 0.5, 8), matteMat(P.white)), 0, -0.12, 0),
    place(blob(0.24, P.red, 1, 1, 0.55), 0, 0.24, 0),
    place(mesh(GEO.torus(0.13, 0.035), toyMat(P.white)), 0, 0.24, 0.1),
    place(mesh(GEO.torus(0.06, 0.03), toyMat(P.white)), 0, 0.24, 0.12),
    place(mesh(GEO.sphere(0.03), toyMat(P.white)), 0, 0.24, 0.13));
}

/* meals ----------------------------------------------------------------- */

function pizza(): THREE.Group {
  const g = group(mesh(GEO.cylinder(0.37, 0.37, 0.05, 22), matteMat(P.dough)));
  g.add(hoop(0.35, 0.05, 0xd08f3c, 0.03));
  g.add(
    place(mesh(GEO.cylinder(0.3, 0.3, 0.03, 22), toyMat(0xd6412f)), 0, 0.04, 0),
    place(mesh(GEO.cylinder(0.3, 0.3, 0.02, 22), toyMat(P.cheese)), 0, 0.06, 0));
  const spots: Array<[number, number]> = [[0.15, 0.11], [-0.17, 0.03], [0.06, -0.17],
    [-0.06, 0.16], [0.18, -0.1], [-0.14, -0.15]];
  for (const [x, z] of spots) {
    g.add(place(blob(0.075, 0xc0392b, 1, 0.34, 1), x, 0.07, z));
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.4;
    g.add(place(mesh(GEO.box(0.05, 0.018, 0.05), matteMat(P.green)), Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2, 0, a, 0));
  }
  return g;
}

function burger(): THREE.Group {
  const g = group();
  g.add(
    place(mesh(GEO.cylinder(0.3, 0.29, 0.12, 18), matteMat(P.dough)), 0, -0.15, 0),
    place(mesh(GEO.cylinder(0.3, 0.3, 0.1, 18), toyMat(P.chocolate)), 0, -0.04, 0));
  const cheese = place(mesh(GEO.roundedBox(0.56, 0.035, 0.56, 0.015), toyMat(P.cheese)), 0, 0.03, 0, 0, Math.PI / 4, 0);
  const lettuce = mesh(GEO.torus(0.27, 0.055), toyMat(P.green));
  lettuce.rotation.x = Math.PI / 2;
  lettuce.position.y = 0.08;
  lettuce.scale.set(1, 1, 0.6);
  g.add(cheese, lettuce, place(blob(0.31, P.dough, 1, 0.6, 1), 0, 0.19, 0));
  for (let i = 0; i < 7; i++) {
    const y = 0.27 + (i % 2) * 0.05;
    const rr = 0.31 * Math.sqrt(Math.max(0, 1 - ((y - 0.19) * (y - 0.19)) / 0.0346));
    g.add(place(mesh(GEO.sphere(0.025), matteMat(P.cream)), Math.cos(i * 2.39996) * rr, y, Math.sin(i * 2.39996) * rr));
  }
  return g;
}

function sandwich(): THREE.Group {
  const specs: Array<[number, number, number, string, THREE.Material]> = [
    [0.5, 0.44, 0.1, 'bread-a', matteMat(P.tan)], [0.56, 0.5, 0.05, 'lettuce', toyMat(P.green)],
    [0.54, 0.48, 0.04, 'cheese', toyMat(P.cheese)], [0.5, 0.45, 0.06, 'ham', toyMat(0xf291a5)],
    [0.5, 0.44, 0.1, 'bread-b', matteMat(P.tan)],
  ];
  const inner = group();
  let z = 0;
  for (const [w, h, d, key, mat] of specs) {
    inner.add(place(mesh(GEO.extrude(triShape(w, h), d, `sand:${key}`), mat), 0, 0, z));
    z += d;
  }
  inner.rotation.x = -Math.PI / 2;
  return group(inner);
}

function hotdog(): THREE.Group {
  const bun = mesh(GEO.capsule(0.16, 0.42), matteMat(P.dough));
  const sausage = mesh(GEO.capsule(0.1, 0.42), toyMat(0xc9503a));
  bun.rotation.z = sausage.rotation.z = Math.PI / 2;
  bun.position.y = -0.06;
  sausage.position.y = 0.06;
  const parts: THREE.Object3D[] = [bun, sausage];
  for (let i = 0; i < 8; i++) {
    parts.push(place(mesh(GEO.sphere(0.032), toyMat(P.gold)), -0.26 + i * 0.075, 0.15, i % 2 ? 0.04 : -0.04));
  }
  return group(...parts);
}

function pancake(): THREE.Group {
  const g = group();
  for (let i = 0; i < 3; i++) {
    g.add(place(mesh(GEO.cylinder(0.3, 0.3, 0.11, 20), matteMat(i % 2 ? P.dough : 0xd0934c)), 0, -0.11 + i * 0.11, 0));
  }
  g.add(
    place(blob(0.29, 0xc4761f, 1, 0.28, 1), 0, 0.17, 0),
    place(mesh(GEO.roundedBox(0.15, 0.06, 0.15, 0.02), toyMat(P.cream)), 0, 0.24, 0, 0, 0.4, 0));
  return g;
}

function sushi(): THREE.Group {
  return group(
    blob(0.27, 0xfaf6ee, 1, 0.48, 0.7),
    place(mesh(GEO.roundedBox(0.5, 0.07, 0.3, 0.03), toyMat(P.salmon)), 0, 0.13, 0, 0, 0, 0.03),
    place(mesh(GEO.roundedBox(0.08, 0.3, 0.4, 0.02), matteMat(P.nori)), 0, 0.01, 0),
    place(mesh(GEO.sphere(0.03), matteMat(P.nori)), -0.05, 0.14, 0.15),
    place(mesh(GEO.sphere(0.03), matteMat(P.nori)), 0.06, 0.14, 0.16));
}

/* drinks + extras ------------------------------------------------------- */

function juice(): THREE.Group {
  return group(
    mesh(GEO.cylinder(0.21, 0.17, 0.44, 18), glassMat(0xcfeaff, 0.3)),
    place(mesh(GEO.cylinder(0.185, 0.15, 0.34, 18), toyMat(P.orange)), 0, -0.04, 0),
    place(mesh(GEO.cylinder(0.024, 0.024, 0.52, 8), toyMat(0xff5c5c)), 0.06, 0.16, 0.03, 0.1, 0, -0.3),
    place(mesh(GEO.sphere(0.03), glowMat(0xffd9a0, 0.5)), -0.06, -0.06, 0.04),
    place(mesh(GEO.sphere(0.024), glowMat(0xffd9a0, 0.5)), 0.05, 0.02, -0.05));
}

function milk(): THREE.Group {
  return group(
    mesh(GEO.roundedBox(0.34, 0.4, 0.34, 0.04), toyMat(P.white)),
    place(mesh(GEO.extrude(triShape(0.34, 0.16), 0.34, 'milk:roof'), toyMat(P.white)), 0, 0.2, -0.17),
    place(mesh(GEO.roundedBox(0.06, 0.05, 0.34, 0.02), toyMat(P.white)), 0, 0.37, 0),
    place(mesh(GEO.roundedBox(0.36, 0.14, 0.36, 0.03), toyMat(P.blue)), 0, -0.05, 0),
    place(mesh(GEO.circle(0.06), toyMat(P.red)), 0, 0.06, 0.176));
}

function icecube(): THREE.Group {
  const cube = mesh(GEO.roundedBox(0.5, 0.5, 0.5, 0.1), glassMat(P.ice, 0.5));
  cube.rotation.set(0.35, 0.6, 0.15);
  return group(cube,
    place(mesh(GEO.sphere(0.12), glowMat(0xffffff, 0.35)), 0, 0, 0),
    place(mesh(GEO.sphere(0.07), toyMat(P.white)), -0.13, 0.14, 0.16));
}

/* dispatch -------------------------------------------------------------- */

function build(kind: FoodKind): THREE.Group {
  switch (kind) {
    case 'apple': return apple();
    case 'banana': return banana();
    case 'strawberry': return strawberry();
    case 'grapes': return grapes();
    case 'orange': return orangeFruit();
    case 'watermelon': return watermelon();
    case 'cherry': return cherry();
    case 'lemon': return lemon();
    case 'carrot': return carrot();
    case 'tomato': return tomato();
    case 'broccoli': return broccoli();
    case 'corn': return corn();
    case 'cake': return cake();
    case 'donut': return donut();
    case 'cookie': return cookie();
    case 'candy': return candy();
    case 'icecream': return icecream();
    case 'cupcake': return cupcake();
    case 'lollipop': return lollipop();
    case 'pizza': return pizza();
    case 'burger': return burger();
    case 'sandwich': return sandwich();
    case 'hotdog': return hotdog();
    case 'pancake': return pancake();
    case 'sushi': return sushi();
    case 'juice': return juice();
    case 'milk': return milk();
    case 'icecube': return icecube();
    default: return group();
  }
}
