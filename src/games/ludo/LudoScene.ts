import Phaser from 'phaser';
import { audio } from '../../core/AudioManager';
import { confetti, burst, sparkles } from '../../core/FX';
import { LUDO_DEV_MODE, consumeTestDice, fetchTestDice } from '../../core/LudoDev';
import { progress } from '../../core/Progress';
import { SceneBase } from '../../core/SceneBase';
import { button, label, panel, Pill, toast, type Btn } from '../../core/UI';
import { ThreeStage } from '../../three/stage';
import { chooseMove } from './LudoAI';
import { LudoBoard3D } from './LudoBoard3D';
import {
  FINISH,
  PLAYER_COLOR,
  PLAYER_HEX,
  PLAYER_NAMES,
  applyMove,
  currentPlayer,
  createState,
  finishedCount,
  legalMoves,
  nextTurn,
  rollRandom,
  type LudoState,
  type Move,
  type Phase,
} from './LudoRules';

export interface LudoSnapshot {
  phase: Phase;
  dice: number | null;
  diceShown: number;
  players: number[];
  isAI: boolean[];
  current: number;
  currentPlayer: number;
  tokens: number[][];
  legal: Move[];
  winner: number | null;
  turn: number;
  captures: number[];
  sixes: number[];
}

export interface LudoSceneApi {
  snapshot(): LudoSnapshot;
  tokenScreen(player: number, token: number): { x: number; y: number } | null;
  diceScreen(): { x: number; y: number } | null;
  samplePixel(x: number, y: number): [number, number, number, number] | null;
}

const HOP_MS = 170;

/**
 * Ludo: full rules, 2-4 players (human or computer), rendered as a real
 * Three.js 3D board underneath the shared Phaser HUD.
 */
export class LudoScene extends SceneBase implements LudoSceneApi {
  private stage: ThreeStage | null = null;
  private board: LudoBoard3D | null = null;
  private st: LudoState | null = null;

  private turnPill!: Pill;
  private statusText!: Phaser.GameObjects.Text;
  private rollBtn!: Btn;
  private devPill: Pill | null = null;
  private setupObjs: Phaser.GameObjects.GameObject[] = [];
  private chipBtns: Btn[] = [];
  private countBtns: Btn[] = [];
  private playerCount = 4;
  private isAIcfg = [false, true, true, true];
  private disposed = false;

  private readonly onPauseFn = (): void => this.stage?.stop();
  private readonly onResumeFn = (): void => this.stage?.start();
  private readonly onShutdownFn = (): void => this.teardown();
  private readonly onPointerFn = (p: Phaser.Input.Pointer): void => this.handlePointer(p);

  constructor() {
    super('Ludo');
  }

  create(): void {
    this.disposed = false;
    this.st = null;
    this.setupObjs = [];
    this.chipBtns = [];
    this.countBtns = [];
    this.devPill = null;

    /* -------- 3D stage (may fail on devices without WebGL) -------- */
    try {
      const parent = document.getElementById('game-root');
      if (!parent) throw new Error('game root missing');
      this.stage = new ThreeStage({
        parent,
        host: this.game.canvas,
        designW: 1280,
        designH: 720,
        onContextLost: () => this.showWebGLError('WebGL context lost'),
      });
      this.board = new LudoBoard3D(this.stage);
      this.stage.start();
    } catch (err) {
      this.stage = null;
      this.board = null;
      this.showWebGLError(err instanceof Error ? err.message : String(err));
      return;
    }

    /* -------- HUD -------- */
    this.showHud({ score: 0, scoreIcon: '🏆' });

    this.turnPill = new Pill(this, 640, 44, 'CHOOSE PLAYERS', {
      color: 0x33364f,
      minW: 340,
      depth: 520,
    });

    this.statusText = label(this, 640, 596, '', {
      size: 28,
      color: '#ffffff',
      stroke: '#1f2340',
      strokeThickness: 7,
      depth: 520,
    });

    this.rollBtn = button(this, {
      x: 640,
      y: 664,
      w: 380,
      h: 84,
      label: 'ROLL DICE',
      icon: '🎲',
      color: 0xffa94d,
      fontSize: 34,
      iconSize: 40,
      depth: 530,
      onClick: () => void this.requestRoll(),
    });
    this.rollBtn.setEnabled(false);

    if (LUDO_DEV_MODE) {
      label(this, 300, 44, 'DEV TEST MODE', {
        size: 20,
        color: '#7a4a00',
        stroke: '#ffd93d',
        strokeThickness: 6,
        depth: 525,
      });
      this.devPill = new Pill(this, 320, 96, 'Next Test Dice: --', {
        color: 0x1f2340,
        minW: 320,
        depth: 525,
      });
      void fetchTestDice().then((n) => {
        if (!this.disposed) this.devPill?.set(`Next Test Dice: ${n ?? '--'}`);
      });
    }

    /* -------- input + lifecycle -------- */
    this.input.on('pointerdown', this.onPointerFn);
    this.events.on('pause', this.onPauseFn);
    this.events.on('resume', this.onResumeFn);
    this.events.on('shutdown', this.onShutdownFn);

    (window as unknown as { __ludo?: LudoScene }).__ludo = this;

    this.showSetup();
  }

  /* ================================================================ */
  /* setup overlay                                                     */
  /* ================================================================ */

  private activePlayers(): number[] {
    if (this.playerCount === 2) return [0, 2];
    if (this.playerCount === 3) return [0, 1, 2];
    return [0, 1, 2, 3];
  }

  private clearSetup(): void {
    this.setupObjs.forEach((o) => o.destroy());
    this.chipBtns = [];
    this.countBtns = [];
    this.setupObjs = [];
  }

  private showSetup(): void {
    this.clearSetup();
    this.st = createState(this.activePlayers(), this.isAIcfg, 'setup');
    this.board?.sync(this.st);
    this.board?.setSelectable(null);
    this.turnPill.set('NEW GAME', 0x33364f);
    // The setup panel (depth 600) covers the shared status line, so the hint
    // lives inside the panel instead of behind it.
    this.setStatus('');
    this.rollBtn.setEnabled(false);

    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.setupObjs.push(o);
      return o;
    };

    const p = add(panel(this, 640, 370, 780, 520, { color: 0xffffff, alpha: 0.97 }));
    p.setDepth(600);
    const title = label(this, 640, 158, '🎲 LUDO', { size: 58, color: '#33364f', depth: 610 });
    add(title);
    const sub = label(this, 640, 212, '2-4 players · humans vs computer', {
      size: 24,
      color: '#6b7280',
      depth: 610,
    });
    add(sub);
    const hint = label(this, 640, 478, 'Pick how many players, then tap START!', {
      size: 24,
      color: '#6b7280',
      depth: 610,
    });
    add(hint);

    (['2 PLAYERS', '3 PLAYERS', '4 PLAYERS'] as const).forEach((txt, i) => {
      const count = i + 2;
      const b = button(this, {
        x: 430 + i * 210,
        y: 272,
        w: 186,
        h: 72,
        label: txt,
        color: count === this.playerCount ? 0x6bcb77 : 0x9aa0ae,
        fontSize: 26,
        depth: 610,
        onClick: () => {
          audio.play('click');
          this.playerCount = count;
          this.showSetup();
        },
      });
      this.countBtns.push(b);
      add(b);
    });

    const active = new Set(this.activePlayers());
    PLAYER_NAMES.forEach((name, i) => {
      const inGame = active.has(i);
      const b = button(this, {
        x: 355 + i * 190,
        y: 392,
        w: 164,
        h: 104,
        label: `${name}\n${inGame ? (this.isAIcfg[i] ? '🤖 AI' : '🙂 YOU') : '—'}`,
        color: inGame ? PLAYER_COLOR[i] : 0xd8dbe6,
        textColor: inGame ? '#33364f' : '#9aa0ae',
        fontSize: 22,
        layout: 'stack',
        radius: 24,
        depth: 610,
        enabled: inGame,
        onClick: () => {
          if (!inGame) return;
          audio.play('click');
          this.isAIcfg[i] = !this.isAIcfg[i];
          this.showSetup();
        },
      });
      this.chipBtns.push(b);
      add(b);
    });

    const start = button(this, {
      x: 640,
      y: 556,
      w: 340,
      h: 88,
      label: 'START GAME',
      icon: '▶️',
      color: 0x6bcb77,
      fontSize: 32,
      depth: 610,
      onClick: () => this.startMatch(),
    });
    add(start);
    start.pulse();
  }

  private startMatch(): void {
    audio.play('click');
    const players = this.activePlayers();
    this.clearSetup();
    this.st = createState(players, this.isAIcfg, 'roll');
    this.board?.sync(this.st);
    this.hud?.setScore(0);
    this.beginTurn();
  }

  /* ================================================================ */
  /* turn flow                                                         */
  /* ================================================================ */

  private setStatus(text: string): void {
    this.statusText.setText(text);
  }

  private primaryPlayer(): number {
    const s = this.st!;
    const human = s.players.find((p) => !s.isAI[p]);
    return human ?? s.players[0];
  }

  private liveScore(player: number): number {
    const s = this.st!;
    return finishedCount(s, player) * 150 + s.captures[player] * 60;
  }

  private updateTurnUI(): void {
    const s = this.st!;
    const p = currentPlayer(s);
    const ai = s.isAI[p];
    this.turnPill.set(`${ai ? '🤖' : '🙂'} ${PLAYER_NAMES[p]}'S TURN`, PLAYER_COLOR[p]);
    this.hud?.setScore(this.liveScore(this.primaryPlayer()));
  }

  private beginTurn(): void {
    const s = this.st;
    if (!s || !this.stage || s.phase === 'over') return;
    s.phase = 'roll';
    s.dice = null;
    this.board?.setSelectable(null);
    this.updateTurnUI();
    const p = currentPlayer(s);
    if (s.isAI[p]) {
      this.rollBtn.setEnabled(false);
      this.setStatus(`${PLAYER_NAMES[p]} is getting ready...`);
      this.stage.delay(750, () => void this.doRoll());
    } else {
      this.rollBtn.setEnabled(true);
      this.setStatus('Your turn! Tap ROLL DICE 🎲');
    }
  }

  private async requestRoll(): Promise<void> {
    const s = this.st;
    if (!s || s.phase !== 'roll' || s.isAI[currentPlayer(s)]) return;
    await this.doRoll();
  }

  private async doRoll(): Promise<void> {
    const s = this.st;
    if (!s || !this.stage || !this.board || s.phase !== 'roll') return;
    s.phase = 'rolling';
    this.rollBtn.setEnabled(false);
    this.setStatus('Rolling the dice...');

    let value = 0;
    if (LUDO_DEV_MODE) {
      const forced = await consumeTestDice();
      if (this.disposed || !this.scene.isActive()) return;
      if (this.devPill) {
        const next = await fetchTestDice();
        if (this.disposed) return;
        this.devPill.set(`Next Test Dice: ${next ?? '--'}`);
      }
      if (forced !== null) value = forced;
    }
    if (!value) value = rollRandom();

    s.rolls += 1;
    if (value === 6) s.sixes[currentPlayer(s)] += 1;
    audio.play('dice');
    this.board.rollDice(value, () => {
      if (this.disposed || !this.scene.isActive()) return;
      this.onDiceSettled(value);
    });
  }

  private onDiceSettled(value: number): void {
    const s = this.st;
    if (!s || !this.stage || !this.board) return;
    s.dice = value;
    s.phase = 'choose';
    const p = currentPlayer(s);
    this.setStatus(`${PLAYER_NAMES[p]} rolled ${value}!`);
    this.updateTurnUI();

    const moves = legalMoves(s);
    if (moves.length === 0) {
      s.phase = 'moving';
      this.setStatus(`No move for ${PLAYER_NAMES[p]} — turn passes`);
      audio.play('whoosh');
      this.stage.delay(950, () => {
        if (this.disposed || !this.scene.isActive()) return;
        nextTurn(s);
        this.beginTurn();
      });
      return;
    }

    this.board.setSelectable(moves);
    if (s.isAI[p]) {
      this.setStatus(`${PLAYER_NAMES[p]} is choosing a token...`);
      this.stage.delay(700, () => {
        if (this.disposed || !this.scene.isActive()) return;
        const mv = chooseMove(legalMoves(s), s);
        this.executeMove(mv);
      });
    } else {
      this.setStatus(moves.length === 1 ? 'Tap the glowing token!' : 'Tap a glowing token!');
    }
  }

  private executeMove(m: Move): void {
    const s = this.st;
    if (!s || !this.stage || !this.board || s.phase !== 'choose') return;
    s.phase = 'moving';
    this.board.setSelectable(null);
    this.setStatus('Moving...');

    const waypoints = this.board.waypointsFor(m.player, m.token, m.from, m.to);
    const yFrom = m.from === -1 ? 0.075 : 0.16;
    const yTo = 0.16;
    if (m.from === -1) audio.play('flip');
    this.board.animateToken(
      m.player,
      m.token,
      waypoints,
      yFrom,
      yTo,
      HOP_MS,
      () => audio.play('tick'),
      () => {
        if (this.disposed || !this.scene.isActive()) return;
        this.afterLanded(m);
      }
    );
  }

  private afterLanded(m: Move): void {
    const s = this.st;
    if (!s || !this.stage || !this.board) return;

    const outcome = applyMove(s, m);
    // snap everything except tokens that still need an animation
    for (let p = 0; p < 4; p++) {
      for (let t = 0; t < 4; t++) {
        const isCaptured = outcome.captured.some((c) => c.player === p && c.token === t);
        if (isCaptured) continue;
        this.snapToken(p, t);
      }
    }

    if (outcome.captured.length > 0) {
      audio.play('capture');
      for (const c of outcome.captured) {
        const spot = this.board.tokenScreen(c.player, c.token);
        if (spot) burst(this, spot.x, spot.y, PLAYER_COLOR[c.player], 18);
        this.board.flyHome(c.player, c.token);
      }
      const names = [...new Set(outcome.captured.map((c) => PLAYER_NAMES[c.player]))].join(' & ');
      toast(this, `⚔️ ${PLAYER_NAMES[m.player]} captured ${names}!`, {
        color: 0xc92a2a,
        duration: 1600,
      });
    }

    if (outcome.finished) {
      audio.play('star');
      const spot = this.board.tokenScreen(m.player, m.token);
      if (spot) sparkles(this, spot.x, spot.y, PLAYER_COLOR[m.player], 14);
      this.board.celebrate(m.player, m.token);
      toast(this, `🏁 ${PLAYER_NAMES[m.player]} got one home!`, {
        color: 0x2f9e44,
        duration: 1500,
      });
    }

    this.hud?.setScore(this.liveScore(this.primaryPlayer()));

    if (outcome.won) {
      this.handleWin(m.player);
      return;
    }

    const extra = s.dice === 6 || outcome.captured.length > 0 || outcome.finished;
    this.stage.delay(extra ? 780 : 900, () => {
      if (this.disposed || !this.scene.isActive() || !this.st) return;
      if (extra) {
        this.setStatus(`${PLAYER_NAMES[currentPlayer(s)]} rolls again! 🎲`);
        this.beginTurn();
      } else {
        nextTurn(s);
        this.beginTurn();
      }
    });
  }

  private snapToken(p: number, t: number): void {
    const s = this.st;
    if (!s || !this.board) return;
    this.board.snapToken(p, t, s.tokens[p][t]);
  }

  private handleWin(player: number): void {
    const s = this.st;
    if (!s || !this.stage || !this.board) return;
    s.phase = 'over';
    this.rollBtn.setEnabled(false);
    this.board.setSelectable(null);
    this.turnPill.set(`🏆 ${PLAYER_NAMES[player]} WINS!`, PLAYER_COLOR[player]);
    this.setStatus(`${PLAYER_NAMES[player]} brings all four tokens home!`);

    confetti(this, 2600);
    audio.play('reward');
    for (let t = 0; t < 4; t++) this.board.celebrate(player, t);
    toast(this, `🏆 ${PLAYER_NAMES[player]} wins the game!`, {
      color: PLAYER_COLOR[player],
      duration: 2400,
      fontSize: 34,
    });

    // progress / achievements
    const primary = this.primaryPlayer();
    // Any human seat that wins counts - not only the first human seat.
    const humanWin = !s.isAI[player];
    const humanCaptures = s.players
      .filter((p) => !s.isAI[p])
      .reduce((sum, p) => sum + s.captures[p], 0);
    const humanSixes = s.players.filter((p) => !s.isAI[p]).reduce((sum, p) => sum + s.sixes[p], 0);
    if (humanCaptures > 0) progress.track('ludo_captures', humanCaptures);
    if (humanSixes > 0) progress.track('ludo_sixes', humanSixes);
    if (humanWin) {
      progress.track('ludo_wins', 1);
      progress.track('ludo_all_home', 1);
    }

    const home = finishedCount(s, primary);
    const win = s.winner === primary;
    const score = home * 150 + s.captures[primary] * 60 + (win ? 500 : 0);
    const stars = win ? 3 : home >= 3 ? 2 : home >= 1 ? 1 : 0;

    this.stage.delay(2100, () => {
      if (this.disposed || !this.scene.isActive()) return;
      this.finish({
        score,
        stars,
        win,
        subtitle: win
          ? `${PLAYER_NAMES[primary]} got all 4 tokens home!`
          : `${home} of 4 tokens made it home`,
        lines: [
          { icon: '🏁', label: 'Home', value: `${home}/4` },
          { icon: '⚔️', label: 'Captures', value: String(s.captures[primary]) },
          { icon: '🎲', label: 'Rolls', value: String(s.rolls) },
        ],
      });
    });
  }

  /* ================================================================ */
  /* pointer handling (3D raycasting)                                  */
  /* ================================================================ */

  private handlePointer(p: Phaser.Input.Pointer): void {
    const s = this.st;
    if (!s || !this.stage || !this.board || s.phase === 'setup') return;
    const dx = p.x;
    const dy = p.y;
    if (dx < 0 || dx > 1280 || dy < 0 || dy > 720) return;

    const hit = this.stage.pick(dx, dy, [this.board.root]);
    if (!hit || !hit.userData) return;

    if (hit.userData.pick === 'dice') {
      if (s.phase === 'roll' && !s.isAI[currentPlayer(s)]) void this.doRoll();
      return;
    }
    if (hit.userData.pick === 'token') {
      const player = hit.userData.player as number;
      const token = hit.userData.token as number;
      if (s.phase !== 'choose') return;
      const mv = legalMoves(s).find((m) => m.player === player && m.token === token);
      if (!mv) {
        toast(this, 'That token cannot move right now', { color: 0x33364f, duration: 1100 });
        return;
      }
      audio.play('click');
      this.executeMove(mv);
    }
  }

  /* ================================================================ */
  /* error handling                                                    */
  /* ================================================================ */

  private showWebGLError(reason: string): void {
    this.teardownStageOnly();
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x4aa3ff, 0x4aa3ff, 0x9be2ff, 0x9be2ff, 1);
    g.fillRect(0, 0, 1280, 720);

    panel(this, 640, 340, 760, 360, { color: 0xffffff });
    label(this, 640, 240, '😢', { size: 84, depth: 10 });
    label(this, 640, 322, '3D graphics are unavailable on this device/browser.', {
      size: 30,
      color: '#33364f',
      wrap: 660,
      depth: 10,
    });
    label(this, 640, 372, reason.slice(0, 80), { size: 18, color: '#9aa0ae', depth: 10 });
    button(this, {
      x: 640,
      y: 462,
      w: 320,
      h: 84,
      label: 'RETURN HOME',
      icon: '🏠',
      color: 0x4aa3ff,
      fontSize: 30,
      depth: 10,
      onClick: () => this.goHome(),
    });
  }

  private teardownStageOnly(): void {
    try {
      this.stage?.dispose();
    } catch {
      /* ignore */
    }
    this.stage = null;
    this.board = null;
  }

  private teardown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.input.off('pointerdown', this.onPointerFn);
    this.events.off('pause', this.onPauseFn);
    this.events.off('resume', this.onResumeFn);
    this.events.off('shutdown', this.onShutdownFn);
    this.teardownStageOnly();
    if ((window as unknown as { __ludo?: LudoScene }).__ludo === this) {
      delete (window as unknown as { __ludo?: LudoScene }).__ludo;
    }
  }

  /* ================================================================ */
  /* test / debug API (drives real E2E verification)                   */
  /* ================================================================ */

  snapshot(): LudoSnapshot {
    const s = this.st;
    if (!s) {
      return {
        phase: 'setup',
        dice: null,
        diceShown: 0,
        players: [],
        isAI: [],
        current: 0,
        currentPlayer: -1,
        tokens: [],
        legal: [],
        winner: null,
        turn: 0,
        captures: [],
        sixes: [],
      };
    }
    return {
      phase: s.phase,
      dice: s.dice,
      diceShown: this.board?.diceShown() ?? 0,
      players: [...s.players],
      isAI: [...s.isAI],
      current: s.current,
      currentPlayer: currentPlayer(s),
      tokens: s.tokens.map((t) => [...t]),
      legal: legalMoves(s),
      winner: s.winner,
      turn: s.turn,
      captures: [...s.captures],
      sixes: [...s.sixes],
    };
  }

  tokenScreen(player: number, token: number): { x: number; y: number } | null {
    return this.board?.tokenScreen(player, token) ?? null;
  }

  diceScreen(): { x: number; y: number } | null {
    return this.board?.diceScreen() ?? null;
  }

  samplePixel(x: number, y: number): [number, number, number, number] | null {
    try {
      return this.stage?.readPixel(x, y) ?? null;
    } catch {
      return null;
    }
  }

  /** Colour of a player, handy for UI/tests. */
  playerHex(player: number): string {
    return PLAYER_HEX[player];
  }

  /** True when the scene owns a live 3D stage. */
  has3D(): boolean {
    return this.stage !== null;
  }

  /** Exposed so tests can assert the winner flow uses FINISH positions. */
  finishPosition(): number {
    return FINISH;
  }
}
