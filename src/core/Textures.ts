import { EMOJI_FONT } from '../config';

function emojiKey(ch: string, size: number): string {
  const cp = Array.from(ch)
    .map((c) => (c.codePointAt(0) ?? 0).toString(36))
    .join('-');
  return `emo_${size}_${cp}`;
}

/**
 * Returns a texture key for an emoji glyph. Textures are generated once and
 * cached by the global Phaser texture manager, so repeated calls are free.
 * Rendering goes straight to a canvas, which keeps boot fast and avoids any
 * dependency on text game objects.
 */
export function emojiTex(scene: Phaser.Scene, ch: string, size = 96): string {
  const key = emojiKey(ch, size);
  if (scene.textures.exists(key)) return key;
  try {
    const tex = scene.textures.createCanvas(key, size, size);
    if (!tex) return key;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = Math.round(size * 0.86);
    ctx.font = `${fontSize}px ${EMOJI_FONT}`;
    // shrink the glyph if it would be clipped (wide multi-part emoji)
    let guard = 0;
    while (ctx.measureText(ch).width > size - 4 && fontSize > 10 && guard < 40) {
      fontSize -= 3;
      guard++;
      ctx.font = `${fontSize}px ${EMOJI_FONT}`;
    }
    ctx.fillText(ch, size / 2, size / 2 + fontSize * 0.06);
    tex.refresh();
  } catch {
    return '';
  }
  return key;
}

export function emojiSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  ch: string,
  size = 96,
  scale = 1
): Phaser.GameObjects.Image | null {
  const key = emojiTex(scene, ch, size);
  if (!key) return null;
  return scene.add.image(x, y, key).setScale(scale);
}

function canvasTex(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
  return key;
}

/** Translucent soap bubble sprite (tinted per instance). */
export function bubbleTexture(scene: Phaser.Scene): string {
  return canvasTex(scene, 'tex_bubble', 110, 110, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 3;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0.55)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.42, r * 0.26, r * 0.16, -0.7, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Base particle / decoration textures used by FX everywhere. */
export function ensureFxTextures(scene: Phaser.Scene): void {
  canvasTex(scene, 'fx_dot', 18, 18, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  canvasTex(scene, 'fx_confetti', 14, 20, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.fill();
  });

  canvasTex(scene, 'fx_star', 40, 40, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const spikes = 5;
    const outer = w / 2 - 1;
    const inner = outer * 0.46;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });

  canvasTex(scene, 'fx_spark', 24, 24, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.quadraticCurveTo(cx + 3, cy - 3, w, cy);
    ctx.quadraticCurveTo(cx + 3, cy + 3, cx, h);
    ctx.quadraticCurveTo(cx - 3, cy + 3, 0, cy);
    ctx.quadraticCurveTo(cx - 3, cy - 3, cx, 0);
    ctx.closePath();
    ctx.fill();
  });
}
