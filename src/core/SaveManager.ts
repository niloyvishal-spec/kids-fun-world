import type { SaveData } from './types';

const KEY = 'kids_fun_world_save_v2';

export const TODAY = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

function defaults(): SaveData {
  return {
    version: 2,
    stars: 0,
    coins: 0,
    highScores: {},
    bestStars: {},
    plays: {},
    achievements: {},
    stats: {},
    settings: { sound: true, music: true },
    daily: { date: TODAY(), id: '', progress: 0, claimed: false },
    art: {},
    world: [],
    totalScore: 0,
  };
}

let memory: SaveData | null = null;
let persistent = true;

function readStorage(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return mergeDefaults(parsed);
  } catch {
    persistent = false;
    return memory;
  }
}

function mergeDefaults(parsed: Partial<SaveData>): SaveData {
  const base = defaults();
  const out: SaveData = { ...base, ...parsed };
  out.settings = { ...base.settings, ...(parsed.settings ?? {}) };
  out.daily = { ...base.daily, ...(parsed.daily ?? {}) };
  out.highScores = parsed.highScores ?? {};
  out.bestStars = parsed.bestStars ?? {};
  out.plays = parsed.plays ?? {};
  out.achievements = parsed.achievements ?? {};
  out.stats = parsed.stats ?? {};
  out.art = parsed.art ?? {};
  out.world = Array.isArray(parsed.world) ? parsed.world : [];
  return out;
}

export function loadSave(): SaveData {
  const data = readStorage() ?? defaults();
  memory = data;
  return data;
}

export function writeSave(data: SaveData): void {
  memory = data;
  if (!persistent) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    persistent = false;
  }
}

export function isPersistent(): boolean {
  return persistent;
}
