import * as THREE from 'three';
import type { Quality } from './materials';

/**
 * Reusable lighting presets.
 *
 * Every game picks a preset; `applyLighting` swaps the light rig and the sky
 * backdrop in one call and is safe to call again (previous preset lights are
 * tagged and removed first).
 */

export type LightingPreset =
  | 'day'
  | 'sunset'
  | 'night'
  | 'space'
  | 'underwater'
  | 'indoor'
  | 'candy'
  | 'neon';

interface SkySpec {
  top: string;
  mid: string;
  bottom: string;
}

const SKY: Record<LightingPreset, SkySpec> = {
  day: { top: '#4aa3ff', mid: '#8ed7ff', bottom: '#d9f6ff' },
  sunset: { top: '#ff9a5a', mid: '#ffc48a', bottom: '#ffe9c7' },
  night: { top: '#141b3d', mid: '#2b3a67', bottom: '#4b5b8c' },
  space: { top: '#05060f', mid: '#0b1030', bottom: '#141a3c' },
  underwater: { top: '#0a5f9e', mid: '#1f9fd0', bottom: '#8fe6f5' },
  indoor: { top: '#cfe4ff', mid: '#eef6ff', bottom: '#ffffff' },
  candy: { top: '#ff9ad5', mid: '#ffd3f0', bottom: '#fff3fb' },
  neon: { top: '#1b0f3a', mid: '#3b1d6e', bottom: '#7b3fbf' },
};

/** Soft vertical sky gradient texture (4x256, cheap). */
export function skyTexture(spec: SkySpec): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, spec.top);
  g.addColorStop(0.55, spec.mid);
  g.addColorStop(1, spec.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface LightingRig {
  preset: LightingPreset;
  key: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  rim?: THREE.DirectionalLight;
  extras: THREE.Light[];
  /** Optional animated point light (torches, neon, lamps). */
  blink?: (t: number) => void;
}

const rigs = new WeakMap<THREE.Scene, LightingRig>();
const skies = new WeakMap<THREE.Scene, THREE.Texture>();

function clearPreset(scene: THREE.Scene): void {
  const old = rigs.get(scene);
  if (!old) return;
  const all: THREE.Light[] = [old.key, old.hemi, old.fill, ...(old.rim ? [old.rim] : []), ...old.extras];
  all.forEach((l) => {
    l.removeFromParent();
    if ((l as THREE.PointLight).dispose) (l as THREE.PointLight).dispose();
  });
  rigs.delete(scene);
}

export interface ApplyOpts {
  /** Keep / replace the scene background (default: set preset sky). */
  sky?: boolean;
  fog?: boolean;
}

export function applyLighting(
  scene: THREE.Scene,
  preset: LightingPreset,
  quality: Quality,
  opts: ApplyOpts = {}
): LightingRig {
  clearPreset(scene);

  const shadows = quality === 'high' || quality === 'medium';
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fd0ff, 1.0);
  const fill = new THREE.DirectionalLight(0xdff0ff, 0.35);
  const extras: THREE.Light[] = [];
  let rim: THREE.DirectionalLight | undefined;

  const conf: Record<LightingPreset, () => void> = {
    day: () => {
      key.color.setHex(0xfff4e0);
      key.intensity = 1.35;
      key.position.set(9, 22, 11);
      hemi.color.setHex(0xffffff);
      hemi.groundColor.setHex(0x8fc6ff);
      hemi.intensity = 1.05;
      fill.position.set(-10, 9, -8);
    },
    sunset: () => {
      key.color.setHex(0xffd0a0);
      key.intensity = 1.5;
      key.position.set(-14, 9, 8);
      hemi.color.setHex(0xffe0c0);
      hemi.groundColor.setHex(0xff9a6a);
      hemi.intensity = 0.85;
      fill.color.setHex(0x8fb6ff);
      fill.intensity = 0.3;
      fill.position.set(10, 6, -6);
    },
    night: () => {
      key.color.setHex(0xcfe0ff);
      key.intensity = 0.55;
      key.position.set(7, 18, 6);
      hemi.color.setHex(0x9fb6ff);
      hemi.groundColor.setHex(0x2a3560);
      hemi.intensity = 0.55;
      fill.intensity = 0.18;
      fill.position.set(-8, 6, -6);
      rim = new THREE.DirectionalLight(0x9fd8ff, 0.35);
      rim.position.set(-6, 8, 10);
      extras.push(rim);
    },
    space: () => {
      key.color.setHex(0xffffff);
      key.intensity = 1.15;
      key.position.set(10, 16, 9);
      hemi.color.setHex(0x6d8dff);
      hemi.groundColor.setHex(0x141430);
      hemi.intensity = 0.5;
      fill.intensity = 0.25;
      fill.position.set(-9, 5, -7);
    },
    underwater: () => {
      key.color.setHex(0xd8fbff);
      key.intensity = 1.05;
      key.position.set(4, 20, 6);
      hemi.color.setHex(0x7fe8ff);
      hemi.groundColor.setHex(0x0a4f8f);
      hemi.intensity = 1.15;
      fill.color.setHex(0x9ff0ff);
      fill.intensity = 0.45;
      fill.position.set(-8, 7, -5);
      scene.fog = new THREE.Fog(0x1f9fd0, 22, 70);
    },
    indoor: () => {
      key.color.setHex(0xfff8ec);
      key.intensity = 1.1;
      key.position.set(6, 16, 10);
      hemi.color.setHex(0xfff4e0);
      hemi.groundColor.setHex(0xd8e4ff);
      hemi.intensity = 1.2;
      fill.intensity = 0.4;
      fill.position.set(-9, 8, -6);
      const lamp = new THREE.PointLight(0xfff0cc, 0.55, 26, 2);
      lamp.position.set(0, 7, 4);
      extras.push(lamp);
    },
    candy: () => {
      key.color.setHex(0xfff0fa);
      key.intensity = 1.3;
      key.position.set(8, 20, 10);
      hemi.color.setHex(0xffd9f5);
      hemi.groundColor.setHex(0xb8ffd9);
      hemi.intensity = 1.2;
      fill.color.setHex(0xd6fff0);
      fill.intensity = 0.4;
      fill.position.set(-9, 7, -6);
    },
    neon: () => {
      key.color.setHex(0xbfa8ff);
      key.intensity = 0.7;
      key.position.set(6, 16, 8);
      hemi.color.setHex(0xff7ad9);
      hemi.groundColor.setHex(0x2a1358);
      hemi.intensity = 0.7;
      fill.color.setHex(0x4de1ff);
      fill.intensity = 0.5;
      fill.position.set(-9, 6, -8);
      const p1 = new THREE.PointLight(0xff4dd2, 0.9, 30, 2);
      p1.position.set(-6, 5, 3);
      const p2 = new THREE.PointLight(0x4dd0ff, 0.9, 30, 2);
      p2.position.set(6, 5, -3);
      extras.push(p1, p2);
    },
  };

  conf[preset]();

  key.castShadow = shadows;
  if (key.castShadow) {
    key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    const cam = key.shadow.camera as THREE.OrthographicCamera;
    cam.left = -20;
    cam.right = 20;
    cam.top = 20;
    cam.bottom = -20;
    cam.near = 1;
    cam.far = 70;
    key.shadow.bias = -0.0012;
    key.shadow.radius = 3;
    cam.updateProjectionMatrix();
  }

  scene.add(key, hemi, fill, ...extras);

  if (opts.sky !== false) {
    skies.get(scene)?.dispose();
    const tex = skyTexture(SKY[preset]);
    skies.set(scene, tex);
    scene.background = tex;
  }
  if (preset !== 'underwater' && opts.fog !== false) scene.fog = null;

  const rig: LightingRig = { preset, key, hemi, fill, rim, extras };
  rigs.set(scene, rig);
  return rig;
}

export function currentLighting(scene: THREE.Scene): LightingRig | undefined {
  return rigs.get(scene);
}

/** Sunset-style rim light on a character (called by the victory sequence). */
export function rimLight(color = 0xffe9a8, intensity = 0.6): THREE.DirectionalLight {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(-4, 6, -6);
  return l;
}
