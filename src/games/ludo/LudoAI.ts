import type { LudoState, Move } from './LudoRules';
import { FINISH, YARD, currentPlayer, isSafePathIndex, pathIndexFor } from './LudoRules';

/**
 * Computer player move selection.
 *
 * Scores every legal move heuristically: finishing > capturing > escaping
 * the yard > entering the lane > pure progress, with a small bonus for
 * landing on safe cells and a penalty for landing right in front of an
 * opponent that could strike back.
 */
export function chooseMove(moves: Move[], s: LudoState): Move {
  if (moves.length === 0) throw new Error('chooseMove called without legal moves');
  const me = currentPlayer(s);
  let best = moves[0];
  let bestScore = -Infinity;

  for (const m of moves) {
    let score = 0;

    if (m.to === FINISH) score += 1000;
    else if (m.from === YARD) score += 320;
    else if (m.to >= 51) score += 240 + (m.to - 51) * 30;
    else score += m.to * 2;

    // capture?
    if (m.to >= 0 && m.to <= 50) {
      const abs = pathIndexFor(m.player, m.to);
      if (!isSafePathIndex(abs)) {
        for (const opp of s.players) {
          if (opp === me) continue;
          for (const opos of s.tokens[opp]) {
            if (opos >= 0 && opos <= 50 && pathIndexFor(opp, opos) === abs) score += 500;
          }
        }
      } else {
        score += 40; // safe cell bonus
      }
    }

    score += Math.random() * 12; // slight variety between equal moves
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
