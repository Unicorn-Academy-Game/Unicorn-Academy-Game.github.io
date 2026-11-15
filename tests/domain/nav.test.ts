import { describe, expect, it } from 'vitest';
import { dist } from '../../src/domain/geometry';
import { Nav, pathLength } from '../../src/domain/nav/nav';
import type { Obstacle } from '../../src/shared/map';

const nav = (obstacles: Obstacle[], w = 1024, h = 768): Nav => new Nav({ width: w, height: h, obstacles });
const R = 22;

/**
 * Every segment of a path keeps the feet clear. The first segment may start from a pinched point.
 */
function expectClearPath(n: Nav, from: { x: number; y: number }, path: { x: number; y: number }[]): void {
  let prev = from;
  for (const p of path) {
    expect(n.segmentClear(prev, p, -0.75), `segment ${JSON.stringify(prev)} -> ${JSON.stringify(p)}`).toBe(true);
    prev = p;
  }
}

describe('nav', () => {
  it('routes around a wall through the gap and keeps its feet clear', () => {
    // A wall with a gap at y 300..420 (120 wide).
    const n = nav([
      { kind: 'rect', x: 480, y: 0, w: 64, h: 300 },
      { kind: 'rect', x: 480, y: 420, w: 64, h: 348 },
    ]);
    const from = { x: 200, y: 360 + 200 };
    const to = { x: 800, y: 100 };
    const path = n.findPath(from, to)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual(to);
    expectClearPath(n, from, path);
    // It really went through the gap.
    const crossing = path.find((p, i) => (i === 0 ? from.x : path[i - 1]!.x) < 512 && p.x >= 512);
    expect(crossing).toBeDefined();
  });

  it('refuses a goal inside an obstacle or too close to one for the feet to fit', () => {
    const n = nav([{ kind: 'circle', x: 500, y: 400, r: 80 }]);
    expect(n.findPath({ x: 100, y: 100 }, { x: 500, y: 400 })).toBeNull();
    expect(n.findPath({ x: 100, y: 100 }, { x: 500 + 80 + 10, y: 400 })).toBeNull();
    expect(n.findPath({ x: 100, y: 100 }, { x: 500 + 80 + R + 2, y: 400 })).not.toBeNull();
  });

  it('does not cut the corner between two blocks that touch diagonally', () => {
    // Two small posts one cell apart on the diagonal, with the actor's cell and the goal cell on
    // the other diagonal.
    const n = nav([
      { kind: 'circle', x: 208, y: 176, r: 5 },
      { kind: 'circle', x: 176, y: 208, r: 5 },
    ]);
    const from = { x: 176, y: 176 };
    const to = { x: 208, y: 208 };
    const path = n.findPath(from, to)!;
    expect(path).not.toBeNull();
    expectClearPath(n, from, path);
    expect(pathLength(from, path)).toBeGreaterThan(dist(from, to) + 8);
  });

  it('returns no path between disconnected areas', () => {
    // A closed room in the middle.
    const n = nav([
      { kind: 'rect', x: 400, y: 300, w: 300, h: 40 },
      { kind: 'rect', x: 400, y: 560, w: 300, h: 40 },
      { kind: 'rect', x: 400, y: 300, w: 40, h: 300 },
      { kind: 'rect', x: 660, y: 300, w: 40, h: 300 },
    ]);
    expect(n.findPath({ x: 100, y: 100 }, { x: 550, y: 450 })).toBeNull();
    expect(n.sameComponent({ x: 100, y: 100 }, { x: 550, y: 450 })).toBe(false);
  });

  it("picks a reachable fallback for a tap on a blocked spot, in the leader's own area", () => {
    const n = nav([
      { kind: 'circle', x: 500, y: 400, r: 90 },
      // enclosed pocket the leader can never enter, right next to the tap
      { kind: 'rect', x: 700, y: 500, w: 200, h: 30 },
      { kind: 'rect', x: 700, y: 640, w: 200, h: 30 },
      { kind: 'rect', x: 700, y: 500, w: 30, h: 170 },
      { kind: 'rect', x: 870, y: 500, w: 30, h: 170 },
    ]);
    const from = { x: 100, y: 100 };
    const blocked = n.nearestReachable(from, { x: 500, y: 400 })!;
    expect(blocked.exact).toBe(false);
    expect(n.isWalkable(blocked.point)).toBe(true);
    expect(dist(blocked.point, { x: 500, y: 400 })).toBeLessThan(90 + R + 40);
    expect(n.findPath(from, blocked.point)).not.toBeNull();

    // A tap inside the sealed pocket resolves outside it, in the leader's area.
    const pocket = n.nearestReachable(from, { x: 800, y: 585 })!;
    expect(pocket).not.toBeNull();
    expect(n.sameComponent(from, pocket.point)).toBe(true);
  });

  it('keeps the exact point for a reachable tap', () => {
    const n = nav([{ kind: 'circle', x: 500, y: 400, r: 80 }]);
    const r = n.nearestReachable({ x: 100, y: 100 }, { x: 300, y: 200 })!;
    expect(r.exact).toBe(true);
    expect(r.point).toEqual({ x: 300, y: 200 });
  });

  it('refuses a tap that is far from anything reachable and offers an edge point for a sparkle', () => {
    // The only open ground is a strip in the corner; the tap is deep inside a huge obstacle.
    const n = nav([{ kind: 'rect', x: 200, y: 0, w: 824, h: 768 }]);
    const from = { x: 100, y: 384 };
    expect(n.nearestReachable(from, { x: 800, y: 384 })).toBeNull();
    const edge = n.closestEdgePoint(from, { x: 800, y: 384 });
    expect(n.isWalkable(edge)).toBe(true);
    expect(edge.x).toBeLessThan(200);
  });

  it('rounds corners only where the curve has room', () => {
    // An L-shaped corridor 100 wide: a rounded corner would clip the inside wall unless it is
    // checked.
    const n = nav([
      { kind: 'rect', x: 0, y: 0, w: 1024, h: 200 },
      { kind: 'rect', x: 0, y: 300, w: 700, h: 468 },
      { kind: 'rect', x: 800, y: 300, w: 224, h: 468 },
    ]);
    const from = { x: 60, y: 250 };
    const to = { x: 750, y: 700 };
    const path = n.findPath(from, to);
    expect(path).not.toBeNull();
    expectClearPath(n, from, path!);
  });

  it('finds a free standing point near a spot that avoids other actors and stays in the same area', () => {
    const n = nav([{ kind: 'circle', x: 500, y: 400, r: 60 }]);
    const avoid = [
      { x: 300, y: 300 },
      { x: 330, y: 300 },
    ];
    const p = n.freePointNear({ x: 300, y: 300 }, avoid, 56)!;
    expect(p).not.toBeNull();
    for (const a of avoid) expect(dist(p, a)).toBeGreaterThanOrEqual(56);
    expect(n.isWalkable(p)).toBe(true);
    expect(n.sameComponent(p, { x: 300, y: 300 })).toBe(true);
  });

  it('treats the map edge as an obstacle', () => {
    const n = nav([]);
    expect(n.isWalkable({ x: 10, y: 400 })).toBe(false);
    expect(n.isWalkable({ x: R + 1, y: 400 })).toBe(true);
    expect(n.findPath({ x: 100, y: 100 }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('nav footing', () => {
  const rect = (x: number, y: number, w: number, h: number): Obstacle => ({ kind: 'rect', x, y, w, h });
  /**
   * A lane 54 across between two blocks. Her feet fit in the middle of it, and no cell centre does.
   */
  const lane = (): Nav => nav([rect(200, 300, 600, 81), rect(200, 435, 600, 300)]);
  /** A room walled in on every side, with 36 cells of floor. */
  const closet = [rect(400, 300, 300, 40), rect(400, 560, 300, 40), rect(400, 300, 40, 300), rect(660, 300, 40, 300)];

  it('can be set off from open ground, and not from inside an obstacle, in the lane, or off the map', () => {
    const n = lane();
    expect(n.canSetOff({ x: 100, y: 100 })).toBe(true);
    expect(n.isWalkable({ x: 500, y: 408 })).toBe(true);
    expect(n.canSetOff({ x: 500, y: 408 })).toBe(false);
    expect(n.canSetOff({ x: 500, y: 340 })).toBe(false);
    expect(n.canSetOff({ x: Number.NaN, y: 100 })).toBe(false);
    expect(n.canSetOff({ x: -50, y: 100 })).toBe(false);
  });

  it('can be set off from a place a hair too close to a wall, as a follower is when it comes to rest', () => {
    const n = nav([rect(480, 0, 64, 768)]);
    expect(n.canSetOff({ x: 480 - R + 2, y: 300 })).toBe(true);
  });

  it('cannot be set off from a pocket that holds too few cells, and can from a sealed room big enough to walk about in', () => {
    const small = nav(closet);
    expect(small.isWalkable({ x: 550, y: 450 })).toBe(true);
    expect(small.sameComponent({ x: 550, y: 450 }, { x: 100, y: 100 })).toBe(false);
    expect(small.canSetOff({ x: 550, y: 450 })).toBe(false);
    expect(small.canSetOff({ x: 100, y: 100 })).toBe(true);
    const big = nav([
      rect(100, 100, 700, 40),
      rect(100, 560, 700, 40),
      rect(100, 100, 40, 500),
      rect(760, 100, 40, 500),
    ]);
    expect(big.sameComponent({ x: 450, y: 350 }, { x: 40, y: 40 })).toBe(false);
    expect(big.canSetOff({ x: 450, y: 350 })).toBe(true);
    expect(big.canSetOff({ x: 40, y: 40 })).toBe(true);
  });

  it('counts the largest ground as ground to walk about on, however small the map', () => {
    const tiny = nav([], 128, 128);
    expect(tiny.walkableCells()).toBeLessThan(10);
    expect(tiny.canSetOff({ x: 64, y: 64 })).toBe(true);
  });

  it('puts her down on ground she can set off from, and as near as it can be', () => {
    const n = lane();
    const from = { x: 500, y: 408 };
    const to = n.openGroundNear(from)!;
    expect(to).not.toBeNull();
    expect(n.canSetOff(to)).toBe(true);
    expect(n.isWalkable(to, 2)).toBe(true);
    // No other cell centre on open ground is nearer.
    let nearer = 0;
    for (let y = 16; y < 768; y += 32)
      for (let x = 16; x < 1024; x += 32)
        if (n.isWalkable({ x, y }) && n.canSetOff({ x, y }) && dist({ x, y }, from) < dist(to, from) - 1e-6) nearer++;
    expect(nearer).toBe(0);
  });

  it('puts her down outside a closet she is shut in, in the ground the rest of the map is', () => {
    const n = nav(closet);
    const to = n.openGroundNear({ x: 550, y: 450 })!;
    expect(n.canSetOff(to)).toBe(true);
    expect(n.sameComponent(to, { x: 100, y: 100 })).toBe(true);
  });

  it('keeps the places she is put down at away from those who stand there', () => {
    const n = nav([]);
    const crowd = [
      { x: 100, y: 100 },
      { x: 150, y: 100 },
      { x: 100, y: 150 },
    ];
    const to = n.openGroundNear({ x: 110, y: 110 }, crowd, 56)!;
    for (const c of crowd) expect(dist(to, c)).toBeGreaterThanOrEqual(56);
    expect(n.canSetOff(to)).toBe(true);
  });

  it('puts her down on the side of the wall her tap is on, when that is much the shorter way', () => {
    // A wall from the top of the map down to y 600, so the way round is a long one. She stands by
    // it with the tap just across.
    const n = nav([rect(500, 0, 20, 600)]);
    const from = { x: 478, y: 300 };
    const tap = { x: 560, y: 300 };
    expect(n.openGroundNear(from)!.x).toBeLessThan(500);
    const to = n.openGroundNear(from, [], 56, tap)!;
    expect(to.x).toBeGreaterThan(520);
    expect(n.canSetOff(to)).toBe(true);
    expect(dist(to, tap)).toBeLessThan(100);
  });

  it('keeps to her own side when the tap is across a wall that has no way round', () => {
    const n = nav([rect(500, 0, 20, 768)]);
    const from = { x: 478, y: 300 };
    const to = n.openGroundNear(from, [], 56, { x: 560, y: 300 })!;
    expect(to.x).toBeLessThan(500);
  });

  it('does not put her on ground cut off from the big ground she is on, though it is nearer', () => {
    const n = nav([rect(500, 0, 20, 768)]);
    const from = { x: 478, y: 300 };
    // Everyone on her own side stands near her, so the nearest free ground is across the wall, and
    // she is put down on her own side all the same.
    const crowd = [
      { x: 478, y: 300 },
      { x: 400, y: 300 },
      { x: 440, y: 260 },
      { x: 440, y: 340 },
    ];
    const to = n.openGroundNear(from, crowd, 100)!;
    expect(to.x).toBeLessThan(500);
    expect(n.sameComponent(to, from)).toBe(true);
    // The free ground across the wall really was nearer.
    let nearestAcross = Infinity;
    for (let y = 16; y < 768; y += 32) {
      for (let x = 560; x < 1024; x += 32) {
        const c = { x, y };
        if (n.isWalkable(c) && crowd.every((q) => dist(c, q) >= 100))
          nearestAcross = Math.min(nearestAcross, dist(c, from));
      }
    }
    expect(nearestAcross).toBeLessThan(dist(from, to));
  });

  it('goes across the wall when her own side has no ground at all', () => {
    const n = nav([rect(500, 0, 20, 768), rect(0, 0, 500, 768)]);
    const to = n.openGroundNear({ x: 478, y: 400 })!;
    expect(to.x).toBeGreaterThan(520);
  });

  it('names the ground a route runs on: none for a place in the lane, whatever cells are near', () => {
    const n = lane();
    expect(n.groundAt({ x: 100, y: 100 })).toBeGreaterThanOrEqual(0);
    expect(n.groundAt({ x: 500, y: 408 })).toBe(-1);
    expect(n.sameGround({ x: 100, y: 100 }, { x: 500, y: 408 })).toBe(false);
    expect(n.sameGround({ x: 100, y: 100 }, { x: 900, y: 100 })).toBe(true);
  });

  it('takes a tap in a nook as the nearest place that a route can end at, not as it is', () => {
    const n = lane();
    const from = { x: 100, y: 100 };
    const inLane = { x: 500, y: 408 };
    expect(n.isWalkable(inLane)).toBe(true);
    const found = n.nearestReachable(from, inLane)!;
    expect(found).not.toBeNull();
    expect(found.exact).toBe(false);
    expect(n.findPath(from, found.point)).not.toBeNull();
    // And the tap on open ground is kept exactly.
    expect(n.nearestReachable(from, { x: 900, y: 100 })).toEqual({ point: { x: 900, y: 100 }, exact: true });
  });

  it('has no route to start from a nook, so nothing in reach of one is told it can be reached', () => {
    const n = lane();
    expect(n.nearestReachable({ x: 500, y: 408 }, { x: 100, y: 100 })).toBeNull();
  });

  it('has nowhere to put her down on a map with no ground', () => {
    const n = nav([rect(0, 0, 1024, 768)]);
    expect(n.openGroundNear({ x: 500, y: 400 })).toBeNull();
    expect(n.canSetOff({ x: 500, y: 400 })).toBe(false);
  });
});
