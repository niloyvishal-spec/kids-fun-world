/**
 * Canonical Ludo board + rules model.
 *
 * The board is a standard 15x15 grid. The shared movement track is the
 * classic 52-cell clockwise loop (row, col pairs). A player's token travels
 * from its start cell, around the loop, turns off into its 5-cell home lane
 * one cell before its start, and must land exactly on the centre to finish.
 *
 * Position encoding for one token:
 *   -1        in the home yard (needs a 6 to enter the track)
 *   0..50     on the main track, offset from the player's start cell
 *             (50 = the entry cell directly before the home lane)
 *   51..55    on the player's home lane (5 cells)
 *   56        finished (centre triangle)
 *
 * All rendering coordinates are derived from this model; nothing about the
 * game state is stored as a visual position.
 */

export type Grid = readonly [number, number]; // [row, col] on the 15x15 grid

export const FINISH = 56;
export const YARD = -1;

export const PLAYER_IDS = [0, 1, 2, 3] as const;
export const PLAYER_NAMES = ['RED', 'GREEN', 'YELLOW', 'BLUE'] as const;
export const PLAYER_HEX = ['#ff6b6b', '#6bcb77', '#ffd93d', '#4aa3ff'] as const;
export const PLAYER_COLOR = [0xff6b6b, 0x6bcb77, 0xffd93d, 0x4aa3ff] as const;
export const PLAYER_LIGHT = [0xffb3b3, 0xb9f0c2, 0xffeda6, 0xb7d9ff] as const;

/** The 52-cell shared path, clockwise, as [row, col] pairs. */
export const PATH: Grid[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // 0-4
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], // 5-10
  [0, 7], // 11
  [0, 8], // 12
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // 13-17
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // 18-23
  [7, 14], // 24
  [8, 14], // 25
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 26-30
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // 31-36
  [14, 7], // 37
  [14, 6], // 38
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 39-43
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // 44-49
  [7, 0], // 50
  [6, 0], // 51
];

/** Start cell (path index) per player. */
export const START_INDEX = [0, 13, 26, 39] as const;

/** The 8 safe cells: every start cell plus the classic star cells. */
export const SAFE_PATH_INDICES = [0, 8, 13, 21, 26, 34, 39, 47] as const;

/** Home lane cells (5 each), ordered from the lane entrance toward centre. */
export const LANE: Grid[][] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
];

/** Yard parking slots per player quadrant ([row, col], fractional centres). */
export const YARD_SLOTS: Grid[][] = [
  [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
];

/** World-space centre of each player's triangle inside the finish square. */
export const FINISH_SLOTS: readonly { x: number; z: number }[][] = [
  [-0.55, -0.18, 0.19, 0.56].map((z) => ({ x: -0.78, z })),
  [-0.55, -0.18, 0.19, 0.56].map((x) => ({ x, z: -0.78 })),
  [-0.55, -0.18, 0.19, 0.56].map((z) => ({ x: 0.78, z })),
  [-0.55, -0.18, 0.19, 0.56].map((x) => ({ x, z: 0.78 })),
];

/* ------------------------------------------------------------------ */
/* coordinate helpers                                                  */
/* ------------------------------------------------------------------ */

/** Grid cell -> world X (col 7 is the centre column). */
export function gridX(col: number): number {
  return col - 7;
}

/** Grid cell -> world Z (row 7 is the centre row). */
export function gridZ(row: number): number {
  return row - 7;
}

export function pathIndexFor(player: number, pos: number): number {
  return (START_INDEX[player] + pos) % 52;
}

export function isSafePathIndex(abs: number): boolean {
  return (SAFE_PATH_INDICES as readonly number[]).includes(abs);
}

export interface WorldPos {
  x: number;
  z: number;
}

/** World position of a token given its logical position. */
export function posWorld(player: number, pos: number, token: number): WorldPos {
  if (pos === FINISH) {
    const s = FINISH_SLOTS[player][token];
    return { x: s.x, z: s.z };
  }
  if (pos === YARD) {
    const [row, col] = YARD_SLOTS[player][token];
    return { x: gridX(col), z: gridZ(row) };
  }
  if (pos >= 51) {
    const [row, col] = LANE[player][pos - 51];
    return { x: gridX(col), z: gridZ(row) };
  }
  const [row, col] = PATH[pathIndexFor(player, pos)];
  return { x: gridX(col), z: gridZ(row) };
}

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

export type Phase = 'setup' | 'roll' | 'rolling' | 'choose' | 'moving' | 'over';

export interface LudoState {
  /** Active players in turn order (subset of 0..3). */
  players: number[];
  /** Human/AI flag indexed by player id. */
  isAI: boolean[];
  /** Token positions indexed by player id: tokens[player][token]. */
  tokens: number[][];
  /** Index into players[] of the player whose turn it is. */
  current: number;
  dice: number | null;
  phase: Phase;
  winner: number | null;
  turn: number;
  captures: number[];
  sixes: number[];
  rolls: number;
}

export interface Move {
  player: number;
  token: number;
  from: number;
  to: number;
}

export interface MoveOutcome {
  captured: { player: number; token: number }[];
  finished: boolean;
  won: boolean;
}

export function createState(
  players: number[],
  isAI: boolean[],
  phase: Phase = 'roll'
): LudoState {
  const tokens: number[][] = [];
  for (let p = 0; p < 4; p++) tokens.push([YARD, YARD, YARD, YARD]);
  return {
    players: [...players],
    isAI: [...isAI],
    tokens,
    current: 0,
    dice: null,
    phase,
    winner: null,
    turn: 1,
    captures: [0, 0, 0, 0],
    sixes: [0, 0, 0, 0],
    rolls: 0,
  };
}

export function currentPlayer(s: LudoState): number {
  return s.players[s.current];
}

export function isCurrentAI(s: LudoState): boolean {
  return s.isAI[currentPlayer(s)];
}

export function rollRandom(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/** All legal moves for the player on turn with the current dice value. */
export function legalMoves(s: LudoState): Move[] {
  if (s.phase !== 'choose' || s.dice === null) return [];
  const dice = s.dice;
  const p = currentPlayer(s);
  const moves: Move[] = [];
  s.tokens[p].forEach((pos, token) => {
    if (pos === FINISH) return;
    if (pos === YARD) {
      if (dice === 6) moves.push({ player: p, token, from: pos, to: 0 });
      return;
    }
    const to = pos + dice;
    if (to <= FINISH) moves.push({ player: p, token, from: pos, to });
  });
  return moves;
}

/** Apply a legal move: mutates the state, resolves captures and winning. */
export function applyMove(s: LudoState, m: Move): MoveOutcome {
  const out: MoveOutcome = { captured: [], finished: false, won: false };
  s.tokens[m.player][m.token] = m.to;

  if (m.to >= 0 && m.to <= 50) {
    const abs = pathIndexFor(m.player, m.to);
    if (!isSafePathIndex(abs)) {
      for (const opp of s.players) {
        if (opp === m.player) continue;
        s.tokens[opp].forEach((opos, otoken) => {
          if (opos >= 0 && opos <= 50 && pathIndexFor(opp, opos) === abs) {
            s.tokens[opp][otoken] = YARD;
            out.captured.push({ player: opp, token: otoken });
          }
        });
      }
    }
  }

  if (m.to === FINISH) out.finished = true;
  s.captures[m.player] += out.captured.length;

  if (s.tokens[m.player].every((t) => t === FINISH)) {
    out.won = true;
    s.winner = m.player;
    s.phase = 'over';
  }
  return out;
}

/** Pass the dice to the next active player. */
export function nextTurn(s: LudoState): void {
  s.current = (s.current + 1) % s.players.length;
  s.turn += 1;
  s.dice = null;
  if (s.phase !== 'over') s.phase = 'roll';
}

/** How many finished tokens a player has. */
export function finishedCount(s: LudoState, player: number): number {
  return s.tokens[player].filter((t) => t === FINISH).length;
}
