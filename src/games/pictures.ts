/**
 * Vector "colouring book" pictures.
 * Each region is a flat polygon [x1,y1,x2,y2,…] in a 640 x 470 canvas space.
 * Regions later in the array are drawn (and hit-tested) on top.
 */

export interface PictureDef {
  id: string;
  name: string;
  icon: string;
  color: number;
  regions: number[][];
}

export function rect(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

export function circle(cx: number, cy: number, r: number, segs = 26): number[] {
  const pts: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, segs = 28): number[] {
  const pts: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
}

export function tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number[] {
  return [x1, y1, x2, y2, x3, y3];
}

/** Partial ring band from angle a0 to a1 (radians). */
export function ring(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  a0: number,
  a1: number,
  segs = 24
): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push(cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter);
  }
  for (let i = segs; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
  }
  return pts;
}

const rainbowBands = (): number[][] => {
  const cx = 320;
  const cy = 400;
  const bands: number[][] = [];
  let outer = 220;
  for (let i = 0; i < 6; i++) {
    bands.push(ring(cx, cy, outer, outer - 24, Math.PI, Math.PI * 2, 26));
    outer -= 24;
  }
  return bands;
};

export const PICTURES: PictureDef[] = [
  {
    id: 'rainbow',
    name: 'Rainbow',
    icon: '🌈',
    color: 0xffd93d,
    regions: [
      ...rainbowBands(),
      circle(90, 395, 44),
      circle(545, 395, 44),
      circle(560, 85, 52),
    ],
  },
  {
    id: 'house',
    name: 'House',
    icon: '🏠',
    color: 0x6bcb77,
    regions: [
      rect(0, 380, 640, 90),
      rect(190, 220, 260, 170),
      tri(155, 228, 485, 228, 320, 105),
      rect(398, 128, 52, 74),
      rect(288, 300, 74, 90),
      rect(214, 252, 62, 62),
      rect(364, 252, 62, 62),
      circle(82, 78, 46),
      circle(548, 84, 42),
    ],
  },
  {
    id: 'car',
    name: 'Car',
    icon: '🚗',
    color: 0x4aa3ff,
    regions: [
      rect(0, 358, 640, 70),
      [
        90, 300, 550, 300, 550, 248, 472, 248, 432, 192, 214, 192, 174, 248, 90, 248,
      ],
      [234, 202, 320, 202, 320, 244, 198, 244],
      [342, 202, 416, 202, 446, 244, 342, 244],
      circle(190, 312, 50),
      circle(452, 312, 50),
      circle(190, 312, 20),
      circle(452, 312, 20),
      circle(544, 274, 18),
      circle(96, 274, 16),
    ],
  },
  {
    id: 'rocket',
    name: 'Rocket',
    icon: '🚀',
    color: 0xff6b6b,
    regions: [
      tri(320, 48, 404, 172, 236, 172),
      [236, 172, 404, 172, 404, 344, 236, 344],
      circle(320, 224, 46),
      [236, 250, 186, 366, 236, 344],
      [404, 250, 454, 366, 404, 344],
      [246, 348, 394, 348, 320, 448],
      circle(112, 92, 26),
      circle(548, 148, 22),
      circle(560, 58, 40),
    ],
  },
  {
    id: 'dino',
    name: 'Dino',
    icon: '🦕',
    color: 0x6bcb77,
    regions: [
      rect(0, 392, 640, 78),
      [155, 246, 40, 174, 58, 304, 152, 324],
      ellipse(300, 284, 152, 112),
      ellipse(468, 178, 82, 66),
      rect(232, 352, 62, 62),
      rect(332, 352, 62, 62),
      tri(248, 176, 292, 138, 302, 192),
      tri(322, 168, 366, 130, 374, 188),
      ellipse(300, 322, 92, 62),
      circle(494, 164, 15),
    ],
  },
  {
    id: 'cat',
    name: 'Cat',
    icon: '🐱',
    color: 0xffa94d,
    regions: [
      rect(0, 418, 640, 52),
      ellipse(320, 344, 142, 112),
      [448, 382, 562, 300, 592, 342, 468, 424],
      circle(320, 200, 112),
      tri(238, 122, 276, 56, 306, 124),
      tri(334, 124, 366, 56, 404, 122),
      circle(280, 188, 26),
      circle(362, 188, 26),
      tri(306, 228, 336, 228, 321, 250),
      circle(150, 400, 34),
    ],
  },
  {
    id: 'space',
    name: 'Space',
    icon: '🌌',
    color: 0xa78bfa,
    regions: [
      rect(0, 0, 640, 470),
      circle(430, 210, 92),
      ring(430, 210, 138, 108, -0.3 * Math.PI, 1.35 * Math.PI, 30),
      circle(138, 112, 56),
      circle(94, 316, 22),
      circle(556, 386, 26),
      circle(306, 66, 18),
      circle(196, 396, 16),
    ],
  },
];
