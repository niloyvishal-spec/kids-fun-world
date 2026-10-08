/** Global design constants for Kids Fun World. */

export const DESIGN_W = 1280;
export const DESIGN_H = 720;

export const EMOJI_FONT =
  "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji','Twemoji Mozilla',sans-serif";
export const UI_FONT = "'Trebuchet MS','Segoe UI',Verdana,sans-serif";

export const C = {
  skyTop: 0x4aa3ff,
  skyMid: 0x8ed7ff,
  grass: 0x7ed957,
  grassDark: 0x5cc44a,
  sand: 0xffe08a,
  night: 0x2b3a67,
  white: 0xffffff,
  ink: 0x33364f,
  shadow: 0x1f2340,

  red: 0xff6b6b,
  orange: 0xffa94d,
  yellow: 0xffd93d,
  green: 0x6bcb77,
  teal: 0x4dd0e1,
  blue: 0x4aa3ff,
  purple: 0xa78bfa,
  pink: 0xff8fab,
  brown: 0xc98a5b,
  cream: 0xfff6e3,
} as const;

/** Colourful palette used for gems, bubbles, cards, etc. */
export const PALETTE: number[] = [
  0xff5c7a, 0xffd93d, 0x6bcb77, 0x4aa3ff, 0xa78bfa, 0xffa94d, 0x4dd0e1, 0xff8fab,
];

export const PALETTE_HEX: string[] = PALETTE.map((c) => '#' + c.toString(16).padStart(6, '0'));

export function cssHex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
