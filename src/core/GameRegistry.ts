import type { GameDef } from './types';

export const GAMES: GameDef[] = [
  { id: 'MatchPuzzle', title: 'Match Puzzle', icon: '🧩', color: 0xff6b6b, accent: 0xffd93d, tag: 'Swap & Match' },
  { id: 'BubblePop', title: 'Bubble Pop', icon: '🫧', color: 0x4dd0e1, accent: 0xa78bfa, tag: 'Tap Bubbles' },
  { id: 'BunnyRun', title: 'Bunny Run', icon: '🐰', color: 0x6bcb77, accent: 0xffd93d, tag: 'Jump & Run' },
  { id: 'MiniRacing', title: 'Mini Racing', icon: '🚗', color: 0x4aa3ff, accent: 0xffa94d, tag: 'Race & Dodge' },
  { id: 'PetCare', title: 'Pet Care', icon: '🐶', color: 0xff8fab, accent: 0x4dd0e1, tag: 'Love Your Pet' },
  { id: 'LittleChef', title: 'Little Chef', icon: '🍕', color: 0xffa94d, accent: 0x6bcb77, tag: 'Cook Yummy Food' },
  { id: 'ColorStudio', title: 'Color Studio', icon: '🎨', color: 0xa78bfa, accent: 0xff8fab, tag: 'Paint & Color' },
  { id: 'MemoryMatch', title: 'Memory Match', icon: '🃏', color: 0xffd93d, accent: 0x4aa3ff, tag: 'Flip & Find' },
  { id: 'MathAdventure', title: 'Math Adventure', icon: '🔢', color: 0x4dd0e1, accent: 0xff6b6b, tag: 'Solve & Go' },
  { id: 'BuildMyWorld', title: 'Build My World', icon: '🏗️', color: 0x6bcb77, accent: 0xffa94d, tag: 'Place & Create' },
  { id: 'Ludo', title: 'Ludo', icon: '🎲', color: 0xff5c7a, accent: 0xffd93d, tag: 'Roll & Race' },
  { id: 'SkyFlyer', title: 'Sky Flyer', icon: '🐤', color: 0x4dd0e1, accent: 0xff8fab, tag: 'Flap & Fly' },
];

const byId = new Map(GAMES.map((g) => [g.id, g]));

export function gameById(id: string): GameDef {
  return (
    byId.get(id) ?? {
      id,
      title: id,
      icon: '🎮',
      color: 0x4aa3ff,
      accent: 0xffd93d,
      tag: '',
    }
  );
}
