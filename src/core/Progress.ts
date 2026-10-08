import { loadSave, writeSave, TODAY } from './SaveManager';
import type { SaveData, ScoreResult } from './types';

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  check: (s: SaveData) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_game', icon: '🎮', title: 'First Game', desc: 'Play your first game', check: (s) => total(s.plays) >= 1 },
  { id: 'puzzle_master', icon: '🧩', title: 'Puzzle Master', desc: 'Finish 3 puzzle levels', check: (s) => (s.stats.puzzle_levels ?? 0) >= 3 },
  { id: 'bubble_popper', icon: '🫧', title: 'Bubble Popper', desc: 'Pop 100 bubbles', check: (s) => (s.stats.bubbles_popped ?? 0) >= 100 },
  { id: 'speed_runner', icon: '🏃', title: 'Speed Runner', desc: 'Run 500 metres', check: (s) => (s.stats.distance ?? 0) >= 500 },
  { id: 'memory_master', icon: '🃏', title: 'Memory Master', desc: 'Win a memory game', check: (s) => (s.stats.memory_wins ?? 0) >= 1 },
  { id: 'little_chef', icon: '👨‍🍳', title: 'Little Chef', desc: 'Serve 3 dishes', check: (s) => (s.stats.dishes_served ?? 0) >= 3 },
  { id: 'creative_artist', icon: '🎨', title: 'Creative Artist', desc: 'Finish a whole picture', check: (s) => (s.stats.pictures_done ?? 0) >= 1 },
  { id: 'math_star', icon: '⭐', title: 'Math Star', desc: 'Answer 10 questions right', check: (s) => (s.stats.math_correct ?? 0) >= 10 },
  { id: 'world_builder', icon: '🏗️', title: 'World Builder', desc: 'Place 15 things in your world', check: (s) => (s.stats.world_items ?? 0) >= 15 },
  { id: 'ludo_first_win', icon: '🎲', title: 'First Ludo Win', desc: 'Win your first game of Ludo', check: (s) => (s.stats.ludo_wins ?? 0) >= 1 },
  { id: 'ludo_five_wins', icon: '🏆', title: 'Ludo Champion', desc: 'Win 5 games of Ludo', check: (s) => (s.stats.ludo_wins ?? 0) >= 5 },
  { id: 'ludo_ten_wins', icon: '👑', title: 'Ludo Legend', desc: 'Win 10 games of Ludo', check: (s) => (s.stats.ludo_wins ?? 0) >= 10 },
  { id: 'ludo_ten_captures', icon: '⚔️', title: 'Token Catcher', desc: 'Capture 10 enemy tokens in Ludo', check: (s) => (s.stats.ludo_captures ?? 0) >= 10 },
  { id: 'ludo_sixes', icon: '⚅', title: 'Lucky Six', desc: 'Roll a six in Ludo', check: (s) => (s.stats.ludo_sixes ?? 0) >= 1 },
  { id: 'ludo_all_home', icon: '🏁', title: 'All Home', desc: 'Get all 4 tokens home in Ludo', check: (s) => (s.stats.ludo_all_home ?? 0) >= 1 },
  { id: 'sky_flyer', icon: '🐤', title: 'Sky Flyer', desc: 'Fly through 10 gates', check: (s) => (s.stats.gates_flown ?? 0) >= 10 },
  { id: 'sky_legend', icon: '🏆', title: 'Cloud Champion', desc: 'Fly through 30 gates', check: (s) => (s.stats.gates_flown ?? 0) >= 30 },
];

export interface DailyDef {
  id: string;
  icon: string;
  text: string;
  metric: string;
  target: number;
  reward: number;
  mode: 'add' | 'max';
}

export const DAILY_POOL: DailyDef[] = [
  { id: 'score100', icon: '🎯', text: 'Score 100 points', metric: 'any_score', target: 100, reward: 50, mode: 'max' },
  { id: 'pop30', icon: '🫧', text: 'Pop 30 bubbles', metric: 'bubbles_popped', target: 30, reward: 50, mode: 'add' },
  { id: 'collect20', icon: '⭐', text: 'Collect 20 stars in games', metric: 'stars_collected', target: 20, reward: 50, mode: 'add' },
  { id: 'math5', icon: '🔢', text: 'Answer 5 questions right', metric: 'math_correct', target: 5, reward: 50, mode: 'add' },
  { id: 'memory1', icon: '🃏', text: 'Finish a memory game', metric: 'memory_wins', target: 1, reward: 50, mode: 'add' },
  { id: 'match1', icon: '🧩', text: 'Complete a puzzle level', metric: 'puzzle_levels', target: 1, reward: 50, mode: 'add' },
  { id: 'chef1', icon: '🍕', text: 'Serve one dish', metric: 'dishes_served', target: 1, reward: 50, mode: 'add' },
  { id: 'color1', icon: '🎨', text: 'Finish a picture', metric: 'pictures_done', target: 1, reward: 50, mode: 'add' },
  { id: 'care1', icon: '🐶', text: 'Make a pet super happy', metric: 'pet_wins', target: 1, reward: 50, mode: 'add' },
  { id: 'build1', icon: '🏗️', text: 'Place 10 things in your world', metric: 'world_items', target: 10, reward: 50, mode: 'add' },
  { id: 'race1', icon: '🚗', text: 'Finish a car race', metric: 'races_won', target: 1, reward: 50, mode: 'add' },
  { id: 'run300', icon: '🐰', text: 'Run 300 metres', metric: 'distance', target: 300, reward: 50, mode: 'add' },
  { id: 'ludo1', icon: '🎲', text: 'Win a game of Ludo', metric: 'ludo_wins', target: 1, reward: 50, mode: 'add' },
  { id: 'ludo_cap2', icon: '⚔️', text: 'Capture 2 tokens in Ludo', metric: 'ludo_captures', target: 2, reward: 50, mode: 'add' },
  { id: 'flap10', icon: '🐤', text: 'Fly through 10 gates', metric: 'gates_flown', target: 10, reward: 50, mode: 'add' },
];

function total(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

type ProgressEvent =
  | { type: 'stars'; amount: number }
  | { type: 'coins'; amount: number }
  | { type: 'achievement'; id: string }
  | { type: 'daily' };

class ProgressService {
  data: SaveData;
  /** Achievements unlocked since the last consumeUnlocked() call. */
  private pendingUnlocks: string[] = [];
  private dailyJustDone = false;
  private listeners: ((e: ProgressEvent) => void)[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = loadSave();
    this.rollDaily();
  }

  /* ---------------- events ---------------- */

  on(fn: (e: ProgressEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: ProgressEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch {
        /* listener errors must never break the game */
      }
    }
  }

  /* ---------------- persistence ---------------- */

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 400);
  }

  flush(): void {
    writeSave(this.data);
  }

  /* ---------------- economy ---------------- */

  addStars(n: number, silent = false): void {
    if (n === 0) return;
    this.data.stars = Math.max(0, this.data.stars + n);
    this.scheduleSave();
    if (!silent) this.emit({ type: 'stars', amount: n });
  }

  addCoins(n: number): void {
    if (n === 0) return;
    this.data.coins = Math.max(0, this.data.coins + n);
    this.scheduleSave();
    this.emit({ type: 'coins', amount: n });
  }

  spendStars(n: number): boolean {
    if (this.data.stars < n) return false;
    this.data.stars -= n;
    this.scheduleSave();
    return true;
  }

  /* ---------------- stats / achievements / daily ---------------- */

  track(metric: string, amount: number, mode: 'add' | 'max' = 'add'): void {
    const cur = this.data.stats[metric] ?? 0;
    this.data.stats[metric] = mode === 'max' ? Math.max(cur, amount) : cur + amount;

    const daily = this.currentDaily();
    if (daily && daily.metric === metric && !this.data.daily.claimed) {
      const curP = this.data.daily.progress;
      const next = mode === 'max' ? Math.max(curP, amount) : curP + amount;
      this.data.daily.progress = Math.min(daily.target, next);
      if (this.data.daily.progress >= daily.target) {
        this.data.daily.claimed = true;
        this.dailyJustDone = true;
        this.addStars(daily.reward, true);
      }
      this.emit({ type: 'daily' });
    }
    this.checkAchievements();
    this.scheduleSave();
  }

  checkAchievements(): string[] {
    const got: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements[a.id]) continue;
      let ok = false;
      try {
        ok = a.check(this.data);
      } catch {
        ok = false;
      }
      if (ok) {
        this.data.achievements[a.id] = Date.now();
        this.pendingUnlocks.push(a.id);
        got.push(a.id);
        this.emit({ type: 'achievement', id: a.id });
      }
    }
    if (got.length) this.scheduleSave();
    return got;
  }

  consumeUnlocks(): string[] {
    const list = [...new Set(this.pendingUnlocks)];
    this.pendingUnlocks = [];
    return list;
  }

  consumeDailyDone(): boolean {
    const v = this.dailyJustDone;
    this.dailyJustDone = false;
    return v;
  }

  /* ---------------- daily challenge ---------------- */

  currentDaily(): DailyDef | null {
    return DAILY_POOL.find((d) => d.id === this.data.daily.id) ?? null;
  }

  private rollDaily(): void {
    const today = TODAY();
    if (this.data.daily.date === today && this.data.daily.id) return;
    const def = DAILY_POOL[hashStr(today) % DAILY_POOL.length];
    this.data.daily = { date: today, id: def.id, progress: 0, claimed: false };
    this.scheduleSave();
  }

  dailyProgressRatio(): number {
    const def = this.currentDaily();
    if (!def) return 0;
    return Math.min(1, this.data.daily.progress / def.target);
  }

  /* ---------------- scoring ---------------- */

  recordScore(gameId: string, score: number, stars: number, win: boolean): ScoreResult {
    const d = this.data;
    const prevBest = d.highScores[gameId] ?? 0;
    const isBest = score > prevBest;
    if (isBest) d.highScores[gameId] = score;
    d.bestStars[gameId] = Math.max(d.bestStars[gameId] ?? 0, stars);
    d.plays[gameId] = (d.plays[gameId] ?? 0) + 1;
    d.totalScore += score;

    const rewardStars = win ? 20 + stars * 10 : Math.max(3, Math.min(10, Math.round(score / 100)));
    const rewardCoins = Math.max(1, Math.floor(score / 50)) + (win ? 5 : 0);

    this.addStars(rewardStars, true);
    this.addCoins(rewardCoins);
    this.track('any_score', score, 'max');
    this.track('total_plays', 1);
    this.checkAchievements();
    this.flush();

    return {
      isBest,
      best: d.highScores[gameId] ?? score,
      rewardStars,
      rewardCoins,
      unlocked: this.consumeUnlocks(),
      dailyDone: this.consumeDailyDone(),
    };
  }

  reset(): void {
    const settings = { ...this.data.settings };
    this.data = loadSaveFresh(settings);
    this.rollDaily();
    this.flush();
  }
}

function loadSaveFresh(settings: { sound: boolean; music: boolean }): SaveData {
  const fresh: SaveData = {
    version: 2,
    stars: 0,
    coins: 0,
    highScores: {},
    bestStars: {},
    plays: {},
    achievements: {},
    stats: {},
    settings,
    daily: { date: TODAY(), id: '', progress: 0, claimed: false },
    art: {},
    world: [],
    totalScore: 0,
  };
  return fresh;
}

export const progress = new ProgressService();
