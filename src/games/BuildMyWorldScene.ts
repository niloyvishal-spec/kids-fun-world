import Phaser from 'phaser';
import { audio } from '../core/AudioManager';
import { burst, confetti, floatText, sparkles } from '../core/FX';
import { progress } from '../core/Progress';
import { SceneBase } from '../core/SceneBase';
import { button, emojiText, Pill, toast } from '../core/UI';

const COLS = 13;
const ROWS = 6;
const CELL = 76;
const X0 = (1280 - COLS * CELL) / 2;
const Y0 = 150;

const ITEMS = ['🏠', '🌳', '🌲', '🌸', '☁️', '🐶', '🐱', '⭐', '🎈', '🌻'];

/** Creative sandbox: place houses, trees, animals and decorations on a grid. */
export class BuildMyWorldScene extends SceneBase {
  private cells: (Phaser.GameObjects.Text | null)[] = new Array(COLS * ROWS).fill(null);
  private grid: string[] = new Array(COLS * ROWS).fill('');
  private selected = ITEMS[0];
  private eraseMode = false;
  private undoStack: string[][] = [];
  private celebrated = false;
  private over = false;
  private itemBtns: import('../core/UI').Btn[] = [];
  private countPill!: Pill;
  private selText!: Phaser.GameObjects.Text;

  constructor() {
    super('BuildMyWorld');
  }

  create(): void {
    this.cells = new Array(COLS * ROWS).fill(null);
    this.undoStack = [];
    this.celebrated = false;
    this.over = false;
    this.itemBtns = [];
    this.eraseMode = false;
    this.selected = ITEMS[0];

    // restore saved world
    const saved = progress.data.world;
    this.grid = new Array(COLS * ROWS).fill('');
    if (Array.isArray(saved)) saved.forEach((v, i) => (this.grid[i] = v));
    // an already-crowded restored world must not re-fire the +30 star reward
    if (this.grid.filter((v) => v !== '').length >= 15) this.celebrated = true;

    const bg = this.add.graphics().setDepth(-100);
    bg.fillGradientStyle(0x9be2ff, 0x9be2ff, 0xd9f3ff, 0xeaf9ff, 1);
    bg.fillRect(0, 0, 1280, 720);
    // ground
    bg.fillStyle(0x7ed957, 1);
    bg.fillRect(0, Y0 - 6, 1280, ROWS * CELL + 12);
    bg.fillStyle(0x63c44a, 1);
    bg.fillRect(0, Y0 - 6, 1280, 8);

    // grid slots
    const slotsG = this.add.graphics().setDepth(-50);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const on = (r + c) % 2 === 0;
        slotsG.fillStyle(0xffffff, on ? 0.22 : 0.12);
        slotsG.fillRoundedRect(X0 + c * CELL + 3, Y0 + r * CELL + 3, CELL - 6, CELL - 6, 14);
        slotsG.lineStyle(2, 0xffffff, 0.35);
        slotsG.strokeRoundedRect(X0 + c * CELL + 3, Y0 + r * CELL + 3, CELL - 6, CELL - 6, 14);
      }
    }

    // hit zones
    const zones = this.add.container(0, 0).setDepth(0);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const zone = this.add
          .rectangle(X0 + c * CELL + CELL / 2, Y0 + r * CELL + CELL / 2, CELL, CELL, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => this.tapCell(i));
        zones.add(zone);
      }
    }

    this.showHud({ score: 0, center: '🏗️ BUILD MY WORLD' });
    this.countPill = new Pill(this, 640, 100, ' ', { color: 0x6bcb77, minW: 260, depth: 20 });

    // palette bar
    const bar = this.add.graphics().setDepth(4);
    bar.fillStyle(0xffffff, 0.94);
    bar.fillRoundedRect(60, 618, 1160, 92, 30);
    bar.lineStyle(4, 0xffffff, 1);
    bar.strokeRoundedRect(60, 618, 1160, 92, 30);

    ITEMS.forEach((it, i) => {
      const b = button(this, {
        x: 130 + i * 76,
        y: 664,
        w: 66,
        h: 66,
        icon: it,
        color: i === 0 ? 0xffd93d : 0xf1f3f7,
        iconSize: 40,
        radius: 20,
        depth: 6,
        onClick: () => this.selectItem(i),
      });
      this.itemBtns.push(b);
    });

    // Selected-item preview: kept clear of the palette (ends x847) and of the
    // four tool buttons below (start x923) so it is never painted over.
    this.selText = emojiText(this, 884, 664, ITEMS[0], 44).setDepth(6);

    const tool = (x: number, icon: string, color: number, onClick: () => void): void => {
      button(this, { x, y: 664, w: 70, h: 66, icon, color, iconSize: 34, depth: 6, onClick });
    };
    tool(958, '🧽', 0x4dd0e1, () => {
      this.eraseMode = !this.eraseMode;
      audio.play('click');
      this.refreshCount();
      toast(this, this.eraseMode ? 'Eraser ON — tap to remove' : 'Eraser OFF', {
        icon: '🧽',
        color: 0x4dd0e1,
        duration: 1000,
      });
    });
    tool(1033, '↩️', 0xa78bfa, () => this.undo());
    tool(1108, '🎲', 0xffa94d, () => this.randomize());
    tool(1183, '🗑️', 0xff6b6b, () => this.clearAll());

    // Top-right, above the grid (grid starts at y150) - a bottom-right button
    // would sit on top of the last grid cells and swallow their taps.
    button(this, {
      x: 1130, y: 105, w: 240, h: 64, label: 'ALL DONE!', icon: '✅', color: 0x6bcb77, fontSize: 26,
      depth: 8,
      onClick: () => this.finishBuilding(),
    });

    // rebuild existing world
    for (let i = 0; i < COLS * ROWS; i++) if (this.grid[i]) this.placeVisual(i, false);

    this.refreshCount();
  }

  /* ---------------- interaction ---------------- */

  private selectItem(index: number): void {
    this.selected = ITEMS[index];
    this.eraseMode = false;
    audio.play('click');
    this.selText.setText(this.selected);
    this.tweens.add({ targets: this.selText, scale: 1.4, duration: 130, yoyo: true });
    this.itemBtns.forEach((b, idx) => b.setColor(idx === index ? 0xffd93d : 0xf1f3f7));
  }

  private snapshot(): void {
    this.undoStack.push([...this.grid]);
    if (this.undoStack.length > 40) this.undoStack.shift();
  }

  private tapCell(i: number): void {
    if (this.over) return;
    audio.resumeAfterGesture();
    if (this.eraseMode) {
      if (!this.grid[i]) return;
      this.snapshot();
      this.grid[i] = '';
      this.destroyCell(i);
      audio.play('erase');
      this.refreshCount();
      this.save();
      return;
    }
    if (this.grid[i] === this.selected) return;
    this.snapshot();
    this.grid[i] = this.selected;
    this.destroyCell(i);
    this.placeVisual(i, true);
    audio.play('place');
    progress.track('world_items', 1);
    this.refreshCount();
    this.save();
    if (this.countItems() >= 15 && !this.celebrated) {
      this.celebrated = true;
      confetti(this, 2200);
      audio.play('success');
      toast(this, '🏗️ Amazing world! ⭐ +30', { color: 0x2f9e44, duration: 2200 });
      progress.addStars(30);
    }
  }

  private placeVisual(i: number, animate: boolean): void {
    const emoji = this.grid[i];
    if (!emoji) return;
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    const x = X0 + c * CELL + CELL / 2;
    const y = Y0 + r * CELL + CELL / 2;
    const img = emojiText(this, x, y, emoji, 52).setDepth(3);
    this.cells[i] = img;
    if (animate) {
      img.setScale(0);
      this.tweens.add({ targets: img, scale: 1, duration: 300, ease: 'Back.easeOut' });
      burst(this, x, y, 0xffd93d, 8, { speed: 130 });
      floatText(this, x, y - 34, '+10', { color: '#ffffff', size: 22 });
    }
  }

  private destroyCell(i: number): void {
    const obj = this.cells[i];
    if (obj) {
      this.tweens.add({ targets: obj, scale: 0, alpha: 0, duration: 180, onComplete: () => obj.destroy() });
      this.cells[i] = null;
    }
  }

  private undo(): void {
    if (this.over) return;
    const prev = this.undoStack.pop();
    if (!prev) {
      audio.play('wrong');
      toast(this, 'Nothing to undo', { icon: '↩️', color: 0xa78bfa, duration: 900 });
      return;
    }
    audio.play('click');
    for (let i = 0; i < this.grid.length; i++) {
      if (prev[i] !== this.grid[i]) {
        this.grid[i] = prev[i];
        this.destroyCell(i);
        if (prev[i]) this.placeVisual(i, false);
      }
    }
    this.refreshCount();
    this.save();
  }

  private randomize(): void {
    if (this.over) return;
    this.snapshot();
    const density = 0.4;
    for (let i = 0; i < this.grid.length; i++) {
      const next = Math.random() < density ? ITEMS[Math.floor(Math.random() * ITEMS.length)] : '';
      if (next !== this.grid[i]) {
        this.grid[i] = next;
        this.destroyCell(i);
        if (next) this.placeVisual(i, false);
      }
    }
    audio.play('reward');
    sparkles(this, 640, 360, 0xffd93d, 18);
    this.refreshCount();
    this.save();
  }

  private clearAll(): void {
    if (this.over) return;
    this.snapshot();
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = '';
      this.destroyCell(i);
    }
    audio.play('erase');
    this.refreshCount();
    this.save();
    toast(this, 'World cleared', { icon: '🗑️', color: 0xff6b6b, duration: 900 });
  }

  private countItems(): number {
    return this.grid.filter((v) => v !== '').length;
  }

  private refreshCount(): void {
    const n = this.countItems();
    this.countPill.set(`${this.eraseMode ? '🧽' : '🏗️'} ${n} things placed`);
    this.hud?.setScore(n * 10);
  }

  private save(): void {
    progress.data.world = [...this.grid];
    progress.flush();
  }

  private finishBuilding(): void {
    if (this.over) return;
    const n = this.countItems();
    const kinds = new Set(this.grid.filter((v) => v !== '')).size;
    if (n === 0) {
      toast(this, 'Place some things first! 👆', { color: 0xffa94d, duration: 1400 });
      audio.play('wrong');
      return;
    }
    this.over = true;
    audio.play('success');
    confetti(this, 1800);
    const score = n * 10 + kinds * 25;
    const stars = n >= 15 ? 3 : n >= 8 ? 2 : 1;
    this.time.delayedCall(700, () => {
      if (!this.scene.isActive()) return;
      this.finish({
        score,
        stars,
        win: n >= 8,
        subtitle: 'Your world looks wonderful!',
        lines: [
          { icon: '🏗️', label: 'Things', value: String(n) },
          { icon: '🌈', label: 'Varieties', value: String(kinds) },
        ],
      });
    });
  }
}
