import Phaser from 'phaser';
import { audio } from './AudioManager';
import { gameById } from './GameRegistry';
import { progress } from './Progress';
import { addHud, button, iconButton, label, panel, toast, type Hud, type HudOpts } from './UI';
import type { ResultPayload } from './types';

export type FinishOpts = Omit<ResultPayload, 'gameId' | 'title' | 'icon' | 'color'>;

/**
 * Shared base for every mini-game: HUD, pause, restart, home and the
 * hand-off to the shared result screen. Keeps all games consistent.
 */
export abstract class SceneBase extends Phaser.Scene {
  protected hud: Hud | null = null;

  protected showHud(opts: Omit<HudOpts, 'onPause'> & { onPause?: boolean } = {}): Hud {
    const { onPause, ...rest } = opts;
    this.hud = addHud(this, {
      ...rest,
      onPause: onPause === false ? undefined : () => this.pauseGame(),
    });
    return this.hud;
  }

  protected pauseGame(): void {
    audio.play('click');
    this.scene.pause();
    this.scene.launch('PauseScene', { target: this.scene.key });
  }

  protected finish(opts: FinishOpts): void {
    const def = gameById(this.scene.key);
    const result = progress.recordScore(def.id, opts.score, opts.stars, opts.win);
    this.hud?.destroy();
    this.hud = null;
    this.scene.start('ResultScene', {
      ...opts,
      gameId: def.id,
      title: def.title,
      icon: def.icon,
      color: def.color,
      result,
    } satisfies ResultPayload);
  }

  protected goHome(): void {
    audio.play('click');
    this.scene.start('HomeScene');
  }

  /**
   * Fade out the camera, then switch scenes.
   *
   * Phaser fires `camerafadeoutcomplete` on the camera when the fade ends
   * (there is no `fadeoutcomplete` event). The delayed call is a safety net
   * so navigation can never hang on a white screen.
   */
  protected transitionTo(key: string, duration = 220, color = 0xffffff): void {
    let done = false;
    const go = (): void => {
      if (done) return;
      done = true;
      if (this.scene.isActive() || this.scene.isPaused()) this.scene.start(key);
    };
    try {
      this.cameras.main.once('camerafadeoutcomplete', go);
      this.cameras.main.fadeOut(
        duration,
        ((color >> 16) & 0xff) / 255,
        ((color >> 8) & 0xff) / 255,
        (color & 0xff) / 255
      );
      this.time.delayedCall(duration + 500, go);
    } catch {
      go();
    }
  }

  protected restartSelf(): void {
    audio.play('click');
    this.scene.restart();
  }

  protected overlayHint(text: string): void {
    toast(this, text, { color: 0x33364f });
  }
}

/* ------------------------------------------------------------------ */
/* Pause overlay scene (used by every game)                            */
/* ------------------------------------------------------------------ */

export interface PauseData {
  target: string;
}

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create(data: PauseData): void {
    const target = data?.target;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x1f2340, 0.62);
    g.fillRect(0, 0, 1280, 720);
    this.input.setTopOnly(true);

    panel(this, 640, 380, 520, 470, { color: 0xffffff });
    label(this, 640, 205, '⏸️ PAUSED', { size: 52, color: '#33364f' });

    button(this, {
      x: 640, y: 300, w: 340, h: 72, label: 'RESUME', icon: '▶️', color: 0x6bcb77,
      fontSize: 32,
      onClick: () => this.resume(),
    });
    button(this, {
      x: 640, y: 390, w: 340, h: 72, label: 'RESTART', icon: '🔄', color: 0x4aa3ff,
      fontSize: 32,
      onClick: () => this.restartGame(target),
    });
    button(this, {
      x: 640, y: 480, w: 340, h: 72, label: 'SETTINGS', icon: '⚙️', color: 0xa78bfa,
      fontSize: 32,
      onClick: () => {
        audio.play('click');
        this.scene.launch('SettingsScene', { overlay: true });
      },
    });
    button(this, {
      x: 640, y: 570, w: 340, h: 72, label: 'HOME', icon: '🏠', color: 0xff6b6b,
      fontSize: 32,
      onClick: () => this.goHome(target),
    });
  }

  private resume(): void {
    audio.play('click');
    const target = (this.scene.settings.data as PauseData)?.target;
    if (target) this.scene.resume(target);
    this.scene.stop();
  }

  private restartGame(target?: string): void {
    audio.play('click');
    if (target) {
      this.scene.stop(target);
      this.scene.start(target);
    } else {
      this.scene.start('HomeScene');
    }
  }

  private goHome(target?: string): void {
    audio.play('click');
    if (target) this.scene.stop(target);
    this.scene.start('HomeScene');
  }
}

/* ------------------------------------------------------------------ */
/* Small reusable in-game confirm dialog                               */
/* ------------------------------------------------------------------ */

export function confirmDialog(
  scene: Phaser.Scene,
  msg: string,
  onYes: () => void,
  onNo?: () => void
): void {
  const depth = 1500;
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(0x1f2340, 0.6);
  g.fillRect(0, 0, 1280, 720);
  const objs: Phaser.GameObjects.GameObject[] = [g];
  // Invisible blocker: without it, clicks landing on the dialog but outside
  // YES/NO fall through to whatever interactive object sits underneath.
  const blocker = scene.add
    .rectangle(0, 0, 1280, 720, 0x000000, 0)
    .setOrigin(0)
    .setDepth(depth)
    .setInteractive();
  objs.push(blocker);
  const p = panel(scene, 640, 360, 560, 300, { color: 0xffffff });
  p.setDepth(depth);
  objs.push(p);
  const t = label(scene, 640, 290, msg, { size: 32, color: '#33364f', wrap: 460 });
  t.setDepth(depth + 1);
  objs.push(t);
  const yes = button(scene, {
    x: 520, y: 430, w: 200, h: 74, label: 'YES', icon: '✅', color: 0x6bcb77, fontSize: 30,
    depth: depth + 1,
    onClick: () => {
      objs.forEach((o) => o.destroy());
      onYes();
    },
  });
  const no = button(scene, {
    x: 760, y: 430, w: 200, h: 74, label: 'NO', icon: '❌', color: 0xff6b6b, fontSize: 30,
    depth: depth + 1,
    onClick: () => {
      objs.forEach((o) => o.destroy());
      onNo?.();
    },
  });
  objs.push(yes, no);
}

export { iconButton };
