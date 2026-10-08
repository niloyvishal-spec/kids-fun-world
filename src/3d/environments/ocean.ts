import * as THREE from 'three';
import { GEO, glassMat, group, matteMat, mesh, renderQuality, toyMat } from '../materials';
import type { ThreeStage } from '../engine/stage';
import { makeGround, makeRock, makeWorld, qcount, seeded, type World, type WorldOpts } from './common';

interface Sway { g: THREE.Group; phase: number; amp: number }
interface Rise { g: THREE.Mesh; x: number; z: number; bottom: number; top: number; speed: number; phase: number }
interface Fish {
  g: THREE.Group;
  tail: THREE.Group;
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
}

const FISH_COLS = [0xffb703, 0xff7b54, 0x9bf6ff, 0xffd6a5];
const CORAL_COLS = [0xff6f9c, 0xff9f45, 0xb388ff, 0x4fd1c5];
const SHELL_COLS = [0xfff1e0, 0xffd9f0, 0xd9f6ff];
const GRID = 20;

function makeCoral(rnd: () => number, color: number): THREE.Group {
  const mat = toyMat(color, { flatShading: true });
  const g = group();
  const branches = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < branches; i++) {
    const h = Math.round((0.8 + rnd() * 1.2) * 5) / 5;
    const b = mesh(GEO.cylinder(0.07, 0.16, h, 6), mat);
    b.position.set((rnd() - 0.5) * 0.7, h * 0.5, (rnd() - 0.5) * 0.7);
    b.rotation.set((rnd() - 0.5) * 0.6, rnd() * 6.28, (rnd() - 0.5) * 0.6);
    const tip = mesh(GEO.sphere(0.14), mat);
    tip.position.y = h * 0.5;
    b.add(tip);
    g.add(b);
  }
  return g;
}

function makeFish(rnd: () => number): { g: THREE.Group; tail: THREE.Group } {
  const col = FISH_COLS[Math.floor(rnd() * FISH_COLS.length)];
  const mat = toyMat(col);
  const body = mesh(GEO.sphere(0.5), mat);
  body.scale.set(1.5, 0.85, 0.8);
  const eyeMat = matteMat(0x1d2733);
  const eyeL = mesh(GEO.sphere(0.07), eyeMat, { cast: false });
  eyeL.position.set(-0.17, 0.13, 0.33);
  const eyeR = mesh(GEO.sphere(0.07), eyeMat, { cast: false });
  eyeR.position.set(0.17, 0.13, 0.33);
  const dorsal = mesh(GEO.cone(0.2, 0.35, 6), mat);
  dorsal.position.set(0, 0.34, -0.05);
  dorsal.rotation.x = -0.5;
  const finL = mesh(GEO.cone(0.13, 0.3, 6), mat);
  finL.position.set(-0.32, -0.05, 0.05);
  finL.rotation.set(0, 0, 1.9);
  const finR = mesh(GEO.cone(0.13, 0.3, 6), mat);
  finR.position.set(0.32, -0.05, 0.05);
  finR.rotation.set(0, 0, -1.9);
  const tail = group();
  const tailFin = mesh(GEO.cone(0.3, 0.6, 6), mat);
  tailFin.rotation.x = -Math.PI / 2;
  tailFin.position.z = -0.3;
  tail.add(tailFin);
  tail.position.z = -0.42;
  const g = group(body, eyeL, eyeR, dorsal, finL, finR, tail);
  return { g, tail };
}

export function createOceanWorld(stage: ThreeStage, opts: WorldOpts = {}): World {
  const q = opts.quality ?? renderQuality();
  const rnd = seeded(opts.seed ?? 31);
  const size = opts.size ?? 28;
  const root = new THREE.Group();
  const sways: Sway[] = [];
  const bubbles: Rise[] = [];
  const fishes: Fish[] = [];

  const floorY = -3.5;
  const surfY = 1.4;
  root.add(makeGround(size * 1.2, 0xe9d9a9, { seg: 40, y: floorY }));

  const waterGeo = GEO.plane(size, size, GRID, GRID).clone();
  waterGeo.userData = {};
  const posAttr = waterGeo.attributes.position as THREE.BufferAttribute;
  const norAttr = waterGeo.attributes.normal as THREE.BufferAttribute;
  const warr = posAttr.array as Float32Array;
  const narr = norAttr.array as Float32Array;
  const step = size / GRID;
  const water = mesh(waterGeo, glassMat(0x3fb5e6, 0.5), { cast: false, receive: true });
  water.rotation.x = -Math.PI / 2;
  water.position.y = surfY;
  root.add(water);

  function updateWaves(t: number): void {
    for (let i = 0; i < warr.length; i += 3) {
      warr[i + 2] =
        Math.sin(warr[i] * 0.45 + t * 1.7) * 0.22 +
        Math.cos(warr[i + 1] * 0.55 + t * 1.25) * 0.18;
    }
    posAttr.needsUpdate = true;
    const verts = warr.length / 3;
    const row = GRID + 1;
    for (let iy = 0; iy <= GRID; iy++) {
      for (let ix = 0; ix <= GRID; ix++) {
        const i = iy * row + ix;
        const iL = ix > 0 ? i - 1 : i;
        const iR = ix < GRID ? i + 1 : i;
        const iD = i - row >= 0 ? i - row : i;
        const iU = i + row < verts ? i + row : i;
        const dx = ix === 0 || ix === GRID ? step : step * 2;
        const dy = iy === 0 || iy === GRID ? step : step * 2;
        const nx = -(warr[iR * 3 + 2] - warr[iL * 3 + 2]) / dx;
        const ny = -(warr[iU * 3 + 2] - warr[iD * 3 + 2]) / dy;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        narr[i * 3] = nx * inv;
        narr[i * 3 + 1] = ny * inv;
        narr[i * 3 + 2] = inv;
      }
    }
    norAttr.needsUpdate = true;
  }

  for (let i = 0, n = qcount(3, 6, q); i < n; i++) {
    const coral = makeCoral(rnd, CORAL_COLS[i % CORAL_COLS.length]);
    const a = rnd() * 6.28;
    const rr = size * (0.2 + rnd() * 0.55);
    coral.position.set(Math.cos(a) * rr, floorY, Math.sin(a) * rr);
    root.add(coral);
    sways.push({ g: coral, phase: rnd() * 6.28, amp: 0.1 + rnd() * 0.08 });
  }

  const plantMat = matteMat(0x2f9e5c);
  for (let i = 0, n = qcount(6, 16, q); i < n; i++) {
    const h = Math.round((1.4 + rnd() * 1.6) * 5) / 5;
    const blade = mesh(GEO.cylinder(0.05, 0.11, h, 5), plantMat);
    blade.position.y = h * 0.5;
    const pivot = group(blade);
    const a = rnd() * 6.28;
    const rr = size * (0.15 + rnd() * 0.7);
    pivot.position.set(Math.cos(a) * rr, floorY, Math.sin(a) * rr);
    root.add(pivot);
    sways.push({ g: pivot, phase: rnd() * 6.28, amp: 0.16 + rnd() * 0.14 });
  }

  for (let i = 0, n = qcount(4, 9, q); i < n; i++) {
    const shell = mesh(
      GEO.sphere(0.32),
      toyMat(SHELL_COLS[i % SHELL_COLS.length], { flatShading: true })
    );
    shell.scale.set(1, 0.55, 1);
    const a = rnd() * 6.28;
    const rr = size * (0.1 + rnd() * 0.75);
    shell.position.set(Math.cos(a) * rr, floorY + 0.09, Math.sin(a) * rr);
    shell.rotation.y = rnd() * 6.28;
    root.add(shell);
  }
  for (let i = 0, n = qcount(3, 5, q); i < n; i++) {
    const rk = makeRock(0.5 + rnd() * 0.8);
    const a = rnd() * 6.28;
    const rr = size * (0.25 + rnd() * 0.6);
    rk.position.set(Math.cos(a) * rr, floorY, Math.sin(a) * rr);
    rk.rotation.y = rnd() * 6.28;
    root.add(rk);
  }

  const bubbleMat = glassMat(0xcfefff, 0.45);
  for (let i = 0, n = qcount(10, 26, q); i < n; i++) {
    const br = Math.round((0.09 + rnd() * 0.12) * 50) / 50;
    const b = mesh(GEO.sphere(br), bubbleMat, { cast: false, receive: false });
    const a = rnd() * 6.28;
    const rr = size * (0.1 + rnd() * 0.7);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const bottom = floorY + 0.4;
    b.position.set(x, bottom + rnd() * (surfY - bottom), z);
    root.add(b);
    bubbles.push({
      g: b,
      x,
      z,
      bottom,
      top: surfY - 0.2,
      speed: 0.5 + rnd() * 1.1,
      phase: rnd() * 6.28,
    });
  }

  for (let i = 0, n = qcount(3, 6, q); i < n; i++) {
    const f = makeFish(rnd);
    f.g.position.set((rnd() - 0.5) * size * 0.5, -1.5 + rnd() * 2, (rnd() - 0.5) * size * 0.5);
    root.add(f.g);
    fishes.push({
      g: f.g,
      tail: f.tail,
      cx: (rnd() - 0.5) * size * 0.35,
      cy: floorY + 1.2 + rnd() * 3,
      cz: (rnd() - 0.5) * size * 0.35,
      rx: 4 + rnd() * 5,
      rz: 4 + rnd() * 5,
      speed: 0.35 + rnd() * 0.4,
      phase: rnd() * 6.28,
    });
  }

  function update(dt: number, t: number): void {
    if (q !== 'low') updateWaves(t);
    for (const s of sways) {
      s.g.rotation.z = Math.sin(t * 1.3 + s.phase) * s.amp;
      s.g.rotation.x = Math.cos(t * 1.05 + s.phase) * s.amp * 0.6;
    }
    for (const b of bubbles) {
      b.g.position.y += b.speed * dt;
      if (b.g.position.y > b.top) b.g.position.y = b.bottom;
      b.g.position.x = b.x + Math.sin(t * 2 + b.phase) * 0.18;
    }
    for (const f of fishes) {
      const th = t * f.speed + f.phase;
      f.g.position.set(
        f.cx + Math.cos(th) * f.rx,
        f.cy + Math.sin(t * 0.9 + f.phase) * 0.5,
        f.cz + Math.sin(th) * f.rz
      );
      f.g.rotation.y = Math.atan2(-Math.sin(th) * f.rx, Math.cos(th) * f.rz);
      f.g.rotation.z = Math.sin(th * 2) * 0.12;
      f.tail.rotation.y = Math.sin(t * 9 + f.phase) * 0.5;
    }
  }

  stage.scene.add(root);
  return makeWorld(root, update);
}
