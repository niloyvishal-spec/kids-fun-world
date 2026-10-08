import { DESIGN_W } from '../config';

const PALETTE = [0xff5c7a, 0xffd93d, 0x6bcb77, 0x4aa3ff, 0xa78bfa, 0xffa94d, 0x4dd0e1, 0xffffff];

function pick(colors: number[] = PALETTE): number {
  return colors[Math.floor(Math.random() * colors.length)];
}

/** Circular sparkle / debris burst. */
export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number = pick(),
  count = 12,
  opts: { speed?: number; life?: number; texture?: string } = {}
): void {
  try {
    const em = scene.add.particles(x, y, opts.texture ?? 'fx_dot', {
      speed: { min: (opts.speed ?? 120) * 0.4, max: opts.speed ?? 240 },
      angle: { min: 0, max: 360 },
      lifespan: opts.life ?? 620,
      scale: { start: 0.85, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      quantity: 1,
      emitting: false,
      blendMode: 'ADD',
    });
    em.explode(count);
    scene.time.delayedCall((opts.life ?? 620) + 250, () => {
      if (em.scene) em.destroy();
    });
  } catch {
    /* effects are optional */
  }
}

/** Star-shaped sparkle pop (rewards, matches). */
export function sparkles(scene: Phaser.Scene, x: number, y: number, color = 0xffd93d, count = 8): void {
  try {
    const em = scene.add.particles(x, y, 'fx_star', {
      speed: { min: 50, max: 190 },
      angle: { min: 0, max: 360 },
      lifespan: 750,
      scale: { start: 0.9, end: 0 },
      rotate: { start: 0, end: 220 },
      tint: [color, 0xffffff],
      quantity: 1,
      emitting: false,
    });
    em.explode(count);
    scene.time.delayedCall(1050, () => {
      if (em.scene) em.destroy();
    });
  } catch {
    /* optional */
  }
}

/** Falling confetti across the screen. */
export function confetti(scene: Phaser.Scene, duration = 2000, yFrom = -30): Phaser.GameObjects.Particles.ParticleEmitter | null {
  try {
    const em = scene.add.particles(0, 0, 'fx_confetti', {
      x: { min: -40, max: DESIGN_W + 40 },
      y: yFrom,
      lifespan: 2600,
      speedY: { min: 130, max: 300 },
      speedX: { min: -70, max: 70 },
      rotate: { start: 0, end: 400 },
      scale: { start: 1.1, end: 0.7 },
      alpha: { start: 1, end: 0.85 },
      tint: PALETTE,
      quantity: 2,
      frequency: 55,
    });
    scene.time.delayedCall(duration, () => {
      if (!em.scene) return;
      em.stop();
      scene.time.delayedCall(2800, () => {
        if (em.scene) em.destroy();
      });
    });
    return em;
  } catch {
    return null;
  }
}

/** Floating score / feedback text that rises and fades away. */
export function floatText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  opts: { color?: string; size?: number; stroke?: string; dy?: number; duration?: number; bold?: boolean } = {}
): void {
  try {
    const t = scene.add
      .text(x, y, str, {
        fontFamily: "'Trebuchet MS',sans-serif",
        fontSize: `${opts.size ?? 30}px`,
        color: opts.color ?? '#ffffff',
        stroke: opts.stroke ?? '#33364f',
        strokeThickness: opts.stroke === '' ? 0 : 6,
        fontStyle: opts.bold === false ? 'normal' : 'bold',
      })
      .setOrigin(0.5)
      .setDepth(900)
      .setScale(0.4);
    scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: t,
      y: y - (opts.dy ?? 70),
      alpha: 0,
      duration: opts.duration ?? 900,
      ease: 'Cubic.easeOut',
      delay: 140,
      onComplete: () => t.destroy(),
    });
  } catch {
    /* optional */
  }
}

/** Reward banner: "+25 ⭐" scales in, sparkles, floats away. */
export function rewardFly(scene: Phaser.Scene, x: number, y: number, str: string, color = '#ffd93d'): void {
  try {
    const t = scene.add
      .text(x, y, str, {
        fontFamily: "'Trebuchet MS',sans-serif",
        fontSize: '46px',
        fontStyle: 'bold',
        color,
        stroke: '#33364f',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setScale(0.2);
    sparkles(scene, x, y, 0xffd93d, 14);
    scene.tweens.add({
      targets: t,
      scale: 1,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: t,
          y: y - 90,
          alpha: 0,
          scale: 1.15,
          delay: 420,
          duration: 700,
          onComplete: () => t.destroy(),
        });
      },
    });
  } catch {
    /* optional */
  }
}

/** Small bounce pop used on newly spawned / matched objects. */
export function popIn(obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, scene: Phaser.Scene, from = 0): void {
  try {
    const target = obj as unknown as { scale: number; alpha?: number };
    const final = (obj as unknown as { baseScale?: number }).baseScale ?? target.scale ?? 1;
    target.scale = from;
    scene.tweens.add({ targets: obj, scale: final, duration: 260, ease: 'Back.easeOut' });
  } catch {
    /* optional */
  }
}

export function shakeCamera(scene: Phaser.Scene, intensity = 0.006, duration = 220): void {
  try {
    scene.cameras.main.shake(duration, intensity);
  } catch {
    /* optional */
  }
}

/**
 * Full-screen fade helper for scene transitions.
 * NOTE: Phaser's camera completion event is `camerafadeoutcomplete`
 * (Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE). A delayed fallback
 * guarantees the callback still runs if the event is ever missed.
 */
export function fadeOut(scene: Phaser.Scene, color = 0xffffff, duration = 260, onComplete?: () => void): void {
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    onComplete?.();
  };
  try {
    const cam = scene.cameras.main;
    cam.once('camerafadeoutcomplete', finish);
    cam.fadeOut(duration, ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    scene.time.delayedCall(duration + 400, finish);
  } catch {
    finish();
  }
}

export function fadeIn(scene: Phaser.Scene, color = 0xffffff, duration = 260): void {
  try {
    scene.cameras.main.fadeIn(
      duration,
      ((color >> 16) & 0xff) / 255,
      ((color >> 8) & 0xff) / 255,
      (color & 0xff) / 255
    );
  } catch {
    /* optional */
  }
}

export function allColors(): number[] {
  return [...PALETTE];
}
