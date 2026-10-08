import * as THREE from 'three';
import { GEO, cachedGeo, group, matteMat, mesh, renderQuality, toyMat } from '../materials';
import type { ThreeStage } from '../engine/stage';
import { makeWorld, qcount, seeded, type World, type WorldOpts } from './common';

interface Spin { o: THREE.Object3D; sx: number; sy: number }
interface Orbit { pivot: THREE.Group; speed: number }
interface Tumble { o: THREE.Object3D; rx: number; ry: number; rz: number }
interface Bob { g: THREE.Group; y: number; phase: number }

let starTex: THREE.CanvasTexture | null = null;

function starTexture(): THREE.CanvasTexture {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  starTex = tex;
  return tex;
}

function makeStarField(count: number): THREE.Points {
  const geo = cachedGeo(`env:stars:${count}`, () => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const rnd = seeded(7);
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const r = 70 + rnd() * 90;
      p[i * 3] = Math.cos(a) * s * r;
      p[i * 3 + 1] = u * r;
      p[i * 3 + 2] = Math.sin(a) * s * r;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  });
  const mat = new THREE.PointsMaterial({
    map: starTexture(),
    color: 0xffffff,
    size: 2.6,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function makePlanet(r: number, color: number, ring = false): THREE.Group {
  const core = mesh(GEO.sphere(r), toyMat(color));
  const g = group(core);
  if (ring) {
    const rg = mesh(
      GEO.ring(r * 1.4, r * 2.1),
      toyMat(0xffd98a, { transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    rg.rotation.x = -Math.PI / 2 + 0.35;
    rg.rotation.z = 0.25;
    g.add(rg);
  }
  return g;
}

function makeSatellite(): THREE.Group {
  const hull = mesh(GEO.roundedBox(1.4, 1, 1, 0.2), toyMat(0xd9d9e2));
  const panelMat = toyMat(0x2b5bd7);
  const panelL = mesh(GEO.box(2.4, 0.08, 0.9), panelMat);
  panelL.position.x = -2;
  const panelR = mesh(GEO.box(2.4, 0.08, 0.9), panelMat);
  panelR.position.x = 2;
  const dish = mesh(GEO.cone(0.6, 0.4, 10), toyMat(0xf4f4ff));
  dish.rotation.x = Math.PI / 2;
  dish.position.z = 0.9;
  const ant = mesh(GEO.cylinder(0.05, 0.05, 1.3), toyMat(0xeeeeee));
  ant.position.y = 1;
  return group(hull, panelL, panelR, dish, ant);
}

function makeStation(): THREE.Group {
  const modMat = toyMat(0xf0f3ff);
  const ring = mesh(GEO.torus(3, 0.42), toyMat(0xcfd6e6));
  ring.rotation.x = -Math.PI / 2;
  const hub = mesh(GEO.sphere(1.1), toyMat(0xffb454));
  const spokeA = mesh(GEO.cylinder(0.3, 0.3, 6, 8), modMat);
  spokeA.rotation.z = Math.PI / 2;
  const spokeB = mesh(GEO.cylinder(0.3, 0.3, 6, 8), modMat);
  spokeB.rotation.x = Math.PI / 2;
  const tower = mesh(GEO.cylinder(0.7, 0.7, 2.4, 8), modMat);
  tower.position.y = 1.4;
  const pod = mesh(GEO.roundedBox(1.6, 1.2, 1.6, 0.3), toyMat(0xffb454));
  pod.position.set(3.6, 1.2, 0);
  return group(ring, hub, spokeA, spokeB, tower, pod);
}

export function createSpaceWorld(stage: ThreeStage, opts: WorldOpts = {}): World {
  const q = opts.quality ?? renderQuality();
  const rnd = seeded(opts.seed ?? 77);
  const size = opts.size ?? 50;
  const root = new THREE.Group();
  const spins: Spin[] = [];
  const orbits: Orbit[] = [];
  const tumbles: Tumble[] = [];
  const bobs: Bob[] = [];

  const stars = makeStarField(qcount(350, 1400, q));
  root.add(stars);

  const planetSpecs: [number, number, number, number, number, boolean][] = [
    [3.4, 0xff8c42, 0, 0, 0, true],
    [2.2, 0x6fd3ff, -16, 6, -20, false],
    [1.6, 0xc77dff, 18, -5, -26, false],
  ];
  const planetGroups: THREE.Group[] = [];
  planetSpecs.forEach(([r, col, x, y, z, ring]) => {
    const p = makePlanet(r, col, ring);
    p.position.set(x, y, z);
    root.add(p);
    planetGroups.push(p);
    spins.push({ o: p.children[0], sx: 0.05, sy: 0.18 + r * 0.04 });
    bobs.push({ g: p, y, phase: rnd() * 6.28 });
  });

  const moonMat = matteMat(0xd8d3c8, { flatShading: true });
  const moonSpecs: [number, number, number, number][] = [
    [1.1, 6.5, 0.35, 0],
    [0.8, 4.8, 0.5, 2],
  ];
  for (const [r, dist, speed, idx] of moonSpecs) {
    const planet = planetGroups[idx];
    const pivot = group();
    const moon = mesh(GEO.sphere(r), moonMat);
    moon.position.x = dist;
    pivot.add(moon);
    planet.add(pivot);
    orbits.push({ pivot, speed });
    spins.push({ o: moon, sx: 0.1, sy: 0.22 });
  }

  for (let i = 0, n = qcount(6, 16, q); i < n; i++) {
    const a = rnd() * 6.28;
    const u = rnd() * 2 - 1;
    const rr = 20 + rnd() * (size * 0.8);
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const ar = Math.round((0.5 + rnd() * 0.9) * 5) / 5;
    const rock = mesh(
      rnd() < 0.5 ? GEO.icosahedron(ar) : GEO.diamond(ar),
      matteMat(0x8d8778, { flatShading: true })
    );
    rock.position.set(Math.cos(a) * s * rr, u * rr * 0.4, Math.sin(a) * s * rr);
    root.add(rock);
    tumbles.push({
      o: rock,
      rx: (rnd() - 0.5) * 1.4,
      ry: (rnd() - 0.5) * 1.4,
      rz: (rnd() - 0.5) * 1.4,
    });
  }
  const satPivot = group();
  const sat = makeSatellite();
  sat.position.x = size * 0.55;
  sat.rotation.z = 0.3;
  satPivot.add(sat);
  satPivot.rotation.y = 1.2;
  root.add(satPivot);
  orbits.push({ pivot: satPivot, speed: 0.12 });
  tumbles.push({ o: sat, rx: 0, ry: 0.05, rz: 0.08 });

  const station = makeStation();
  station.scale.setScalar(1.5);
  const stationY = 12;
  station.position.set(-24, stationY, -34);
  root.add(station);

  function update(dt: number, t: number): void {
    stars.rotation.y = t * 0.014;
    stars.rotation.x = Math.sin(t * 0.05) * 0.04;
    for (const s of spins) {
      s.o.rotation.x = t * s.sx;
      s.o.rotation.y = t * s.sy;
    }
    for (const o of orbits) o.pivot.rotation.y = t * o.speed;
    for (const a of tumbles) {
      a.o.rotation.x += a.rx * dt;
      a.o.rotation.y += a.ry * dt;
      a.o.rotation.z += a.rz * dt;
    }
    for (const b of bobs) b.g.position.y = b.y + Math.sin(t * 0.45 + b.phase) * 0.8;
    station.rotation.y = t * 0.06;
    station.position.y = stationY + Math.sin(t * 0.35 + 1.4) * 1.2;
  }

  stage.scene.add(root);
  return makeWorld(root, update);
}
