import * as THREE from 'three';
import { GEO, cachedGeo, glowMat, group, matteMat, mesh, renderQuality, roundedBoxGeometry, toyMat } from '../materials';
import type { ThreeStage } from '../engine/stage';
import { makeCloud, makeGround, makeRock, makeTree, makeWorld, qcount, seeded, type World, type WorldOpts } from './common';

/**
 * Racing World - a long asphalt road with lane markings, guard barriers,
 * traffic signs, bridges, chequered checkpoint arches, barrels, roadside
 * trees, buildings and distant mountains.
 *
 * Checkpoint arch groups carry `userData.checkpoint = <index>` and barrels
 * carry `userData.props = { kind: 'barrel' }`, so the racing game can raycast
 * or box-test them directly.
 */

/** Half-width of the driveable asphalt (world units), centred on x = 0. */
export const ROAD_HALF_WIDTH = 7;

interface Drift { g: THREE.Group; speed: number; limit: number }
interface Sway { g: THREE.Group; phase: number; amp: number }

const ROAD_LEN = 420;

/** Half-torus used for the bridge truss (GEO.torus has no arc argument). */
function archGeo(): THREE.BufferGeometry {
  return cachedGeo(`bridge-arch:`, () =>
    new THREE.TorusGeometry(ROAD_HALF_WIDTH + 1.2, 0.18, 6, 14, Math.PI)
  );
}

export function createRacingWorld(stage: ThreeStage, opts: WorldOpts = {}): World {
  const q = opts.quality ?? renderQuality();
  const rnd = seeded(opts.seed ?? 7);
  const size = opts.size ?? 40;
  const root = new THREE.Group();
  const clouds: Drift[] = [];
  const sways: Sway[] = [];

  /* ---------------- ground + road ---------------- */

  root.add(makeGround(size * 3.2, 0x69a05a));

  const asphalt = toyMat(0x4a4f5a, { shiny: false });
  const road = mesh(GEO.box(ROAD_HALF_WIDTH * 2, 0.16, ROAD_LEN), asphalt, { cast: false, receive: true });
  road.position.y = 0.08;
  root.add(road);

  // shoulder gravel
  for (const s of [-1, 1]) {
    const shoulder = mesh(GEO.box(2.2, 0.1, ROAD_LEN), matteMat(0x9c9276), { cast: false, receive: true });
    shoulder.position.set(s * (ROAD_HALF_WIDTH + 1.1), 0.05, 0);
    root.add(shoulder);
  }

  // dashed centre line
  const dashMat = matteMat(0xfff4d0);
  for (let z = -ROAD_LEN / 2 + 6; z < ROAD_LEN / 2; z += 12) {
    const dash = mesh(GEO.box(0.36, 0.05, 5), dashMat, { cast: false, receive: false });
    dash.position.set(0, 0.18, z);
    root.add(dash);
  }
  // solid edge lines
  for (const s of [-1, 1]) {
    const line = mesh(GEO.box(0.3, 0.05, ROAD_LEN), dashMat, { cast: false, receive: false });
    line.position.set(s * (ROAD_HALF_WIDTH - 0.7), 0.18, 0);
    root.add(line);
  }

  /* ---------------- guard barriers ---------------- */

  const postMat = matteMat(0xf2f2f2);
  const railMat = toyMat(0xff5c5c);
  for (const s of [-1, 1]) {
    const x = s * (ROAD_HALF_WIDTH + 0.4);
    for (let z = -ROAD_LEN / 2 + 4; z < ROAD_LEN / 2; z += 9) {
      const post = mesh(GEO.box(0.24, 0.7, 0.24), postMat, { cast: false });
      post.position.set(x, 0.4, z);
      root.add(post);
      const rail = mesh(GEO.box(0.16, 0.3, 8.6), railMat, { cast: false });
      rail.position.set(x, 0.72, z + 4.2);
      root.add(rail);
    }
  }

  /* ---------------- traffic signs ---------------- */

  const poleMat = matteMat(0x8e99a8);
  for (let i = 0, n = qcount(6, 12, q); i < n; i++) {
    const s = i % 2 ? 1 : -1;
    const z = -ROAD_LEN / 2 + 20 + (i / n) * (ROAD_LEN - 40);
    const pole = mesh(GEO.cylinder(0.09, 0.11, 2.6, 8), poleMat, { cast: false });
    pole.position.set(s * (ROAD_HALF_WIDTH + 2.4), 1.3, z);
    const face = mesh(GEO.cylinder(0.6, 0.6, 0.08, 16), toyMat(i % 3 === 0 ? 0xffd93d : i % 3 === 1 ? 0xff5c5c : 0x4dd0e1), { cast: false });
    face.rotation.z = Math.PI / 2;
    face.position.set(s * (ROAD_HALF_WIDTH + 2.4), 2.8, z);
    const rim = mesh(GEO.torus(0.6, 0.07), matteMat(0xffffff), { cast: false });
    rim.position.copy(face.position);
    rim.rotation.y = Math.PI / 2;
    const g = group(pole, face, rim);
    g.rotation.y = s > 0 ? 0 : Math.PI;
    root.add(g);
    sways.push({ g, phase: rnd() * 6.28, amp: 0.03 });
  }

  /* ---------------- roadside nature ---------------- */

  for (let i = 0, n = qcount(8, 18, q); i < n; i++) {
    const s = rnd() < 0.5 ? -1 : 1;
    const tr = makeTree({ height: 3.4 + rnd() * 2.2, autumn: rnd() < 0.35 });
    tr.position.set(s * (ROAD_HALF_WIDTH + 5 + rnd() * 16), 0, (rnd() * 2 - 1) * ROAD_LEN * 0.5);
    tr.rotation.y = rnd() * 6.28;
    root.add(tr);
    sways.push({ g: tr, phase: rnd() * 6.28, amp: 0.03 });
  }
  for (let i = 0, n = qcount(5, 12, q); i < n; i++) {
    const s = rnd() < 0.5 ? -1 : 1;
    const rk = makeRock(0.5 + rnd() * 1.1);
    rk.position.set(s * (ROAD_HALF_WIDTH + 4 + rnd() * 18), 0, (rnd() * 2 - 1) * ROAD_LEN * 0.5);
    rk.rotation.y = rnd() * 6.28;
    root.add(rk);
  }

  /* ---------------- buildings ---------------- */

  const windowMat = glowMat(0xffe9a8, 0.55);
  for (let i = 0, n = qcount(5, 10, q); i < n; i++) {
    const s = rnd() < 0.6 ? 1 : -1;
    const w = 5 + rnd() * 5;
    const h = 6 + rnd() * 11;
    const d = 5 + rnd() * 5;
    const x = s * (ROAD_HALF_WIDTH + 14 + rnd() * 14);
    const z = (rnd() * 2 - 1) * ROAD_LEN * 0.45;
    const body = mesh(
      roundedBoxGeometry(w, h, d, 0.4),
      toyMat([0xd7dde8, 0xf0e2d0, 0xcfd9ea, 0xf6d9c0][i % 4], { shiny: false })
    );
    body.position.set(x, h / 2, z);
    root.add(body);
    for (let r = 0; r < Math.floor(h / 2.4); r++) {
      for (let c = 0; c < 3; c++) {
        const win = mesh(GEO.box(0.9, 1.1, 0.1), windowMat, { cast: false, receive: false });
        win.position.set(x - s * (w / 2 + 0.05), 1.6 + r * 2.4, z - 2 + c * 2);
        win.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        root.add(win);
      }
    }
  }

  /* ---------------- mountains on the horizon ---------------- */

  const mountainMat = matteMat(0x6f8fa8, { flatShading: true });
  const peakMat = matteMat(0xeef4fb, { flatShading: true });
  for (let i = 0, n = qcount(6, 12, q); i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const rr = size * (2.4 + rnd() * 1.2);
    const h = 16 + rnd() * 18;
    const m = mesh(GEO.cone(9 + rnd() * 7, h, 7), mountainMat, { cast: false, receive: false });
    m.position.set(Math.cos(a) * rr, h / 2 - 1, Math.sin(a) * rr);
    root.add(m);
    if (h > 24) {
      const cap = mesh(GEO.cone(3.6, 5.4, 7), peakMat, { cast: false, receive: false });
      cap.position.set(m.position.x, h - 3.6, m.position.z);
      root.add(cap);
    }
  }

  /* ---------------- bridge ---------------- */

  const bridgeZ = -70;
  const waterStrip = mesh(GEO.box(ROAD_HALF_WIDTH * 4.4, 0.1, 16), toyMat(0x2f9fd0, { shiny: false }), { cast: false, receive: true });
  waterStrip.position.set(0, 0.02, bridgeZ);
  root.add(waterStrip);

  const deck = mesh(roundedBoxGeometry(ROAD_HALF_WIDTH * 2 + 1.4, 0.7, 17, 0.16), matteMat(0x8b93a3));
  deck.position.set(0, 0.6, bridgeZ);
  root.add(deck);
  const deckTop = mesh(GEO.box(ROAD_HALF_WIDTH * 2, 0.1, 17), toyMat(0x4a4f5a, { shiny: false }), { cast: false, receive: true });
  deckTop.position.set(0, 0.98, bridgeZ);
  root.add(deckTop);
  for (const s of [-1, 1]) {
    const rail = mesh(GEO.box(0.35, 1.0, 17), toyMat(0xffd93d), { cast: false });
    rail.position.set(s * (ROAD_HALF_WIDTH + 0.2), 1.5, bridgeZ);
    root.add(rail);
    for (let z = -7; z <= 7; z += 3.5) {
      const strut = mesh(GEO.cylinder(0.18, 0.22, 1.4, 8), matteMat(0x6d7482), { cast: false });
      strut.position.set(s * (ROAD_HALF_WIDTH - 0.6), 0.3, bridgeZ + z);
      root.add(strut);
    }
  }
  // arched truss over the deck
  for (let z = -7; z <= 7; z += 3.5) {
    const arch = mesh(archGeo(), matteMat(0x6d7482), { cast: false });
    arch.position.set(0, 1.6, bridgeZ + z);
    root.add(arch);
  }

  /* ---------------- checkpoint arches ---------------- */

  const chequerA = matteMat(0xffffff);
  const chequerB = matteMat(0x22262e);
  const checkpoints: THREE.Group[] = [];
  for (let i = 0, n = 5; i < n; i++) {
    const z = -ROAD_LEN / 2 + 45 + i * ((ROAD_LEN - 90) / (n - 1));
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const pillar = mesh(roundedBoxGeometry(0.9, 5.4, 0.9, 0.14), toyMat(0xffffff));
      pillar.position.set(s * (ROAD_HALF_WIDTH + 0.9), 2.7, 0);
      g.add(pillar);
      const base = mesh(GEO.box(1.6, 0.4, 1.6), matteMat(0x8b93a3));
      base.position.set(s * (ROAD_HALF_WIDTH + 0.9), 0.2, 0);
      g.add(base);
    }
    const beam = mesh(GEO.box(ROAD_HALF_WIDTH * 2 + 2.8, 1.1, 0.7), chequerA);
    beam.position.y = 5.5;
    g.add(beam);
    const cols = 14;
    for (let c = 0; c < cols; c++) {
      if (c % 2 === 0) continue;
      const tile = mesh(GEO.box((ROAD_HALF_WIDTH * 2 + 2.8) / cols, 0.55, 0.74), chequerB, { cast: false });
      tile.position.set(-ROAD_HALF_WIDTH - 1.4 + (c + 0.5) * ((ROAD_HALF_WIDTH * 2 + 2.8) / cols), 5.5, 0);
      g.add(tile);
    }
    const banner = mesh(GEO.box(ROAD_HALF_WIDTH * 2 + 2.8, 0.5, 0.74), toyMat(0xff5c7a), { cast: false });
    banner.position.y = 4.7;
    g.add(banner);

    g.position.z = z;
    g.userData.checkpoint = i;
    g.userData.kind = 'checkpoint';
    g.userData.pick = true;
    root.add(g);
    checkpoints.push(g);
  }

  /* ---------------- barrels / tyre-stack barriers ---------------- */

  const barrelWood = matteMat(0xb87333);
  const barrelBand = toyMat(0x2b2f45);
  const props: THREE.Group[] = [];
  for (let i = 0, n = qcount(10, 22, q); i < n; i++) {
    const s = rnd() < 0.5 ? -1 : 1;
    const x = s * (ROAD_HALF_WIDTH - 1.4 - rnd() * 1.4);
    const z = (rnd() * 2 - 1) * ROAD_LEN * 0.48;
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const b = mesh(GEO.cylinder(0.5, 0.5, 0.7, 12), barrelWood);
      b.position.y = 0.35 + k * 0.72;
      const band = mesh(GEO.torus(0.5, 0.07), barrelBand, { cast: false });
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.35 + k * 0.72;
      g.add(b, band);
    }
    g.position.set(x, 0, z);
    g.userData.props = { kind: 'barrel' };
    g.userData.pick = true;
    root.add(g);
    props.push(g);
  }

  /* ---------------- clouds ---------------- */

  for (let i = 0, n = qcount(4, 7, q); i < n; i++) {
    const c = makeCloud(1.6 + rnd() * 2);
    c.position.set((rnd() * 2 - 1) * size * 2, 14 + rnd() * 8, (rnd() * 2 - 1) * ROAD_LEN * 0.4);
    root.add(c);
    clouds.push({ g: c, speed: 1.2 + rnd() * 2.2, limit: size * 3.4 });
  }

  /* ---------------- update ---------------- */

  function update(dt: number, t: number): void {
    for (const c of clouds) {
      c.g.position.x += c.speed * dt;
      if (c.g.position.x > c.limit) c.g.position.x = -c.limit;
    }
    for (const s of sways) {
      s.g.rotation.z = Math.sin(t * 0.9 + s.phase) * s.amp;
    }
    for (let i = 0; i < checkpoints.length; i++) {
      const g = checkpoints[i];
      g.children.forEach((child, idx) => {
        if (idx >= 6) return;
        child.position.y += Math.sin(t * 2 + i + idx) * 0.0015;
      });
    }
  }

  stage.scene.add(root);
  return makeWorld(root, update);
}
