import Phaser from 'phaser';
import { DESIGN_H, DESIGN_W } from './config';
import { audio } from './core/AudioManager';
import { progress } from './core/Progress';
import { AchievementsScene } from './scenes/AchievementsScene';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { ResultScene } from './scenes/ResultScene';
import { RewardsScene } from './scenes/RewardsScene';
import { SettingsScene } from './scenes/SettingsScene';
import { BuildMyWorldScene } from './games/BuildMyWorldScene';
import { BubblePopScene } from './games/BubblePopScene';
import { BunnyRunScene } from './games/BunnyRunScene';
import { ColorStudioScene } from './games/ColorStudioScene';
import { LittleChefScene } from './games/LittleChefScene';
import { MathAdventureScene } from './games/MathAdventureScene';
import { MatchPuzzleScene } from './games/MatchPuzzleScene';
import { MemoryMatchScene } from './games/MemoryMatchScene';
import { MiniRacingScene } from './games/MiniRacingScene';
import { PetCareScene } from './games/PetCareScene';
import { SkyFlyerScene } from './games/SkyFlyerScene';
import { LudoScene } from './games/ludo/LudoScene';
import { PauseScene } from './core/SceneBase';

// Automated smoke test mode (?test=1): keeps the drawing buffer readable and
// exposes the game instance so e2e/smoke.mjs can drive scenes directly.
const TEST_MODE = new URLSearchParams(window.location.search).has('test');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: DESIGN_W,
  height: DESIGN_H,
  // Transparent Phaser canvas: the 3D Ludo board renders on its own canvas
  // underneath, and every scene draws its own background (the page body
  // provides the same #4aa3ff fallback colour).
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    // NO_CENTER: #game-root is a flex container that already centres the
    // canvas. Phaser's CENTER_BOTH margins are *added* to the flex centring,
    // which pushed the whole game down-right on any non-16:9 viewport
    // (measured: +35px on 1280x860, +140px on 390x780).
    autoCenter: Phaser.Scale.NO_CENTER,
    width: DESIGN_W,
    height: DESIGN_H,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: TEST_MODE,
  },
  input: { activePointers: 3 },
  // Render order = this array's order (Phaser draws scenes in registration
  // order and never reorders them). Overlays MUST therefore come last or
  // they would be painted underneath the running game and stay invisible.
  scene: [
    BootScene,
    HomeScene,
    AchievementsScene,
    RewardsScene,
    ResultScene,
    MatchPuzzleScene,
    BubblePopScene,
    BunnyRunScene,
    MiniRacingScene,
    PetCareScene,
    LittleChefScene,
    ColorStudioScene,
    MemoryMatchScene,
    MathAdventureScene,
    BuildMyWorldScene,
    LudoScene,
    SkyFlyerScene,
    PauseScene,
    SettingsScene,
  ],
});

// The Ludo 3D stage appends its own canvas (z-index 1) behind the Phaser
// canvas, so the HUD always draws on top of the 3D board.
const stackCanvas = (): void => {
  if (!game.canvas) return;
  game.canvas.style.position = 'relative';
  game.canvas.style.zIndex = '2';
};
stackCanvas();
game.events.once('ready', stackCanvas);

/* ------------------------------------------------------------------ */
/* Small debug / test API (used by the automated smoke test).          */
/* ------------------------------------------------------------------ */

interface KidsApi {
  ready: boolean;
  current(): string;
  start(id: string): void;
  home(): void;
  save(): unknown;
  stars(): number;
}

const api: KidsApi = {
  ready: false,
  current() {
    const scenes = game.scene.getScenes(true);
    return scenes.length ? scenes[scenes.length - 1].scene.key : '';
  },
  start(id: string) {
    game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
    game.scene.start(id);
  },
  home() {
    game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
    game.scene.start('HomeScene');
  },
  save() {
    return JSON.parse(JSON.stringify(progress.data));
  },
  stars() {
    return progress.data.stars;
  },
};

(window as unknown as { __kids: KidsApi }).__kids = api;
// Debug/test handle: lets the automated interaction tests inspect live scene
// state after real mouse input. Harmless in production.
(window as unknown as { __game: Phaser.Game }).__game = game;

// Any first pointer/key event unlocks audio (browser autoplay policy).
const unlockOnce = (): void => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockOnce);
  window.removeEventListener('keydown', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);

// Hide the HTML boot fallback once Phaser has painted its first frame.
game.events.once('ready', () => {
  api.ready = true;
  const el = document.getElementById('boot-fallback');
  if (el) el.classList.add('hidden');
});

export default game;
