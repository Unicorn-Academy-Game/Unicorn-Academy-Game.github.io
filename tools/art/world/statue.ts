import { EAST, WEST } from '../../../src/shared/compass';
import { blit, createRgba, type Rgba } from '../core/image';
import { deg, v3 } from '../core/vec';
import { commonPalette, hairKeys, hairPalette } from '../unicorn/characters/shared';
import { wildstar } from '../unicorn/characters/wildstar';
import { makeKit, ORIGIN_X, ORIGIN_Y, renderFrame } from '../unicorn/frame';
import { FOOT_REST, NECK_REST_DEG, type Pose, restPose } from '../unicorn/pose';
import type { PaletteEntry, UnicornSpec } from '../unicorn/spec';
import { Painter } from './paint';
import { box } from './prims';
import { renderScene, SceneBuilder } from './scene';
import { stoneKit } from './stone';

const COS = Math.cos((27 * Math.PI) / 180);

export const STATUE = { canvas: { w: 280, h: 270, ox: 140, oy: 222 }, plinthTop: 54 } as const;

const MARBLE = ['#8f8ab8', '#b8b5db', '#d6d5ec', '#ececf8', '#ffffff'] as const;
const stone = (colors: readonly string[]): PaletteEntry => ({
  base: colors[Math.floor(colors.length / 2)]!,
  colors,
  outline: '#4b4676',
  outlineLit: '#7b77a8',
});
const GOLD = ['#9a5f18', '#d99a34', '#f4c95e', '#ffe49a', '#fff4cc'];
const HAIR = [
  ['hair0', '#eceaf8', '#5b5787'],
  ['hair1', '#dcdaf0', '#5b5787'],
  ['hair2', '#e8e6f6', '#5b5787'],
  ['hair3', '#d4d2ec', '#5b5787'],
  ['hair4', '#e4e2f4', '#5b5787'],
  ['hair5', '#d9d7ee', '#5b5787'],
  ['hair6', '#ebe9f7', '#5b5787'],
] as const;

/**
 * Wildstar carved in pale marble, with her horn, halter and gems in gold. Same model and
 * proportions as the live unicorn.
 */
export const statueSpec: UnicornSpec = {
  ...wildstar,
  palette: {
    ...commonPalette({
      coat: stone(MARBLE),
      muzzle: stone(['#928cb8', '#bab6da', '#d9d6ee', '#eeecf8']),
      hoof: stone(['#7c77a6', '#a09cc8', '#c4c1e0']),
      horn: { base: '#f4c95e', colors: GOLD, outline: '#7a4c14', outlineLit: '#c98f3a' },
      hornGroove: { base: '#c98a2c', colors: ['#8a5214', '#c98a2c'], outline: '#7a4c14' },
      earInner: stone(['#9d98c4', '#bcb8dc', '#d8d5ec']),
      eyeRing: '#4a4570',
      iris: ['#6a6695', '#8a86b5'],
      nostril: '#6c67a0',
      mouth: '#7f7aa8',
    }),
    ...hairPalette(HAIR),
    strap: {
      base: '#f5c332',
      colors: ['#9a5f18', '#d99a34', '#f4c95e', '#ffe49a'],
      outline: '#7a4c14',
      outlineLit: '#c98f3a',
    },
    trim: { base: '#ffe49a', colors: ['#c98a2c', '#f4c95e', '#fff0b8'], outline: '#7a4c14', outlineLit: '#c98f3a' },
    gem: { base: '#3fd3c4', steps: 3, outline: '#136f88', priority: 2 },
  },
  hair: hairKeys(HAIR),
  decals: [],
};

const NECK_ABS = [
  NECK_REST_DEG.n0,
  NECK_REST_DEG.n0 + NECK_REST_DEG.n1,
  NECK_REST_DEG.n0 + NECK_REST_DEG.n1 + NECK_REST_DEG.n2,
  NECK_REST_DEG.n0 + NECK_REST_DEG.n1 + NECK_REST_DEG.n2 + NECK_REST_DEG.head,
] as const;

/**
 * A proud, still pose: neck arched high, one fore hoof raised, tail and mane lifted as if in a
 * breeze.
 */
export function statuePose(): Pose {
  const p = restPose();
  const target = [-83, -61, -49, 22] as const;
  const t = 0.9;
  const a = NECK_ABS.map((v, i) => v + (target[i]! - v) * t);
  p.neck = [
    deg(a[0]! - NECK_REST_DEG.n0),
    deg(a[1]! - a[0]! - NECK_REST_DEG.n1),
    deg(a[2]! - a[1]! - NECK_REST_DEG.n2),
  ];
  p.head = deg(a[3]! - a[2]! - NECK_REST_DEG.head);
  p.legs.fl = { foot: [FOOT_REST.fl[0] + 11, FOOT_REST.fl[1], 21], hoofPitch: 0.6 };
  p.chest = 0.7;
  p.tailLift = 0.4;
  p.wind = 0.55;
  p.hairSway = 0.7;
  p.hairPhase = 0.2;
  p.earL = deg(-8);
  p.earR = deg(-8);
  return p;
}

function buildPlinth(): SceneBuilder {
  const b = new SceneBuilder();
  const k = stoneKit(b, 5);
  const marble = b.mesh(k.marble);
  box(marble, v3(0, 0, 5), v3(128, 78, 10));
  const die = b.mesh(k.marble);
  box(die, v3(0, 0, 28), v3(100, 60, 36));
  const cap = b.mesh(k.marble);
  box(cap, v3(0, 0, 50), v3(114, 70, 8));
  const gold = b.mesh(k.gold);
  box(gold, v3(0, 0, 10.8), v3(102, 62, 3));
  box(gold, v3(0, 0, 45.5), v3(104, 64, 3));
  box(gold, v3(0, -30.8, 28), v3(40, 2, 20));
  return b;
}

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

let plinthCache: Rgba | null = null;
function plinthImage(): Rgba {
  if (!plinthCache) {
    const r = renderScene(buildPlinth(), {
      width: STATUE.canvas.w,
      height: STATUE.canvas.h,
      originX: STATUE.canvas.ox,
      originY: STATUE.canvas.oy,
      ss: 4,
      aoRadius: 8,
      lineDepth: 5,
      shadowFit: true,
      shadowBias: 3.2,
    });
    plinthCache = r.rgba;
    // A small rose heart on the gold plate.
    const p = new Painter(plinthCache);
    const [cx, cy] = r.at(v3(0, -32, 28));
    const x0 = Math.round(cx) - 3,
      y0 = Math.round(cy) - 3;
    HEART.forEach((row, j) => {
      [...row].forEach((c, i) => {
        if (c !== 'X') return;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const)
          if (HEART[j + dy]?.[i + dx] !== 'X') p.px(x0 + i + dx, y0 + j + dy, [122, 58, 20]);
      });
    });
    HEART.forEach((row, j) => {
      [...row].forEach((c, i) => {
        if (c === 'X')
          p.px(x0 + i, y0 + j, j <= 1 && i <= 2 ? [255, 150, 186] : j >= 4 || i >= 5 ? [190, 40, 98] : [236, 74, 128]);
      });
    });
  }
  const copy = createRgba(plinthCache.width, plinthCache.height);
  copy.data.set(plinthCache.data);
  return copy;
}

let kitCache: ReturnType<typeof makeKit> | null = null;
const frameCache = new Map<'east' | 'west', ReturnType<typeof renderFrame>>();

function statueFrame(facing: 'east' | 'west'): ReturnType<typeof renderFrame> {
  let frame = frameCache.get(facing);
  if (!frame) {
    kitCache ??= makeKit(statueSpec);
    frame = renderFrame(kitCache, statuePose(), facing === 'east' ? EAST : WEST);
    frameCache.set(facing, frame);
  }
  return frame;
}

const plinthTopY = (): number => Math.round(STATUE.canvas.oy - STATUE.plinthTop * COS);

/**
 * The corner of the unicorn's frame on the sprite, which puts her hooves on the top of the plinth.
 */
const framePlace = (): [number, number] => [STATUE.canvas.ox - ORIGIN_X, plinthTopY() - ORIGIN_Y];

/**
 * Where the tip of the statue's horn falls on its sprite, in pixels from the sprite's top left
 * corner.
 */
export function statueHornTip(facing: 'east' | 'west'): [number, number] {
  const [x, y] = statueFrame(facing).anchors.horn;
  const [fx, fy] = framePlace();
  return [fx + x, fy + y];
}

/** A statue and its plinth as one sprite, anchored at the middle of the plinth's base. */
export function renderStatue(facing: 'east' | 'west'): Rgba {
  const img = plinthImage();
  const p = new Painter(img);
  const { ox } = STATUE.canvas;
  const topY = plinthTopY();
  // Soft contact shade on the stone beneath the hooves.
  for (let y = -13; y <= 13; y++) {
    for (let x = -52; x <= 52; x++) {
      const d = (x * x) / (52 * 52) + (y * y) / (12 * 12);
      if (d < 1 && p.get(ox + x, topY + y)[3] === 255) p.over(ox + x, topY + y, [70, 58, 120], 0.2 * (1 - d));
    }
  }
  const [fx, fy] = framePlace();
  blit(img, statueFrame(facing).rgba, fx, fy);
  return img;
}
