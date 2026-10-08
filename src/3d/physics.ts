import * as THREE from 'three';

/**
 * Lightweight physics helpers for the mini-games: gravity, bounce, rolling,
 * springs, buoyancy and simple circle/box collisions. Deliberately not a full
 * physics engine - games that need heavy simulation don't exist in this
 * collection, so we keep it cheap and predictable instead.
 */

export interface BodyOpts {
  pos?: THREE.Vector3 | { x: number; y: number; z: number };
  vel?: THREE.Vector3 | { x: number; y: number; z: number };
  radius?: number;
  gravity?: number;
  bounce?: number;
  friction?: number;
  drag?: number;
  floorY?: number;
}

export class Body {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  radius = 0.4;
  gravity = -22;
  bounce = 0.45;
  friction = 0.9;
  drag = 0.02;
  floorY = 0;
  onGround = false;
  /** Set true by `step` when the body came to rest on the floor. */
  resting = false;

  constructor(o: BodyOpts = {}) {
    if (o.pos) this.pos.set(o.pos.x, o.pos.y, o.pos.z);
    if (o.vel) this.vel.set(o.vel.x, o.vel.y, o.vel.z);
    if (o.radius !== undefined) this.radius = o.radius;
    if (o.gravity !== undefined) this.gravity = o.gravity;
    if (o.bounce !== undefined) this.bounce = o.bounce;
    if (o.friction !== undefined) this.friction = o.friction;
    if (o.drag !== undefined) this.drag = o.drag;
    if (o.floorY !== undefined) this.floorY = o.floorY;
  }

  applyImpulse(x: number, y: number, z = 0): void {
    this.vel.x += x;
    this.vel.y += y;
    this.vel.z += z;
    this.resting = false;
  }

  step(dt: number): void {
    this.vel.y += this.gravity * dt;
    if (this.drag > 0) {
      const d = Math.max(0, 1 - this.drag * dt * 10);
      this.vel.x *= d;
      this.vel.z *= d;
    }
    this.pos.addScaledVector(this.vel, dt);

    this.onGround = false;
    if (this.pos.y - this.radius <= this.floorY) {
      this.pos.y = this.floorY + this.radius;
      if (this.vel.y < 0) {
        if (Math.abs(this.vel.y) < 1.4) {
          this.vel.y = 0;
          this.resting = true;
        } else {
          this.vel.y = -this.vel.y * this.bounce;
          this.vel.x *= this.friction;
          this.vel.z *= this.friction;
        }
      }
      this.onGround = true;
    }
  }

  get speed(): number {
    return this.vel.length();
  }
}

/** Critically-damped-ish spring (position + velocity integration). */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  stiffness: number;
  damping: number;

  constructor(value: number, stiffness = 140, damping = 14, target = value) {
    this.value = value;
    this.target = target;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  update(dt: number): void {
    const a = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += a * dt;
    this.value += this.velocity * dt;
  }

  get settled(): boolean {
    return Math.abs(this.target - this.value) < 0.001 && Math.abs(this.velocity) < 0.01;
  }

  kick(v: number): void {
    this.velocity += v;
  }
}

export class Spring3 {
  x: Spring;
  y: Spring;
  z: Spring;
  constructor(stiffness = 140, damping = 14) {
    this.x = new Spring(0, stiffness, damping);
    this.y = new Spring(0, stiffness, damping);
    this.z = new Spring(0, stiffness, damping);
  }
  setTarget(x: number, y: number, z: number): void {
    this.x.target = x;
    this.y.target = y;
    this.z.target = z;
  }
  kick(vx: number, vy: number, vz: number): void {
    this.x.kick(vx);
    this.y.kick(vy);
    this.z.kick(vz);
  }
  update(dt: number): void {
    this.x.update(dt);
    this.y.update(dt);
    this.z.update(dt);
  }
}

/** Sine bobbing helper (floats, bubbles, hovering pickups). */
export class Bob {
  base: number;
  amplitude: number;
  speed: number;
  t: number;

  constructor(base = 0, amplitude = 0.2, speed = 2) {
    this.base = base;
    this.amplitude = amplitude;
    this.speed = speed;
    this.t = Math.random() * 6;
  }

  update(dt: number): number {
    this.t += dt;
    return this.base + Math.sin(this.t * this.speed) * this.amplitude;
  }
}

/** Buoyancy: float around `surfaceY` with damped vertical oscillation. */
export function buoyancy(pos: THREE.Vector3, vel: THREE.Vector3, surfaceY: number, dt: number, amount = 8): void {
  const depth = pos.y - surfaceY;
  vel.y -= depth * amount * dt;
  vel.y *= 1 - Math.min(1, 2.4 * dt);
  pos.y += vel.y * dt;
}

/** 2D (XZ) circle collision - resolves and returns true on contact. */
export function collideCircles(
  a: { x: number; z: number; r: number },
  b: { x: number; z: number; r: number },
  out?: { x: number; z: number }
): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  const rr = a.r + b.r;
  if (d2 >= rr * rr || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const nz = dz / d;
  const push = (rr - d) / 2;
  if (out) {
    out.x = nx * push;
    out.z = nz * push;
  }
  return true;
}

/** Sphere-vs-ground containment used by rolling balls. */
export function rollOnPlane(pos: THREE.Vector3, vel: THREE.Vector3, r: number, floorY: number, dt: number, friction = 0.98): void {
  pos.addScaledVector(vel, dt);
  if (pos.y < floorY + r) {
    pos.y = floorY + r;
    if (vel.y < 0) vel.y = -vel.y * 0.4;
    vel.x *= friction;
    vel.z *= friction;
  }
}

/** Ease a value toward a target (frame-rate independent). */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Point-in-box test (world axes) used for simple pickups/obstacles. */
export function inBox(p: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}
