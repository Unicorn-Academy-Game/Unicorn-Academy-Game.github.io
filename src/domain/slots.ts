import type { UnicornId, Vec2 } from '../shared/ids';
import { CONFIG } from './config';
import { dist, smoothstep } from './geometry';
import type { Bend, Trail } from './trail';

/** Distance between the places tried, going back along the trail. */
const STEP = 8;
/** How much farther back than its gap a follower's place may be pushed to find room. */
const MAX_BACK = 960;
/**
 * Distance on each side of a follower over which the trail direction is measured for its sideways
 * offset.
 */
export const CORNER_SPAN = 84;
/**
 * The sideways offset fades out as the trail's straightness (see `Trail.bendAt`) falls from the
 * second of these to the first.
 */
const SWING_FROM = 0.2;
const SWING_TO = 0.92;

/**
 * The sideways offset a follower settles at, which alternates by place in the herd so neighbors
 * stand either side of the trail.
 */
export const lateralFor = (index: number): number => (index % 2 === 0 ? 1 : -1) * CONFIG.herd.lateral;

/**
 * How far a follower holding the sideways offset `lat` stands from the trail point, as a vector.
 * The offset swings through zero where the trail doubles back, so it never jumps from one side to
 * the other.
 */
export function sideOffset(bend: Bend, lat: number): Vec2 {
  const side = lat * smoothstep(SWING_FROM, SWING_TO, bend.straight);
  return { x: -bend.tangent.y * side, y: bend.tangent.x * side };
}

/** Where the follower at this place in the herd stands at rest when it is at arc length `s`. */
export function restingPlace(trail: Trail, s: number, index: number): Vec2 {
  const at = trail.pointAt(s);
  const side = sideOffset(trail.bendAt(s, CORNER_SPAN), lateralFor(index));
  return { x: at.x + side.x, y: at.y + side.y };
}

export interface Slots {
  /** Arc length on the trail where each follower belongs. */
  readonly at: ReadonlyMap<UnicornId, number>;
  /**
   * True when the trail ran out before some follower could be given room. Those followers stand too
   * close to the ones ahead.
   */
  readonly cramped: boolean;
}

/**
 * Where each follower belongs on the trail, as an arc length. A follower stands its gap behind the
 * one ahead of it in the herd, so on a straight walk the herd is a line, a gap apart.
 *
 * Where the trail doubles back, a spot one gap behind can be right beside the leader, or beside the
 * follower ahead, because the path folded in between. The place is then moved back along the trail
 * until the unicorn standing there is clear of everyone ahead: the herd lines up along the way it
 * came, in two rows if the way turned, and nobody stands inside anybody else. A place that is clear
 * of the leader and of the places ahead of it stays clear whatever the leader does next, so the
 * answer holds still while the herd rests.
 */
export function computeSlots(trail: Trail, order: readonly UnicornId[]): Slots {
  const at = new Map<UnicornId, number>();
  let cramped = false;
  const standing: Vec2[] = [trail.headPoint];
  let from = trail.head;
  order.forEach((id, index) => {
    const wanted = from - CONFIG.herd.gap[id];
    let s = wanted;
    let place = restingPlace(trail, wanted, index);
    let roomy = false;
    for (let back = 0; back <= MAX_BACK && wanted - back > trail.tail; back += STEP) {
      const candidate = restingPlace(trail, wanted - back, index);
      if (standing.every((other) => dist(other, candidate) >= CONFIG.herd.spacing)) {
        s = wanted - back;
        place = candidate;
        roomy = true;
        break;
      }
    }
    if (!roomy) cramped = true;
    at.set(id, s);
    standing.push(place);
    from = s;
  });
  return { at, cramped };
}
