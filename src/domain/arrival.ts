import { facingOfCardinal, vecOf } from '../shared/compass';
import type { Facing, UnicornId, Vec2 } from '../shared/ids';
import type { LogicMap } from '../shared/map';
import { CONFIG } from './config';
import type { Nav } from './nav/nav';
import { computeSlots, restingPlace } from './slots';
import { Trail } from './trail';

/**
 * The line a herd stands along when it arrives: Wildstar at its start, the friends along it in the
 * order they were found. It is the way the herd came in, so they follow it when Wildstar walks off.
 * It must be long enough for the herd, wide enough where it turns back on itself, and run over
 * ground a unicorn can stand on. A map author draws the lines for doors. Everywhere else, such as
 * where a saved game was left, this module finds one.
 */

/** How far from a doorway the herd keeps. */
const DOOR_MARGIN = 48;

/**
 * Ground a unicorn can stand on, with this much to spare beyond its feet, tried from roomiest to
 * tightest.
 */
const CLEARANCES = [30, 16, 4];
const STRAIGHT_EXTRA = [0, 40, 80, 120, 160];
const BENDS = [-135, -90, -45, 45, 90, 135];
const RADII = [70, 80, 90, 100, 110];

export interface LineCandidate {
  line: Vec2[];
  /** Lower is better: straight lines first, then one bend, then a block that doubles back. */
  score: number;
  what: string;
}

/** The oldest-first trail through a line, which is the line backwards. */
export const trailOf = (line: readonly Vec2[]): Trail => {
  const trail = new Trail(line[0]!);
  trail.seed([...line].reverse());
  return trail;
};

/**
 * How far behind Wildstar the way back is looked for when the herd has no authored line to stand
 * along.
 */
const WAY_BACK = 700;

/** A walkable way back from where Wildstar stands, her own position first. */
export function wayBack(nav: Nav, leader: Vec2, facing: Facing): Vec2[] {
  const back = vecOf(facingOfCardinal(facing));
  const far = nav.freePointNear({ x: leader.x - back.x * WAY_BACK, y: leader.y - back.y * WAY_BACK }, [], 0, 400);
  const path = far ? nav.findPath(leader, far) : null;
  return path && path.length > 0 ? [leader, ...path] : [leader];
}

/** Trail length needed to give each of these friends the gap behind the one ahead of it. */
export const lengthFor = (herd: readonly UnicornId[]): number => herd.reduce((sum, id) => sum + CONFIG.herd.gap[id], 0);

/**
 * Every line worth trying from where Wildstar stands, best first. `need` is how long the line has
 * to be.
 */
export function lineCandidates(leader: Vec2, facing: Facing, need: number): LineCandidate[] {
  const ahead = vecOf(facingOfCardinal(facing));
  const back = Math.atan2(-ahead.y, -ahead.x);
  const at = (angle: number, along: number, across: number, from: Vec2 = leader): Vec2 => ({
    x: from.x + Math.cos(angle) * along - Math.sin(angle) * across,
    y: from.y + Math.sin(angle) * along + Math.cos(angle) * across,
  });
  const out: LineCandidate[] = [];
  for (let k = -3; k <= 3; k++) {
    const angle = back + (k * Math.PI) / 4;
    const turned = Math.abs(k) * 12;
    for (const extra of STRAIGHT_EXTRA) {
      const length = need + extra;
      out.push({
        line: [leader, at(angle, length / 2, 0), at(angle, length, 0)],
        score: length / 10 - 30 + turned,
        what: `straight ${length} at ${k * 45} degrees from behind`,
      });
    }
    for (const bend of BENDS) {
      for (let first = Math.round((need * 0.3) / 40) * 40; first <= need * 0.75; first += 40) {
        const corner = at(angle, first, 0);
        const end = at(angle + (bend * Math.PI) / 180, need + 100 - first, 0, corner);
        out.push({
          line: [leader, corner, end],
          score: 70 + turned + Math.abs(bend) / 9 + Math.abs(first - need / 2) / 40,
          what: `bend of ${bend} degrees after ${first}, from ${k * 45} degrees from behind`,
        });
      }
    }
    for (const side of [-1, 1]) {
      for (const radius of RADII) {
        const rowLeast = Math.max(80, Math.ceil((need - Math.PI * radius) / 80) * 40);
        for (let row = rowLeast; row <= rowLeast + 200; row += 40) {
          const turn: Vec2[] = [];
          for (let i = 1; i < 10; i++) {
            const a = (Math.PI * i) / 10;
            turn.push(at(angle, row + radius * Math.sin(a), side * (radius - radius * Math.cos(a))));
          }
          const line = [
            leader,
            at(angle, row, 0),
            ...turn,
            at(angle, row, side * 2 * radius),
            at(angle, 0, side * 2 * radius),
          ];
          out.push({
            line,
            score: 100 + (row + 2 * radius) / 10 + turned,
            what: `block ${row} long, ${2 * radius} wide, to the ${side > 0 ? 'right' : 'left'} of ${k * 45} degrees from behind`,
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The places the herd keeps out of: each doorway, and the spot in front of it where Wildstar stands
 * to go through.
 */
export function doorways(map: LogicMap): Rect[] {
  return map.portals.flatMap((p) => [p.bounds, { x: p.approach.x - 24, y: p.approach.y - 24, w: 48, h: 48 }]);
}

const inside = (r: Rect, p: Vec2, margin: number): boolean =>
  p.x > r.x - margin && p.x < r.x + r.w + margin && p.y > r.y - margin && p.y < r.y + r.h + margin;

export interface Fit {
  /** Every point of the line is on ground with `clear` to spare. */
  onGround: boolean;
  /** Every leg of the line can be walked in a straight line. */
  walkable: boolean;
  /** The herd can be given places a spacing apart along the line. */
  roomy: boolean;
  /**
   * Every place the herd would stand is on ground a unicorn can stand on, and none is in a doorway.
   */
  standable: boolean;
}

/** How well a herd fits along a line. `doors` are the doorways the herd keeps out of. */
export function fit(
  nav: Nav,
  line: readonly Vec2[],
  herd: readonly UnicornId[],
  clear: number,
  doors: readonly Rect[],
): Fit {
  const width = nav.source.width,
    height = nav.source.height;
  const onGround = line.every((p) => p.x > 0 && p.y > 0 && p.x < width && p.y < height && nav.isWalkable(p, clear));
  const walkable = line.every((p, i) => i === 0 || nav.segmentClear(line[i - 1]!, p));
  if (!onGround || !walkable) return { onGround, walkable, roomy: false, standable: false };
  const trail = trailOf(line);
  const slots = computeSlots(trail, herd);
  const standable = herd.every((id, i) => {
    const place = restingPlace(trail, slots.at.get(id)!, i);
    return nav.isWalkable(place, 2) && !doors.some((d) => inside(d, place, DOOR_MARGIN));
  });
  return { onGround, walkable, roomy: !slots.cramped, standable };
}

const holds = (f: Fit): boolean => f.onGround && f.walkable && f.roomy && f.standable;

/**
 * The best line from here that holds this herd, with as much room to spare as can be had. Null when
 * nothing fits.
 */
export function herdLine(
  nav: Nav,
  leader: Vec2,
  facing: Facing,
  herd: readonly UnicornId[],
  doors: readonly Rect[],
): Vec2[] | null {
  if (herd.length === 0) return [leader];
  const candidates = lineCandidates(leader, facing, lengthFor(herd));
  for (const clear of CLEARANCES) {
    const hit = candidates.find((c) => holds(fit(nav, c.line, herd, clear, doors)));
    if (hit) return hit.line;
  }
  return null;
}

/** Whether a line holds a herd with just enough ground under it to stand on. */
export const lineHolds = (
  nav: Nav,
  line: readonly Vec2[],
  herd: readonly UnicornId[],
  doors: readonly Rect[],
): boolean => holds(fit(nav, line, herd, 2, doors));
