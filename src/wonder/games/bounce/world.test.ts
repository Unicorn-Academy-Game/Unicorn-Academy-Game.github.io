import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import type { UnicornId } from '../../../shared/ids';
import { arcAt, arcBetween } from './hop';
import {
  ARC_STARS,
  BODY,
  buildWorld,
  type CloudKind,
  FRIEND_ROWS,
  LIFT,
  MAX_DX,
  ROW,
  ROWS,
  reachable,
  stepAt,
  WORLD_W,
} from './world';

const FRIENDS: readonly UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const world = (seed: number, friends: readonly UnicornId[] = FRIENDS, look = 'red') =>
  buildWorld(new Rng(seed), friends, look);

describe('the sky', () => {
  it('is the same for the same seed and not the same for another', () => {
    const a = world(5);
    const b = world(5);
    const c = world(6);
    expect(a.clouds).toEqual(b.clouds);
    expect(a.pickups).toEqual(b.pickups);
    expect(a.clouds).not.toEqual(c.clouds);
  });

  it('has a mushroom at the bottom, rows of two or three clouds, and a gate at the top', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      expect(w.mushroom.kind).toBe('mushroom');
      expect(w.mushroom.y).toBe(0);
      expect(w.gate.kind).toBe('gate');
      for (let r = 0; r < ROWS; r++) {
        const n = w.row(r).length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
      }
      expect(w.row(ROWS)).toHaveLength(1);
    }
  });

  it('goes up by the same step every row, give or take a little', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      for (let r = 0; r < ROWS; r++)
        for (const c of w.row(r)) expect(Math.abs(c.y - -(r + 1) * ROW)).toBeLessThanOrEqual(15);
    }
  });

  it('has every cloud a leap from the one it says it comes from, in the row below', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const c of w.clouds) {
        if (c.row < 0) continue;
        const parent = w.byId(c.parent);
        expect(parent.row).toBe(c.row - 1);
        expect(reachable(parent, c)).toBe(true);
      }
    }
  });

  it('can be climbed from the mushroom to the gate by leaps the game allows', () => {
    for (const seed of SEEDS) {
      for (const look of ['red', 'pink', 'blue']) {
        const w = world(seed, FRIENDS, look);
        let at = w.gate;
        let steps = 0;
        while (at.row >= 0) {
          at = w.byId(at.parent);
          steps++;
        }
        expect(at).toBe(w.mushroom);
        expect(steps).toBe(ROWS + 1);
      }
    }
  });

  it('never puts two clouds of a row close enough to touch, or outside the sky', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      for (let r = 0; r <= ROWS; r++) {
        const row = w.row(r);
        for (let i = 0; i < row.length; i++) {
          const c = row[i]!;
          expect(c.x - c.width / 2).toBeGreaterThan(20);
          expect(c.x + c.width / 2).toBeLessThan(WORLD_W - 20);
          const next = row[i + 1];
          if (next) expect(next.x - next.width / 2 - (c.x + c.width / 2)).toBeGreaterThanOrEqual(35);
        }
      }
    }
  });

  it('puts the way up within reach all the way, so a child who always goes up never has to do anything clever', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      for (let r = 0; r < ROWS; r++) {
        for (const c of w.row(r)) expect(Math.abs(w.byId(c.parent).x - c.x)).toBeLessThanOrEqual(MAX_DX - 30 + 1);
      }
    }
  });

  it('hangs its stars along leaps she can make, so that a leap to the cloud takes her through all of them', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const w = world(seed);
      expect(w.pickups.length).toBeGreaterThan(30);
      const by = new Map<number, typeof w.pickups>();
      for (const p of w.pickups) by.set(p.cloud, [...(by.get(p.cloud) ?? []), p]);
      for (const [id, stars] of by) {
        expect(stars).toHaveLength(ARC_STARS);
        const to = w.byId(id);
        const from = w.byId(to.parent);
        const arc = arcBetween(from.x, from.y, to.x, to.y, 1, LIFT);
        for (const s of stars) {
          // The star is where her middle is when she passes it.
          const p = arcAt(arc, (s.index + 1) / (ARC_STARS + 1));
          expect(s.x).toBeCloseTo(p.x, 4);
          expect(s.y).toBeCloseTo(p.y - BODY, 4);
        }
      }
    }
  });

  it('gives the first leap stars, so the first thing the player is shown is where to go', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const first = w.row(0).find((c) => w.byId(c.parent) === w.mushroom && w.pickups.some((p) => p.cloud === c.id));
      expect(first).toBeDefined();
    }
  });

  it('waits a friend on a cloud for each friend she has, on the rows set aside for them, and for no one else', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const some = world(seed, ['leaf', 'river']);
      const friends = some.clouds.filter((c) => c.kind === 'friend');
      expect(friends.map((c) => c.friend)).toEqual(['leaf', 'river']);
      expect(friends.map((c) => c.row)).toEqual([FRIEND_ROWS[0], FRIEND_ROWS[1]]);
      expect(world(seed, []).clouds.some((c) => c.kind === 'friend')).toBe(false);
      expect(world(seed, FRIENDS).clouds.filter((c) => c.kind === 'friend')).toHaveLength(5);
    }
  });

  it('shows every kind of cloud early, so the player sees what the sky has before they have climbed far', () => {
    for (const seed of SEEDS) {
      const kinds = new Set<CloudKind>();
      const w = world(seed);
      for (let r = 0; r <= 11; r++) for (const c of w.row(r)) kinds.add(c.kind);
      for (const k of ['plain', 'sleepy', 'jelly', 'heart', 'music', 'rainbow', 'star'] as const)
        expect(kinds.has(k), `${k} in seed ${seed}`).toBe(true);
    }
  });

  it('is a little different in each of the three skies', () => {
    const count = (look: string, kind: CloudKind): number =>
      SEEDS.reduce((sum, s) => sum + world(s, FRIENDS, look).clouds.filter((c) => c.kind === kind).length, 0);
    expect(count('pink', 'heart')).toBeGreaterThan(count('red', 'heart'));
    expect(count('blue', 'star')).toBeGreaterThan(count('red', 'star'));
    expect(count('red', 'rainbow')).toBeGreaterThan(count('pink', 'rainbow'));
  });

  it('knows which clouds a height can show', () => {
    const w = world(3);
    for (const [top, bottom] of [
      [-300, 60],
      [-1500, -1100],
      [-3000, -2500],
      [-5000, -3000],
    ] as const) {
      const [first, last] = w.rowsIn(top, bottom);
      for (const c of w.clouds)
        if (c.y >= top && c.y <= bottom)
          expect(c.row >= first && c.row <= last, `cloud on row ${c.row} for ${top}..${bottom}`).toBe(true);
    }
  });

  it('says how high up a height is, from nothing at the meadow to everything at the gate', () => {
    const w = world(4);
    expect(w.altitude(0)).toBe(0);
    expect(w.altitude(w.gate.y)).toBe(1);
    expect(w.altitude(w.gate.y / 2)).toBeCloseTo(0.5, 6);
    expect(w.altitude(500)).toBe(0);
    expect(w.altitude(-1e6)).toBe(1);
  });

  it('plays a note by where a cloud is across the sky: the further right, the higher, from the bottom of the scale to the top', () => {
    expect(stepAt(0)).toBe(0);
    expect(stepAt(WORLD_W)).toBe(9);
    let last = -1;
    for (let x = 0; x <= WORLD_W; x += 10) {
      expect(stepAt(x)).toBeGreaterThanOrEqual(last);
      last = stepAt(x);
    }
  });
});
