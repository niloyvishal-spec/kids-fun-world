import * as THREE from 'three';
import { GEO, cachedGeo, glassMat, glowMat, matteMat, mesh, roundedBoxGeometry, toyMat } from '../materials';

/**
 * Reusable 3D vehicle library - ten procedural low-poly vehicles (racing car,
 * bus, truck, go-kart, monster truck, futuristic car, rocket, plane, boat and
 * train) built from shared primitives with no external model files.
 *
 *   const car = createVehicle('racingCar', { color: 0xff5c7a });
 *   scene.add(car.root);
 *   car.steer(input);            // front wheels pivot
 *   car.spinWheels(speed * dt);  // all wheels rotate about their axle
 *   car.setBodyRoll(lean);       // cornering / acceleration lean
 *
 * Convention: ground contact at y = 0, vehicle faces +Z. Every animated part
 * lives under `root.userData.body`, so gameplay can move `root` freely while
 * steering, wheel spin and body roll keep working.
 */

export type VehicleKind =
  | 'racingCar'
  | 'bus'
  | 'truck'
  | 'kart'
  | 'monsterTruck'
  | 'futureCar'
  | 'rocket'
  | 'plane'
  | 'boat'
  | 'train';

export const VEHICLE_KINDS: readonly VehicleKind[] = [
  'racingCar', 'bus', 'truck', 'kart', 'monsterTruck', 'futureCar', 'rocket', 'plane', 'boat', 'train',
];

const EMOJI: Record<VehicleKind, string> = {
  racingCar: '🏎️', bus: '🚌', truck: '🚚', kart: '🏎️', monsterTruck: '🚙',
  futureCar: '🛸', rocket: '🚀', plane: '✈️', boat: '⛵', train: '🚂',
};

const KIND_SET: ReadonlySet<string> = new Set<string>(VEHICLE_KINDS);

export function isVehicleKind(v: string): v is VehicleKind { return KIND_SET.has(v); }
export function vehicleEmoji(kind: VehicleKind): string { return EMOJI[kind]; }

export interface VehicleOpts {
  /** Paint colour override. */
  color?: number;
  /** Uniform scale (default 1). */
  scale?: number;
  /** Trim / stripe colour. */
  accent?: number;
}

export interface VehicleHandle {
  root: THREE.Group;
  kind: VehicleKind;
  /** Wheel pivots (tires). Empty for boat / rocket. */
  wheels: THREE.Object3D[];
  /** Front wheels used for steering (subset of `wheels`). */
  steerWheels: THREE.Object3D[];
  /** Spin every wheel about its own axle by `rad` radians. */
  spinWheels(rad: number): void;
  /** Steer the front wheels (radians, clamped to +/-0.6). */
  steer(angleRad: number): void;
  /** Body roll (z) + optional pitch (x) in radians. */
  setBodyRoll(zRad: number, pitchRad?: number): void;
  /** Toggle head / tail lights. */
  setLights(on: boolean): void;
  /** Exhaust flame group (rocket, futureCar). */
  boost?: THREE.Object3D;
  setBoost(on: boolean): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* wheels                                                              */
/* ------------------------------------------------------------------ */

export interface Wheel {
  pivot: THREE.Group;
  spin: THREE.Group;
}

/** Wheel whose pivot sits at the hub; `spin` rotates about the axle (X). */
export function createWheel(radius: number, width: number, rimColor = 0xf0f3f8): Wheel {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);

  const tire = mesh(GEO.cylinder(radius, radius, width, 16), matteMat(0x2b2f45));
  tire.rotation.z = Math.PI / 2;
  spin.add(tire);

  const shoulderL = mesh(GEO.torus(radius * 0.86, width * 0.16), matteMat(0x1f2340));
  shoulderL.rotation.y = Math.PI / 2;
  shoulderL.position.x = width * 0.5;
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = -width * 0.5;
  spin.add(shoulderL, shoulderR);

  const rim = mesh(GEO.cylinder(radius * 0.56, radius * 0.56, width * 1.04, 12), toyMat(rimColor));
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spoke = mesh(GEO.box(width * 1.1, radius * 0.16, radius * 0.16), matteMat(0x9aa4b4));
    spoke.rotation.x = a;
    spin.add(spoke);
  }
  const hub = mesh(GEO.sphere(radius * 0.2, 8), glowMat(0xffd93d, 0.35));
  hub.position.x = width * 0.56;
  const hub2 = hub.clone();
  hub2.position.x = -width * 0.56;
  spin.add(hub, hub2);
  return { pivot, spin };
}

/* ------------------------------------------------------------------ */
/* shared part helpers                                                 */
/* ------------------------------------------------------------------ */

interface BuildCtx {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
  steerWheels: THREE.Group[];
  lights: THREE.MeshPhongMaterial[];
  boost?: THREE.Object3D;
}

function newCtx(): BuildCtx {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.userData.body = body;
  return { root, body, wheels: [], steerWheels: [], lights: [] };}

function addWheel(ctx: BuildCtx, r: number, w: number, x: number, z: number, steer: boolean, rim = 0xf0f3f8): void {
  const wh = createWheel(r, w, rim);
  wh.pivot.position.set(x, r, z);
  ctx.body.add(wh.pivot);
  ctx.wheels.push(wh.pivot);
  if (steer) ctx.steerWheels.push(wh.pivot);
}

function lightMat(color: number): THREE.MeshPhongMaterial {
  const m = new THREE.MeshPhongMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.85,
    shininess: 80,
  });
  return m;
}

function addHeadlights(ctx: BuildCtx, y: number, z: number, spread: number): void {
  for (const s of [-1, 1]) {
    const m = lightMat(0xfff8d6);
    ctx.lights.push(m);
    const lamp = mesh(GEO.sphere(0.13, 10), m);
    lamp.position.set(s * spread, y, z);
    lamp.scale.set(1, 0.8, 0.6);
    ctx.body.add(lamp);
  }
}

function addTaillights(ctx: BuildCtx, y: number, z: number, spread: number): void {
  for (const s of [-1, 1]) {
    const m = lightMat(0xff3b30);
    ctx.lights.push(m);
    const lamp = mesh(GEO.box(0.24, 0.13, 0.08), m);
    lamp.position.set(s * spread, y, z);
    ctx.body.add(lamp);
  }
}

function setEmissive(ctx: BuildCtx, on: boolean): void {
  for (const m of ctx.lights) m.emissiveIntensity = on ? 0.85 : 0.08;
}

function buildFlame(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const outer = mesh(GEO.cone(0.22 * scale, 0.7 * scale, 10), glowMat(0xff8c1a, 0.95), { cast: false, receive: false });
  outer.rotation.x = -Math.PI / 2;
  outer.position.z = -0.34 * scale;
  const inner = mesh(GEO.cone(0.12 * scale, 0.42 * scale, 8), glowMat(0xfff0a8, 1), { cast: false, receive: false });
  inner.rotation.x = -Math.PI / 2;
  inner.position.z = -0.2 * scale;
  g.add(outer, inner);
  return g;
}

function glass(w: number, h: number): THREE.Mesh {
  const m = toyMat(0x9be2ff, {
    opacity: 0.55, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    emissive: 0x9be2ff, emissiveIntensity: 0.12,
  });
  return mesh(GEO.plane(w, h), m, { cast: false, receive: false });
}

/* ------------------------------------------------------------------ */
/* kinds                                                               */
/* ------------------------------------------------------------------ */

function buildRacingCar(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;

  const chassis = mesh(roundedBoxGeometry(1.24, 0.34, 2.5, 0.14), toyMat(color));
  chassis.position.y = 0.44;
  b.add(chassis);

  const nose = mesh(roundedBoxGeometry(1.0, 0.24, 0.7, 0.1), toyMat(color));
  nose.position.set(0, 0.38, 1.15);
  nose.rotation.x = 0.12;
  b.add(nose);

  const cabin = mesh(roundedBoxGeometry(1.04, 0.4, 1.1, 0.14), toyMat(color));
  cabin.position.set(0, 0.74, -0.22);
  b.add(cabin);

  const windshield = glass(0.94, 0.42);
  windshield.position.set(0, 0.76, 0.36);
  windshield.rotation.x = -0.5;
  b.add(windshield);

  const sideL = glass(0.9, 0.3);
  sideL.position.set(-0.53, 0.76, -0.22);
  sideL.rotation.y = -Math.PI / 2;
  const sideR = sideL.clone();
  sideR.position.x = 0.53;
  sideR.rotation.y = Math.PI / 2;
  b.add(sideL, sideR);

  const rearGlass = glass(0.9, 0.34);
  rearGlass.position.set(0, 0.78, -0.78);
  rearGlass.rotation.x = 0.45;
  b.add(rearGlass);

  // racing stripe over the top
  const stripe = mesh(GEO.box(0.26, 0.04, 2.4), toyMat(accent));
  stripe.position.set(0, 0.63, 0.1);
  b.add(stripe);

  // number panel
  const panel = mesh(GEO.circle(0.24, 16), toyMat(0xffffff));
  panel.rotation.y = Math.PI / 2;
  panel.position.set(0.63, 0.5, 0.1);
  b.add(panel);
  const panel2 = panel.clone();
  panel2.rotation.y = -Math.PI / 2;
  panel2.position.x = -0.63;
  b.add(panel2);

  // spoiler
  const wing = mesh(roundedBoxGeometry(1.3, 0.08, 0.4, 0.03), toyMat(accent));
  wing.position.set(0, 0.94, -1.16);
  const postL = mesh(GEO.box(0.08, 0.3, 0.1), matteMat(0x2b2f45));
  postL.position.set(-0.42, 0.78, -1.14);
  const postR = postL.clone();
  postR.position.x = 0.42;
  b.add(wing, postL, postR);

  // side mirrors
  for (const s of [-1, 1]) {
    const mirror = mesh(GEO.roundedBox(0.16, 0.1, 0.08, 0.03), toyMat(accent));
    mirror.position.set(s * 0.68, 0.78, 0.28);
    b.add(mirror);
  }

  addHeadlights(ctx, 0.46, 1.44, 0.4);
  addTaillights(ctx, 0.55, -1.27, 0.42);

  const exhaust = mesh(GEO.cylinder(0.07, 0.08, 0.2, 8), matteMat(0x9aa4b4));
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.4, 0.3, -1.3);
  b.add(exhaust);

  addWheel(ctx, 0.34, 0.24, -0.64, 0.82, true, 0xfff0c4);
  addWheel(ctx, 0.34, 0.24, 0.64, 0.82, true, 0xfff0c4);
  addWheel(ctx, 0.34, 0.26, -0.64, -0.84, false, 0xfff0c4);
  addWheel(ctx, 0.34, 0.26, 0.64, -0.84, false, 0xfff0c4);
}

function buildBus(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const shell = mesh(roundedBoxGeometry(1.6, 1.5, 4.4, 0.22), toyMat(color));
  shell.position.y = 1.15;
  b.add(shell);
  const band = mesh(GEO.box(1.63, 0.22, 4.3), toyMat(accent));
  band.position.y = 0.7;
  b.add(band);
  // window band
  const winMat = glassMat(0x9be2ff, 0.62);
  for (const s of [-1, 1]) {
    const win = mesh(GEO.box(0.06, 0.5, 3.7), winMat);
    win.position.set(s * 0.8, 1.45, -0.1);
    b.add(win);
  }
  const front = glass(1.3, 0.62);
  front.position.set(0, 1.5, 2.21);
  b.add(front);
  const rear = glass(1.3, 0.55);
  rear.position.set(0, 1.5, -2.21);
  rear.rotation.y = Math.PI;
  b.add(rear);
  addHeadlights(ctx, 0.7, 2.24, 0.55);
  addTaillights(ctx, 1.0, -2.24, 0.6);
  for (const [x, z, steer] of [[-0.78, 1.5, true], [0.78, 1.5, true], [-0.78, -1.4, false], [0.78, -1.4, false]] as [number, number, boolean][]) {
    addWheel(ctx, 0.44, 0.26, x, z, steer, 0xdfe4ec);
  }
}

function buildTruck(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const cab = mesh(roundedBoxGeometry(1.5, 1.2, 1.5, 0.2), toyMat(color));
  cab.position.set(0, 1.0, 1.5);
  b.add(cab);
  const hood = mesh(roundedBoxGeometry(1.3, 0.5, 0.8, 0.14), toyMat(color));
  hood.position.set(0, 0.6, 2.3);
  b.add(hood);
  const windshield = glass(1.2, 0.55);
  windshield.position.set(0, 1.3, 2.24);
  windshield.rotation.x = -0.2;
  b.add(windshield);
  const cargo = mesh(roundedBoxGeometry(1.7, 1.6, 3.0, 0.12), toyMat(accent));
  cargo.position.set(0, 1.2, -0.9);
  b.add(cargo);
  const frame = mesh(GEO.box(1.2, 0.2, 4.6), matteMat(0x2b2f45));
  frame.position.y = 0.5;
  b.add(frame);
  addHeadlights(ctx, 0.66, 2.72, 0.45);
  addTaillights(ctx, 1.4, -2.42, 0.65);
  for (const [x, z, steer] of [[-0.76, 1.7, true], [0.76, 1.7, true], [-0.76, -1.7, false], [0.76, -1.7, false]] as [number, number, boolean][]) {
    addWheel(ctx, 0.45, 0.28, x, z, steer, 0x9aa4b4);
  }
}

function buildKart(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const floor = mesh(roundedBoxGeometry(0.9, 0.14, 1.9, 0.06), matteMat(0x2b2f45));
  floor.position.y = 0.3;
  b.add(floor);
  const seat = mesh(roundedBoxGeometry(0.6, 0.5, 0.5, 0.12), toyMat(color));
  seat.position.set(0, 0.6, -0.3);
  b.add(seat);
  const backrest = mesh(roundedBoxGeometry(0.6, 0.5, 0.14, 0.06), toyMat(color));
  backrest.position.set(0, 0.86, -0.54);
  backrest.rotation.x = -0.2;
  b.add(backrest);
  const nose = mesh(roundedBoxGeometry(0.8, 0.2, 0.7, 0.08), toyMat(accent));
  nose.position.set(0, 0.36, 0.85);
  b.add(nose);
  // exposed steering column
  const column = mesh(GEO.cylinder(0.04, 0.04, 0.6, 8), matteMat(0x9aa4b4));
  column.position.set(0, 0.62, 0.34);
  column.rotation.x = -0.55;
  b.add(column);
  const wheelRing = mesh(GEO.torus(0.18, 0.035), matteMat(0x2b2f45));
  wheelRing.position.set(0, 0.86, 0.18);
  wheelRing.rotation.x = 1.0;
  b.add(wheelRing);
  // side pods
  for (const s of [-1, 1]) {
    const pod = mesh(roundedBoxGeometry(0.22, 0.28, 1.0, 0.08), toyMat(accent));
    pod.position.set(s * 0.5, 0.42, 0);
    b.add(pod);
  }
  addHeadlights(ctx, 0.4, 1.2, 0.3);
  addTaillights(ctx, 0.5, -1.0, 0.32);
  addWheel(ctx, 0.28, 0.18, -0.56, 0.72, true, 0xfff0c4);
  addWheel(ctx, 0.28, 0.18, 0.56, 0.72, true, 0xfff0c4);
  addWheel(ctx, 0.3, 0.22, -0.58, -0.7, false, 0xfff0c4);
  addWheel(ctx, 0.3, 0.22, 0.58, -0.7, false, 0xfff0c4);
}

function buildMonsterTruck(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const chassis = mesh(GEO.box(1.3, 0.28, 3.0), matteMat(0x3a4152));
  chassis.position.y = 1.15;
  b.add(chassis);
  const cab = mesh(roundedBoxGeometry(1.3, 0.8, 1.4, 0.16), toyMat(color));
  cab.position.set(0, 1.7, 0.3);
  b.add(cab);
  const bed = mesh(roundedBoxGeometry(1.4, 0.6, 1.5, 0.1), toyMat(accent));
  bed.position.set(0, 1.55, -1.1);
  b.add(bed);
  const windshield = glass(1.1, 0.5);
  windshield.position.set(0, 1.85, 1.02);
  windshield.rotation.x = -0.3;
  b.add(windshield);
  // roll bar
  const bar = mesh(GEO.torus(0.55, 0.05), matteMat(0x9aa4b4));
  bar.position.set(0, 2.0, -0.55);
  bar.rotation.y = Math.PI / 2;
  b.add(bar);
  // suspension struts
  for (const [x, z] of [[-0.7, 1.1], [0.7, 1.1], [-0.7, -1.1], [0.7, -1.1]]) {
    const strut = mesh(GEO.cylinder(0.06, 0.06, 0.7, 8), matteMat(0xffd93d));
    strut.position.set(x, 0.8, z);
    b.add(strut);
  }
  addHeadlights(ctx, 1.4, 1.55, 0.45);
  addTaillights(ctx, 1.7, -1.85, 0.55);
  addWheel(ctx, 0.72, 0.44, -0.85, 1.1, true, 0x9aa4b4);
  addWheel(ctx, 0.72, 0.44, 0.85, 1.1, true, 0x9aa4b4);
  addWheel(ctx, 0.72, 0.44, -0.85, -1.1, false, 0x9aa4b4);
  addWheel(ctx, 0.72, 0.44, 0.85, -1.1, false, 0x9aa4b4);
}

function buildFutureCar(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const hull = mesh(roundedBoxGeometry(1.3, 0.4, 2.7, 0.2), toyMat(color));
  hull.position.y = 0.5;
  hull.rotation.x = 0.03;
  b.add(hull);
  const wedge = mesh(GEO.cone(0.7, 1.1, 4), toyMat(color));
  wedge.rotation.x = Math.PI / 2;
  wedge.rotation.y = Math.PI / 4;
  wedge.position.set(0, 0.52, 1.5);
  wedge.scale.set(1.1, 0.5, 0.7);
  b.add(wedge);
  const canopy = mesh(GEO.sphere(0.55, 16), glassMat(0x9be2ff, 0.55), { cast: false, receive: false });
  canopy.scale.set(0.9, 0.55, 1.2);
  canopy.position.set(0, 0.78, -0.15);
  b.add(canopy);
  // underglow
  const glow = mesh(GEO.plane(1.1, 2.4), glowMat(accent, 0.9), { cast: false, receive: false });
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.16;
  b.add(glow);
  // thrusters
  for (const s of [-1, 1]) {
    const thr = mesh(GEO.cylinder(0.16, 0.2, 0.4, 10), matteMat(0x9aa4b4));
    thr.rotation.x = Math.PI / 2;
    thr.position.set(s * 0.42, 0.5, -1.4);
    b.add(thr);
  }
  const flame = buildFlame(1);
  flame.position.set(0, 0.5, -1.5);
  flame.visible = false;
  b.add(flame);
  ctx.boost = flame;

  addHeadlights(ctx, 0.5, 1.44, 0.44);
  addTaillights(ctx, 0.55, -1.5, 0.5);

  // hover pods instead of tyres (kept in `wheels` so spin/steer still work)
  addWheel(ctx, 0.3, 0.2, -0.66, 0.85, true, 0x4dd0e1);
  addWheel(ctx, 0.3, 0.2, 0.66, 0.85, true, 0x4dd0e1);
  addWheel(ctx, 0.3, 0.2, -0.66, -0.85, false, 0x4dd0e1);
  addWheel(ctx, 0.3, 0.2, 0.66, -0.85, false, 0x4dd0e1);
}

function buildRocket(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const hull = mesh(GEO.capsule(0.5, 2.2), toyMat(color));
  hull.rotation.x = Math.PI / 2;
  hull.position.y = 1.0;
  b.add(hull);
  const noseCone = mesh(GEO.cone(0.5, 1.0, 16), toyMat(accent));
  noseCone.rotation.x = Math.PI / 2;
  noseCone.position.set(0, 1.0, 1.85);
  b.add(noseCone);
  // portholes
  for (let i = 0; i < 2; i++) {
    const port = mesh(GEO.cylinder(0.16, 0.16, 0.1, 12), glassMat(0x9be2ff, 0.7));
    port.rotation.z = Math.PI / 2;
    port.position.set(0, 1.0, 0.4 - i * 0.7);
    port.rotation.x = 0;
    const ring = mesh(GEO.torus(0.17, 0.035), toyMat(0xffffff));
    ring.position.copy(port.position);
    ring.rotation.y = Math.PI / 2;
    b.add(port, ring);
  }
  // fins
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.9, -0.4);
  finShape.lineTo(0.9, 0.3);
  finShape.closePath();
  const finGeo = cachedGeo('veh-fin', () => new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false }));
  for (const s of [-1, 1]) {
    const fin = mesh(finGeo, toyMat(accent));
    fin.position.set(s * 0.4, 1.0, -1.0);
    fin.rotation.y = s > 0 ? 0 : Math.PI;
    b.add(fin);
  }
  const nozzle = mesh(GEO.cylinder(0.36, 0.5, 0.5, 12), matteMat(0x5b6270));
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 1.0, -1.6);
  b.add(nozzle);
  const flame = buildFlame(1.5);
  flame.position.set(0, 1.0, -1.75);
  flame.visible = true;
  b.add(flame);
  ctx.boost = flame;
}

function buildPlane(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const fuselage = mesh(GEO.capsule(0.36, 2.4), toyMat(color));
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.y = 1.1;
  b.add(fuselage);
  const cockpit = mesh(GEO.sphere(0.34, 14), glassMat(0x9be2ff, 0.6), { cast: false, receive: false });
  cockpit.scale.set(1, 0.8, 1.4);
  cockpit.position.set(0, 1.3, 0.8);
  b.add(cockpit);
  // wings
  const wing = mesh(roundedBoxGeometry(4.4, 0.1, 0.9, 0.04), toyMat(accent));
  wing.position.set(0, 1.1, 0.1);
  b.add(wing);
  const wingTipL = mesh(GEO.sphere(0.14, 8), glowMat(0xff5c7a, 0.7));
  wingTipL.position.set(-2.2, 1.1, 0.1);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 2.2;
  b.add(wingTipL, wingTipR);
  // tail
  const tailWing = mesh(roundedBoxGeometry(1.6, 0.09, 0.5, 0.04), toyMat(accent));
  tailWing.position.set(0, 1.2, -1.5);
  b.add(tailWing);
  const fin = mesh(roundedBoxGeometry(0.08, 0.8, 0.6, 0.04), toyMat(accent));
  fin.position.set(0, 1.6, -1.55);
  b.add(fin);
  // propeller
  const prop = new THREE.Group();
  const spinner = mesh(GEO.cone(0.12, 0.3, 8), toyMat(0x2b2f45));
  spinner.rotation.x = Math.PI / 2;
  const bladeA = mesh(roundedBoxGeometry(0.1, 1.4, 0.06, 0.03), matteMat(0x2b2f45));
  const bladeB = bladeA.clone();
  bladeB.rotation.z = Math.PI / 2;
  prop.add(spinner, bladeA, bladeB);
  prop.position.set(0, 1.1, 1.75);
  b.add(prop);
  b.userData.propeller = prop;
  // landing gear
  for (const [x, z] of [[-0.5, 0.5], [0.5, 0.5], [0, -1.1]]) {
    const strut = mesh(GEO.cylinder(0.05, 0.05, 0.5, 6), matteMat(0x9aa4b4));
    strut.position.set(x, 0.6, z);
    const wheel = createWheel(0.16, 0.1);
    wheel.pivot.position.set(x, 0.16, z);
    b.add(strut, wheel.pivot);
    ctx.wheels.push(wheel.pivot);
  }
}

function buildBoat(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  const hullGeo = cachedGeo('veh-hull', () => {
    const g = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    g.scale(0.9, 0.8, 2.2);
    g.translate(0, 0.8, 0);
    return g;
  });
  const hull = mesh(hullGeo, toyMat(color));
  b.add(hull);
  const deck = mesh(GEO.box(1.5, 0.1, 3.6), matteMat(0xd9a45f));
  deck.position.y = 0.82;
  b.add(deck);
  const cabin = mesh(roundedBoxGeometry(1.1, 0.7, 1.2, 0.14), toyMat(accent));
  cabin.position.set(0, 1.2, 0.3);
  b.add(cabin);
  const cabinGlass = glass(1.0, 0.4);
  cabinGlass.position.set(0, 1.28, 0.92);
  b.add(cabinGlass);
  const mast = mesh(GEO.cylinder(0.06, 0.08, 1.8, 8), matteMat(0x8a5a3b));
  mast.position.set(0, 1.9, -0.9);
  b.add(mast);
  const sail = mesh(GEO.plane(1.2, 1.4), toyMat(0xffffff, { side: THREE.DoubleSide }));
  sail.position.set(0.62, 1.9, -0.9);
  b.add(sail);
  const flag = mesh(GEO.plane(0.5, 0.3), toyMat(0xff5c7a, { side: THREE.DoubleSide }));
  flag.position.set(0.3, 2.7, -0.9);
  b.add(flag);
  const light = lightMat(0xffd93d);
  ctx.lights.push(light);
  const lamp = mesh(GEO.sphere(0.1, 8), light);
  lamp.position.set(0, 2.9, -0.9);
  b.add(lamp);
}

function buildTrain(ctx: BuildCtx, color: number, accent: number): void {
  const b = ctx.body;
  // locomotive
  const boiler = mesh(GEO.cylinder(0.5, 0.5, 2.2, 14), toyMat(color));
  boiler.rotation.x = Math.PI / 2;
  boiler.position.set(0, 1.0, 1.0);
  b.add(boiler);
  const cab = mesh(roundedBoxGeometry(1.3, 1.4, 1.3, 0.14), toyMat(accent));
  cab.position.set(0, 1.2, -0.6);
  b.add(cab);
  const roof = mesh(roundedBoxGeometry(1.5, 0.16, 1.5, 0.06), matteMat(0x2b2f45));
  roof.position.set(0, 1.98, -0.6);
  b.add(roof);
  const chimney = mesh(GEO.cylinder(0.18, 0.24, 0.6, 10), matteMat(0x2b2f45));
  chimney.position.set(0, 1.75, 1.7);
  b.add(chimney);
  const cowcatcher = mesh(GEO.cone(0.5, 0.6, 4), toyMat(0xffd93d));
  cowcatcher.rotation.x = -Math.PI / 2;
  cowcatcher.rotation.y = Math.PI / 4;
  cowcatcher.position.set(0, 0.6, 2.3);
  b.add(cowcatcher);
  addHeadlights(ctx, 1.1, 2.2, 0.25);

  // two carriages
  for (let i = 0; i < 2; i++) {
    const car = mesh(roundedBoxGeometry(1.4, 1.3, 2.2, 0.14), toyMat(i % 2 ? accent : color));
    car.position.set(0, 1.1, -2.6 - i * 2.6);
    b.add(car);
    const win = mesh(GEO.box(1.44, 0.5, 1.6), glassMat(0x9be2ff, 0.6));
    win.position.set(0, 1.35, -2.6 - i * 2.6);
    b.add(win);
    addWheel(ctx, 0.32, 0.2, -0.6, -2.0 - i * 2.6, false, 0x9aa4b4);
    addWheel(ctx, 0.32, 0.2, 0.6, -2.0 - i * 2.6, false, 0x9aa4b4);
    addWheel(ctx, 0.32, 0.2, -0.6, -3.2 - i * 2.6, false, 0x9aa4b4);
    addWheel(ctx, 0.32, 0.2, 0.6, -3.2 - i * 2.6, false, 0x9aa4b4);
  }
  addWheel(ctx, 0.42, 0.24, -0.62, 1.4, false, 0x9aa4b4);
  addWheel(ctx, 0.42, 0.24, 0.62, 1.4, false, 0x9aa4b4);
  addWheel(ctx, 0.42, 0.24, -0.62, 0.1, false, 0x9aa4b4);
  addWheel(ctx, 0.42, 0.24, 0.62, 0.1, false, 0x9aa4b4);
}

/* ------------------------------------------------------------------ */
/* assembly                                                            */
/* ------------------------------------------------------------------ */

function buildKind(kind: VehicleKind, ctx: BuildCtx, color: number, accent: number): void {
  switch (kind) {
    case 'racingCar': buildRacingCar(ctx, color, accent); break;
    case 'bus': buildBus(ctx, color, accent); break;
    case 'truck': buildTruck(ctx, color, accent); break;
    case 'kart': buildKart(ctx, color, accent); break;
    case 'monsterTruck': buildMonsterTruck(ctx, color, accent); break;
    case 'futureCar': buildFutureCar(ctx, color, accent); break;
    case 'rocket': buildRocket(ctx, color, accent); break;
    case 'plane': buildPlane(ctx, color, accent); break;
    case 'boat': buildBoat(ctx, color, accent); break;
    case 'train': buildTrain(ctx, color, accent); break;
  }
}

const DEFAULT_COLOR: Record<VehicleKind, number> = {
  racingCar: 0xff5c7a, bus: 0x4aa3ff, truck: 0x6bcb77, kart: 0xffd93d,
  monsterTruck: 0xa78bfa, futureCar: 0x4dd0e1, rocket: 0xffffff, plane: 0xf2f4f8,
  boat: 0xffffff, train: 0xff6b6b,
};

const DEFAULT_ACCENT: Record<VehicleKind, number> = {
  racingCar: 0xffffff, bus: 0xffd93d, truck: 0xfff6e3, kart: 0xff6b6b,
  monsterTruck: 0xffd93d, futureCar: 0xff8fab, rocket: 0xff5c7a, plane: 0xff5c7a,
  boat: 0xff8fab, train: 0x4aa3ff,
};

export function createVehicle(kind: VehicleKind, opts: VehicleOpts = {}): VehicleHandle {
  const color = opts.color ?? DEFAULT_COLOR[kind];
  const accent = opts.accent ?? DEFAULT_ACCENT[kind];
  const ctx = newCtx();
  buildKind(kind, ctx, color, accent);
  if (opts.scale) ctx.root.scale.multiplyScalar(opts.scale);
  ctx.root.userData.pick = true;
  ctx.root.userData.vehicle = kind;

  const maxSteer = 0.6;
  const handle: VehicleHandle = {
    root: ctx.root,
    kind,
    wheels: ctx.wheels,
    steerWheels: ctx.steerWheels,
    spinWheels(rad: number): void {
      for (const w of ctx.wheels) w.rotation.x += rad;
    },
    steer(angleRad: number): void {
      const a = Math.max(-maxSteer, Math.min(maxSteer, angleRad));
      for (const w of ctx.steerWheels) w.rotation.y = a;
    },
    setBodyRoll(zRad: number, pitchRad = 0): void {
      ctx.body.rotation.z = zRad;
      ctx.body.rotation.x = pitchRad;
    },
    setLights(on: boolean): void {
      setEmissive(ctx, on);
    },
    setBoost(on: boolean): void {
      if (ctx.boost) ctx.boost.visible = on;
    },
    dispose(): void {
      ctx.root.removeFromParent();
    },
  };
  if (ctx.boost) handle.boost = ctx.boost;
  handle.setLights(true);
  return handle;
}
