import Phaser from 'phaser';
import { audio } from '../core/AudioManager';
import { GAMES } from '../core/GameRegistry';
import { progress } from '../core/Progress';
import { SceneBase } from '../core/SceneBase';
import { button, drawSky, label, panel, Pill } from '../core/UI';

/**
 * The central dashboard: title, currency, daily challenge, twelve game cards and
 * the settings / achievements / rewards shortcuts.
 */
export class HomeScene extends SceneBase {
  constructor() {
    super('HomeScene');
  }

  create(): void {
    this.drawRainbow();
    drawSky(this);

    // ---- header -----------------------------------------------------
    const title = label(this, 640, 58, '🌈 KIDS FUN WORLD', {
      size: 56,
      color: '#ffffff',
      stroke: '#33364f',
      strokeThickness: 9,
    });
    this.tweens.add({ targets: title, y: 50, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const currency: Pill[] = [
      new Pill(this, 995, 58, `🪙 ${progress.data.coins}`, { color: 0xffa94d, minW: 150, depth: 20 }),
      new Pill(this, 1190, 58, `⭐ ${progress.data.stars}`, { color: 0xff8fab, minW: 170, depth: 20 }),
    ];
    currency.forEach((p) => {
      p.setInteractive(new Phaser.Geom.Rectangle(-85, -25, 170, 50), Phaser.Geom.Rectangle.Contains);
      p.on('pointerover', () => this.tweens.add({ targets: p, scale: 1.06, duration: 120 }));
      p.on('pointerout', () => this.tweens.add({ targets: p, scale: 1, duration: 120 }));
      p.on('pointerup', () => {
        audio.play('click');
        this.scene.start('RewardsScene');
      });
    });

    const dailyDef = progress.currentDaily();
    const dailyPill = new Pill(
      this,
      245,
      58,
      `🎯 ${dailyDef ? `${Math.min(progress.data.daily.progress, dailyDef.target)}/${dailyDef.target}` : '—'}`,
      { color: 0x4aa3ff, minW: 270, depth: 20 }
    );
    dailyPill.setInteractive(new Phaser.Geom.Rectangle(-135, -25, 270, 50), Phaser.Geom.Rectangle.Contains);
    dailyPill.on('pointerover', () => this.tweens.add({ targets: dailyPill, scale: 1.06, duration: 120 }));
    dailyPill.on('pointerout', () => this.tweens.add({ targets: dailyPill, scale: 1, duration: 120 }));
    dailyPill.on('pointerup', () => {
      audio.play('click');
      this.scene.start('RewardsScene');
    });

    // ---- play & discover -------------------------------------------
    const play = button(this, {
      x: 640,
      y: 150,
      w: 400,
      h: 72,
      label: 'PLAY & DISCOVER',
      icon: '🎲',
      color: 0xffd93d,
      textColor: '#7a4a00',
      fontSize: 34,
      iconSize: 44,
      depth: 10,
      onClick: () => {
        const def = GAMES[Math.floor(Math.random() * GAMES.length)];
        this.transitionTo(def.id);
      },
    });
    play.pulse();

    // ---- game grid (6 columns x 2 rows for 12 game cards) -----------
    const gridBg = panel(this, 640, 385, 1180, 366, { color: 0xffffff, alpha: 0.2, radius: 40, border: 0 });
    gridBg.setDepth(1);

    const xs = [190, 370, 550, 730, 910, 1090];
    const ys = [300, 470];
    GAMES.forEach((def, i) => {
      const best = progress.data.highScores[def.id] ?? 0;
      const card = button(this, {
        x: xs[i % 6],
        y: ys[Math.floor(i / 6)],
        w: 170,
        h: 150,
        icon: def.icon,
        label: def.title,
        sub: def.tag,
        color: def.color,
        layout: 'stack',
        iconSize: 48,
        fontSize: 21,
        subSize: 15,
        radius: 30,
        depth: 5,
        badge: best > 0 ? String(best) : undefined,
        onClick: () => {
          this.transitionTo(def.id);
        },
      });
      card.enter(40 + i * 40, 360);
    });

    // ---- footer shortcuts -------------------------------------------
    button(this, {
      x: 340, y: 655, w: 250, h: 66, label: 'SETTINGS', icon: '⚙️', color: 0xa78bfa, fontSize: 27,
      depth: 10,
      onClick: () => {
        audio.play('click');
        this.scene.launch('SettingsScene', { overlay: true });
      },
    });
    button(this, {
      x: 640, y: 655, w: 250, h: 66, label: 'ACHIEVEMENTS', icon: '🏆', color: 0x6bcb77, fontSize: 23,
      depth: 10,
      onClick: () => {
        audio.play('click');
        this.scene.start('AchievementsScene');
      },
    });
    button(this, {
      x: 940, y: 655, w: 250, h: 66, label: 'REWARDS', icon: '🎁', color: 0xff8fab, fontSize: 27,
      depth: 10,
      onClick: () => {
        audio.play('click');
        this.scene.start('RewardsScene');
      },
    });

    // hint for first-time players
    const hint = label(this, 640, 205, 'Tap a game to start!', {
      size: 22,
      color: '#ffffff',
      alpha: 0.95,
    });
    hint.setDepth(4);
    this.tweens.add({ targets: hint, alpha: 0.55, duration: 1200, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => audio.resumeAfterGesture());
  }

  private drawRainbow(): void {
    const g = this.add.graphics().setDepth(-99);
    const colors = [0xff5c7a, 0xffa94d, 0xffd93d, 0x6bcb77, 0x4aa3ff, 0xa78bfa];
    colors.forEach((c, i) => {
      g.lineStyle(22, c, 0.55);
      g.beginPath();
      g.arc(640, -40, 470 - i * 24, 0.18 * Math.PI, 0.82 * Math.PI, false);
      g.strokePath();
    });
  }
}
