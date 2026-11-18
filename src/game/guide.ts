import type { MapId, Vec2 } from '../shared/ids';
import { clamp } from '../shared/math';

/**
 * Pointing the way. When a way out is off the screen, a bubble sits at the edge of the screen on
 * the line toward it, so a child who has wandered off can see which way to go and tap it to be
 * taken there. This is only the geometry: where the bubbles go, and which of them show. The DOM
 * layer draws them.
 */

export interface ExitSpot {
  portalId: string;
  /** Where the way out leads. */
  mapId: MapId;
  /** Where its marker hovers, in the world. */
  at: Vec2;
  /** A way that is shown ahead of nearer ones when there are more ways than bubbles. */
  main?: boolean;
}

export interface Screen {
  w: number;
  h: number;
}

/**
 * How far in from each edge of the screen a bubble is kept, in CSS pixels, so it clears the buttons
 * and the notch.
 */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * A button in the top left corner of the screen: how far its right side and its lower side are from
 * the top left of the screen, in CSS pixels, with the room a bubble needs round it added. Only
 * those two sides matter, since the button sits in the corner.
 */
export interface Corner {
  right: number;
  bottom: number;
}

/**
 * Where a bubble may sit, given the buttons in the corner, which a bubble should neither hide
 * behind nor cover. Along the top it goes under a button when that leaves it above the middle of
 * the screen, where the herd stands and where a bubble would take the taps meant for the world. A
 * button too low for that, as the stack of them is on a phone held sideways, is kept clear on the
 * other side: the bubbles keep to the right of it. A button wider than a third of the screen is
 * always gone under, since the bubbles could not all be crowded to the right of it, and one that
 * ends above the first row of bubbles is no concern. The result is still a rectangle, so a bubble
 * still slides smoothly round the screen.
 */
export function roomAround(inset: Inset, corner: readonly Corner[], screen: Screen, bubble: number): Inset {
  const above = screen.h / 2 - bubble;
  let { top, left } = inset;
  for (const part of corner) {
    if (part.bottom <= inset.top) continue;
    if (part.bottom <= above || part.right > screen.w / 3) top = Math.max(top, part.bottom);
    else left = Math.max(left, part.right);
  }
  return { ...inset, top, left };
}

/**
 * The button for looking at the whole of something near: what it is called, and whether the camera
 * is already standing back.
 */
export interface SurveyOffer {
  word: string;
  active: boolean;
}

/** The button that takes the herd out of where she is in one tap: what it says. */
export interface WayOutOffer {
  label: string;
}

export interface ExitArrow {
  portalId: string;
  mapId: MapId;
  /** The middle of the bubble on the screen, in CSS pixels. */
  x: number;
  y: number;
  /** The way it points, in radians from east, clockwise on the screen. */
  angle: number;
}

/** A marker that is this close to being on the screen needs no bubble: the child can see it. */
const SEEN_MARGIN = 20;
/**
 * Bubbles closer than this to one already placed are left out: they would sit on top of each other.
 */
const APART = 64;
/**
 * How far above the thing it points at the middle of the bubble for a word hovers, in CSS pixels.
 */
const SEEK_LIFT = 44;

const onScreen = (p: Vec2, screen: Screen): boolean =>
  p.x >= SEEN_MARGIN && p.x <= screen.w - SEEN_MARGIN && p.y >= SEEN_MARGIN && p.y <= screen.h - SEEN_MARGIN;

/**
 * Where the line from the middle of the screen to a point leaves the inset rectangle, which is
 * where a bubble for that point goes, and how far the point is. The middle of the screen is inside
 * the rectangle, and of its walls along the line the first one the line reaches is where it leaves.
 * A point at the middle has no direction, so it has no edge.
 */
function edgeToward(p: Vec2, screen: Screen, inset: Inset): (Vec2 & { angle: number; far: number }) | null {
  const cx = screen.w / 2,
    cy = screen.h / 2;
  const left = inset.left,
    right = screen.w - inset.right,
    top = inset.top,
    bottom = screen.h - inset.bottom;
  const dx = p.x - cx,
    dy = p.y - cy;
  const far = Math.hypot(dx, dy);
  if (far < 1e-6) return null;
  const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
  const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx), far };
}

/**
 * The bubbles to show for the ways out that are off the screen, the nearest first but a main way
 * ahead of the rest, at most `limit` of them. `toScreen` says where a world point is on the screen
 * now. The line from the middle of the screen to a marker is cut where it leaves the inset
 * rectangle, which is where its bubble goes. A bubble that would sit on one of the `taken` places
 * is left out.
 */
export function exitArrows(
  spots: readonly ExitSpot[],
  toScreen: (p: Vec2) => Vec2,
  screen: Screen,
  inset: Inset,
  limit = 3,
  taken: readonly Vec2[] = [],
): ExitArrow[] {
  const found: (ExitArrow & { far: number; main: boolean })[] = [];
  for (const s of spots) {
    const p = toScreen(s.at);
    if (onScreen(p, screen)) continue;
    const edge = edgeToward(p, screen, inset);
    if (edge) found.push({ portalId: s.portalId, mapId: s.mapId, main: s.main === true, ...edge });
  }
  found.sort((a, b) => Number(b.main) - Number(a.main) || a.far - b.far);
  const kept: ExitArrow[] = [];
  for (const f of found) {
    if (kept.length >= limit) break;
    if (
      kept.some((k) => Math.hypot(k.x - f.x, k.y - f.y) < APART) ||
      taken.some((t) => Math.hypot(t.x - f.x, t.y - f.y) < APART)
    )
      continue;
    const { far: _far, main: _main, ...arrow } = f;
    kept.push(arrow);
  }
  return kept;
}

/**
 * The bubble that goes with the player to a word they are looking for, and where on the screen it
 * is.
 */
export interface SeekBubble {
  /** The middle of the bubble on the screen, in CSS pixels. */
  x: number;
  y: number;
  /** The way it points, in radians from east, clockwise on the screen. */
  angle: number;
  /**
   * It hovers by the thing and points at it, which is on the screen. Otherwise it sits at the edge
   * and points the way.
   */
  over: boolean;
}

/**
 * Where the bubble for a word goes, for a thing or an exit at `at` in the world. A thing that can
 * be seen has the bubble hovering above it, pointing down. Where above would be under the buttons
 * along the top it stays just below them, so that it slides along as the thing goes up and does not
 * jump. One that cannot be seen has it at the edge of the screen on the line toward it, as an exit
 * does.
 */
export function seekBubble(at: Vec2, toScreen: (p: Vec2) => Vec2, screen: Screen, inset: Inset): SeekBubble {
  const p = toScreen(at);
  if (!onScreen(p, screen)) {
    const edge = edgeToward(p, screen, inset);
    if (edge) return { x: edge.x, y: edge.y, angle: edge.angle, over: false };
  }
  return {
    x: clamp(p.x, inset.left, screen.w - inset.right),
    y: clamp(p.y - SEEK_LIFT, inset.top, screen.h - inset.bottom),
    angle: Math.PI / 2,
    over: true,
  };
}
