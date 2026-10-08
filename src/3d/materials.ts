import * as THREE from 'three';

/**
 * Shared material / geometry factory.
 *
 * Every toy-like mesh in the collection comes from here so that:
 *  - colours and glossiness stay consistent across all 12 games
 *  - identical geometry is never duplicated (cached + shared)
 *  - cache entries survive scene changes (they are marked `userData.shared`
 *    so `ThreeStage.dispose()` never frees them)
 */

export type Quality = 'high' | 'medium' | 'low';

let quality: Quality = 'high';

export function setRenderQuality(q: Quality): void {
  quality = q;
}

export function renderQuality(): Quality {
  return quality;
}

/* ------------------------------------------------------------------ */
/* materials                                                           */
/* ------------------------------------------------------------------ */

const matCache = new Map<string, THREE.MeshPhongMaterial>();

export interface ToyMatOpts {
  /** Glossy toy finish (default true). */
  shiny?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  /** 0..1 - values < 1 make the material transparent. */
  opacity?: number;
  transparent?: boolean;
  flatShading?: boolean;
  side?: THREE.Side;
  depthWrite?: boolean;
}

function hashOpts(o: ToyMatOpts): string {
  return [
    o.shiny ?? true,
    o.emissive ?? 0,
    o.emissiveIntensity ?? 1,
    o.opacity ?? 1,
    o.transparent ?? false,
    o.flatShading ?? false,
    o.side ?? THREE.FrontSide,
    o.depthWrite ?? true,
  ].join('|');
}

/** Cached glossy "plastic toy" material. */
export function toyMat(color: number, opts: ToyMatOpts = {}): THREE.MeshPhongMaterial {
  const key = `${color}|${hashOpts(opts)}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const shininess = opts.shiny === false ? 4 : 90;
  const m = new THREE.MeshPhongMaterial({
    color,
    shininess,
    specular: opts.shiny === false ? 0x111111 : 0x555555,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    flatShading: opts.flatShading ?? false,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
  if (opts.opacity !== undefined && opts.opacity < 1) {
    m.transparent = true;
    m.opacity = opts.opacity;
  } else if (opts.transparent) {
    m.transparent = true;
  }
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}

/** Matte variant (ground, cardboard, cloth). */
export function matteMat(color: number, opts: ToyMatOpts = {}): THREE.MeshPhongMaterial {
  return toyMat(color, { ...opts, shiny: false });
}

/** Translucent glass/bubble material. */
export function glassMat(color: number, opacity = 0.35): THREE.MeshPhongMaterial {
  return toyMat(color, {
    opacity,
    transparent: true,
    depthWrite: false,
    emissive: color,
    emissiveIntensity: 0.12,
  });
}

/** Self-lit material (lights, glows, neon). */
export function glowMat(color: number, intensity = 0.85): THREE.MeshPhongMaterial {
  return toyMat(color, { emissive: color, emissiveIntensity: intensity });
}

/* ------------------------------------------------------------------ */
/* geometries                                                          */
/* ------------------------------------------------------------------ */

const geoCache = new Map<string, THREE.BufferGeometry>();

export function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = make();
  g.userData.shared = true;
  geoCache.set(key, g);
  return g;
}

/** Rounded box (toy-like softened edges), exact requested dimensions. */
export function roundedBoxGeometry(w: number, h: number, d: number, radius = 0.12): THREE.BufferGeometry {
  const r = Math.max(0.001, Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const key = `rb:${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${r.toFixed(3)}`;
  return cachedGeo(key, () => {
    const iw = Math.max(0.002, w - 2 * r);
    const ih = Math.max(0.002, h - 2 * r);
    const shape = new THREE.Shape();
    const x = -iw / 2;
    const y = -ih / 2;
    shape.moveTo(x, y);
    shape.lineTo(x + iw, y);
    shape.quadraticCurveTo(x + iw + r, y, x + iw + r, y + r);
    shape.lineTo(x + iw + r, y + ih);
    shape.quadraticCurveTo(x + iw + r, y + ih + r, x + iw, y + ih + r);
    shape.lineTo(x, y + ih + r);
    shape.quadraticCurveTo(x - r, y + ih + r, x - r, y + ih);
    shape.lineTo(x - r, y);
    shape.quadraticCurveTo(x - r, y, x, y);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.002, d - 2 * r),
      bevelEnabled: true,
      bevelThickness: r,
      bevelSize: r,
      bevelSegments: 2,
      curveSegments: 3,
    });
    g.center();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const sx = w / Math.max(0.001, bb.max.x - bb.min.x);
    const sy = h / Math.max(0.001, bb.max.y - bb.min.y);
    const sz = d / Math.max(0.001, bb.max.z - bb.min.z);
    g.scale(sx, sy, sz);
    g.computeVertexNormals();
    return g;
  });
}

const SEG = (): number => (quality === 'high' ? 24 : quality === 'medium' ? 18 : 12);
const SEG_LOW = (): number => (quality === 'high' ? 14 : 10);

export const GEO = {
  sphere(r = 1, seg?: number): THREE.SphereGeometry {
    const s = seg ?? SEG();
    return cachedGeo(`s:${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(6, Math.round(s * 0.7)))) as THREE.SphereGeometry;
  },
  box(w = 1, h = 1, d = 1): THREE.BoxGeometry {
    return cachedGeo(`b:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)) as THREE.BoxGeometry;
  },
  roundedBox(w = 1, h = 1, d = 1, r = 0.12): THREE.BufferGeometry {
    return roundedBoxGeometry(w, h, d, r);
  },
  cylinder(rt = 0.5, rb = 0.5, h = 1, seg?: number): THREE.CylinderGeometry {
    const s = seg ?? SEG();
    return cachedGeo(`c:${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)) as THREE.CylinderGeometry;
  },
  cone(r = 0.5, h = 1, seg?: number): THREE.ConeGeometry {
    const s = seg ?? SEG();
    return cachedGeo(`k:${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)) as THREE.ConeGeometry;
  },
  capsule(r = 0.4, len = 0.8): THREE.CapsuleGeometry {
    return cachedGeo(`cp:${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 4, SEG_LOW())) as THREE.CapsuleGeometry;
  },
  torus(r = 0.5, tube = 0.16): THREE.TorusGeometry {
    return cachedGeo(`t:${r},${tube}`, () => new THREE.TorusGeometry(r, tube, 10, SEG())) as THREE.TorusGeometry;
  },
  plane(w = 1, h = 1, sw = 1, sh = 1): THREE.PlaneGeometry {
    return cachedGeo(`p:${w},${h},${sw},${sh}`, () => new THREE.PlaneGeometry(w, h, sw, sh)) as THREE.PlaneGeometry;
  },
  circle(r = 1, seg?: number): THREE.CircleGeometry {
    const s = seg ?? SEG();
    return cachedGeo(`ci:${r},${s}`, () => new THREE.CircleGeometry(r, s)) as THREE.CircleGeometry;
  },
  ring(inner = 0.4, outer = 0.5, seg?: number): THREE.RingGeometry {
    const s = seg ?? SEG();
    return cachedGeo(`ri:${inner},${outer},${s}`, () => new THREE.RingGeometry(inner, outer, s)) as THREE.RingGeometry;
  },
  octahedron(r = 0.5): THREE.OctahedronGeometry {
    return cachedGeo(`o:${r}`, () => new THREE.OctahedronGeometry(r, 0)) as THREE.OctahedronGeometry;
  },
  icosahedron(r = 0.5): THREE.IcosahedronGeometry {
    return cachedGeo(`i:${r}`, () => new THREE.IcosahedronGeometry(r, 0)) as THREE.IcosahedronGeometry;
  },
  diamond(r = 0.5): THREE.OctahedronGeometry {
    return cachedGeo(`d:${r}`, () => {
      const g = new THREE.OctahedronGeometry(r, 0);
      g.scale(1, 1.35, 1);
      return g;
    }) as THREE.OctahedronGeometry;
  },
  lathe(points: number[][], seg = 14): THREE.LatheGeometry {
    const key = `la:${points.flat().map((n) => n.toFixed(3)).join(',')},${seg}`;
    return cachedGeo(key, () => new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), seg)) as THREE.LatheGeometry;
  },
  extrude(shape: THREE.Shape, depth = 0.2, key: string): THREE.ExtrudeGeometry {
    return cachedGeo(`e:${key}`, () => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 5 })) as THREE.ExtrudeGeometry;
  },
};

/** Mesh helper: cached geometry + material, shadow flags on by default. */
export function mesh(
  g: THREE.BufferGeometry,
  m: THREE.Material,
  opts: { cast?: boolean; receive?: boolean } = {}
): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = opts.cast ?? true;
  o.receiveShadow = opts.receive ?? true;
  return o;
}

/** Group helper (never casts shadows by default - keeps draw cost low). */
export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  children.forEach((c) => c && g.add(c));
  return g;
}

/** Free every cached non-shared resource. Called by tests only. */
export function disposeMaterialCache(): void {
  matCache.forEach((m) => m.dispose());
  matCache.clear();
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
}
