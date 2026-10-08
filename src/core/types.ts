export interface GameDef {
  id: string;
  title: string;
  icon: string;
  color: number;
  accent: number;
  tag: string;
}

export interface Settings {
  sound: boolean;
  music: boolean;
}

export interface DailyState {
  date: string;
  id: string;
  progress: number;
  claimed: boolean;
}

export interface SaveData {
  version: number;
  stars: number;
  coins: number;
  highScores: Record<string, number>;
  bestStars: Record<string, number>;
  plays: Record<string, number>;
  achievements: Record<string, number>;
  stats: Record<string, number>;
  settings: Settings;
  daily: DailyState;
  art: Record<string, number[]>;
  world: string[];
  totalScore: number;
}

export interface ScoreResult {
  isBest: boolean;
  best: number;
  rewardStars: number;
  rewardCoins: number;
  unlocked: string[];
  dailyDone: boolean;
}

export interface ResultPayload {
  gameId: string;
  title: string;
  icon: string;
  color: number;
  score: number;
  stars: number;
  win: boolean;
  subtitle?: string;
  lines?: { icon: string; label: string; value: string }[];
  result?: ScoreResult;
}
