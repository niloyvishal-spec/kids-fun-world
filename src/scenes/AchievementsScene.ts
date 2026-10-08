import { ACHIEVEMENTS, progress } from '../core/Progress';
import { SceneBase } from '../core/SceneBase';
import { button, drawSky, label, type Btn } from '../core/UI';

/**
 * Grid of the unlockable achievements.
 *
 * Paginated 3x3 per page: ACHIEVEMENTS grows over time and the original
 * hardcoded 3-row lookup (`ys[Math.floor(i / 3)]`) threw a TypeError for the
 * tenth achievement onwards, taking the whole scene down.
 */
const PER_PAGE = 9;
const XS = [250, 640, 1030];
const YS = [235, 400, 565];

export class AchievementsScene extends SceneBase {
  private page = 0;
  private pages = 1;
  private cards: Phaser.GameObjects.Container[] = [];
  private pageLabel: Phaser.GameObjects.Text | null = null;
  private prev: Btn | null = null;
  private next: Btn | null = null;

  constructor() {
    super('AchievementsScene');
  }

  create(): void {
    this.page = 0;
    this.pages = Math.max(1, Math.ceil(ACHIEVEMENTS.length / PER_PAGE));
    this.cards = [];

    drawSky(this, { hills: true, sun: true });

    label(this, 640, 56, '🏆 ACHIEVEMENTS', {
      size: 50,
      color: '#ffffff',
      stroke: '#33364f',
      strokeThickness: 8,
    });

    const unlockedCount = ACHIEVEMENTS.filter((a) => progress.data.achievements[a.id]).length;
    label(this, 640, 106, `${unlockedCount} / ${ACHIEVEMENTS.length} unlocked`, {
      size: 24,
      color: '#eaf7ff',
    });

    // Sits in the gap between PREV and BACK - at (640,672) it was painted
    // underneath the opaque BACK button and could never be seen.
    this.pageLabel = label(this, 422, 672, ' ', {
      size: 26,
      color: '#eaf7ff',
      stroke: '#33364f',
      strokeThickness: 5,
    });

    this.prev = button(this, {
      x: 300, y: 672, w: 110, h: 62, label: '◀', color: 0x4aa3ff, fontSize: 30,
      onClick: () => this.goTo(this.page - 1),
    });
    this.next = button(this, {
      x: 980, y: 672, w: 110, h: 62, label: '▶', color: 0x4aa3ff, fontSize: 30,
      onClick: () => this.goTo(this.page + 1),
    });

    button(this, {
      x: 640, y: 672, w: 300, h: 62, label: 'BACK', icon: '🏠', color: 0x6bcb77, fontSize: 28,
      onClick: () => this.goHome(),
    });

    this.renderPage();
  }

  private goTo(page: number): void {
    if (page < 0 || page >= this.pages || page === this.page) return;
    this.page = page;
    this.renderPage();
  }

  private renderPage(): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    this.pageLabel?.setText(this.pages > 1 ? `${this.page + 1} / ${this.pages}` : ' ');
    this.prev?.setEnabled(this.page > 0);
    this.next?.setEnabled(this.page < this.pages - 1);

    const slice = ACHIEVEMENTS.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE);
    slice.forEach((a, i) => {
      const unlocked = Boolean(progress.data.achievements[a.id]);
      const x = XS[i % 3];
      const y = YS[Math.floor(i / 3)];
      const card = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(unlocked ? 0xffd93d : 0xf1f3f7, 1);
      g.fillRoundedRect(-180, -72, 360, 144, 28);
      g.lineStyle(5, unlocked ? 0xffffff : 0xd7dbe4, 1);
      g.strokeRoundedRect(-180, -72, 360, 144, 28);
      const icon = this.add
        .text(-135, -6, unlocked ? a.icon : '🔒', { fontSize: '54px' })
        .setOrigin(0.5);
      const title = this.add
        .text(-85, -28, a.title, {
          fontFamily: "'Trebuchet MS',sans-serif",
          fontSize: '26px',
          fontStyle: 'bold',
          color: unlocked ? '#7a4a00' : '#8b90a0',
        })
        .setOrigin(0, 0.5);
      const desc = this.add
        .text(-85, 10, a.desc, {
          fontFamily: "'Trebuchet MS',sans-serif",
          fontSize: '18px',
          color: unlocked ? '#8a6d1f' : '#a7abb8',
          wordWrap: { width: 250 },
        })
        .setOrigin(0, 0.5);
      const stamp = this.add
        .text(-85, 45, unlocked ? '✅ DONE' : '⏳ KEEP PLAYING', {
          fontFamily: "'Trebuchet MS',sans-serif",
          fontSize: '17px',
          fontStyle: 'bold',
          color: unlocked ? '#2f9e44' : '#9aa0ae',
        })
        .setOrigin(0, 0.5);
      card.add([g, icon, title, desc, stamp]);
      card.setAlpha(0);
      card.setScale(0.86);
      this.cards.push(card);
      this.tweens.add({
        targets: card,
        alpha: 1,
        scale: 1,
        duration: 320,
        delay: 40 + i * 55,
        ease: 'Back.easeOut',
      });
      if (unlocked) {
        this.tweens.add({ targets: icon, scale: 1.12, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
  }
}
