import Phaser from 'phaser';
import { UI_FONT, cssHex } from '../config';
import { audio } from '../core/AudioManager';
import { ACHIEVEMENTS } from '../core/Progress';
import { confetti, rewardFly, sparkles } from '../core/FX';
import { button, emojiText, label, panel, Pill, toast } from '../core/UI';
import type { ResultPayload } from '../core/types';

/**
 * Shared result screen: score, star rating, best score, rewards and the
 * play-again / home / more-games navigation.
 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create(raw: ResultPayload): void {
    const d = raw ?? (this.scene.settings.data as ResultPayload);
    if (!d) {
      this.scene.start('HomeScene');
      return;
    }

    // background
    const g = this.add.graphics();
    g.fillGradientStyle(d.color, d.color, 0xffffff, 0xffffff, 1);
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle(0x1f2340, 0.18);
    g.fillRect(0, 0, 1280, 720);

    if (d.win || d.stars >= 2) {
      confetti(this, 2400);
      audio.play('reward');
    } else {
      audio.play('fail');
    }

    panel(this, 640, 360, 840, 620, { color: 0xffffff, radius: 44 });

    const icon = emojiText(this, 640, 128, d.icon, 88);
    this.tweens.add({ targets: icon, y: 118, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const headline = d.win || d.stars >= 2 ? '🎉 GREAT JOB!' : d.stars >= 1 ? '👍 NICE PLAY!' : '💪 TRY AGAIN!';
    label(this, 640, 205, headline, { size: 50, color: '#33364f' });
    if (d.subtitle) {
      label(this, 640, 250, d.subtitle, { size: 24, color: '#6b7280' });
    }

    // stars
    const startX = 640 - 90;
    for (let i = 0; i < 3; i++) {
      const lit = i < d.stars;
      const s = emojiText(this, startX + i * 90, 300, '⭐', 68).setAlpha(lit ? 1 : 0.25);
      if (!lit) s.setTint(0x8b90a0);
      else {
        this.time.delayedCall(350 + i * 260, () => {
          sparkles(this, s.x, s.y, 0xffd93d, 10);
          audio.play('star');
          this.tweens.add({ targets: s, scale: { from: 1.5, to: 1 }, duration: 340, ease: 'Back.easeOut' });
        });
      }
      s.setScale(0.6);
      this.tweens.add({ targets: s, scale: 1, duration: 300, delay: 200 + i * 160, ease: 'Back.easeOut' });
    }

    // score counting up
    label(this, 640, 368, 'SCORE', { size: 22, color: '#9aa0ae' });
    const scoreTxt = this.add
      .text(640, 415, '0', {
        fontFamily: UI_FONT,
        fontSize: '62px',
        fontStyle: 'bold',
        color: cssHex(d.color),
        stroke: '#33364f',
        strokeThickness: 7,
      })
      .setOrigin(0.5);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: d.score,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: () => scoreTxt.setText(String(Math.round(counter.v))),
      onComplete: () => scoreTxt.setText(String(d.score)),
    });

    // extra stat lines
    if (d.lines?.length) {
      const parts = d.lines.map((l) => `${l.icon} ${l.label}: ${l.value}`).join('    ');
      label(this, 640, 468, parts, { size: 22, color: '#6b7280' });
    }

    // best score
    const res = d.result;
    const bestPill = new Pill(
      this,
      640,
      510,
      `${res?.isBest ? '🌟 NEW BEST' : '🏆 BEST'}: ${res?.best ?? 0}`,
      { color: res?.isBest ? 0xffa94d : 0x9aa0ae, minW: 330, depth: 10 }
    );
    if (res?.isBest) {
      this.tweens.add({ targets: bestPill, scale: 1.07, duration: 700, yoyo: true, repeat: -1 });
    }

    // reward popup
    if (res) {
      this.time.delayedCall(700, () => {
        rewardFly(this, 470, 575, `⭐ +${res.rewardStars}`);
        rewardFly(this, 810, 575, `🪙 +${res.rewardCoins}`, '#ff9f43');
        audio.play('coin');
      });

      // achievement + daily toasts
      res.unlocked.forEach((id, i) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (!a) return;
        this.time.delayedCall(1400 + i * 1100, () => {
          toast(this, `${a.icon} ${a.title} unlocked!`, { color: 0xb8860b, duration: 2200 });
          audio.play('star');
        });
      });
      if (res.dailyDone) {
        this.time.delayedCall(1500 + res.unlocked.length * 1100, () => {
          toast(this, 'Daily challenge complete! ⭐ +' + 50, { color: 0x2f9e44, duration: 2400 });
        });
      }
    }

    // navigation
    button(this, {
      x: 360, y: 620, w: 250, h: 76, label: 'PLAY AGAIN', icon: '🔄', color: 0x6bcb77, fontSize: 27,
      depth: 20,
      onClick: () => this.scene.start(d.gameId),
    });
    button(this, {
      x: 640, y: 620, w: 250, h: 76, label: 'HOME', icon: '🏠', color: 0x4aa3ff, fontSize: 27,
      depth: 20,
      onClick: () => this.scene.start('HomeScene'),
    });
    button(this, {
      x: 920, y: 620, w: 250, h: 76, label: 'MORE GAMES', icon: '🎮', color: 0xa78bfa, fontSize: 24,
      depth: 20,
      onClick: () => this.scene.start('HomeScene'),
    });
  }
}
