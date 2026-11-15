import { LIFE } from '../content/life';
import { PROP_DEFS } from '../content/props';
import type { Critter, NpcActor, UnicornActor, World } from '../domain';
import { UNICORN_FACINGS, type UnicornFacing } from '../shared/compass';
import type { UnicornId, Vec2 } from '../shared/ids';
import { UNICORN_BODY_ROWS } from './unicorn-bodies';

export type TapTarget =
  | { kind: 'unicorn'; id: UnicornId }
  | { kind: 'critter'; id: string }
  | { kind: 'prop'; instanceId: string }
  | { kind: 'npc'; instanceId: string }
  | { kind: 'ground'; at: Vec2 };

/**
 * Generous ellipses around a unicorn's body, relative to her feet, in world units, one for each of
 * the 32 facings she is drawn at. Each is fitted to the pictures: the smallest that holds almost
 * all of the pixels she is drawn with at that facing when she walks and stands, a little wider than
 * that. A side view is about 190 wide and 130 tall, a view from behind or from the front is about
 * 65 wide, and the ellipse changes shape with her through the facings between. See
 * `unicorn-bodies.ts`.
 */
const BODY: Record<UnicornFacing, { rx: number; ry: number; cy: number }> = Object.fromEntries(
  UNICORN_FACINGS.map((f) => {
    const [rx, ry, cy] = UNICORN_BODY_ROWS[f]!;
    return [f, { rx, ry, cy }];
  }),
) as Record<UnicornFacing, { rx: number; ry: number; cy: number }>;
const NPC_BODY = { rx: 48, ry: 84, cy: 78 } as const;

/** Where inside an ellipse a point is: below 1 is inside. */
const inside = (p: Vec2, cx: number, cy: number, rx: number, ry: number): number =>
  ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2;

interface Candidate {
  target: TapTarget;
  /** Ground y of the thing, so the one drawn in front wins. */
  feetY: number;
  closeness: number;
}

function unicornCandidate(a: UnicornActor, p: Vec2, minHalf: number): Candidate | null {
  const b = BODY[a.anim.facing];
  const rx = Math.max(b.rx, minHalf);
  const ry = Math.max(b.ry, minHalf);
  const d = inside(p, a.pos.x, a.pos.y - b.cy, rx, ry);
  return d <= 1 ? { target: { kind: 'unicorn', id: a.id }, feetY: a.pos.y, closeness: d } : null;
}

function npcCandidate(n: NpcActor, p: Vec2, minHalf: number): Candidate | null {
  const d = inside(p, n.pos.x, n.pos.y - NPC_BODY.cy, Math.max(NPC_BODY.rx, minHalf), Math.max(NPC_BODY.ry, minHalf));
  return d <= 1 ? { target: { kind: 'npc', instanceId: n.instanceId }, feetY: n.pos.y, closeness: d } : null;
}

/** The top of a unicorn's body, which is where something that points at her hovers. */
export function unicornTop(a: UnicornActor): Vec2 {
  const b = BODY[a.anim.facing];
  return { x: a.pos.x, y: a.pos.y - b.cy - b.ry };
}

/** The top of a creature's body, which is higher when it flies. */
export function critterTop(c: Critter): Vec2 {
  const b = LIFE[c.kind].body;
  return { x: c.pos.x, y: c.pos.y - c.z - b.cy - b.ry };
}

/**
 * A creature is tapped where it is drawn: its middle sits `cy` above its ground point, and higher
 * still when it flies.
 */
function critterCandidate(c: Critter, p: Vec2, minHalf: number): Candidate | null {
  const b = LIFE[c.kind].body;
  const d = inside(p, c.pos.x, c.pos.y - c.z - b.cy, Math.max(b.rx, minHalf), Math.max(b.ry, minHalf));
  // One in the air is in front of whatever it flies over, whatever its ground point says.
  return d <= 1 ? { target: { kind: 'critter', id: c.id }, feetY: c.pos.y + (c.z > 0 ? 400 : 0), closeness: d } : null;
}

const best = (candidates: Candidate[]): Candidate | undefined =>
  candidates.sort((a, b) => b.feetY - a.feetY || a.closeness - b.closeness)[0];

/**
 * How far in, as closeness, a tap is on a unicorn whoever else is drawn there. Closeness is the
 * square of the way out to the edge, so this is half the way. Beyond it the ellipse is a margin
 * that her picture often does not fill, and a unicorn drawn in front of her may not have her
 * covered there.
 */
const SOLID = 0.25;

/**
 * The unicorn a tap means, of those whose ellipses hold it. A tap in the middle of some of them is
 * on the one of those drawn in front. A tap in the middle of none is on the one it is nearest the
 * middle of, and not on the one in front, because where two ellipses overlap at their edges the one
 * in front is often not drawn.
 */
function unicornAmong(candidates: Candidate[]): Candidate | undefined {
  const solid = candidates.filter((c) => c.closeness <= SOLID);
  return solid.length > 0 ? best(solid) : candidates.sort((a, b) => a.closeness - b.closeness)[0];
}

/**
 * What a tap at `p` means, in this order: unicorn or creature, then prop or NPC, then ground.
 * Overlapping candidates resolve to the one drawn in front, then to the nearest body center.
 * Overlapping unicorns are the exception, see `unicornAmong`. `minHalf` is the smallest half-size a
 * target may have in world units, so a target stays tappable on a small screen.
 */
export function hitTest(world: World, p: Vec2, minHalf: number): TapTarget {
  // Unicorns and the small creatures who live among them compete for the tap, and the one drawn in
  // front wins.
  const living: Candidate[] = [];
  const unicorns: Candidate[] = [];
  for (const a of Object.values(world.unicorns)) {
    const c = a ? unicornCandidate(a, p, minHalf) : null;
    if (c) unicorns.push(c);
  }
  const unicorn = unicornAmong(unicorns);
  if (unicorn) living.push(unicorn);
  for (const c of world.life.critters) {
    const hit = critterCandidate(c, p, minHalf);
    if (hit) living.push(hit);
  }
  const alive = best(living);
  if (alive) return alive.target;

  const things: Candidate[] = [];
  for (const inst of world.interactables.values()) {
    if (PROP_DEFS[inst.definitionId]?.tap === 'none') continue;
    const h = inst.hit;
    const cx = h.x + h.w / 2;
    const cy = h.y + h.h / 2;
    const halfW = Math.max(h.w / 2, minHalf);
    const halfH = Math.max(h.h / 2, minHalf);
    if (Math.abs(p.x - cx) <= halfW && Math.abs(p.y - cy) <= halfH)
      things.push({
        target: { kind: 'prop', instanceId: inst.instanceId },
        feetY: inst.pos.y,
        closeness: Math.hypot((p.x - cx) / halfW, (p.y - cy) / halfH),
      });
  }
  for (const n of world.npcs) {
    const c = npcCandidate(n, p, minHalf);
    if (c) things.push(c);
  }
  const thing = best(things);
  return thing ? thing.target : { kind: 'ground', at: p };
}
