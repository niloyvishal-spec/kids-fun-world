import * as THREE from 'three';
import { glassMat, GEO, glowMat, group, matteMat, mesh, roundedBoxGeometry, toyMat } from '../materials';
import { wrapCharacter, type AnimatedCharacter, type CharacterRig } from '../animation';

/**
 * Procedural low-poly character library.
 *
 * Ten reusable characters (robot mascot, animals, cartoon children, friendly
 * monster, astronaut, chef and a princess) built from shared primitives - no
 * external model files. Every character is handed to `wrapCharacter()` so it
 * animates with the shared `AnimController`: idle, blink, walk, run, jump,
 * wave, dance, celebrate, happy, sad, sleep, interact.
 *
 *   const bunny = createCharacter('bunny', { scale: 1.4 });
 *   scene.add(bunny.root);
 *   bunny.play('run');
 *   bunny.update(dt);
 *
 * Convention: feet on y = 0, facing +Z, ~1.8 units tall for bipeds.
 * `rig.body` is the hip group (legs hang from it), `rig.head` sits above it
 * and `armL/armR/legL/legR` all pivot at their joints so the shared clips
 * swing them correctly. Quadrupeds map `arm*` to the front legs and `leg*` to
 * the back legs, which makes the shared trot cycle read naturally.
 */

export type CharacterKind =
  | 'robot'
  | 'bunny'
  | 'cat'
  | 'dog'
  | 'child'
  | 'monster'
  | 'astronaut'
  | 'chef'
  | 'bird'
  | 'princess';

export const CHARACTER_KINDS: readonly CharacterKind[] = [
  'robot', 'bunny', 'cat', 'dog', 'child', 'monster', 'astronaut', 'chef', 'bird', 'princess',
];

const EMOJI: Record<CharacterKind, string> = {
  robot: '🤖', bunny: '🐰', cat: '🐱', dog: '🐶', child: '🧒',
  monster: '👾', astronaut: '🧑‍🚀', chef: '👨‍🍳', bird: '🐦', princess: '👸',
};

const KIND_SET: ReadonlySet<string> = new Set<string>(CHARACTER_KINDS);

export function isCharacterKind(v: string): v is CharacterKind { return KIND_SET.has(v); }
export function characterEmoji(kind: CharacterKind): string { return EMOJI[kind]; }

export interface CharacterOpts {
  /** Primary body colour override. */
  color?: number;
  /** Uniform scale (default 1). */
  scale?: number;
  /** Include the kind's signature headwear (default true). */
  hat?: boolean;
  /** Add glasses (customisation, default false). */
  glasses?: boolean;
  /** Add a backpack (customisation, default false). */
  backpack?: boolean;
  /** Deterministic variation seed (unused variations are kept neutral). */
  seed?: number;
}

export type AccessoryName = 'hat' | 'glasses' | 'backpack' | 'shoes';

export interface CharacterHandle extends AnimatedCharacter {
  kind: CharacterKind;
  /** Bones customisation may swap in/out. */
  accessories: Partial<Record<AccessoryName, THREE.Object3D>>;
  /** Show or hide a mounted accessory. */
  setAccessory(name: AccessoryName, on: boolean): void;
  /** Re-tint the character's primary surfaces (per-instance material clone). */
  setPrimaryColor(hex: number): void;
  /** Detach from the scene. Shared geometry/materials are never freed. */
  dispose(): void;
}

interface Built {
  rig: CharacterRig;
  primary: THREE.Object3D[];
  accessories: Partial<Record<AccessoryName, THREE.Object3D>>;
  mounts: Partial<Record<AccessoryName, THREE.Object3D>>;
}

/** Quadrupeds always expose a tail. */
type QuadRig = CharacterRig & { tail: THREE.Object3D };

interface QuadBuilt extends Built {
  rig: QuadRig;
}

/* ------------------------------------------------------------------ */
/* shared part helpers                                                 */
/* ------------------------------------------------------------------ */

/** A limb whose pivot is the top joint: rotate it and the limb swings. */
function limb(len: number, rad: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const h = Math.max(0.04, len - rad * 2);
  const m = mesh(GEO.capsule(rad, h), toyMat(color));
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

/** Eye: a group centred on the eyeball so `scale.y` makes it blink. */
function eye(x: number, y: number, z: number, r: number, dark = 0x27303f): THREE.Group {
  const g = new THREE.Group();
  const white = mesh(GEO.sphere(r, 12), matteMat(0xffffff), { cast: false, receive: false });
  const pupil = mesh(GEO.sphere(r * 0.55, 10), matteMat(dark), { cast: false, receive: false });
  pupil.position.z = r * 0.58;
  const glint = mesh(GEO.sphere(r * 0.2, 8), glowMat(0xffffff, 0.8), { cast: false, receive: false });
  glint.position.set(r * 0.3, r * 0.3, r * 0.72);
  g.add(white, pupil, glint);
  g.position.set(x, y, z);
  return g;
}

function mouth(w: number, y: number, z: number, color = 0x7a3b3b): THREE.Mesh {
  const m = mesh(GEO.torus(w, 0.028), matteMat(color), { cast: false, receive: false });
  m.position.set(0, y, z);
  m.rotation.x = Math.PI;
  m.scale.set(1, 0.6, 1);
  return m;
}

function blush(x: number, y: number, z: number): THREE.Mesh {
  const m = mesh(GEO.circle(0.075, 10), matteMat(0xff9fb2, { opacity: 0.75, transparent: true }), { cast: false, receive: false });
  m.position.set(x, y, z);
  return m;
}

/** Small accessory builders (mount points recorded by the caller). */
function makeGlasses(color = 0x33364f): THREE.Group {
  const frame = toyMat(color);
  const l = mesh(GEO.torus(0.13, 0.032), frame);
  l.position.x = -0.16;
  const r = mesh(GEO.torus(0.13, 0.032), frame);
  r.position.x = 0.16;
  const bridge = mesh(GEO.box(0.1, 0.03, 0.03), frame);
  const lensL = mesh(GEO.circle(0.12, 12), glassMat(0x9be2ff, 0.32), { cast: false, receive: false });
  lensL.position.x = -0.16;
  const lensR = lensL.clone();
  lensR.position.x = 0.16;
  const g = group(l, r, bridge, lensL, lensR);
  g.userData.accessory = 'glasses';
  return g;
}

function makeBackpack(color = 0xff8fab): THREE.Group {
  const pack = mesh(roundedBoxGeometry(0.42, 0.5, 0.24, 0.08), toyMat(color));
  const pocket = mesh(roundedBoxGeometry(0.3, 0.2, 0.1, 0.05), toyMat(0xffd93d));
  pocket.position.set(0, -0.1, 0.14);
  const strapL = mesh(GEO.box(0.07, 0.4, 0.05), matteMat(0x33364f));
  strapL.position.set(-0.16, 0.05, 0.16);
  const strapR = strapL.clone();
  strapR.position.x = 0.16;
  const g = group(pack, pocket, strapL, strapR);
  g.userData.accessory = 'backpack';
  return g;
}

function makeShoe(color = 0x33364f): THREE.Object3D[] {
  const shoes: THREE.Object3D[] = [];
  for (let i = 0; i < 2; i++) {
    const s = mesh(roundedBoxGeometry(0.22, 0.14, 0.34, 0.06), toyMat(color));
    s.position.set(0, -0.07, 0.06);
    shoes.push(s);
  }
  return shoes;
}

/* ------------------------------------------------------------------ */
/* bipeds                                                              */
/* ------------------------------------------------------------------ */

interface BipedSpec {
  bodyColor: number;
  headColor: number;
  armColor: number;
  legColor: number;
  torsoGeo: 'box' | 'capsule';
  headShape: 'sphere' | 'box';
  eyeScale: number;
}

function buildBiped(spec: BipedSpec, opts: CharacterOpts): Built {
  const primary: THREE.Object3D[] = [];
  const rig: Partial<CharacterRig> = {};

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  root.add(body);

  const torso =
    spec.torsoGeo === 'box'
      ? mesh(roundedBoxGeometry(0.52, 0.56, 0.36, 0.12), toyMat(spec.bodyColor))
      : mesh(GEO.capsule(0.24, 0.3), toyMat(spec.bodyColor));
  torso.position.y = 0.28;
  body.add(torso);
  primary.push(torso);

  const head = new THREE.Group();
  head.position.y = 0.78;
  body.add(head);
  const skull =
    spec.headShape === 'box'
      ? mesh(roundedBoxGeometry(0.52, 0.46, 0.46, 0.14), toyMat(spec.headColor))
      : mesh(GEO.sphere(0.3, 16), toyMat(spec.headColor));
  head.add(skull);
  primary.push(skull);

  const e = spec.eyeScale;
  const eyes = [eye(-0.13 * e, 0.04, 0.26 * e, 0.075 * e), eye(0.13 * e, 0.04, 0.26 * e, 0.075 * e)];
  eyes.forEach((x) => head.add(x));
  head.add(mouth(0.07, -0.1, 0.27 * e));
  head.add(blush(-0.2 * e, -0.05, 0.22 * e), blush(0.2 * e, -0.05, 0.22 * e));

  const armL = limb(0.46, 0.085, spec.armColor);
  armL.position.set(-0.33, 0.5, 0);
  const armR = limb(0.46, 0.085, spec.armColor);
  armR.position.set(0.33, 0.5, 0);
  body.add(armL, armR);
  const handL = mesh(GEO.sphere(0.1, 10), toyMat(spec.headColor));
  handL.position.y = -0.46;
  armL.add(handL);
  const handR = handL.clone();
  armR.add(handR);

  const legL = limb(0.6, 0.1, spec.legColor);
  legL.position.set(-0.16, 0.02, 0);
  const legR = limb(0.6, 0.1, spec.legColor);
  legR.position.set(0.16, 0.02, 0);
  body.add(legL, legR);

  rig.root = root;
  rig.body = body;
  rig.head = head;
  rig.armL = armL;
  rig.armR = armR;
  rig.legL = legL;
  rig.legR = legR;
  rig.eyes = eyes;

  const shoes = makeShoe(0x33364f);
  legL.add(shoes[0]);
  legR.add(shoes[1]);

  const accessories: Partial<Record<AccessoryName, THREE.Object3D>> = {};
  const mounts: Partial<Record<AccessoryName, THREE.Object3D>> = {};
  mounts.glasses = head;
  mounts.backpack = body;
  const pack = makeBackpack(opts.color ? opts.color : 0xff8fab);
  pack.position.set(0, 0.3, -0.24);
  pack.rotation.y = Math.PI;
  accessories.backpack = pack;
  body.add(pack);
  accessories.shoes = shoes[0];

  return { rig: rig as CharacterRig, primary, accessories, mounts };
}

/* ------------------------------------------------------------------ */
/* quadrupeds                                                          */
/* ------------------------------------------------------------------ */

interface QuadSpec {
  bodyColor: number;
  bellyColor?: number;
  headColor?: number;
  legLength: number;
  bodyLen: number;
  headSize: number;
}

function buildQuadruped(spec: QuadSpec): QuadBuilt {
  const primary: THREE.Object3D[] = [];
  const rig: Partial<CharacterRig> = {};
  const headColor = spec.headColor ?? spec.bodyColor;

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = spec.legLength + 0.24;
  root.add(body);

  const torso = mesh(GEO.capsule(0.26, spec.bodyLen), toyMat(spec.bodyColor));
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  primary.push(torso);

  if (spec.bellyColor !== undefined) {
    const belly = mesh(GEO.capsule(0.2, spec.bodyLen * 0.7), toyMat(spec.bellyColor));
    belly.rotation.x = Math.PI / 2;
    belly.position.set(0, -0.12, 0.03);
    body.add(belly);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.24, spec.bodyLen * 0.5 + 0.24);
  body.add(head);
  const skull = mesh(GEO.sphere(spec.headSize, 16), toyMat(headColor));
  head.add(skull);
  primary.push(skull);

  const ey = spec.headSize * 0.16;
  const ez = spec.headSize * 0.85;
  const eyes = [
    eye(-spec.headSize * 0.4, ey, ez, spec.headSize * 0.24),
    eye(spec.headSize * 0.4, ey, ez, spec.headSize * 0.24),
  ];
  eyes.forEach((x) => head.add(x));

  // front legs -> armL/armR, back legs -> legL/legR (diagonal trot)
  const armL = limb(spec.legLength, 0.085, spec.bodyColor);
  armL.position.set(-0.17, 0.05, spec.bodyLen * 0.42);
  const armR = limb(spec.legLength, 0.085, spec.bodyColor);
  armR.position.set(0.17, 0.05, spec.bodyLen * 0.42);
  const legL = limb(spec.legLength, 0.09, spec.bodyColor);
  legL.position.set(-0.17, 0.05, -spec.bodyLen * 0.42);
  const legR = limb(spec.legLength, 0.09, spec.bodyColor);
  legR.position.set(0.17, 0.05, -spec.bodyLen * 0.42);
  body.add(armL, armR, legL, legR);

  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -spec.bodyLen * 0.5 - 0.16);
  body.add(tail);

  rig.root = root;
  rig.body = body;
  rig.head = head;
  rig.armL = armL;
  rig.armR = armR;
  rig.legL = legL;
  rig.legR = legR;
  rig.tail = tail;
  rig.eyes = eyes;

  return { rig: rig as QuadRig, primary, accessories: {}, mounts: {} };
}

/* ------------------------------------------------------------------ */
/* per-kind assembly                                                   */
/* ------------------------------------------------------------------ */

function buildRobot(opts: CharacterOpts): Built {
  const c = opts.color ?? 0x4aa3ff;
  const b = buildBiped(
    { bodyColor: c, headColor: 0xe8eef5, armColor: 0xc3ccd8, legColor: 0xaeb9c7, torsoGeo: 'box', headShape: 'box', eyeScale: 1 },
    opts
  );

  const head = b.rig.head;
  // visor
  const visor = mesh(roundedBoxGeometry(0.4, 0.2, 0.06, 0.06), toyMat(0x2b3a67));
  visor.position.set(0, 0.04, 0.23);
  head.add(visor);
  // antenna
  const stalk = mesh(GEO.cylinder(0.03, 0.03, 0.26, 8), matteMat(0x8e99a8));
  stalk.position.y = 0.34;
  const bulb = mesh(GEO.sphere(0.07, 10), glowMat(0xffd93d, 0.9));
  bulb.position.y = 0.5;
  head.add(stalk, bulb);
  // ears
  for (const s of [-1, 1]) {
    const ear = mesh(GEO.cylinder(0.07, 0.07, 0.09, 10), toyMat(0x8e99a8));
    ear.rotation.z = Math.PI / 2;
    ear.position.set(s * 0.3, 0.02, 0);
    head.add(ear);
  }
  // chest panel
  const panel = mesh(roundedBoxGeometry(0.3, 0.22, 0.05, 0.04), glowMat(0x4dd0e1, 0.55));
  panel.position.set(0, 0.3, 0.19);
  b.rig.body.add(panel);
  const dot = mesh(GEO.sphere(0.045, 8), glowMat(0xff5c7a, 0.9));
  dot.position.set(-0.08, 0.34, 0.22);
  b.rig.body.add(dot);

  // signature "hat": the antenna cap counts; also allow glasses
  b.accessories.glasses = makeGlasses(0x1f2340);
  b.accessories.glasses.position.set(0, 0.05, 0.27);
  b.mounts.glasses = head;
  if (opts.glasses !== false) head.add(b.accessories.glasses);
  return b;
}

function buildChild(opts: CharacterOpts, palette: { body: number; head: number; leg: number }): Built {
  const b = buildBiped(
    {
      bodyColor: opts.color ?? palette.body,
      headColor: palette.head,
      armColor: palette.head,
      legColor: palette.leg,
      torsoGeo: 'capsule',
      headShape: 'sphere',
      eyeScale: 1,
    },
    opts
  );
  // hair
  const hair = mesh(GEO.sphere(0.315, 16), matteMat(0x5b3a2a));
  hair.scale.set(1, 0.7, 1);
  hair.position.y = 0.12;
  b.rig.head.add(hair);
  const fringe = mesh(GEO.sphere(0.3, 12), matteMat(0x5b3a2a));
  fringe.scale.set(1, 0.35, 0.6);
  fringe.position.set(0, 0.17, 0.13);
  b.rig.head.add(fringe);
  return b;
}

function buildMonster(opts: CharacterOpts): Built {
  const c = opts.color ?? 0xa78bfa;
  const primary: THREE.Object3D[] = [];
  const rig: Partial<CharacterRig> = {};

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.5;
  root.add(body);

  const torso = mesh(GEO.sphere(0.46, 18), toyMat(c));
  torso.scale.set(1, 0.92, 0.94);
  torso.position.y = 0.3;
  body.add(torso);
  primary.push(torso);

  const belly = mesh(GEO.sphere(0.3, 14), toyMat(0xfff0cf));
  belly.scale.set(1, 0.8, 0.6);
  belly.position.set(0, 0.22, 0.3);
  body.add(belly);

  const head = new THREE.Group();
  head.position.y = 0.86;
  body.add(head);
  const skull = mesh(GEO.sphere(0.3, 16), toyMat(c));
  head.add(skull);
  primary.push(skull);

  // horns
  for (const s of [-1, 1]) {
    const horn = mesh(GEO.cone(0.08, 0.24, 8), toyMat(0xffd93d));
    horn.position.set(s * 0.18, 0.26, 0);
    horn.rotation.z = -s * 0.3;
    head.add(horn);
  }

  const eyes = [eye(-0.13, 0.06, 0.26, 0.085), eye(0.13, 0.06, 0.26, 0.085)];
  eyes.forEach((x) => head.add(x));
  const tooth = mesh(GEO.cone(0.04, 0.08, 6), matteMat(0xffffff));
  tooth.position.set(0.05, -0.12, 0.26);
  tooth.rotation.x = Math.PI;
  head.add(tooth, mouth(0.08, -0.09, 0.26, 0x5b2b4a));

  const armL = limb(0.4, 0.1, c);
  armL.position.set(-0.44, 0.5, 0);
  const armR = limb(0.4, 0.1, c);
  armR.position.set(0.44, 0.5, 0);
  body.add(armL, armR);
  for (const a of [armL, armR]) {
    const claw = mesh(GEO.sphere(0.11, 10), toyMat(0xffd93d));
    claw.position.y = -0.4;
    a.add(claw);
  }

  const legL = limb(0.46, 0.13, c);
  legL.position.set(-0.19, 0.04, 0);
  const legR = limb(0.46, 0.13, c);
  legR.position.set(0.19, 0.04, 0);
  body.add(legL, legR);

  // little tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.16, -0.42);
  const tuft = mesh(GEO.sphere(0.1, 10), toyMat(0xffd93d));
  tuft.position.z = -0.18;
  tail.add(tuft);
  body.add(tail);

  rig.root = root;
  rig.body = body;
  rig.head = head;
  rig.armL = armL;
  rig.armR = armR;
  rig.legL = legL;
  rig.legR = legR;
  rig.tail = tail;
  rig.eyes = eyes;

  const accessories: Partial<Record<AccessoryName, THREE.Object3D>> = {};
  const mounts: Partial<Record<AccessoryName, THREE.Object3D>> = { glasses: head, backpack: body };
  const pack = makeBackpack(0x4dd0e1);
  pack.position.set(0, 0.34, -0.34);
  pack.rotation.y = Math.PI;
  accessories.backpack = pack;
  body.add(pack);

  return { rig: rig as CharacterRig, primary, accessories, mounts };
}

function buildAstronaut(opts: CharacterOpts): Built {
  const b = buildBiped(
    { bodyColor: opts.color ?? 0xf2f4f8, headColor: 0xf2f4f8, armColor: 0xe2e6ee, legColor: 0xdfe4ec, torsoGeo: 'box', headShape: 'sphere', eyeScale: 1 },
    opts
  );
  const head = b.rig.head;
  // helmet shell
  const shell = mesh(GEO.sphere(0.38, 16), glassMat(0x9be2ff, 0.28), { cast: false, receive: false });
  head.add(shell);
  const ring = mesh(GEO.torus(0.3, 0.04), toyMat(0xc9d2de));
  ring.position.y = -0.24;
  ring.rotation.x = Math.PI / 2;
  head.add(ring);
  // suit details
  const stripe = mesh(GEO.box(0.5, 0.1, 0.38), toyMat(0xff5c7a));
  stripe.position.y = 0.16;
  b.rig.body.add(stripe);
  const badge = mesh(GEO.circle(0.08, 12), glowMat(0x4dd0e1, 0.5));
  badge.position.set(-0.14, 0.34, 0.185);
  b.rig.body.add(badge);
  // life-support backpack
  const pack = makeBackpack(0xdfe4ec);
  pack.position.set(0, 0.3, -0.26);
  pack.rotation.y = Math.PI;
  b.accessories.backpack = pack;
  b.rig.body.add(pack);
  b.mounts.backpack = b.rig.body;
  b.accessories.glasses = makeGlasses(0x1f2340);
  b.accessories.glasses.position.set(0, 0.04, 0.27);
  if (opts.glasses) head.add(b.accessories.glasses);
  return b;
}

function buildChef(opts: CharacterOpts): Built {
  const b = buildChild(opts, { body: 0xffffff, head: 0xffd7b0, leg: 0x4aa3ff });
  const head = b.rig.head;
  if (opts.hat !== false) {
    const hat = new THREE.Group();
    const band = mesh(GEO.cylinder(0.24, 0.24, 0.12, 14), matteMat(0xf6f7fb));
    band.position.y = 0.26;
    const crown = mesh(GEO.cylinder(0.26, 0.22, 0.24, 14), matteMat(0xffffff));
    crown.position.y = 0.42;
    hat.add(band, crown);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const puff = mesh(GEO.sphere(0.13, 10), matteMat(0xffffff));
      puff.position.set(Math.cos(a) * 0.17, 0.56, Math.sin(a) * 0.17);
      hat.add(puff);
    }
    const top = mesh(GEO.sphere(0.15, 10), matteMat(0xffffff));
    top.position.y = 0.6;
    hat.add(top);
    head.add(hat);
    b.accessories.hat = hat;
    b.mounts.hat = head;
  }
  // apron + buttons
  const apron = mesh(roundedBoxGeometry(0.4, 0.34, 0.06, 0.05), toyMat(0xff8fab));
  apron.position.set(0, 0.22, 0.18);
  b.rig.body.add(apron);
  b.accessories.glasses = makeGlasses(0x8a5a3b);
  b.accessories.glasses.position.set(0, 0.05, 0.27);
  b.mounts.glasses = head;
  if (opts.glasses) head.add(b.accessories.glasses);
  return b;
}

function buildPrincess(opts: CharacterOpts): Built {
  const b = buildChild(opts, { body: 0xff8fab, head: 0xffe0c4, leg: 0xff8fab });
  const head = b.rig.head;
  // dress skirt
  const skirt = mesh(GEO.cone(0.4, 0.5, 14), toyMat(opts.color ?? 0xb388ff));
  skirt.position.y = -0.2;
  b.rig.body.add(skirt);
  b.primary.push(skirt);

  if (opts.hat !== false) {
    const crown = new THREE.Group();
    const band = mesh(GEO.cylinder(0.2, 0.2, 0.09, 14), toyMat(0xffd93d, { emissive: 0xffa94d, emissiveIntensity: 0.35 }));
    band.position.y = 0.24;
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = mesh(GEO.cone(0.05, 0.14, 6), toyMat(0xffd93d, { emissive: 0xffa94d, emissiveIntensity: 0.35 }));
      spike.position.set(Math.cos(a) * 0.17, 0.35, Math.sin(a) * 0.17);
      crown.add(spike);
    }
    head.add(crown);
    b.accessories.hat = crown;
    b.mounts.hat = head;
  }
  b.accessories.glasses = makeGlasses(0xff5c7a);
  b.accessories.glasses.position.set(0, 0.05, 0.27);
  b.mounts.glasses = head;
  if (opts.glasses) head.add(b.accessories.glasses);
  return b;
}

function buildBunny(opts: CharacterOpts): QuadBuilt {
  const c = opts.color ?? 0xf7f4ef;
  const b = buildQuadruped({ bodyColor: c, bellyColor: 0xffe9ee, legLength: 0.44, bodyLen: 0.5, headSize: 0.27 });
  const head = b.rig.head;
  // long ears
  const ears = new THREE.Group();
  for (const s of [-1, 1]) {
    const outer = mesh(GEO.capsule(0.07, 0.42), toyMat(c));
    outer.position.set(s * 0.12, 0.44, -0.02);
    outer.rotation.z = -s * 0.18;
    const inner = mesh(GEO.capsule(0.04, 0.3), matteMat(0xffb6c9));
    inner.position.copy(outer.position);
    inner.position.z += 0.045;
    inner.rotation.copy(outer.rotation);
    ears.add(outer, inner);
  }
  head.add(ears);
  // muzzle + nose
  const muzzle = mesh(GEO.sphere(0.11, 12), matteMat(0xffffff));
  muzzle.position.set(0, -0.06, 0.24);
  muzzle.scale.set(1, 0.8, 0.9);
  head.add(muzzle);
  const nose = mesh(GEO.sphere(0.045, 8), matteMat(0xff8fab));
  nose.position.set(0, -0.01, 0.33);
  head.add(nose, mouth(0.05, -0.1, 0.3, 0xc98a9b));
  head.add(blush(-0.19, -0.03, 0.16), blush(0.19, -0.03, 0.16));
  // cotton tail
  const puff = mesh(GEO.sphere(0.12, 10), matteMat(0xffffff));
  puff.position.z = -0.06;
  b.rig.tail.add(puff);
  return b;
}

function buildCat(opts: CharacterOpts): QuadBuilt {
  const c = opts.color ?? 0xffb35c;
  const b = buildQuadruped({ bodyColor: c, bellyColor: 0xfff0cf, legLength: 0.42, bodyLen: 0.52, headSize: 0.26 });
  const head = b.rig.head;
  for (const s of [-1, 1]) {
    const ear = mesh(GEO.cone(0.11, 0.2, 4), toyMat(c));
    ear.position.set(s * 0.16, 0.24, -0.02);
    ear.rotation.z = -s * 0.18;
    const inner = mesh(GEO.cone(0.06, 0.12, 4), matteMat(0xffb6c9));
    inner.position.set(s * 0.16, 0.24, 0.02);
    inner.rotation.z = -s * 0.18;
    head.add(ear, inner);
  }
  const muzzle = mesh(GEO.sphere(0.1, 12), matteMat(0xfff4e4));
  muzzle.position.set(0, -0.06, 0.23);
  muzzle.scale.set(1.1, 0.8, 0.9);
  head.add(muzzle);
  const nose = mesh(GEO.cone(0.04, 0.05, 3), matteMat(0xff6f9c));
  nose.position.set(0, -0.01, 0.32);
  nose.rotation.x = Math.PI;
  head.add(nose, mouth(0.05, -0.1, 0.29, 0x8a5a5a));
  // whiskers
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const w = mesh(GEO.box(0.16, 0.012, 0.012), matteMat(0xffffff), { cast: false, receive: false });
      w.position.set(s * 0.19, -0.05 + i * 0.05, 0.24);
      w.rotation.z = s * (0.16 - i * 0.3);
      head.add(w);
    }
  }
  // long tail: three segments so it curves
  const seg1 = mesh(GEO.capsule(0.055, 0.24), toyMat(c));
  seg1.rotation.x = Math.PI / 2;
  seg1.position.z = -0.14;
  const tip = mesh(GEO.sphere(0.07, 10), matteMat(0xfff0cf));
  tip.position.z = -0.3;
  b.rig.tail.add(seg1, tip);
  return b;
}

function buildDog(opts: CharacterOpts): QuadBuilt {
  const c = opts.color ?? 0xd9a45f;
  const b = buildQuadruped({ bodyColor: c, bellyColor: 0xfff0cf, legLength: 0.42, bodyLen: 0.54, headSize: 0.27 });
  const head = b.rig.head;
  // floppy ears
  for (const s of [-1, 1]) {
    const ear = mesh(GEO.capsule(0.08, 0.2), toyMat(0x8a5a3b));
    ear.position.set(s * 0.24, 0.06, -0.02);
    ear.rotation.z = s * 0.5;
    ear.scale.set(1, 1, 0.55);
    head.add(ear);
  }
  const muzzle = mesh(GEO.sphere(0.13, 12), matteMat(0xfff4e4));
  muzzle.position.set(0, -0.06, 0.25);
  muzzle.scale.set(1.05, 0.85, 1);
  head.add(muzzle);
  const nose = mesh(GEO.sphere(0.055, 8), matteMat(0x2b2f45));
  nose.position.set(0, -0.02, 0.37);
  head.add(nose, mouth(0.055, -0.12, 0.32, 0x6b4636));
  const tongue = mesh(GEO.box(0.07, 0.1, 0.03), matteMat(0xff7ba6));
  tongue.position.set(0, -0.17, 0.31);
  head.add(tongue);
  head.add(blush(-0.2, -0.02, 0.16), blush(0.2, -0.02, 0.16));
  // wagging tail (segments)
  const seg = mesh(GEO.capsule(0.06, 0.2), toyMat(c));
  seg.rotation.x = Math.PI / 2;
  seg.position.z = -0.12;
  const tipm = mesh(GEO.sphere(0.07, 10), matteMat(0xfff0cf));
  tipm.position.z = -0.26;
  b.rig.tail.add(seg, tipm);
  return b;
}

function buildBird(opts: CharacterOpts): QuadBuilt {
  const c = opts.color ?? 0xffd93d;
  const b = buildQuadruped({ bodyColor: c, legLength: 0.3, bodyLen: 0.34, headSize: 0.24 });
  const head = b.rig.head;
  const beak = mesh(GEO.cone(0.07, 0.16, 6), toyMat(0xffa94d));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.02, 0.3);
  head.add(beak);
  const tuft = mesh(GEO.cone(0.05, 0.16, 6), toyMat(c));
  tuft.position.set(0, 0.26, -0.03);
  head.add(tuft);
  // wings instead of arms
  for (const [g, s] of [[b.rig.armL, -1], [b.rig.armR, 1]] as [THREE.Object3D | undefined, number][]) {
    if (!g) continue;
    const wing = mesh(GEO.sphere(0.16, 12), toyMat(c));
    wing.scale.set(0.35, 0.5, 1.1);
    wing.position.set(s * 0.04, -0.2, -0.02);
    g.add(wing);
  }
  // tail feathers
  for (let i = -1; i <= 1; i++) {
    const f = mesh(GEO.cone(0.05, 0.22, 5), toyMat(c));
    f.rotation.x = -Math.PI / 2;
    f.rotation.z = i * 0.3;
    f.position.set(i * 0.07, 0, -0.18);
    b.rig.tail.add(f);
  }
  // bird legs read better as thin
  return b;
}

/* ------------------------------------------------------------------ */
/* assembly                                                            */
/* ------------------------------------------------------------------ */

function buildKind(kind: CharacterKind, opts: CharacterOpts): Built {
  switch (kind) {
    case 'robot': return buildRobot(opts);
    case 'child': return buildChild(opts, { body: 0x6bcb77, head: 0xffd7b0, leg: 0x4aa3ff });
    case 'monster': return buildMonster(opts);
    case 'astronaut': return buildAstronaut(opts);
    case 'chef': return buildChef(opts);
    case 'princess': return buildPrincess(opts);
    case 'bunny': return buildBunny(opts);
    case 'cat': return buildCat(opts);
    case 'dog': return buildDog(opts);
    case 'bird': return buildBird(opts);
  }
}

export function createCharacter(kind: CharacterKind, opts: CharacterOpts = {}): CharacterHandle {
  const built = buildKind(kind, opts);
  const handle = wrapCharacter(built.rig) as CharacterHandle;
  const accessoryState: Partial<Record<AccessoryName, boolean>> = {
    glasses: !!opts.glasses,
    backpack: !!opts.backpack,
    hat: opts.hat !== false && !!built.accessories.hat,
    shoes: true,
  };

  // clone primary materials so per-instance tinting never mutates the cache
  const primaryMeshes: THREE.Mesh[] = [];
  for (const o of built.primary) {
    o.traverse((n) => {
      const m = n as THREE.Mesh;
      if (m.isMesh && m.material) {
        const src = m.material as THREE.MeshPhongMaterial;
        const clone = src.clone();
        clone.userData = { ...src.userData, shared: false };
        m.material = clone;
        primaryMeshes.push(m);
      }
    });
  }

  handle.kind = kind;
  handle.accessories = built.accessories;
  handle.setAccessory = (name, on) => {
    const obj = built.accessories[name];
    const mount = built.mounts[name];
    if (!obj || !mount) return;
    accessoryState[name] = on;
    if (on) {
      if (obj.parent !== mount) mount.add(obj);
    } else {
      obj.removeFromParent();
    }
  };
  handle.setPrimaryColor = (hex) => {
    for (const m of primaryMeshes) {
      const mat = m.material as THREE.MeshPhongMaterial;
      if (mat.color) mat.color.setHex(hex);
    }
  };
  handle.dispose = () => {
    handle.root.removeFromParent();
    handle.anim.reset();
    for (const m of primaryMeshes) (m.material as THREE.Material)?.dispose?.();
    primaryMeshes.length = 0;
  };

  // apply the initial accessory configuration
  handle.setAccessory('glasses', accessoryState.glasses === true);
  handle.setAccessory('backpack', accessoryState.backpack === true);
  handle.setAccessory('hat', accessoryState.hat === true);

  if (opts.scale) handle.root.scale.multiplyScalar(opts.scale);
  handle.root.userData.pick = true;
  handle.root.userData.character = kind;
  return handle;
}
