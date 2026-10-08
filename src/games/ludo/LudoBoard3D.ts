import * as THREE from 'three';
import type { ThreeStage } from '../../three/stage';
import {
  FINISH,
  LANE,
  PATH,
  PLAYER_COLOR,
  PLAYER_LIGHT,
  SAFE_PATH_INDICES,
  START_INDEX,
  YARD_SLOTS,
  gridX,
  gridZ,
  posWorld,
  type LudoState,
  type Move,
} from './LudoRules';

/**
 * Procedural 3D Ludo board: raised base, cross track, coloured yards,
 * home lanes, safe stars, finish triangles, 16 pawn tokens and a real
 * 3D die. All geometry is generated locally - no external assets.
 */

const BOARD_TOP = 0.16; // top surface of track/lane/finish tiles
const YARD_TOP = 0.075;
const DICE_POS = { x: 10.35, y: 0, z: 4.15 };

/* ------------------------------------------------------------------ */
/* small geometry helpers                                              */
/* ------------------------------------------------------------------ */

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? outer : inner;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  s.closePath();
  return s;
}

function crossShape(): THREE.Shape {
  const a = 7.5; // half length of each arm
  const b = 1.5; // half width of each arm
  const s = new THREE.Shape();
  s.moveTo(-b, -a);
  s.lineTo(b, -a);
  s.lineTo(b, -b);
  s.lineTo(a, -b);
  s.lineTo(a, b);
  s.lineTo(b, b);
  s.lineTo(b, a);
  s.lineTo(-b, a);
  s.lineTo(-b, b);
  s.lineTo(-a, b);
  s.lineTo(-a, -b);
  s.lineTo(-b, -b);
  s.closePath();
  return s;
}

/** Extruded flat plate lying on the y = yBottom plane. */
function plate(
  shape: THREE.Shape,
  depth: number,
  color: number,
  opts: { bevel?: number; y?: number; roughness?: number } = {}
): THREE.Mesh {
  const bevel = opts.bevel ?? 0.02;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.75,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = opts.y ?? 0;
  mesh.receiveShadow = true;
  return mesh;
}

function boxMesh(w: number, h: number, d: number, color: number, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02 })
  );
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* tokens                                                              */
/* ------------------------------------------------------------------ */

function pawnGeometry(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.02, 0.0),
    new THREE.Vector2(0.3, 0.0),
    new THREE.Vector2(0.34, 0.05),
    new THREE.Vector2(0.3, 0.11),
    new THREE.Vector2(0.18, 0.17),
    new THREE.Vector2(0.13, 0.4),
    new THREE.Vector2(0.17, 0.5),
    new THREE.Vector2(0.24, 0.56),
    new THREE.Vector2(0.25, 0.62),
    new THREE.Vector2(0.19, 0.66),
    new THREE.Vector2(0.1, 0.68),
    new THREE.Vector2(0.02, 0.68),
  ];
  return new THREE.LatheGeometry(pts, 22);
}

interface TokenVisual {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  selectable: boolean;
}

/* ------------------------------------------------------------------ */
/* die                                                                 */
/* ------------------------------------------------------------------ */

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.22, -0.22],
    [0.22, 0.22],
  ],
  3: [
    [-0.22, -0.22],
    [0, 0],
    [0.22, 0.22],
  ],
  4: [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [0.22, 0.22],
  ],
  5: [
    [-0.22, -0.22],
    [0.22, -0.22],
    [0, 0],
    [-0.22, 0.22],
    [0.22, 0.22],
  ],
  6: [
    [-0.22, -0.24],
    [-0.22, 0],
    [-0.22, 0.24],
    [0.22, -0.24],
    [0.22, 0],
    [0.22, 0.24],
  ],
};

/** Euler orientation that puts the given face value on top. */
function diceEulerFor(value: number): { x: number; y: number; z: number } {
  switch (value) {
    case 1:
      return { x: -Math.PI / 2, y: 0, z: 0 }; // +Z face up
    case 6:
      return { x: Math.PI / 2, y: 0, z: 0 }; // -Z face up
    case 2:
      return { x: 0, y: 0, z: 0 }; // +Y face up
    case 5:
      return { x: Math.PI, y: 0, z: 0 }; // -Y face up
    case 3:
      return { x: 0, y: 0, z: Math.PI / 2 }; // +X face up
    default:
      return { x: 0, y: 0, z: -Math.PI / 2 }; // 4: -X face up
  }
}

function buildDice(): THREE.Group {
  const group = new THREE.Group();
  group.userData.pick = 'dice';

  const shape = roundedRectShape(0.7, 0.7, 0.1);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.7,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelSegments: 3,
    curveSegments: 5,
  });
  geo.center();
  const body = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xfffdf5, roughness: 0.35, metalness: 0.05 })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const pipMat = new THREE.MeshStandardMaterial({ color: 0x2b2d44, roughness: 0.5 });
  const pipGeo = new THREE.CircleGeometry(0.07, 16);
  const addPips = (value: number, place: (u: number, v: number) => THREE.Object3D): void => {
    for (const [u, v] of PIPS[value]) {
      const pip = new THREE.Mesh(pipGeo, pipMat);
      const holder = place(u, v);
      holder.add(pip);
      group.add(holder);
    }
  };
  // +Z = 1
  addPips(1, (u, v) => {
    const o = new THREE.Object3D();
    o.position.set(u, v, 0.504);
    return o;
  });
  // -Z = 6
  addPips(6, (u, v) => {
    const o = new THREE.Object3D();
    o.position.set(u, v, -0.504);
    o.rotation.y = Math.PI;
    return o;
  });
  // +X = 3
  addPips(3, (u, v) => {
    const o = new THREE.Object3D();
    o.position.set(0.504, v, -u);
    o.rotation.y = Math.PI / 2;
    return o;
  });
  // -X = 4
  addPips(4, (u, v) => {
    const o = new THREE.Object3D();
    o.position.set(-0.504, v, u);
    o.rotation.y = -Math.PI / 2;
    return o;
  });
  // +Y = 2
  addPips(2, (u, v) => {
    const o = new THREE.Object3D();
    o.position.set(u, 0.504, v);
    o.rotation.x = -Math.PI / 2;
    return o;
  });
  // -Y = 5
  addPips(5, (u, v) => {
    const o = new THREE.Object3D();
    o.position.set(u, -0.504, -v);
    o.rotation.x = Math.PI / 2;
    return o;
  });

  group.scale.setScalar(1.35);
  return group;
}

/* ------------------------------------------------------------------ */
/* board                                                               */
/* ------------------------------------------------------------------ */

export class LudoBoard3D {
  readonly root = new THREE.Group();
  readonly dice: THREE.Group;
  private readonly stage: ThreeStage;
  private readonly tokenVis: TokenVisual[][] = [];
  private readonly diceHolder = new THREE.Group();

  constructor(stage: ThreeStage) {
    this.stage = stage;
    this.buildGround();
    this.buildBase();
    this.buildTrack();
    this.buildYards();
    this.buildLanes();
    this.buildCenter();
    this.buildTokens();
    this.dice = buildDice();
    this.diceHolder.add(this.dice);
    this.diceHolder.position.set(DICE_POS.x, 0.98, DICE_POS.z);
    this.dice.rotation.set(diceEulerFor(1).x, diceEulerFor(1).y, diceEulerFor(1).z);
    this.root.add(this.diceHolder);
    stage.scene.add(this.root);

    stage.onUpdate((dt, now) => this.pulse(dt, now));
  }

  /* ---------------- construction ---------------- */

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x7ed957, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.93;
    ground.receiveShadow = true;
    this.root.add(ground);

    // a few simple low-poly trees around the board
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0xc98a5b, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4faa3f, roughness: 0.85 });
    const spots: [number, number][] = [
      [-12.5, -9.5],
      [12.8, -8.8],
      [-13.2, 9.4],
      [13.4, 10.2],
      [-11.6, 2.4],
      [11.8, -2.6],
    ];
    for (const [x, z] of spots) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 8), trunkMat);
      trunk.position.set(x, -0.33, z);
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.4, 9), leafMat);
      leaves.position.set(x, 1.4, z);
      leaves.castShadow = true;
      this.root.add(trunk, leaves);
    }

    // dice pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.7, 1.18, 24),
      new THREE.MeshStandardMaterial({ color: 0xfff6e3, roughness: 0.7 })
    );
    ped.position.set(DICE_POS.x, -0.34, DICE_POS.z);
    ped.castShadow = true;
    ped.receiveShadow = true;
    this.root.add(ped);
    const padTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.1, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.6 })
    );
    padTop.position.set(DICE_POS.x, 0.24, DICE_POS.z);
    padTop.receiveShadow = true;
    this.root.add(padTop);
  }

  private buildBase(): void {
    const base = plate(roundedRectShape(16.7, 16.7, 1.3), 0.9, 0xe8915a, {
      bevel: 0.08,
      y: -0.9,
      roughness: 0.85,
    });
    base.receiveShadow = true;
    this.root.add(base);
    const rim = plate(roundedRectShape(16.1, 16.1, 1.1), 0.05, 0xfff6e3, { bevel: 0.03, y: -0.02 });
    rim.receiveShadow = true;
    this.root.add(rim);
  }

  private buildTrack(): void {
    // white cross underlay so the gaps between tiles read as grid lines
    const underlay = plate(crossShape(), 0.06, 0xfbfaf3, { bevel: 0.02 });
    this.root.add(underlay);

    const white = 0xffffff;
    const safeSet = new Set<number>(SAFE_PATH_INDICES);
    PATH.forEach(([row, col], idx) => {
      let color = white;
      const startP = START_INDEX.indexOf(idx as (typeof START_INDEX)[number]);
      if (startP >= 0) color = PLAYER_COLOR[startP];
      else if (safeSet.has(idx)) color = 0xffe9a8;
      const tile = boxMesh(0.92, 0.1, 0.92, color, 0.11);
      tile.position.x = gridX(col);
      tile.position.z = gridZ(row);
      this.root.add(tile);
      if (safeSet.has(idx) && startP < 0) {
        const star = plate(starShape(0.3, 0.14), 0.02, 0xf0b429, { bevel: 0, y: 0.161 });
        star.position.x = gridX(col);
        star.position.z = gridZ(row);
        this.root.add(star);
      }
    });
  }

  private buildYards(): void {
    const centers = [
      { x: -4.5, z: -4.5 },
      { x: 4.5, z: -4.5 },
      { x: 4.5, z: 4.5 },
      { x: -4.5, z: 4.5 },
    ];
    for (let p = 0; p < 4; p++) {
      const c = centers[p];
      const plateMesh = plate(roundedRectShape(5.7, 5.7, 0.7), 0.06, PLAYER_COLOR[p], {
        bevel: 0.04,
        roughness: 0.7,
      });
      plateMesh.position.set(c.x, 0, c.z);
      this.root.add(plateMesh);

      const circle = new THREE.Mesh(
        new THREE.CircleGeometry(2.05, 36),
        new THREE.MeshStandardMaterial({ color: PLAYER_LIGHT[p], roughness: 0.8 })
      );
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(c.x, 0.072, c.z);
      circle.receiveShadow = true;
      this.root.add(circle);

      const ringMat = new THREE.MeshStandardMaterial({ color: PLAYER_COLOR[p], roughness: 0.6 });
      for (const [row, col] of YARD_SLOTS[p]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 22), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(gridX(col), 0.074, gridZ(row));
        this.root.add(ring);
      }
    }
  }

  private buildLanes(): void {
    for (let p = 0; p < 4; p++) {
      LANE[p].forEach(([row, col], i) => {
        const color = i === LANE[p].length - 1 ? PLAYER_LIGHT[p] : PLAYER_COLOR[p];
        const tile = boxMesh(0.92, 0.1, 0.92, color, 0.11);
        tile.position.x = gridX(col);
        tile.position.z = gridZ(row);
        this.root.add(tile);
      });
    }
  }

  private buildCenter(): void {
    const corners = [
      [-1.5, -1.5],
      [1.5, -1.5],
      [1.5, 1.5],
      [-1.5, 1.5],
    ];
    // triangle order: p0 left, p1 top, p2 right, p3 bottom
    const tris: number[][][] = [
      [corners[0], corners[3], [0, 0]],
      [corners[0], corners[1], [0, 0]],
      [corners[1], corners[2], [0, 0]],
      [corners[3], corners[2], [0, 0]],
    ];
    tris.forEach((tri, p) => {
      const shape = new THREE.Shape();
      // shape (sx, sy) maps to world (sx, 0, -sy) after rotateX(-90)
      shape.moveTo(tri[0][0], -tri[0][1]);
      shape.lineTo(tri[1][0], -tri[1][1]);
      shape.lineTo(tri[2][0], -tri[2][1]);
      shape.closePath();
      const mesh = plate(shape, 0.1, PLAYER_COLOR[p], { bevel: 0.02, y: 0.06 });
      mesh.receiveShadow = true;
      this.root.add(mesh);
    });

    const centre = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.06, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    );
    centre.position.y = 0.19;
    centre.castShadow = true;
    this.root.add(centre);
  }

  private buildTokens(): void {
    const geo = pawnGeometry();
    const headGeo = new THREE.SphereGeometry(0.17, 18, 12);
    const hitGeo = new THREE.SphereGeometry(0.62, 8, 6);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const ringGeo = new THREE.RingGeometry(0.42, 0.58, 24);

    for (let p = 0; p < 4; p++) {
      const row: TokenVisual[] = [];
      for (let t = 0; t < 4; t++) {
        const group = new THREE.Group();
        group.userData = { pick: 'token', player: p, token: t };

        const body = new THREE.MeshStandardMaterial({
          color: PLAYER_COLOR[p],
          roughness: 0.42,
          metalness: 0.06,
          emissive: PLAYER_COLOR[p],
          emissiveIntensity: 0,
        });
        const bodyMesh = new THREE.Mesh(geo, body);
        bodyMesh.castShadow = true;
        const head = new THREE.Mesh(headGeo, body);
        head.position.y = 0.8;
        head.castShadow = true;

        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.y = 0.45;

        const ring = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        ring.visible = false;

        group.add(bodyMesh, head, hit, ring);
        this.root.add(group);
        row.push({ group, body, ring, selectable: false });
      }
      this.tokenVis.push(row);
    }
  }

  /* ---------------- state sync ---------------- */

  /** Snap every token to its logical position (no animation). */
  sync(state: LudoState): void {
    for (let p = 0; p < 4; p++) {
      for (let t = 0; t < 4; t++) {
        this.snapToken(p, t, state.tokens[p][t]);
      }
    }
  }

  snapToken(p: number, t: number, pos: number): void {
    const v = this.tokenVis[p][t];
    const spot = this.spotFor(p, t, pos);
    v.group.position.set(spot.x, this.tokenY(pos), spot.z);
    v.group.scale.setScalar(pos === FINISH ? 0.7 : 1);
    v.group.visible = true;
  }

  private tokenY(pos: number): number {
    return pos === -1 ? YARD_TOP : BOARD_TOP;
  }

  /** World spot for a token, with a small spread when cells are shared. */
  spotFor(p: number, t: number, pos: number): { x: number; z: number } {
    const w = posWorld(p, pos, t);
    if (pos < 0 || pos > 50) return w;
    return { x: w.x + (t % 2) * 0.2 - 0.1, z: w.z + Math.floor(t / 2) * 0.2 - 0.1 };
  }

  /** Waypoints for a token moving from `from` to `to`. */
  waypointsFor(p: number, t: number, from: number, to: number): { x: number; z: number }[] {
    const pts: { x: number; z: number }[] = [];
    for (let pos = from + 1; pos <= to; pos++) pts.push(this.spotFor(p, t, pos));
    return pts;
  }

  tokenScreen(p: number, t: number): { x: number; y: number } | null {
    const g = this.tokenVis[p][t].group;
    return this.stage.project(g.position.x, g.position.y + 0.5, g.position.z);
  }

  diceScreen(): { x: number; y: number } | null {
    return this.stage.project(DICE_POS.x, DICE_POS.y + 1.2, DICE_POS.z);
  }

  /* ---------------- selection highlight ---------------- */

  setSelectable(moves: Move[] | null): void {
    for (let p = 0; p < 4; p++) {
      for (let t = 0; t < 4; t++) {
        const v = this.tokenVis[p][t];
        const on = !!moves && moves.some((m) => m.player === p && m.token === t);
        v.selectable = on;
        v.ring.visible = on;
        if (!on) {
          v.body.emissiveIntensity = 0;
        }
      }
    }
  }

  private pulse(_dt: number, now: number): void {
    const s = Math.sin(now * 0.007);
    for (let p = 0; p < 4; p++) {
      for (let t = 0; t < 4; t++) {
        const v = this.tokenVis[p][t];
        if (!v.selectable) continue;
        v.body.emissiveIntensity = 0.3 + 0.22 * s;
        const k = 1 + 0.12 * Math.sin(now * 0.007 + p);
        v.ring.scale.setScalar(k);
      }
    }
  }

  /* ---------------- animation ---------------- */

  /** Move a token through waypoints with a hopping arc. */
  animateToken(
    p: number,
    t: number,
    waypoints: { x: number; z: number }[],
    yFrom: number,
    yTo: number,
    hopDur: number,
    onHop?: () => void,
    onDone?: () => void
  ): void {
    const v = this.tokenVis[p][t];
    v.selectable = false;
    v.ring.visible = false;
    v.body.emissiveIntensity = 0;

    const start = v.group.position.clone();
    const points = [{ x: start.x, z: start.z }, ...waypoints];
    const stepDur = hopDur;

    let idx = 0;
    const hop = (): void => {
      if (idx >= waypoints.length) {
        v.group.position.y = yTo;
        onDone?.();
        return;
      }
      const from = points[idx];
      const to = points[idx + 1];
      const baseFrom = idx === 0 ? yFrom : yTo;
      this.stage.tween({
        dur: stepDur,
        ease: (k) => k,
        onUpdate: (k) => {
          const arc = Math.sin(Math.PI * k) * 0.75;
          v.group.position.x = from.x + (to.x - from.x) * k;
          v.group.position.z = from.z + (to.z - from.z) * k;
          v.group.position.y = baseFrom + (yTo - baseFrom) * k + arc;
        },
        onComplete: () => {
          v.group.position.set(to.x, yTo, to.z);
          onHop?.();
          idx++;
          hop();
        },
      });
    };
    hop();
  }

  /** Captured token arcs back to its yard slot. */
  flyHome(p: number, t: number, onDone?: () => void): void {
    const v = this.tokenVis[p][t];
    v.selectable = false;
    v.ring.visible = false;
    v.body.emissiveIntensity = 0;
    const w = posWorld(p, -1, t);
    const from = v.group.position.clone();
    const mid = new THREE.Vector3((from.x + w.x) / 2, 3.2, (from.z + w.z) / 2);
    this.stage.tween({
      dur: 620,
      ease: (k) => k,
      onUpdate: (k) => {
        const a = from.clone().lerp(mid, k);
        const b = mid.clone().lerp(new THREE.Vector3(w.x, YARD_TOP, w.z), k);
        const pnt = a.lerp(b, k);
        v.group.position.copy(pnt);
        v.group.scale.setScalar(1 - 0.2 * Math.sin(Math.PI * k));
      },
      onComplete: () => {
        v.group.position.set(w.x, YARD_TOP, w.z);
        v.group.scale.setScalar(1);
        onDone?.();
      },
    });
  }

  /** Little celebration hop for a finished token. */
  celebrate(p: number, t: number): void {
    const v = this.tokenVis[p][t];
    const y0 = v.group.position.y;
    this.stage.tween({
      dur: 700,
      onUpdate: (k) => {
        v.group.position.y = y0 + Math.sin(Math.PI * k * 2) * 0.5;
        v.group.rotation.y = k * Math.PI * 4;
      },
      onComplete: () => {
        v.group.position.y = y0;
        v.group.rotation.y = 0;
      },
    });
  }

  /** Spin the die and settle with the rolled value on top. */
  rollDice(value: number, onDone?: () => void): void {
    const target = diceEulerFor(value);
    const from = { x: this.dice.rotation.x, y: this.dice.rotation.y, z: this.dice.rotation.z };
    // end orientation must equal the target modulo 2*pi, and spin forward
    // at least 1.5 turns so the tumble always looks like a real roll.
    const forward = (f: number, t: number): number => {
      const k = Math.ceil((f - t + Math.PI * 3) / (Math.PI * 2));
      return t + k * Math.PI * 2;
    };
    const end = {
      x: forward(from.x, target.x),
      y: forward(from.y, target.y + Math.PI * 2 * Math.floor(Math.random() * 2)),
      z: forward(from.z, target.z + Math.PI * 2 * Math.floor(Math.random() * 2)),
    };
    this.stage.tween({
      dur: 950,
      ease: (k) => 1 - Math.pow(1 - k, 2.6),
      onUpdate: (k) => {
        this.dice.rotation.set(
          from.x + (end.x - from.x) * k,
          from.y + (end.y - from.y) * k,
          from.z + (end.z - from.z) * k
        );
        this.diceHolder.position.y = 0.98 + Math.sin(Math.PI * k) * 1.4;
      },
      onComplete: () => {
        this.dice.rotation.set(target.x, target.y, target.z);
        this.diceHolder.position.y = 0.98;
        onDone?.();
      },
    });
  }

  /** Top-face value currently shown by the die (for tests). */
  diceShown(): number {
    const r = this.dice.rotation;
    const wrap = (a: number): number => {
      const v = ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      return v;
    };
    const near = (a: number, b: number): boolean => Math.abs(wrap(a - b)) < 0.25;
    for (let v = 1; v <= 6; v++) {
      const ev = diceEulerFor(v);
      if (near(r.x, ev.x) && near(r.y, ev.y) && near(r.z, ev.z)) return v;
    }
    return 0;
  }

  setDiceInstant(value: number): void {
    const e = diceEulerFor(value);
    this.dice.rotation.set(e.x, e.y, e.z);
  }
}
