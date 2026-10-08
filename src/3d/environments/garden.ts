import * as THREE from 'three';
import { GEO, glowMat, group, matteMat, mesh, renderQuality, toyMat } from '../materials';
import type { ThreeStage } from '../engine/stage';
import { makeCloud, makeGround, makeRock, makeTree, makeWorld, qcount, seeded, type World, type WorldOpts } from './common';

interface Sway { g: THREE.Group; phase: number; amp: number }
interface Drift { g: THREE.Group; speed: number; limit: number }
interface Fly {
  g: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
}

const PETALS = [0xff6f9c, 0xffd166, 0xb388ff, 0xff9f45];

export function createGardenWorld(stage: ThreeStage, opts: WorldOpts = {}): World {
  const q = opts.quality ?? renderQuality();
  const rnd = seeded(opts.seed ?? 12);
  const size = opts.size ?? 26;
  const root = new THREE.Group();
  const trees: THREE.Group[] = [];
  const flowers: Sway[] = [];
  const clouds: Drift[] = [];
  const flies: Fly[] = [];

  root.add(makeGround(size, 0x69bd4c));

  const treeCount = qcount(5, 8, q);
  for (let i = 0; i < treeCount; i++) {
    const a = (i / treeCount) * Math.PI * 2 + rnd() * 0.7;
    const rr = size * (0.42 + rnd() * 0.35);
    const tr = makeTree({ height: 3.4 + rnd() * 2, autumn: rnd() < 0.3 });
    tr.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    tr.rotation.y = rnd() * Math.PI * 2;
    tr.userData.phase = rnd() * 6.28;
    root.add(tr);
    trees.push(tr);
  }

  const stemMat = matteMat(0x3f8f36);
  const coreMat = glowMat(0xffe066, 0.7);
  for (let i = 0, n = qcount(9, 20, q); i < n; i++) {
    const stem = mesh(GEO.cylinder(0.035, 0.05, 0.55), stemMat, { cast: false });
    stem.position.y = 0.275;
    const head = mesh(GEO.sphere(0.16), toyMat(PETALS[i % PETALS.length]));
    head.position.y = 0.6;
    head.scale.set(1, 0.5, 1);
    const core = mesh(GEO.sphere(0.07), coreMat, { cast: false });
    core.position.y = 0.67;
    const f = group(stem, head, core);
    const a = rnd() * 6.28;
    const rr = size * (0.1 + rnd() * 0.62);
    f.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    f.rotation.y = rnd() * 6.28;
    root.add(f);
    flowers.push({ g: f, phase: rnd() * 6.28, amp: 0.14 + rnd() * 0.14 });
  }
  for (let i = 0, n = qcount(3, 5, q); i < n; i++) {
    const a = rnd() * 6.28;
    const rr = size * (0.3 + rnd() * 0.55);
    const rk = makeRock(0.4 + rnd() * 0.6);
    rk.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    rk.rotation.y = rnd() * 6.28;
    root.add(rk);
  }

  const bushA = matteMat(0x3f9b3f);
  const bushB = matteMat(0x54b24f);
  for (let i = 0, n = qcount(3, 5, q); i < n; i++) {
    const b1 = mesh(GEO.sphere(0.65), bushA);
    b1.position.y = 0.42;
    const b2 = mesh(GEO.sphere(0.45), bushB);
    b2.position.set(0.55, 0.3, 0.22);
    const b3 = mesh(GEO.sphere(0.38), bushA);
    b3.position.set(-0.45, 0.26, -0.3);
    const bush = group(b1, b2, b3);
    const a = rnd() * 6.28;
    const rr = size * (0.2 + rnd() * 0.55);
    bush.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    bush.rotation.y = rnd() * 6.28;
    root.add(bush);
  }

  const tuftMat = matteMat(0x57ad3f);
  for (let i = 0, n = qcount(16, 44, q); i < n; i++) {
    const s = 0.7 + rnd() * 0.9;
    const tuft = mesh(GEO.cone(0.1, 0.42), tuftMat, { cast: false, receive: false });
    tuft.scale.set(1, s, 0.55);
    const a = rnd() * 6.28;
    const rr = size * (0.06 + rnd() * 0.88);
    tuft.position.set(Math.cos(a) * rr, 0.21 * s, Math.sin(a) * rr);
    tuft.rotation.y = rnd() * 6.28;
    root.add(tuft);
  }

  const limit = size * 0.9;
  for (let i = 0, n = qcount(3, 5, q); i < n; i++) {
    const c = makeCloud(1.1 + rnd() * 1.3);
    c.position.set((rnd() * 2 - 1) * limit, 9 + rnd() * 5, (rnd() * 2 - 1) * size * 0.5);
    root.add(c);
    clouds.push({ g: c, speed: 0.35 + rnd() * 0.7, limit });
  }

  const wingA = toyMat(0xff8fd0, { transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const wingB = toyMat(0xffd166, { transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const bodyMat = matteMat(0x3a2b23);
  for (let i = 0, n = qcount(3, 5, q); i < n; i++) {
    const body = mesh(GEO.capsule(0.05, 0.2), bodyMat, { cast: false, receive: false });
    body.rotation.x = Math.PI / 2;
    const wm = i % 2 ? wingB : wingA;
    const wingR = group();
    const mr = mesh(GEO.plane(0.42, 0.32), wm, { cast: false, receive: false });
    mr.rotation.x = -Math.PI / 2;
    mr.position.x = 0.21;
    wingR.add(mr);
    const wingL = group();
    const ml = mesh(GEO.plane(0.42, 0.32), wm, { cast: false, receive: false });
    ml.rotation.x = -Math.PI / 2;
    ml.position.x = -0.21;
    wingL.add(ml);
    const bf = group(body, wingR, wingL);
    bf.position.set((rnd() - 0.5) * size * 0.5, 1.4 + rnd() * 2.2, (rnd() - 0.5) * size * 0.5);
    root.add(bf);
    flies.push({
      g: bf,
      wingL,
      wingR,
      cx: (rnd() - 0.5) * size * 0.45,
      cy: 1.4 + rnd() * 2.4,
      cz: (rnd() - 0.5) * size * 0.45,
      rx: 2.5 + rnd() * 3.5,
      rz: 2.5 + rnd() * 3.5,
      speed: 0.3 + rnd() * 0.4,
      phase: rnd() * 6.28,
    });
  }

  function update(dt: number, t: number): void {
    for (const f of flowers) {
      f.g.rotation.z = Math.sin(t * 1.5 + f.phase) * f.amp;
      f.g.rotation.x = Math.cos(t * 1.1 + f.phase) * f.amp * 0.7;
    }
    for (const tr of trees) {
      const ph = tr.userData.phase as number;
      tr.rotation.z = Math.sin(t * 0.8 + ph) * 0.03;
      const canopy = tr.userData.canopy as THREE.Group;
      canopy.rotation.z = Math.sin(t * 1.3 + ph) * 0.05;
      canopy.rotation.x = Math.cos(t * 1.1 + ph) * 0.04;
    }
    for (const b of flies) {
      const th = t * b.speed + b.phase;
      b.g.position.set(
        b.cx + Math.cos(th) * b.rx,
        b.cy + Math.sin(t * 1.7 + b.phase) * 0.7,
        b.cz + Math.sin(th) * b.rz
      );
      b.g.rotation.y = Math.atan2(-Math.sin(th) * b.rx, Math.cos(th) * b.rz);
      const flap = Math.sin(t * 13 + b.phase) * 0.85;
      b.wingR.rotation.z = flap;
      b.wingL.rotation.z = -flap;
    }
    for (const c of clouds) {
      c.g.position.x += c.speed * dt;
      if (c.g.position.x > c.limit) c.g.position.x = -c.limit;
    }
  }

  stage.scene.add(root);
  return makeWorld(root, update);
}
