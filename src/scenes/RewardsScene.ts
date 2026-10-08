import { ACHIEVEMENTS, progress } from '../core/Progress';
import { SceneBase } from '../core/SceneBase';
import { button, drawSky, label, Meter, panel } from '../core/UI';

/** Rewards overview: currency totals, daily challenge and lifetime stats. */
export class RewardsScene extends SceneBase {
  constructor() {
    super('RewardsScene');
  }

  create(): void {
    drawSky(this);

    label(this, 640, 56, '🎁 REWARDS', {
      size: 50,
      color: '#ffffff',
      stroke: '#33364f',
      strokeThickness: 8,
    });

    const d = progress.data;

    /* ---- currency + stats panel ---- */
    panel(this, 340, 350, 560, 470, { color: 0xffffff });
    label(this, 340, 155, 'YOUR TREASURE', { size: 32, color: '#33364f' });

    const rows: { icon: string; text: string; color: string }[] = [
      { icon: '⭐', text: `${d.stars} Stars`, color: '#e8a900' },
      { icon: '🪙', text: `${d.coins} Coins`, color: '#d97706' },
      { icon: '🎮', text: `${Object.values(d.plays).reduce((a, b) => a + b, 0)} Games played`, color: '#33364f' },
      { icon: '🏆', text: `${Object.keys(d.highScores).length} High scores`, color: '#33364f' },
      { icon: '📈', text: `${d.totalScore} Total points`, color: '#33364f' },
      {
        icon: '🏅',
        text: `${Object.keys(d.achievements).length} / ${ACHIEVEMENTS.length} Achievements`,
        color: '#33364f',
      },
    ];
    rows.forEach((r, i) => {
      const y = 225 + i * 52;
      const icon = this.add.text(135, y, r.icon, { fontSize: '34px' }).setOrigin(0.5);
      label(this, 370, y, r.text, { size: 26, color: r.color, origin: 0.5 });
      this.tweens.add({ targets: icon, y: y - 5, duration: 1200 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    /* ---- daily challenge panel ---- */
    panel(this, 950, 350, 560, 470, { color: 0xffffff });
    label(this, 950, 155, '🎯 DAILY CHALLENGE', { size: 32, color: '#33364f' });

    const def = progress.currentDaily();
    if (def) {
      this.add.text(950, 235, def.icon, { fontSize: '76px' }).setOrigin(0.5);
      label(this, 950, 305, def.text, { size: 27, color: '#33364f', wrap: 460 });

      const ratio = progress.dailyProgressRatio();
      new Meter(this, {
        x: 950,
        y: 375,
        w: 420,
        h: 36,
        value: Math.min(progress.data.daily.progress, def.target),
        max: def.target,
        color: 0x6bcb77,
        showValue: false,
      });
      label(
        this,
        950,
        420,
        `${Math.min(progress.data.daily.progress, def.target)} / ${def.target}`,
        { size: 24, color: '#6b7280' }
      );

      if (progress.data.daily.claimed) {
        const done = label(this, 950, 490, '✅ COMPLETE — ⭐ +' + def.reward, {
          size: 32,
          color: '#2f9e44',
        });
        this.tweens.add({ targets: done, scale: 1.07, duration: 700, yoyo: true, repeat: -1 });
        label(this, 950, 545, 'Come back tomorrow for a new one!', { size: 21, color: '#9aa0ae' });
      } else {
        label(this, 950, 490, `REWARD:  ⭐ +${def.reward}`, { size: 34, color: '#e8a900' });
        label(this, 950, 545, `Progress: ${Math.round(ratio * 100)}%`, { size: 21, color: '#9aa0ae' });
      }
    } else {
      label(this, 950, 350, 'No challenge today', { size: 28, color: '#9aa0ae' });
    }

    button(this, {
      x: 640, y: 655, w: 300, h: 66, label: 'BACK', icon: '🏠', color: 0x4aa3ff, fontSize: 28,
      onClick: () => this.goHome(),
    });
  }
}
