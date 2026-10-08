import Phaser from 'phaser';
import { EMOJI_FONT, UI_FONT } from '../config';
import { audio } from './AudioManager';

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export interface LabelOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  stroke?: string;
  strokeThickness?: number;
  origin?: number;
  wrap?: number;
  align?: string;
  alpha?: number;
  depth?: number;
}

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  opts: LabelOpts = {}
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, str, {
      fontFamily: UI_FONT,
      fontSize: `${opts.size ?? 28}px`,
      color: opts.color ?? '#ffffff',
      fontStyle: opts.bold === false ? 'normal' : 'bold',
      stroke: opts.stroke ?? 'rgba(0,0,0,0)',
      strokeThickness: opts.strokeThickness ?? 0,
      align: opts.align ?? 'center',
      wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
    })
    .setOrigin(opts.origin ?? 0.5)
    .setAlpha(opts.alpha ?? 1);
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  return t;
}

export function emojiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  ch: string,
  size = 40
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, ch, { fontFamily: EMOJI_FONT, fontSize: `${size}px` }).setOrigin(0.5);
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export interface ButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  sub?: string;
  icon?: string;
  color?: number;
  textColor?: string;
  fontSize?: number;
  subSize?: number;
  iconSize?: number;
  radius?: number;
  onClick?: () => void;
  enabled?: boolean;
  layout?: 'row' | 'stack';
  depth?: number;
  badge?: string;
  border?: number;
}

export class Btn extends Phaser.GameObjects.Container {
  private readonly o: ButtonOptions;
  private readonly bodyG: Phaser.GameObjects.Graphics;
  private iconObj?: Phaser.GameObjects.Text;
  private labelObj?: Phaser.GameObjects.Text;
  private subObj?: Phaser.GameObjects.Text;
  private badgeObj?: Phaser.GameObjects.Container;
  private isOver = false;
  private isDown = false;
  private btnActive = true;
  /** True while the entrance pop-in is running (see enter()). */
  private entering = false;

  constructor(scene: Phaser.Scene, opts: ButtonOptions) {
    super(scene, opts.x, opts.y);
    this.o = { color: 0x4aa3ff, textColor: '#ffffff', layout: 'row', ...opts };
    scene.add.existing(this);
    if (opts.depth !== undefined) this.setDepth(opts.depth);

    this.bodyG = scene.add.graphics();
    this.add(this.bodyG);
    this.build();

    this.setInteractive(
      new Phaser.Geom.Rectangle(-this.o.w / 2, -this.o.h / 2, this.o.w, this.o.h),
      Phaser.Geom.Rectangle.Contains
    );
    this.bindEvents();
    if (opts.enabled === false) this.setEnabled(false);
  }

  /**
   * Pop-in animation for lists of cards.
   *
   * Deliberately does NOT start at scale 0: a zero-scale Container has a
   * degenerate world matrix, so Phaser's hit test can never match it and the
   * button is a dead zone until its tween begins. Scaling from 0.72 keeps the
   * card tappable from the first frame, and the alpha fade is NOT staggered so
   * nothing invisible is ever left sitting under the cursor.
   */
  enter(delay = 0, dur = 340): this {
    this.settleEntrance();
    this.setScale(0.72);
    this.setAlpha(0);
    this.entering = true;
    this.scene.tweens.add({
      targets: this,
      alpha: this.btnActive ? 1 : 0.45,
      duration: 200,
      ease: 'Linear',
    });
    this.entranceTween = this.scene.tweens.add({
      targets: this,
      scale: 1,
      delay,
      duration: dur,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.entering = false;
        this.entranceTween = null;
        this.setAlpha(this.btnActive ? 1 : 0.45);
      },
    });
    return this;
  }

  private entranceTween: Phaser.Tweens.Tween | null = null;

  /**
   * Jump straight to the resting state and stop the entrance tweens.
   *
   * Without this, `killTweensOf` in the pointer handlers silently cancelled
   * the entrance animation, leaving a card frozen at whatever scale it had
   * reached when the cursor swept over it.
   */
  private settleEntrance(): void {
    if (!this.entering && !this.entranceTween) return;
    this.entering = false;
    this.entranceTween = null;
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
    this.setAlpha(this.btnActive ? 1 : 0.45);
  }

  private build(): void {
    const { w, h, radius, color } = this.o;
    const r = radius ?? Math.min(h * 0.38, 26);
    const g = this.bodyG;
    g.clear();
    g.fillStyle(0x1f2340, 0.26);
    g.fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(color as number, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.24);
    g.fillRoundedRect(-w / 2 + 5, -h / 2 + 4, w - 10, Math.max(8, h * 0.36), Math.max(4, r * 0.5));
    g.lineStyle(this.o.border ?? 3, 0xffffff, 0.7);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    const iconSize = this.o.iconSize ?? Math.min(44, h * 0.6);
    const fontSize = this.o.fontSize ?? Math.min(32, h * 0.44);

    if (this.o.icon && !this.iconObj) {
      this.iconObj = emojiText(this.scene, 0, 0, this.o.icon, iconSize);
      this.add(this.iconObj);
    }
    if (this.o.label && !this.labelObj) {
      this.labelObj = label(this.scene, 0, 0, this.o.label, {
        size: fontSize,
        color: this.o.textColor,
      });
      this.add(this.labelObj);
    }
    if (this.o.sub && !this.subObj) {
      this.subObj = label(this.scene, 0, 0, this.o.sub, {
        size: this.subSizeOrDefault(),
        color: this.o.textColor ?? '#ffffff',
        alpha: 0.92,
      });
      this.add(this.subObj);
    }
    if (this.o.badge && !this.badgeObj) {
      this.badgeObj = this.scene.add.container(w / 2 - 4, -h / 2 + 4);
      const bg = this.scene.add.graphics();
      bg.fillStyle(0xffd93d, 1);
      bg.fillCircle(0, 0, 15);
      bg.lineStyle(3, 0xffffff, 1);
      bg.strokeCircle(0, 0, 15);
      const bt = label(this.scene, 0, 1, this.o.badge!, { size: 17, color: '#7a4a00' });
      this.badgeObj.add([bg, bt]);
      this.add(this.badgeObj);
    }

    this.layoutChildren();
  }

  private subSizeOrDefault(): number {
    return this.o.subSize ?? Math.max(14, Math.min(20, this.o.h * 0.22));
  }

  private layoutChildren(): void {
    const { h, layout } = this.o;
    const iconSize = this.o.iconSize ?? Math.min(44, h * 0.6);
    if (layout === 'stack') {
      if (this.iconObj) this.iconObj.setPosition(0, -h * 0.23);
      if (this.labelObj) this.labelObj.setPosition(0, h * 0.14);
      if (this.subObj) this.subObj.setPosition(0, h * 0.35);
      return;
    }
    const labelW = this.labelObj ? this.labelObj.width : 0;
    const iconW = this.iconObj ? iconSize * 1.15 : 0;
    const gap = this.iconObj && this.labelObj ? 12 : 0;
    const total = iconW + gap + labelW;
    const start = -total / 2;
    if (this.iconObj) this.iconObj.setPosition(start + iconW / 2, this.subObj ? -6 : 0);
    if (this.labelObj) {
      if (this.iconObj) {
        this.labelObj.setOrigin(0, 0.5).setPosition(start + iconW + gap, this.subObj ? -6 : 0);
      } else {
        this.labelObj.setOrigin(0.5, 0.5).setPosition(this.subObj ? 0 : 0, this.subObj ? -6 : 0);
      }
    }
    if (this.subObj) this.subObj.setPosition(0, h * 0.26);
  }

  private bindEvents(): void {
    this.on('pointerover', () => {
      if (!this.btnActive) return;
      this.isOver = true;
      this.prep();
      this.scene.tweens.add({ targets: this, scale: 1.06, duration: 130, ease: 'Back.easeOut' });
    });
    this.on('pointerout', () => {
      if (!this.btnActive) return;
      this.isOver = false;
      // `isDown` is deliberately NOT cleared here. Phaser dispatches a
      // game-object `pointerup` only while the pointer is still over the
      // object (InputPlugin.processUpEvents walks `currentlyOver`), so
      // dropping the press state on `pointerout` discarded every click where
      // the finger drifted off the button and came back - a very common lost
      // tap on touch screens.
      this.prep();
      this.scene.tweens.add({ targets: this, scale: 1, duration: 140, ease: 'Quad.easeOut' });
    });
    this.on('pointerdown', () => {
      if (!this.btnActive) return;
      this.isDown = true;
      this.prep();
      this.scene.tweens.add({ targets: this, scale: 0.94, duration: 80, ease: 'Quad.easeOut' });
    });
    this.on('pointerup', () => {
      if (!this.btnActive || !this.isDown) return;
      this.isDown = false;
      audio.play('click');
      // Start the release animation, then fire the callback IMMEDIATELY.
      // Waiting for the tween's onComplete meant the click was silently lost
      // whenever a pointerout arrived first (very common with touch input).
      const cb = this.o.onClick;
      this.prep();
      this.scene.tweens.add({
        targets: this,
        scale: this.isOver ? 1.07 : 1,
        duration: 140,
        ease: 'Back.easeOut',
      });
      cb?.();
    });

    // Safety net: a press that leaves the button before release never gets an
    // object-level `pointerup`, which would latch `isDown` and let a later
    // press-elsewhere-slide-on release fire a spurious click.
    this.scene.input?.on('pointerup', this.clearPress, this);
  }

  private clearPress(): void {
    this.isDown = false;
  }

  /** Finish the entrance (if running) and drop any hover/press tween. */
  private prep(): void {
    if (this.entering) this.settleEntrance();
    else this.scene.tweens.killTweensOf(this);
  }

  override destroy(fromScene?: boolean): void {
    try {
      this.scene?.input?.off('pointerup', this.clearPress, this);
    } catch {
      /* scene may already be gone */
    }
    super.destroy(fromScene);
  }

  setEnabled(v: boolean): void {
    this.btnActive = v;
    if (v) {
      this.setAlpha(1);
      this.setInteractive(
        new Phaser.Geom.Rectangle(-this.o.w / 2, -this.o.h / 2, this.o.w, this.o.h),
        Phaser.Geom.Rectangle.Contains
      );
    } else {
      this.setAlpha(0.45);
      this.disableInteractive();
    }
  }

  setColor(c: number): void {
    this.o.color = c;
    this.build();
  }

  pulse(): void {
    this.settleEntrance();
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, scale: 1.06, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}

export function button(scene: Phaser.Scene, opts: ButtonOptions): Btn {
  return new Btn(scene, opts);
}

/** Small circular icon button (HUD corners, palettes…). */
export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  icon: string,
  onClick: () => void,
  opts: { size?: number; color?: number; fontSize?: number; depth?: number } = {}
): Btn {
  const s = opts.size ?? 56;
  return button(scene, {
    x,
    y,
    w: s,
    h: s,
    icon,
    color: opts.color ?? 0xffffff,
    iconSize: opts.fontSize ?? s * 0.56,
    radius: s / 2,
    border: 3,
    onClick,
    depth: opts.depth ?? 100,
  });
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { color?: number; alpha?: number; radius?: number; shadow?: boolean; border?: number } = {}
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const r = opts.radius ?? 28;
  const col = opts.color ?? 0xffffff;
  const a = opts.alpha ?? 1;
  if (opts.shadow !== false) {
    g.fillStyle(0x1f2340, 0.22);
    g.fillRoundedRect(x - w / 2, y - h / 2 + 9, w, h, r);
  }
  g.fillStyle(col, a);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
  g.lineStyle(opts.border ?? 4, 0xffffff, 0.85);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
  return g;
}

/* ------------------------------------------------------------------ */
/* Pill (score / timer / counter)                                      */
/* ------------------------------------------------------------------ */

export class Pill extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly txt: Phaser.GameObjects.Text;
  private pw: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    str: string,
    opts: { color?: number; fontSize?: number; pad?: number; height?: number; minW?: number; depth?: number } = {}
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.bg = scene.add.graphics();
    this.txt = label(scene, 0, 0, str, { size: opts.fontSize ?? 26, color: '#ffffff' });
    this.pw = opts.minW ?? 120;
    this.currentColor = opts.color ?? 0x33364f;
    this.add([this.bg, this.txt]);
    this.draw(this.currentColor, opts.height ?? 50, opts.pad ?? 26);
    if (opts.depth !== undefined) this.setDepth(opts.depth);
  }

  private draw(color: number, height: number, pad: number): void {
    const width = Math.max(this.pw, this.txt.width + pad * 2);
    this.pw = width;
    this.bg.clear();
    this.bg.fillStyle(color, 0.86);
    this.bg.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    this.bg.lineStyle(3, 0xffffff, 0.7);
    this.bg.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    this.txt.setPosition(0, 1);
  }

  set(str: string, color?: number, height = 50, pad = 26): void {
    this.txt.setText(str);
    if (color !== undefined) this.currentColor = color;
    this.draw(this.currentColor ?? 0x33364f, height, pad);
  }

  private currentColor?: number;

  setColor(color: number): void {
    this.currentColor = color;
    this.draw(color, 50, 26);
  }
}

/* ------------------------------------------------------------------ */
/* Meter                                                               */
/* ------------------------------------------------------------------ */

export interface MeterOpts {
  x: number;
  y: number;
  w?: number;
  h?: number;
  value?: number;
  max?: number;
  color?: number;
  icon?: string;
  showValue?: boolean;
  depth?: number;
}

export class Meter extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly fillG: Phaser.GameObjects.Graphics;
  private readonly valueTxt?: Phaser.GameObjects.Text;
  private readonly mw: number;
  private readonly mh: number;
  private readonly maxV: number;
  private baseColor: number;

  constructor(scene: Phaser.Scene, opts: MeterOpts) {
    super(scene, opts.x, opts.y);
    scene.add.existing(this);
    this.mw = opts.w ?? 220;
    this.mh = opts.h ?? 30;
    this.maxV = opts.max ?? 100;
    this.baseColor = opts.color ?? 0x6bcb77;
    this.bg = scene.add.graphics();
    this.fillG = scene.add.graphics();
    this.add([this.bg, this.fillG]);

    this.bg.fillStyle(0x1f2340, 0.45);
    this.bg.fillRoundedRect(-this.mw / 2, -this.mh / 2, this.mw, this.mh, this.mh / 2);
    this.bg.lineStyle(3, 0xffffff, 0.85);
    this.bg.strokeRoundedRect(-this.mw / 2, -this.mh / 2, this.mw, this.mh, this.mh / 2);

    if (opts.icon) {
      const ic = emojiText(scene, -this.mw / 2 - 26, 0, opts.icon, Math.round(this.mh * 1.15));
      this.add(ic);
    }
    if (opts.showValue !== false) {
      this.valueTxt = label(scene, this.mw / 2 + 26, 1, '0', { size: 22, color: '#ffffff' });
      this.add(this.valueTxt);
    }
    if (opts.depth !== undefined) this.setDepth(opts.depth);
    this.setValue(opts.value ?? this.maxV, false);
  }

  setValue(v: number, animate = true): void {
    const pct = Phaser.Math.Clamp(v / this.maxV, 0, 1);
    const color = pct > 0.6 ? this.baseColor : pct > 0.3 ? 0xffa94d : 0xff6b6b;
    this.fillG.clear();
    this.fillG.fillStyle(color, 1);
    const fw = Math.max(0, (this.mw - 8) * pct);
    if (fw > 2) this.fillG.fillRoundedRect(-this.mw / 2 + 4, -this.mh / 2 + 4, fw, this.mh - 8, (this.mh - 8) / 2);
    this.valueTxt?.setText(String(Math.round(v)));
    if (animate) {
      this.scene.tweens.add({ targets: this, scale: 1.05, duration: 110, yoyo: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

const toastStack = new WeakMap<Phaser.Scene, number>();

export function toast(
  scene: Phaser.Scene,
  str: string,
  opts: { icon?: string; color?: number; duration?: number; y?: number; fontSize?: number } = {}
): void {
  try {
    const depth = (toastStack.get(scene) ?? 0) + 1;
    toastStack.set(scene, depth);
    const y = (opts.y ?? 120) + (depth - 1) * 62;
    const tmp = label(scene, 0, 0, `${opts.icon ? opts.icon + ' ' : ''}${str}`, {
      size: opts.fontSize ?? 30,
      color: '#ffffff',
    });
    const tw = tmp.width;
    tmp.destroy();
    const w = tw + 70;
    const c = scene.add.container(640, y - 60).setDepth(1200);
    const g = scene.add.graphics();
    g.fillStyle(opts.color ?? 0x33364f, 0.94);
    g.fillRoundedRect(-w / 2, -28, w, 56, 28);
    g.lineStyle(3, 0xffffff, 0.8);
    g.strokeRoundedRect(-w / 2, -28, w, 56, 28);
    const t = label(scene, 0, 1, `${opts.icon ? opts.icon + ' ' : ''}${str}`, {
      size: opts.fontSize ?? 30,
      color: '#ffffff',
    });
    c.add([g, t]);
    c.setScale(0.6);
    scene.tweens.add({
      targets: c,
      y,
      scale: 1,
      duration: 240,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.time.delayedCall(opts.duration ?? 1500, () => {
          scene.tweens.add({
            targets: c,
            alpha: 0,
            y: y - 30,
            duration: 260,
            onComplete: () => {
              c.destroy();
              const cur = toastStack.get(scene) ?? 1;
              toastStack.set(scene, Math.max(0, cur - 1));
            },
          });
        });
      },
    });
  } catch {
    /* optional */
  }
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

export interface HudOpts {
  onHome?: () => void;
  onPause?: () => void;
  score?: number;
  scoreIcon?: string;
  timer?: number;
  /**
   * true when `timer` counts UP (a stopwatch). Countdown timers turn red in
   * the last 5 seconds; a stopwatch must stay blue from its very first tick.
   */
  timerUp?: boolean;
  center?: string;
  depth?: number;
}

export interface Hud {
  setScore(v: number): void;
  addScore(v: number): void;
  setTimer(v: number): void;
  setCenter(str: string): void;
  destroy(): void;
}

export function addHud(scene: Phaser.Scene, opts: HudOpts): Hud {
  const depth = opts.depth ?? 500;
  const objs: Phaser.GameObjects.GameObject[] = [];
  let score = opts.score ?? 0;

  if (opts.onHome) {
    const b = iconButton(scene, 44, 44, '🏠', opts.onHome, { size: 58, color: 0xffffff, depth });
    objs.push(b);
  }
  if (opts.onPause) {
    const b = iconButton(scene, 116, 44, '⏸️', opts.onPause, { size: 58, color: 0xffffff, depth });
    objs.push(b);
  }

  const scorePill = new Pill(scene, 1190, 44, `${opts.scoreIcon ?? '⭐'} ${score}`, {
    color: 0xff8fab,
    minW: 170,
    depth,
  });
  objs.push(scorePill);

  let timerPill: Pill | null = null;
  if (opts.timer !== undefined) {
    timerPill = new Pill(scene, 995, 44, `⏱ ${Math.ceil(opts.timer)}`, { color: 0x4aa3ff, minW: 150, depth });
    objs.push(timerPill);
  }

  const centerTxt = opts.center
    ? label(scene, 640, 44, opts.center, { size: 30, stroke: '#33364f', strokeThickness: 6 }).setDepth(depth)
    : null;
  if (centerTxt) objs.push(centerTxt);

  return {
    setScore(v: number) {
      score = v;
      scorePill.set(`${opts.scoreIcon ?? '⭐'} ${Math.round(v)}`);
    },
    addScore(v: number) {
      score += v;
      scorePill.set(`${opts.scoreIcon ?? '⭐'} ${Math.round(score)}`);
      scorePill.setScale(1.14);
      scene.tweens.add({ targets: scorePill, scale: 1, duration: 220, ease: 'Back.easeOut' });
    },
    setTimer(v: number) {
      const low = !opts.timerUp && v <= 5;
      timerPill?.set(`⏱ ${Math.max(0, Math.ceil(v))}`, low ? 0xff6b6b : 0x4aa3ff);
    },
    setCenter(str: string) {
      centerTxt?.setText(str);
    },
    destroy() {
      objs.forEach((o) => o.destroy());
    },
  };
}

/* ------------------------------------------------------------------ */
/* Backgrounds                                                         */
/* ------------------------------------------------------------------ */

/** Cheerful sky + hills + clouds used by most scenes. */
export function drawSky(scene: Phaser.Scene, opts: { hills?: boolean; sun?: boolean } = {}): void {
  const g = scene.add.graphics().setDepth(-100);
  g.fillGradientStyle(0x4aa3ff, 0x4aa3ff, 0x9be2ff, 0x9be2ff, 1);
  g.fillRect(0, 0, 1280, 720);

  if (opts.sun !== false) {
    const sun = scene.add.circle(1120, 110, 62, 0xffd93d, 0.95).setDepth(-99);
    scene.tweens.add({ targets: sun, scale: 1.08, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const rays = scene.add.circle(1120, 110, 92, 0xffd93d, 0.22).setDepth(-99);
    scene.tweens.add({ targets: rays, scale: 1.16, alpha: 0.1, duration: 1600, yoyo: true, repeat: -1 });
  }

  if (opts.hills !== false) {
    const hill = scene.add.graphics().setDepth(-98);
    hill.fillStyle(0x8fe07a, 1);
    hill.fillEllipse(240, 760, 900, 420);
    hill.fillStyle(0x7ed957, 1);
    hill.fillEllipse(980, 790, 1100, 460);
    hill.fillStyle(0x5cc44a, 1);
    hill.fillRect(0, 640, 1280, 80);
  }

  // drifting clouds
  for (let i = 0; i < 4; i++) {
    const cx = 120 + i * 330;
    const cy = 70 + (i % 2) * 70;
    const cloud = scene.add.graphics().setDepth(-97);
    cloud.fillStyle(0xffffff, 0.9);
    cloud.fillEllipse(0, 0, 130, 56);
    cloud.fillEllipse(-42, 8, 84, 44);
    cloud.fillEllipse(40, 10, 92, 46);
    cloud.fillEllipse(6, -20, 78, 48);
    cloud.setPosition(cx, cy);
    scene.tweens.add({
      targets: cloud,
      x: cx + 90,
      duration: 7000 + i * 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
