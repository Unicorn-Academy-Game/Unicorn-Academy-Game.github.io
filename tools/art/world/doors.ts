import type { RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { projectPoint } from '../core/render';
import { hash2 } from '../core/rng';
import type { V3 } from '../core/vec';
import { flowerAt } from './manor-flowers';
import { Painter } from './paint';
import { GEM, PAL, PALACE, type Ramp } from './palette';
import { WORLD_PITCH } from './scene';

/**
 * Doors as their own sprites, laid over a doorway that the building leaves dark. Frame 0 is shut.
 * The later frames swing the leaves open toward the sides, so each hinge edge stays put and the
 * leaf narrows as it turns, while the light behind spills out of the gap.
 *
 * The doorway is found in the building's own pixels, so anything standing in front of it (columns,
 * a lintel, a porch roof) keeps hiding the door exactly where it hides the doorway.
 */
export interface DoorGeometry {
  /** The building's canvas, so the door can be placed in the building's own pixel space. */
  building: { w: number; h: number; ox: number; oy: number };
  /** Centre of the door's foot in scene units, and the opening's size. */
  base: V3;
  w: number;
  h: number;
  /**
   * The exact colour of the doorway's dark plug, when the building's own colours could be mistaken
   * for the default one.
   */
  plug?: RGB;
}

export const DOOR_FRAMES = 7;

const COS = Math.cos(WORLD_PITCH);
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];
const scale = (c: RGB, k: number): RGB => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** Margin around the opening for the swung leaves and the spill of light on the ground. */
const MARGIN = { side: 12, top: 10, bottom: 16 };

/** The overlay's rectangle in pixels from the building's ground anchor. */
export function doorRect(g: DoorGeometry): { x: number; y: number; w: number; h: number; footY: number } {
  const cfg = { originX: g.building.ox, originY: g.building.oy, pitch: WORLD_PITCH };
  const [fx, fy] = projectPoint(cfg, g.base);
  const [, ty] = projectPoint(cfg, [g.base[0], g.base[1], g.base[2] + g.h]);
  const cx = Math.round(fx - g.building.ox),
    foot = Math.round(fy - g.building.oy),
    top = Math.round(ty - g.building.oy);
  return {
    x: cx - Math.round(g.w / 2) - MARGIN.side,
    y: top - MARGIN.top,
    w: g.w + MARGIN.side * 2,
    h: foot - top + MARGIN.top + MARGIN.bottom,
    footY: foot,
  };
}

export function doorCanvas(g: DoorGeometry): { w: number; h: number; ox: number; oy: number } {
  const r = doorRect(g);
  return { w: r.w, h: r.h, ox: -r.x, oy: -r.y };
}

export interface DoorStyle {
  leaf: Ramp;
  trim: Ramp;
  /** Light behind the doors: centre colour first. */
  light: readonly [RGB, RGB, RGB];
  /** A lift's doors slide into the wall instead of swinging, and the gap shows a golden cabin. */
  kind: 'treasure' | 'stable' | 'lift';
  /** What a lift's leaves look like: a wall of flowers that hides the lift, or plain gold. */
  skin?: 'flowers' | 'gold';
  /**
   * Whether straw lies heaped behind the leaves when they open. A stable door seen from outside has
   * it; from inside it does not. Default true for a stable.
   */
  straw?: boolean;
}

export const TREASURE_DOOR: DoorStyle = {
  leaf: PALACE.roofTeal,
  trim: GEM.gold,
  light: [
    [255, 246, 190],
    [255, 214, 96],
    [214, 150, 40],
  ],
  kind: 'treasure',
};
/** Wrought iron: dark with one pale edge, for straps and hinges. */
const IRON: Ramp = [
  [34, 32, 48],
  [52, 50, 68],
  [74, 72, 92],
  [104, 102, 124],
  [150, 148, 172],
];
export const STABLE_DOOR: DoorStyle = {
  leaf: PAL.wood,
  trim: IRON,
  light: [
    [255, 232, 170],
    [236, 176, 96],
    [150, 92, 52],
  ],
  kind: 'stable',
};

/**
 * True for the pixels of the doorway's dark plug. The outline colour around it is darker still, and
 * not part of the opening.
 */
function isOpening(d: Uint8Array | Uint8ClampedArray, i: number): boolean {
  return (
    d[i + 3] === 255 &&
    d[i]! >= 40 &&
    d[i]! <= 90 &&
    d[i + 1]! >= 26 &&
    d[i + 1]! <= 62 &&
    d[i + 2]! >= 70 &&
    d[i + 2]! <= 124
  );
}

export function renderDoor(g: DoorGeometry, style: DoorStyle, frame: number, building: Rgba): Rgba {
  const r = doorRect(g);
  const img = createRgba(r.w, r.h);
  const p = new Painter(img);
  const bw = building.width;
  const inside = (x: number, y: number): boolean => {
    const bx = x + r.x + g.building.ox,
      by = y + r.y + g.building.oy;
    if (bx < 0 || by < 0 || bx >= bw || by >= building.height) return false;
    const i = (by * bw + bx) * 4;
    if (g.plug)
      return (
        building.data[i + 3] === 255 &&
        Math.abs(building.data[i]! - g.plug[0]) <= 2 &&
        Math.abs(building.data[i + 1]! - g.plug[1]) <= 2 &&
        Math.abs(building.data[i + 2]! - g.plug[2]) <= 2
      );
    return isOpening(building.data, i);
  };
  const cx = -r.x;
  const halfW = g.w / 2;
  // Where the opening really ends at the bottom, which sits a little below the nominal foot when a
  // step is in front.
  let foot = r.footY - r.y;
  for (let y = r.h - 1; y > 0; y--)
    if (inside(cx, y)) {
      foot = y + 1;
      break;
    }
  const zOf = (y: number): number => (foot - y) / COS;
  const t = frame / (DOOR_FRAMES - 1);
  const swing = smooth(t * 1.05);
  const slides = style.kind === 'lift';
  const angle = slides ? 0 : swing * 1.32;
  const leafW = slides
    ? Math.max(0, Math.round(halfW * (1 - swing)))
    : Math.max(3, Math.round(halfW * Math.cos(angle)));
  const lit = 1 - 0.34 * Math.sin(angle);
  const gap = halfW - leafW;
  const left = Math.round(cx - halfW),
    right = Math.round(cx + halfW);
  const archSpring = g.h - halfW;
  if (gap > 0) {
    for (let y = 0; y < foot; y++) {
      for (let x = Math.round(cx - gap); x < Math.round(cx + gap); x++) {
        if (!inside(x, y)) continue;
        const z = zOf(y);
        const dx = Math.abs(x + 0.5 - cx) / Math.max(1, gap);
        const dz = Math.abs(z - g.h * 0.42) / (g.h * 0.62);
        const d = Math.min(1, dx * 0.92 + dz * 0.14);
        let c =
          style.kind === 'lift'
            ? cabinColor(x, z, g, cx, halfW, style)
            : d < 0.34
              ? style.light[0]
              : d < 0.74
                ? style.light[1]
                : style.light[2];
        if (style.kind === 'stable' && style.straw !== false) {
          // Straw heaped along the floor and dim depth above it.
          if (z < 22 && hash2(x >> 1, y >> 1, 3) > 0.45) c = scale(style.light[1], 0.82);
          else if (z > g.h * 0.7) c = scale(c, 0.78);
        }
        p.px(x, y, rgb(c));
      }
    }
    if (style.kind === 'treasure') {
      for (let i = 0; i < 7; i++) {
        const x = Math.round(cx + (hash2(i, 1, 7) - 0.5) * gap * 1.7),
          y = Math.round(foot - 14 - hash2(i, frame, 8) * (g.h * COS - 26));
        if (!inside(x, y)) continue;
        p.px(x, y, [255, 255, 255]);
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const)
          if (inside(x + dx, y + dy)) p.over(x + dx, y + dy, [255, 250, 200], 0.85);
      }
    }
  }
  // The two leaves, hinged at the jambs. `s` is the distance along the shut leaf from the jamb, so
  // patterns squeeze as it turns.
  for (const side of [-1, 1] as const) {
    for (let y = 0; y < foot; y++) {
      for (let k = 0; k < leafW; k++) {
        const x = side < 0 ? left + k : right - 1 - k;
        if (!inside(x, y)) continue;
        const s = slides ? halfW - (leafW - k) : (k / leafW) * halfW;
        p.px(x, y, rgb(leafColor(style, side, x, zOf(y), s, lit, g, halfW, cx, archSpring)));
      }
    }
    // The leaf's free edge gets a bright rim.
    const ex = side < 0 ? left + leafW - 1 : right - leafW;
    if (leafW > 0)
      for (let y = 0; y < foot; y++)
        if (inside(ex, y)) p.px(ex, y, rgb(scale(style.trim[Math.min(3, style.trim.length - 1)]!, lit)));
  }
  // Light falling on the ground in front of the door, wider the further it is opened.
  if (gap > 2) spill(p, building, g, r, cx, foot, gap, style);
  return img;
}

function leafColor(
  style: DoorStyle,
  side: -1 | 1,
  x: number,
  z: number,
  s: number,
  lit: number,
  g: DoorGeometry,
  halfW: number,
  cx: number,
  archSpring: number,
): RGB {
  const leaf = style.leaf,
    trim = style.trim;
  const jamb = halfW - s;
  if (style.kind === 'lift') {
    if (jamb < 2 || z < 5) return trim[2]!;
    // The seam where the two leaves meet is a gold line, then a darker one beside it.
    if (s > halfW - 1.2) return trim[1]!;
    if (s > halfW - 2.4) return trim[4]!;
    if (style.skin === 'flowers') {
      const X = Math.round(side < 0 ? cx - halfW + s : cx + halfW - 1 - s);
      const c = flowerAt(X, Math.round(-z * COS), { seed: 5, cell: 14 });
      return z > archSpring + 2 ? scale(c, 0.97) : c;
    }
    // Plain gold: soft vertical flutes, a band across the middle, and a fan of rays in the arch.
    if (z > archSpring + 6)
      return trim[
        Math.floor((Math.atan2(z - archSpring, (side < 0 ? -1 : 1) * (halfW - s)) / Math.PI) * 9) % 2 === 0 ? 4 : 3
      ]!;
    if (Math.abs(z - g.h * 0.46) < 3) return trim[5]!;
    if (Math.abs(z - g.h * 0.46) < 5) return trim[2]!;
    return trim[Math.floor(s / 6) % 2 === 0 ? 4 : 3]!;
  }
  if (style.kind === 'treasure') {
    if (z > archSpring + 6) {
      // A sunburst fills the arch.
      const a = Math.atan2(z - archSpring, x + 0.5 - cx);
      const ray = Math.floor((a / Math.PI) * 9);
      return scale(trim[ray % 2 === 0 ? 4 : 2]!, lit);
    }
    // Raised panels with a gold border and a boss.
    const px0 = 8,
      px1 = halfW - 8;
    for (const [z0, z1] of [
      [12, 58],
      [70, archSpring - 6],
    ] as const) {
      if (s >= px0 && s <= px1 && z >= z0 && z <= z1) {
        const edge = s < px0 + 2 || s > px1 - 2 || z < z0 + 2 || z > z1 + -2;
        const mx = (px0 + px1) / 2,
          mz = (z0 + z1) / 2;
        if (Math.abs(s - mx) < 3 && Math.abs(z - mz) < 3) return scale(trim[5]!, lit);
        return scale(edge ? trim[3]! : leaf[side < 0 ? 5 : 4]!, lit);
      }
    }
    if (jamb < 3 || z < 6) return scale(trim[2]!, lit);
    return scale(leaf[side < 0 ? 4 : 3]!, lit);
  }
  // Planks with iron straps.
  const plank = Math.floor(s / 9);
  let c = scale(leaf[(plank + (side < 0 ? 1 : 0)) % 2 === 0 ? 4 : 3]!, lit);
  if (s % 9 < 1) c = scale(leaf[1]!, lit);
  const strap = [0.2, 0.52, 0.84].some((f) => Math.abs(z / g.h - f) < 0.03);
  if (strap && jamb < halfW * 0.8) c = scale(trim[2]!, lit);
  if (strap && jamb < 4) c = scale(trim[4]!, lit);
  // The Dutch door's split, where the upper half would open on its own.
  if (Math.abs(z / g.h - 0.58) < 0.012) c = scale(leaf[0]!, lit);
  if (jamb < 2) c = scale(leaf[1]!, lit);
  return c;
}

/**
 * A soft wash of the room's light across the ground just outside the door, only over the building's
 * pale step pixels.
 */
function spill(
  p: Painter,
  building: Rgba,
  g: DoorGeometry,
  r: ReturnType<typeof doorRect>,
  cx: number,
  foot: number,
  gap: number,
  style: DoorStyle,
): void {
  const rows = 11;
  for (let k = 0; k < rows; k++) {
    const y = foot + k;
    const half = gap + k * 0.9;
    const a = 0.5 * (1 - k / rows);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const bx = x + r.x + g.building.ox,
        by = y + r.y + g.building.oy;
      if (bx < 0 || by < 0 || bx >= building.width || by >= building.height) continue;
      const i = (by * building.width + bx) * 4;
      const lum = building.data[i]! + building.data[i + 1]! + building.data[i + 2]!;
      if (building.data[i + 3] !== 255 || lum < 480) continue;
      const edge = 1 - Math.abs(x + 0.5 - cx) / (half + 1);
      p.over(x, y, style.light[1], a * Math.min(1, edge * 1.6));
    }
  }
}

/**
 * What shows through the gap of a lift's doors: a cabin of fluted gold, a floor of dark glass with
 * small lights, a bright ceiling.
 */
function cabinColor(x: number, z: number, g: DoorGeometry, cx: number, halfW: number, style: DoorStyle): RGB {
  const { light } = style;
  const dx = Math.abs(x + 0.5 - cx);
  // Floor of dark glass with a line of small lights along it.
  if (z < 12) return dx % 15 < 2 && z > 3 && z < 8 ? [255, 246, 190] : [62, 40, 78];
  // The back wall's far corners fall into shade, which gives the little room its depth.
  if (dx > halfW - 7) return light[2];
  // A gold hand rail, then amber paneling below it and a pale mirror above.
  if (z > 40 && z < 48) return z < 44 ? [255, 244, 170] : [150, 96, 28];
  if (z > g.h - 14) return light[0];
  const flute = Math.floor(dx / 6) % 2 === 0;
  if (z < 41) return flute ? light[2] : [196, 124, 38];
  if (dx % 44 < 3) return light[2];
  if (z > g.h * 0.72) return flute ? light[1] : light[2];
  return flute ? light[0] : light[1];
}
