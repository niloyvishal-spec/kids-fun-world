import Phaser from 'phaser';
import { audio } from '../core/AudioManager';
import { progress } from '../core/Progress';
import { confirmDialog } from '../core/SceneBase';
import { button, label, panel, toast } from '../core/UI';
import type { Btn } from '../core/UI';

export interface SettingsData {
  overlay?: boolean;
}

/** Sound / music / reset modal. Launched above whatever scene is running. */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  create(_data?: SettingsData): void {
    // Modal: stop the scene underneath from reacting to clicks that land
    // outside this panel (Phaser feeds pointer events to every active scene).
    const under = this.scene.manager
      .getScenes(true)
      .filter((s) => s.scene.key !== this.scene.key);
    under.forEach((s) => {
      if (s.input) s.input.enabled = false;
    });
    this.events.once('shutdown', () => {
      under.forEach((s) => {
        if (s.input) s.input.enabled = true;
      });
    });

    const scrim = this.add.graphics().setDepth(0);
    scrim.fillStyle(0x1f2340, 0.6);
    scrim.fillRect(0, 0, 1280, 720);

    panel(this, 640, 370, 640, 540, { color: 0xffffff }).setDepth(1);
    label(this, 640, 145, '⚙️ SETTINGS', { size: 46, color: '#33364f' }).setDepth(2);

    let soundBtn: Btn | null = null;
    let musicBtn: Btn | null = null;

    const rebuildSound = (): void => {
      soundBtn?.destroy();
      soundBtn = button(this, {
        x: 640, y: 255, w: 440, h: 76,
        label: `SOUND ${progress.data.settings.sound ? 'ON' : 'OFF'}`,
        icon: progress.data.settings.sound ? '🔊' : '🔇',
        color: progress.data.settings.sound ? 0x6bcb77 : 0xb9bdc9,
        fontSize: 30,
        depth: 2,
        onClick: () => {
          const on = !progress.data.settings.sound;
          progress.data.settings.sound = on;
          progress.flush();
          audio.setSound(on);
          if (on) audio.play('star');
          rebuildSound();
        },
      });
    };

    const rebuildMusic = (): void => {
      musicBtn?.destroy();
      musicBtn = button(this, {
        x: 640, y: 350, w: 440, h: 76,
        label: `MUSIC ${progress.data.settings.music ? 'ON' : 'OFF'}`,
        icon: progress.data.settings.music ? '🎵' : '🔈',
        color: progress.data.settings.music ? 0x4aa3ff : 0xb9bdc9,
        fontSize: 30,
        depth: 2,
        onClick: () => {
          const on = !progress.data.settings.music;
          progress.data.settings.music = on;
          progress.flush();
          audio.setMusic(on);
          rebuildMusic();
        },
      });
    };

    rebuildSound();
    rebuildMusic();

    button(this, {
      x: 640, y: 445, w: 440, h: 76, label: 'RESET PROGRESS', icon: '🗑️', color: 0xff6b6b, fontSize: 28,
      depth: 2,
      onClick: () => {
        confirmDialog(this, 'Reset ALL your stars and progress?', () => {
          progress.reset();
          toast(this, 'Progress reset', { icon: '🗑️', color: 0xff6b6b });
          rebuildSound();
          rebuildMusic();
        });
      },
    });

    label(this, 640, 510, 'Progress is saved on this device', {
      size: 20,
      color: '#6b7280',
      bold: false,
    }).setDepth(2);

    button(this, {
      x: 640, y: 580, w: 300, h: 76, label: 'CLOSE', icon: '✅', color: 0xffd93d, textColor: '#7a4a00',
      fontSize: 30, depth: 2,
      onClick: () => {
        audio.play('click');
        this.scene.stop();
      },
    });
  }
}
