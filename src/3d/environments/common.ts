import * as THREE from 'three';
import { GEO, group, matteMat, mesh, type Quality } from '../materials';

export interface World {
  root: THREE.Group;
  update(dt: number, t: number): void;
  dispose(): void;
}

export interface WorldOpts {
  quality?: Quality;
  seed?: number;
  size?: number;
}

export function seeded(seed: number): () => number {
  let a = (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function qcount(low: number, high: number, q: Quality): number {
  if (q === 'low') return low;
  if (q === 'medium') return Math.round((low + high) * 0.5);
  return high;
}

export function makeWorld(root: THREE.Group, update: (dt: number, t: number) => void): World {
  return {
    root,
    update,
    dispose(): void {
      root.removeFromParent();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) {
          for (const mm of mat) if (!mm.userData.shared) mm.dispose();
        } else if (mat && !mat.userData.shared) {
          mat.dispose();
        }
      });
    },
  };
}

export function makeGround(radius: number, color: number, opts: { seg?: number; y?: number } = {}): THREE.Mesh {
  const m = mesh(GEO.circle(radius, opts.seg), matteMat(color), { cast: false, receive: true });
  m.rotation.x = -Math.PI / 2;
  m.position.y = opts.y ?? 0;
  return m;
}

export function makeCloud(scale = 1): THREE.Group {
  const mat = matteMat(0xffffff);
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [1.1, 0.1, 0.1, 0.72],
    [-1.05, 0.05, -0.1, 0.66],
    [0.25, 0.55, 0.15, 0.58],
  ];
  const g = group();
  for (const p of puffs) {
    const m = mesh(GEO.sphere(p[3]), mat, { cast: false, receive: false });
    m.position.set(p[0], p[1], p[2]);
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

export function makeTree(opts: { height?: number; color?: number; autumn?: boolean } = {}): THREE.Group {
  const h = Math.round((opts.height ?? 4) * 2) / 2;
  const trunkH = h * 0.5;
  const trunk = mesh(GEO.cylinder(0.16, 0.26, trunkH), matteMat(0x8a5a34));
  trunk.position.y = trunkH * 0.5;
  const autumn = opts.autumn ?? false;
  const r = Math.round(h * 0.32 * 4) / 4;
  const cols = autumn
    ? [opts.color ?? 0xe8762c, 0xd94f2b, 0xf2b134]
    : [opts.color ?? 0x4fa83c, 0x3d8f34, 0x68bd4e];
  const lobes: [number, number, number, number][] = [
    [0, trunkH + r * 0.7, 0, r],
    [-r * 0.8, trunkH + r * 0.3, r * 0.2, r * 0.7],
    [r * 0.85, trunkH + r * 0.25, -r * 0.25, r * 0.65],
  ];
  const canopy = group();
  lobes.forEach((l, i) => {
    const m = mesh(GEO.sphere(l[3]), matteMat(cols[i]));
    m.position.set(l[0], l[1], l[2]);
    canopy.add(m);
  });
  const g = group(trunk, canopy);
  g.userData.canopy = canopy;
  return g;
}

export function makeRock(scale = 1): THREE.Mesh {
  const m = mesh(GEO.icosahedron(1), matteMat(0x96908a, { flatShading: true }));
  m.scale.set(scale, scale * 0.7, scale * 0.85);
  m.rotation.set(0.35, 0.7, 0.12);
  return m;
}
