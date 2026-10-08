import Phaser from 'phaser';
import { UI_FONT } from '../config';
import { ensureFxTextures, emojiTex } from '../core/Textures';
import { GAMES } from '../core/GameRegistry';

const BOOT_ICONS = [
  '🌈', '⭐', '🪙', '🏆', '🎁', '⚙️', '🎯', '🎲', '🏠', '⏸️', '🔄', '▶️', '❌', '✅',
  '🧩', '🫧', '🐰', '🚗', '🐶', '🍕', '🎨', '🃏', '🔢', '🏗️', '❤️', '🍎', '✨',
  '📖', '🌟', '💫', '🎉', '👍',
];

/**
 * Polished boot / loading screen. Generates shared textures in small batches
 * so the progress bar actually moves, then hands over to the home screen.
 */
export class BootScene extends Phaser.Scene {
  private barFill!: Phaser.GameObjects.Graphics;
  private progress = 0;
  private readonly steps: (() => void)[] = [];

  constructor() {
    super('BootScene');
  }

  create(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x4aa3ff, 0x4aa3ff, 0x9be2ff, 0x9be2ff, 1);
    g.fillRect(0, 0, 1280, 720);

    const logo = this.add.text(640, 210, '🌈', { fontSize: '120px' }).setOrigin(0.5);
    this.tweens.add({ targets: logo, y: 185, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add
      .text(640, 330, 'KIDS FUN WORLD', {
        fontFamily: UI_FONT,
        fontSize: '62px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#33364f',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(640, 392, 'Mini Game Collection', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        color: '#eaf7ff',
      })
      .setOrigin(0.5);

    // progress bar
    const bg = this.add.graphics();
    bg.fillStyle(0x1f2340, 0.35);
    bg.fillRoundedRect(440, 460, 400, 34, 17);
    bg.lineStyle(4, 0xffffff, 0.85);
    bg.strokeRoundedRect(440, 460, 400, 34, 17);
    this.barFill = this.add.graphics();

    this.add
      .text(640, 528, 'Loading the fun…', {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Build the work queue: FX textures, game icons, UI icons.
    this.steps.push(() => ensureFxTextures(this));
    for (const def of GAMES) this.steps.push(() => emojiTex(this, def.icon, 120));
    for (const ic of BOOT_ICONS) this.steps.push(() => emojiTex(this, ic, 96));
    this.steps.push(() => this.finish());

    this.runNext();
    this.time.delayedCall(400, () => {
      const el = document.getElementById('boot-fallback');
      if (el) el.classList.add('hidden');
    });
  }

  private runNext(): void {
    const step = this.steps.shift();
    if (!step) return;
    try {
      step();
    } catch {
      /* never let asset generation break the boot */
    }
    this.progress = Math.min(1, this.progress + 1 / Math.max(1, this.steps.length + 1));
    this.drawBar();
    if (this.steps.length) {
      this.time.delayedCall(24, () => this.runNext());
    }
  }

  private drawBar(): void {
    const w = 392 * this.progress;
    this.barFill.clear();
    if (w > 4) {
      this.barFill.fillStyle(0xffd93d, 1);
      this.barFill.fillRoundedRect(444, 464, w, 26, 13);
      this.barFill.fillStyle(0xffffff, 0.35);
      this.barFill.fillRoundedRect(444, 464, w, 10, 6);
    }
  }

  private finish(): void {
    this.progress = 1;
    this.drawBar();
    let handedOver = false;
    const go = (): void => {
      if (handedOver) return;
      handedOver = true;
      if (this.scene.isActive()) this.scene.start('HomeScene');
    };
    this.cameras.main.fadeOut(240, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', go);
    this.time.delayedCall(700, go);
  }
}
