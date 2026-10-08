import * as THREE from 'three';
import type { ThreeStage } from './engine/stage';

/**
 * Pooled particle system (single THREE.Points draw call per texture) plus the
 * shared burst presets used across all games.
 *
 * Nothing is allocated while playing: particles live in fixed-size typed
 * arrays and are swap-removed when they die.
 */

export type ParticleTex = 'soft' | 'star' | 'square' | 'ring' | 'flame';

export interface BurstOpts {
  pos: THREE.Vector3 | { x: number; y: number; z: number };
  count?: number;
  color?: number | number[];
  speed?: number;
  /** seconds */
  life?: number;
  /** world units */
  size?: number;
  gravity?: number;
  /** 0 = tight, 1 = wide sphere */
  spread?: number;
  direction?: 'sphere' | 'up' | 'ring' | 'down' | 'forward';
  tex?: ParticleTex;
  additive?: boolean;
  drag?: number;
  radius?: number;
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; sizeEnd: number;
  r: number; g: number; b: number; a: number;
  grav: number; drag: number;
}

const texCache = new Map<ParticleTex, THREE.CanvasTexture>();

function particleTexture(name: ParticleTex): THREE.CanvasTexture {
  const hit = texCache.get(name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  if (name === 'soft') {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  } else if (name === 'star') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 30 : 12;
      const x = 32 + Math.cos(ang) * r;
      const y = 32 + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (name === 'square') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(8, 8, 48, 48);
  } else if (name === 'ring') {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(32, 40, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,220,150,0.85)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(name, t);
  return t;
}

const VERT = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  vec4 c = vColor * t;
  if (c.a < 0.02) discard;
  gl_FragColor = c;
}`;

class Pool {
  readonly points: THREE.Points;
  private readonly max: number;
  private count = 0;
  private readonly p: Particle[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;

  constructor(max: number, tex: ParticleTex, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: particleTexture(tex) }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(o: {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; size: number; sizeEnd: number;
    r: number; g: number; b: number;
    grav: number; drag: number;
  }): void {
    if (this.count >= this.max) return;
    this.p[this.count++] = { ...o, max: o.life, a: 1 };
  }

  update(dt: number, scale: number): number {
    let i = 0;
    while (i < this.count) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) {
        const last = this.p[--this.count];
        this.p[i] = last;
        continue;
      }
      q.vy += q.grav * dt;
      if (q.drag > 0) {
        const d = Math.max(0, 1 - q.drag * dt);
        q.vx *= d;
        q.vy *= d;
        q.vz *= d;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      const k = 1 - q.life / q.max;
      const o3 = i * 3;
      const o4 = i * 4;
      this.pos[o3] = q.x;
      this.pos[o3 + 1] = q.y;
      this.pos[o3 + 2] = q.z;
      this.col[o4] = q.r;
      this.col[o4 + 1] = q.g;
      this.col[o4 + 2] = q.b;
      this.col[o4 + 3] = q.a * (k < 0.7 ? 1 : (1 - k) / 0.3);
      this.size[i] = q.size + (q.sizeEnd - q.size) * k;
      i++;
    }
    this.mat.uniforms.uScale.value = scale;
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    return this.count;
  }

  get active(): number {
    return this.count;
  }

  clear(): void {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export interface EmitterOpts extends BurstOpts {
  /** particles per second */
  rate: number;
  area?: { x: number; y: number; z: number };
}

interface Emitter {
  opts: EmitterOpts;
  acc: number;
  dead: boolean;
}

export class ParticleSystem {
  private readonly stage: ThreeStage;
  private readonly root = new THREE.Group();
  private readonly pools = new Map<string, Pool>();
  private readonly emitters: Emitter[] = [];
  private t = 0;

  constructor(stage: ThreeStage) {
    this.stage = stage;
    stage.scene.add(this.root);
    stage.onUpdate((dt) => this.update(dt));
  }

  private pool(tex: ParticleTex, additive: boolean): Pool {
    const key = `${tex}|${additive ? 1 : 0}`;
    let p = this.pools.get(key);
    if (!p) {
      p = new Pool(480, tex, additive);
      this.root.add(p.points);
      this.pools.set(key, p);
    }
    return p;
  }

  burst(opts: BurstOpts): void {
    const count = opts.count ?? 18;
    const tex = opts.tex ?? 'soft';
    const pool = this.pool(tex, opts.additive ?? false);
    const speed = opts.speed ?? 5;
    const life = opts.life ?? 0.9;
    const size = opts.size ?? 0.45;
    const spread = opts.spread ?? 1;
    const dir = opts.direction ?? 'sphere';
    const grav = opts.gravity ?? -6;
    const drag = opts.drag ?? 1.2;
    const radius = opts.radius ?? 0;
    const cols = Array.isArray(opts.color)
      ? opts.color
      : [opts.color ?? 0xffffff];
    const p = opts.pos;

    for (let i = 0; i < count; i++) {
      const col = cols[i % cols.length];
      const c = new THREE.Color(col);
      let vx = 0, vy = 0, vz = 0;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      if (dir === 'up') {
        vx = Math.cos(a) * speed * spread * Math.random();
        vy = speed * (0.55 + Math.random() * 0.7);
        vz = Math.sin(a) * speed * spread * Math.random();
      } else if (dir === 'down') {
        vx = Math.cos(a) * speed * spread;
        vy = -speed * (0.4 + Math.random() * 0.6);
        vz = Math.sin(a) * speed * spread;
      } else if (dir === 'ring') {
        vx = Math.cos(a) * speed;
        vy = speed * 0.25 * (Math.random() - 0.3);
        vz = Math.sin(a) * speed;
      } else if (dir === 'forward') {
        vx = Math.cos(a) * speed * spread * 0.5;
        vy = Math.sin(a) * speed * spread * 0.5;
        vz = speed;
      } else {
        vx = Math.sin(b) * Math.cos(a) * speed * (0.35 + spread * Math.random());
        vy = Math.cos(b) * speed * (0.35 + spread * Math.random());
        vz = Math.sin(b) * Math.sin(a) * speed * (0.35 + spread * Math.random());
      }
      const r = radius > 0 ? radius : 0;
      pool.spawn({
        x: p.x + (Math.random() - 0.5) * r,
        y: p.y + (Math.random() - 0.5) * r,
        z: p.z + (Math.random() - 0.5) * r,
        vx, vy, vz,
        life: life * (0.7 + Math.random() * 0.6),
        size: size * (0.7 + Math.random() * 0.7),
        sizeEnd: size * 0.15,
        r: c.r, g: c.g, b: c.b,
        grav, drag,
      });
    }
  }

  /** Continuous emission; call `stop()` on the handle to end it. */
  emit(opts: EmitterOpts): { stop: () => void } {
    const e: Emitter = { opts, acc: 0, dead: false };
    this.emitters.push(e);
    return {
      stop: () => {
        e.dead = true;
      },
    };
  }

  /** Pause-aware delay (delegates to the stage timer queue). */
  delay(ms: number, fn: () => void): void {
    this.stage.delay(ms, fn);
  }

  private update(dt: number): void {
    this.t += dt;
    const h = this.stage.renderer.domElement.height || 600;
    const scale = (h * 0.5) / Math.tan(((this.stage.camera.fov * Math.PI) / 180) / 2);

    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (e.dead) {
        this.emitters.splice(i, 1);
        continue;
      }
      e.acc += e.opts.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        const a = e.opts.area;
        this.burst({
          ...e.opts,
          count: 1,
          pos: a
            ? {
                x: e.opts.pos.x + (Math.random() - 0.5) * a.x,
                y: e.opts.pos.y + (Math.random() - 0.5) * a.y,
                z: e.opts.pos.z + (Math.random() - 0.5) * a.z,
              }
            : e.opts.pos,
        });
      }
    }

    this.pools.forEach((pool) => pool.update(dt, scale));
  }

  get activeCount(): number {
    let n = 0;
    this.pools.forEach((p) => (n += p.active));
    return n;
  }

  clear(): void {
    this.emitters.length = 0;
    this.pools.forEach((p) => p.clear());
  }

  dispose(): void {
    this.clear();
    this.pools.forEach((p) => p.dispose());
    this.pools.clear();
    this.root.removeFromParent();
  }
}

/* ------------------------------------------------------------------ */
/* presets                                                             */
/* ------------------------------------------------------------------ */

type Pos = THREE.Vector3 | { x: number; y: number; z: number };

export function sparkleBurst(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  fx.burst({ pos, count: 16, color: [0xfff2a8, 0xffffff, 0xffd93d], speed: 3.4, life: 0.8, size: 0.4, tex: 'star', additive: true, gravity: -1.5, drag: 1.6, ...opts });
}

export function coinBurst(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  fx.burst({ pos, count: 14, color: [0xffd93d, 0xffe98a, 0xffa94d], speed: 4.2, life: 0.85, size: 0.42, tex: 'star', additive: true, gravity: -9, direction: 'up', spread: 0.6, ...opts });
}

export function confettiBurst(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  fx.burst({ pos, count: 34, color: [0xff5c7a, 0xffd93d, 0x6bcb77, 0x4aa3ff, 0xa78bfa, 0x4dd0e1], speed: 6.5, life: 1.6, size: 0.34, tex: 'square', gravity: -7, drag: 1.4, spread: 1, radius: 1.2, ...opts });
}

export function magicBurst(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  fx.burst({ pos, count: 22, color: [0xa78bfa, 0xff8fab, 0x4dd0e1], speed: 3.8, life: 1.1, size: 0.5, tex: 'soft', additive: true, gravity: 1.2, drag: 1.1, ...opts });
}

export function bubbleBurst(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  fx.burst({ pos, count: 12, color: [0xd8f6ff, 0xbfefff], speed: 2.6, life: 0.9, size: 0.5, tex: 'ring', gravity: 1.4, drag: 1.4, spread: 0.8, ...opts });
}

export function dustBurst(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  fx.burst({ pos, count: 14, color: [0xe6d6c2, 0xcbb9a4], speed: 2.2, life: 0.7, size: 0.55, tex: 'soft', gravity: -1, drag: 2.4, radius: 0.5, ...opts });
}

export function fireworkBurst(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  const colors = [0xff5c7a, 0xffd93d, 0x6bcb77, 0x4aa3ff, 0xa78bfa, 0x4dd0e1];
  const c = colors[Math.floor(Math.random() * colors.length)];
  fx.burst({ pos, count: 40, color: [c, 0xffffff], speed: 7, life: 1.5, size: 0.4, tex: 'star', additive: true, gravity: -4.5, drag: 0.9, ...opts });
}

export function waterSplash(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): void {
  fx.burst({ pos, count: 20, color: [0x9fe8ff, 0x4dd0e1, 0xffffff], speed: 4.5, life: 0.75, size: 0.4, tex: 'soft', gravity: -11, direction: 'up', spread: 0.7, ...opts });
}

export function snowFall(fx: ParticleSystem, pos: Pos, opts: Partial<BurstOpts> = {}): { stop: () => void } {
  return fx.emit({
    pos, rate: 9, count: 1, color: [0xffffff, 0xeaf6ff], speed: 0.5, life: 4.5, size: 0.3,
    tex: 'soft', gravity: -0.35, drag: 0.3, direction: 'down', spread: 0.4,
    area: { x: 26, y: 2, z: 26 }, ...opts,
  });
}

export function victoryFireworks(fx: ParticleSystem, center: Pos, times = 4): void {
  for (let i = 0; i < times; i++) {
    const delay = i * 380;
    const x = center.x + (Math.random() - 0.5) * 8;
    const y = center.y + 2 + Math.random() * 4;
    const z = center.z + (Math.random() - 0.5) * 6;
    const run = (): void => fireworkBurst(fx, { x, y, z }, { speed: 6 + Math.random() * 3 });
    if (delay === 0) run();
    else fx.delay(delay, run);
  }
}
