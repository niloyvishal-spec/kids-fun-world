import * as THREE from 'three';
import { audio, type SfxName } from '../core/AudioManager';
import type { ThreeStage } from './engine/stage';
import { magicBurst, sparkleBurst, type ParticleSystem } from './particles';

/**
 * Shared audio-visual feedback helpers. Every game reacts to success / error /
 * collection the same way: a 3D burst in the world + a synthesised sound from
 * the existing AudioManager (mute/music settings keep working untouched).
 */

export function sfx(name: SfxName): void {
  audio.play(name);
}

/** Tap feedback: tiny sparkle + click. */
export function tapFx(fx: ParticleSystem | null, pos: THREE.Vector3, sound: SfxName = 'click'): void {
  if (fx) sparkleBurst(fx, pos, { count: 7, speed: 2, life: 0.45, size: 0.3 });
  audio.play(sound);
}

/** Correct answer / successful match. */
export function correctFx(fx: ParticleSystem | null, pos: THREE.Vector3): void {
  if (fx) sparkleBurst(fx, pos, { count: 18, speed: 4, life: 0.8, size: 0.45 });
  audio.play('right');
}

/** Wrong answer / failed match - gentle, never punishing. */
export function wrongFx(fx: ParticleSystem | null, pos: THREE.Vector3): void {
  if (fx) magicBurst(fx, pos, { count: 10, color: [0xff8f7a, 0xffb3a0], speed: 2, life: 0.6, gravity: -4 });
  audio.play('wrong');
}

/** Coin / star / item pickup. */
export function collectFx(fx: ParticleSystem | null, pos: THREE.Vector3, sound: SfxName = 'coin'): void {
  if (fx) sparkleBurst(fx, pos, { count: 14, speed: 3.6, life: 0.7, size: 0.4 });
  audio.play(sound);
}

/** Movement / impact feedback (footsteps, thuds, splashes). */
export function stepFx(): void {
  audio.play('step');
}

export function impactFx(intensity = 1): void {
  audio.play(intensity > 0.7 ? 'thud' : 'land');
}

export function splashFx(): void {
  audio.play('splash');
}

export function bubbleFx(): void {
  audio.play('bubble');
}

export function engineFx(): void {
  audio.play('engine');
}

/** Simple repeating footstep driver - returns a stop function. */
export function footsteps(stage: ThreeStage, intervalMs = 340, onStep?: () => void): () => void {
  let dead = false;
  const tick = (): void => {
    if (dead) return;
    onStep?.();
    audio.play('step');
    stage.delay(intervalMs, tick);
  };
  stage.delay(intervalMs, tick);
  return () => {
    dead = true;
  };
}

/** Project a world point to design-space for bridging into the Phaser HUD. */
export function toScreen(stage: ThreeStage, pos: THREE.Vector3): { x: number; y: number } | null {
  return stage.project(pos.x, pos.y, pos.z);
}
