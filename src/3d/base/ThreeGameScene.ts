import Phaser from 'phaser';
import { DESIGN_H, DESIGN_W } from '../../config';
import { SceneBase } from '../../core/SceneBase';
import { button, label, panel, type HudOpts } from '../../core/UI';
import { CameraRig, type Vec3 } from '../camera';
import { ThreeStage, type Quality } from '../engine/stage';
import { InteractionManager } from '../interaction';
import type { LightingPreset } from '../lighting';
import { ParticleSystem } from '../particles';

/**
 * Shared base class for every genuinely-3D mini-game.
 *
 * Responsibilities:
 *  - own the ThreeStage lifecycle (create / pause / resume / dispose)
 *  - route real pointer input into the raycast interaction layer
 *  - drive the camera rig, particles and per-frame game logic
 *  - play the short cinematic intro and hand over to gameplay
 *  - show the "3D graphics are unavailable" fallback when WebGL is missing
 *  - publish a small test API so E2E can assert real input -> state change
 */

export interface ProbePoint {
  x: number;
  y: number;
  label?: string;
}

export interface GameTestApi {
  /** Live gameplay state (plain JSON - read by the E2E suite). */
  state(): Record<string, unknown>;
  /** Design-space point of an element that must react to a real tap. */
  probe?(): ProbePoint | null;
}

export interface ThreeSceneOpts {
  lighting?: LightingPreset;
  camera?: { pos: Vec3; look: Vec3; fov?: number };
  /** HUD options, or `false` to skip the shared HUD. */
  hud?: HudOpts | false;
  intro?: boolean;
  introDur?: number;
  introFrom?: Vec3;
  quality?: Quality;
}

export abstract class ThreeGameScene extends SceneBase {
  protected stage: ThreeStage | null = null;
  protected rig: CameraRig | null = null;
  protected fx: ParticleSystem | null = null;
  protected interact: InteractionManager | null = null;
  protected gameplayReady = false;

  private disposed = false;
  private consumed = false;
  private testApi: GameTestApi | null = null;

  private readonly onPointerDownFn = (p: Phaser.Input.Pointer): void => this.routeDown(p);
  private readonly onPointerMoveFn = (p: Phaser.Input.Pointer): void => this.routeMove(p);
  private readonly onPointerUpFn = (p: Phaser.Input.Pointer): void => this.routeUp(p);
  private readonly onPauseFn = (): void => this.stage?.stop();
  private readonly onResumeFn = (): void => this.stage?.start();
  private readonly onShutdownFn = (): void => this.teardown();

  /** Call first in `create()`. Returns false when WebGL is unavailable. */
  protected setup3D(opts: ThreeSceneOpts = {}): boolean {
    this.disposed = false;
    this.gameplayReady = false;
    try {
      const parent = document.getElementById('game-root');
      if (!parent) throw new Error('game root missing');
      this.stage = new ThreeStage({
        parent,
        host: this.game.canvas,
        designW: DESIGN_W,
        designH: DESIGN_H,
        quality: opts.quality,
        lighting: opts.lighting ?? 'day',
        onContextLost: () => this.showWebGLError('WebGL context lost'),
      });
      this.rig = new CameraRig(this.stage);
      this.fx = new ParticleSystem(this.stage);
      this.interact = new InteractionManager(this.stage);

      if (opts.camera) this.rig.setPose(opts.camera.pos, opts.camera.look);
      if (opts.camera?.fov) {
        this.stage.camera.fov = opts.camera.fov;
        this.stage.camera.updateProjectionMatrix();
      }

      this.build3D();

      this.stage.onUpdate((dt, t) => this.frame(dt, t));
      this.stage.start();

      if (opts.hud !== false) {
        const { onPause: _customPause, ...hudRest } = opts.hud ?? {};
        this.showHud(hudRest);
      }

      this.input.on('pointerdown', this.onPointerDownFn);
      this.input.on('pointermove', this.onPointerMoveFn);
      this.input.on('pointerup', this.onPointerUpFn);
      this.events.on('pause', this.onPauseFn);
      this.events.on('resume', this.onResumeFn);
      this.events.on('shutdown', this.onShutdownFn);

      if (opts.intro === false) {
        this.gameplayReady = true;
        this.onGameplayStart();
      } else {
        const dur = opts.introDur ?? 900;
        this.rig.intro({
          dur,
          from: opts.introFrom,
          onDone: () => {
            if (this.disposed) return;
            this.gameplayReady = true;
            this.onGameplayStart();
          },
        });
        this.stage.delay(dur + 60, () => {
          if (this.disposed || this.gameplayReady) return;
          this.gameplayReady = true;
          this.onGameplayStart();
        });
      }
      return true;
    } catch (err) {
      this.teardownStageOnly();
      this.showWebGLError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /** Build the 3D content (called once, right after the stage exists). */
  protected abstract build3D(): void;

  /** Per-frame 3D update (already wrapped in try/catch by the base). */
  protected on3DUpdate(_dt: number, _t: number): void {
    /* override */
  }

  /** Gameplay becomes interactive after the cinematic intro. */
  protected onGameplayStart(): void {
    /* override */
  }

  /** Register the E2E test API (`window.__game3d`). */
  protected exposeTest(api: GameTestApi): void {
    this.testApi = api;
    (window as unknown as { __game3d?: GameTestApi & { scene: ThreeGameScene } }).__game3d = {
      ...api,
      scene: this,
    };
  }

  /** Tap in design-space coordinates (3D interaction layer already had its go). */
  protected handleTap(_dx: number, _dy: number): void {
    /* override */
  }

  protected handleDragStart(_dx: number, _dy: number): void {
    /* override */
  }

  protected handleDragMove(_dx: number, _dy: number): void {
    /* override */
  }

  protected handleDragEnd(_dx: number, _dy: number): void {
    /* override */
  }

  /** Convenience: register extra keyboard keys (optional, mobile never needs them). */
  protected addKey(code: string, down: () => void, up?: () => void): void {
    const k = this.input.keyboard?.addKey(code);
    k?.on('down', down);
    if (up) k?.on('up', up);
  }

  /* ---------------- input plumbing ---------------- */

  private overHud(p: Phaser.Input.Pointer): boolean {
    try {
      return this.input.hitTestPointer(p).length > 0;
    } catch {
      return false;
    }
  }

  private inBounds(p: Phaser.Input.Pointer): boolean {
    return p.x >= 0 && p.x <= DESIGN_W && p.y >= 0 && p.y <= DESIGN_H;
  }

  private routeDown(p: Phaser.Input.Pointer): void {
    if (!this.stage || !this.gameplayReady) return;
    if (!this.inBounds(p) || this.overHud(p)) return;
    this.consumed = this.interact?.handleDown(p.x, p.y) ?? false;
    if (this.consumed) return;
    this.handleTap(p.x, p.y);
  }

  private routeMove(p: Phaser.Input.Pointer): void {
    if (!this.stage || !this.interact) return;
    if (this.consumed) {
      this.interact.handleMove(p.x, p.y);
      return;
    }
    if (!this.inBounds(p)) return;
    this.handleDragMove(p.x, p.y);
  }

  private routeUp(p: Phaser.Input.Pointer): void {
    if (!this.stage || !this.interact) return;
    if (this.consumed) {
      this.consumed = false;
      this.interact.handleUp(p.x, p.y);
      return;
    }
    this.interact.handleUp(p.x, p.y);
    this.handleDragEnd(p.x, p.y);
  }

  private frame(dt: number, t: number): void {
    this.rig?.update(dt);
    this.interact?.update(dt);
    this.on3DUpdate(dt, t);
  }

  /* ---------------- failure handling ---------------- */

  protected showWebGLError(reason: string): void {
    this.teardownStageOnly();
    showWebGLFailure(this, reason);
  }
  private teardownStageOnly(): void {
    try {
      this.interact?.clear();
    } catch {
      /* ignore */
    }
    try {
      this.fx?.dispose();
    } catch {
      /* ignore */
    }
    try {
      this.stage?.dispose();
    } catch {
      /* ignore */
    }
    this.stage = null;
    this.rig = null;
    this.fx = null;
    this.interact = null;
  }

  private teardown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.input.off('pointerdown', this.onPointerDownFn);
    this.input.off('pointermove', this.onPointerMoveFn);
    this.input.off('pointerup', this.onPointerUpFn);
    this.events.off('pause', this.onPauseFn);
    this.events.off('resume', this.onResumeFn);
    this.events.off('shutdown', this.onShutdownFn);
    this.teardownStageOnly();
    const w = window as unknown as { __game3d?: { scene?: ThreeGameScene } };
    if (w.__game3d && w.__game3d.scene === this) delete w.__game3d;
    this.testApi = null;
  }

  /** True when the scene owns a live 3D stage. */
  has3D(): boolean {
    return this.stage !== null;
  }

  protected get test(): GameTestApi | null {
    return this.testApi;
  }
}

/** Shared WebGL-unavailable screen (never a black hole). */
export function showWebGLFailure(scene: Phaser.Scene, reason: string): void {
  const g = scene.add.graphics().setDepth(0);
  g.fillGradientStyle(0x4aa3ff, 0x4aa3ff, 0x9be2ff, 0x9be2ff, 1);
  g.fillRect(0, 0, DESIGN_W, DESIGN_H);

  panel(scene, DESIGN_W / 2, DESIGN_H / 2 - 10, 780, 380, { color: 0xffffff });
  label(scene, DESIGN_W / 2, DESIGN_H / 2 - 130, '😢', { size: 84, depth: 10 });
  label(scene, DESIGN_W / 2, DESIGN_H / 2 - 46, '3D graphics are unavailable on this device/browser.', {
    size: 30,
    color: '#33364f',
    wrap: 680,
    depth: 10,
  });
  label(scene, DESIGN_W / 2, DESIGN_H / 2 + 4, String(reason).slice(0, 90), {
    size: 18,
    color: '#9aa0ae',
    depth: 10,
  });
  button(scene, {
    x: DESIGN_W / 2,
    y: DESIGN_H / 2 + 110,
    w: 340,
    h: 84,
    label: 'RETURN HOME',
    icon: '🏠',
    color: 0x4aa3ff,
    fontSize: 30,
    depth: 10,
    onClick: () => {
      scene.scene.start('HomeScene');
    },
  });
}
