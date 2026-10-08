import * as THREE from 'three';
import { GEO, glowMat, group, matteMat, mesh, renderQuality, toyMat } from '../materials';
import type { ThreeStage } from '../engine/stage';
import { makeGround, makeWorld, qcount, seeded, type World, type WorldOpts } from './common';

interface Lolly { head: THREE.Group; speed: number }
interface Blob { o: THREE.Mesh; y: number; s: number; phase: number }
interface Pulse { g: THREE.Group; phase: number }

const GUMMIES = [0xff5f8f, 0x7ce38b, 0xffd166, 0x6fd3ff, 0xc77dff];
const MOUNTAINS = [0xffb3d1, 0xc5a3ff, 0xa8e6ff, 0xffe08a];
const SPRINKLES = [0xff5f8f, 0xffd166, 0x6fd3ff, 0x7ce38b, 0xffffff, 0xc77dff];

function makeCandyTree(rnd: () => number): { g: THREE.Group; canopy: THREE.Group } {
  const trunk = mesh(GEO.cylinder(0.18, 0.28, 1.7), matteMat(0x6b3f23));
  trunk.position.y = 0.85;
  const col = GUMMIES[Math.floor(rnd() * GUMMIES.length)];
  const top = mesh(GEO.sphere(1.15), toyMat(col));
  top.position.y = 2.35;
  const side = mesh(GEO.sphere(0.7), toyMat(col));
  side.position.set(0.75, 1.9, 0.35);
  const canopy = group(top, side);
  const g = group(trunk, canopy);
  return { g, canopy };
}

function makeLollipop(rnd: () => number): { g: THREE.Group; head: THREE.Group } {
  const stick = mesh(GEO.cylinder(0.06, 0.06, 1.6, 8), matteMat(0xf7f7f7));
  stick.position.y = 0.8;
  const col = GUMMIES[Math.floor(rnd() * GUMMIES.length)];
  const candy = mesh(GEO.sphere(0.55), toyMat(col));
  const stripe = mesh(
    GEO.torus(0.5, 0.13),
    toyMat(0xffffff, { transparent: true, opacity: 0.85 })
  );
  stripe.rotation.set(rnd() * 1.2, rnd() * 6.28, rnd() * 1.2);
  const head = group(candy, stripe);
  head.position.y = 1.85;
  const g = group(stick, head);
  return { g, head };
}

function makeHouse(): THREE.Group {
  const body = mesh(GEO.roundedBox(3.2, 2.6, 2.8, 0.28), toyMat(0xfff1a8));
  body.position.y = 1.3;
  const roof = mesh(GEO.sphere(1), toyMat(0xfffdf6, { shiny: true }));
  roof.scale.set(2.3, 1.15, 2.05);
  roof.position.y = 2.75;
  const door = mesh(GEO.roundedBox(0.9, 1.5, 0.2, 0.12), matteMat(0x6b3f23));
  door.position.set(0, 0.75, 1.4);
  const winL = mesh(GEO.roundedBox(0.6, 0.6, 0.16, 0.08), glowMat(0x7ce8ff, 0.7));
  winL.position.set(-1, 1.75, 1.4);
  const winR = mesh(GEO.roundedBox(0.6, 0.6, 0.16, 0.08), glowMat(0x7ce8ff, 0.7));
  winR.position.set(1, 1.75, 1.4);
  const chimney = mesh(GEO.cylinder(0.24, 0.3, 1.3, 8), matteMat(0x6b3f23));
  chimney.position.set(-1, 3.4, -0.5);
  return group(body, roof, door, winL, winR, chimney);
}

export function createCandyWorld(stage: ThreeStage, opts: WorldOpts = {}): World {
  const q = opts.quality ?? renderQuality();
  const rnd = seeded(opts.seed ?? 55);
  const size = opts.size ?? 26;
  const root = new THREE.Group();
  const lollies: Lolly[] = [];
  const blobs: Blob[] = [];
  const pulses: Pulse[] = [];

  root.add(makeGround(size, 0xffc9e5));

  const mountainMat = MOUNTAINS.map((c) => toyMat(c, { shiny: false }));
  const capMat = matteMat(0xffffff);
  for (let i = 0, n = qcount(4, 7, q); i < n; i++) {
    const h = Math.round((8 + rnd() * 6) * 2) / 2;
    const r = Math.round((4 + rnd() * 3) * 2) / 2;
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const m = mesh(GEO.cone(r, h, 12), mountainMat[i % mountainMat.length], {
      cast: false,
      receive: false,
    });
    m.position.set(Math.cos(a) * size * 1.05, h * 0.5, Math.sin(a) * size * 1.05);
    root.add(m);
    const cap = mesh(GEO.cone(r * 0.42, h * 0.4, 12), capMat, { cast: false, receive: false });
    cap.position.set(m.position.x, h * 0.8, m.position.z);
    root.add(cap);
  }

  for (let i = 0, n = qcount(4, 6, q); i < n; i++) {
    const { g, canopy } = makeCandyTree(rnd);
    const a = rnd() * 6.28;
    const rr = size * (0.35 + rnd() * 0.45);
    g.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    g.rotation.y = rnd() * 6.28;
    g.scale.setScalar(0.85 + rnd() * 0.5);
    root.add(g);
    pulses.push({ g: canopy, phase: rnd() * 6.28 });
  }

  for (let i = 0, n = qcount(5, 8, q); i < n; i++) {
    const { g, head } = makeLollipop(rnd);
    const a = rnd() * 6.28;
    const rr = size * (0.12 + rnd() * 0.7);
    g.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    g.rotation.y = rnd() * 6.28;
    root.add(g);
    lollies.push({ head, speed: 0.4 + rnd() * 1.2 });
  }

  const rockCols = [0x5a3620, 0x75452a, 0x8a5a34];
  for (let i = 0, n = qcount(4, 7, q); i < n; i++) {
    const s = 0.35 + rnd() * 0.5;
    const rock = mesh(GEO.icosahedron(1), matteMat(rockCols[i % rockCols.length], { flatShading: true }));
    rock.scale.set(s, s * 0.7, s * 0.9);
    const a = rnd() * 6.28;
    const rr = size * (0.2 + rnd() * 0.6);
    rock.position.set(Math.cos(a) * rr, s * 0.5, Math.sin(a) * rr);
    rock.rotation.set(rnd(), rnd() * 6.28, rnd());
    root.add(rock);
  }
  for (let i = 0, n = qcount(5, 9, q); i < n; i++) {
    const col = GUMMIES[Math.floor(rnd() * GUMMIES.length)];
    const s = 0.5 + rnd() * 0.6;
    const b = mesh(
      GEO.sphere(0.8),
      toyMat(col, { transparent: true, opacity: 0.9 })
    );
    const a = rnd() * 6.28;
    const rr = size * (0.1 + rnd() * 0.7);
    const y = 0.55 * s;
    b.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    b.scale.set(s, s * 0.8, s);
    root.add(b);
    blobs.push({ o: b, y, s, phase: rnd() * 6.28 });
  }

  const house = makeHouse();
  house.position.set(0, 0, size * 0.2);
  house.rotation.y = 0.35;
  root.add(house);

  const sprinkleMats = SPRINKLES.map((c) => toyMat(c));
  for (let i = 0, n = qcount(26, 80, q); i < n; i++) {
    const sp = mesh(GEO.cylinder(0.05, 0.05, 0.2, 5), sprinkleMats[i % sprinkleMats.length], {
      cast: false,
      receive: false,
    });
    const a = rnd() * 6.28;
    const rr = size * (0.05 + rnd() * 0.9);
    sp.position.set(Math.cos(a) * rr, 0.05, Math.sin(a) * rr);
    sp.rotation.set(Math.PI / 2, rnd() * 6.28, 0);
    root.add(sp);
  }

  function update(dt: number, t: number): void {
    for (const l of lollies) l.head.rotation.y += l.speed * dt;
    for (const b of blobs) {
      const k = Math.sin(t * 2 + b.phase);
      b.o.position.y = b.y + Math.abs(k) * 0.12;
      b.o.scale.set(b.s * (1 + k * 0.06), b.s * 0.8 * (1 - k * 0.1), b.s * (1 - k * 0.06));
    }
    for (const p of pulses) {
      const k = 1 + Math.sin(t * 1.5 + p.phase) * 0.05;
      p.g.scale.set(1, k, 1);
    }
  }

  stage.scene.add(root);
  return makeWorld(root, update);
}
