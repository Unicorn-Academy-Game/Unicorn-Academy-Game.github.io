import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { Ascent, newSpot, PORTAL_RADIUS, PORTAL_RISE } from './ascent';
import { buildWorld, ROWS } from './world';

const sky = (seed: number) => buildWorld(new Rng(seed), ['leaf', 'glacier'], 'red');
const SEEDS = [1, 2, 3, 4, 5, 6];
const STARTS = [-1, 0, 5, 14, 28, ROWS - 1];

/** An ascent from the first cloud of a row, or from the mushroom. */
function from(seed: number, row: number): Ascent {
  const world = sky(seed);
  const c = row < 0 ? world.mushroom : world.row(row)[0]!;
  return new Ascent(world, { x: c.x, y: c.y, row });
}

describe('the finale flight', () => {
  it('begins where she stands and ends in the door to the moon', () => {
    for (const seed of SEEDS) {
      for (const row of STARTS) {
        const world = sky(seed);
        const c = row < 0 ? world.mushroom : world.row(row)[0]!;
        const a = new Ascent(world, { x: c.x, y: c.y, row });
        const start = a.at(0);
        expect(start.x).toBeCloseTo(c.x, 6);
        expect(start.y).toBeLessThan(c.y);
        const end = a.at(a.length);
        expect(end.x).toBeCloseTo(world.gate.x, 6);
        expect(end.y).toBeCloseTo(world.gate.y - PORTAL_RISE, 6);
        expect(PORTAL_RADIUS).toBeGreaterThan(40);
      }
    }
  });

  it('takes longer from low down than from the top, but not by as much as it is longer', () => {
    for (const seed of SEEDS) {
      const low = from(seed, -1);
      const top = from(seed, ROWS - 1);
      expect(low.seconds).toBeGreaterThan(top.seconds);
      expect(low.seconds).toBeLessThanOrEqual(9);
      expect(top.seconds).toBeGreaterThanOrEqual(2.6);
      expect(low.length / top.length).toBeGreaterThan(low.seconds / top.seconds);
    }
  });

  it('goes only up, never dipping below where it has been by more than a hop', () => {
    for (const seed of SEEDS) {
      for (const row of STARTS) {
        const a = from(seed, row);
        let highest = Infinity;
        let worst = 0;
        const spot = newSpot();
        for (let s = 0; s <= a.length; s += 4) {
          a.at(s, spot);
          highest = Math.min(highest, spot.y);
          worst = Math.max(worst, spot.y - highest);
        }
        expect(worst, `seed ${seed} from row ${row}`).toBeLessThan(46);
      }
    }
  });

  it('turns smoothly, so the unicorns that follow it do not whip about', () => {
    for (const seed of SEEDS) {
      for (const row of STARTS) {
        const a = from(seed, row);
        const here = newSpot();
        const there = newSpot();
        for (let s = 0; s + 6 <= a.length; s += 6) {
          a.at(s, here);
          a.at(s + 6, there);
          let turn = Math.abs(there.angle - here.angle);
          if (turn > Math.PI) turn = Math.PI * 2 - turn;
          // Measured over sixty skies the sharpest corner is 0.38 radians in six units. A hairpin
          // would be over 1.
          expect(turn, `seed ${seed} from row ${row} at ${s}`).toBeLessThan(0.55);
        }
      }
    }
  });

  it('stays inside the width of the sky, near enough', () => {
    for (const seed of SEEDS) {
      const a = from(seed, -1);
      const spot = newSpot();
      for (let s = 0; s <= a.length; s += 8) {
        a.at(s, spot);
        expect(spot.x).toBeGreaterThan(-60);
        expect(spot.x).toBeLessThan(860);
      }
    }
  });

  it('is slowest at the ends and fastest in the middle, and gets there on time', () => {
    const a = from(3, -1);
    expect(a.distanceAt(0)).toBe(0);
    expect(a.distanceAt(a.seconds)).toBeCloseTo(a.length, 6);
    expect(a.distanceAt(a.seconds * 3)).toBeCloseTo(a.length, 6);
    let last = 0;
    let fastest = 0;
    let fastestAt = 0;
    const dt = 0.05;
    for (let t = 0; t <= a.seconds; t += dt) {
      const d = a.distanceAt(t);
      expect(d).toBeGreaterThanOrEqual(last);
      if ((d - last) / dt > fastest) {
        fastest = (d - last) / dt;
        fastestAt = t;
      }
      last = d;
    }
    expect(fastestAt).toBeGreaterThan(a.seconds * 0.35);
    expect(fastestAt).toBeLessThan(a.seconds * 0.65);
    expect(a.distanceAt(dt) / dt).toBeLessThan(fastest * 0.2);
  });

  it('passes one cloud of every row above her, in order', () => {
    for (const seed of SEEDS) {
      for (const row of STARTS) {
        const world = sky(seed);
        const c = row < 0 ? world.mushroom : world.row(row)[0]!;
        const a = new Ascent(world, { x: c.x, y: c.y, row });
        expect(a.passes.map((p) => p.cloud.row)).toEqual(Array.from({ length: ROWS - 1 - row }, (_, i) => row + 1 + i));
        for (let i = 1; i < a.passes.length; i++) expect(a.passes[i]!.s).toBeGreaterThan(a.passes[i - 1]!.s);
        for (const p of a.passes) expect(p.s).toBeLessThanOrEqual(a.length);
      }
    }
  });

  it('says which clouds were crossed between two distances, each once', () => {
    const a = from(2, 0);
    expect(a.crossed(0, a.length)).toHaveLength(a.passes.length);
    const halves = [...a.crossed(0, a.length / 2), ...a.crossed(a.length / 2, a.length)];
    expect(halves.map((p) => p.cloud.id)).toEqual(a.passes.map((p) => p.cloud.id));
    expect(a.crossed(a.length, a.length + 99)).toHaveLength(0);
  });

  it('goes over each cloud it passes, above it and within its width', () => {
    for (const seed of SEEDS) {
      const a = from(seed, -1);
      const spot = newSpot();
      for (const p of a.passes) {
        a.at(p.s, spot);
        expect(Math.abs(spot.x - p.cloud.x), `seed ${seed} cloud ${p.cloud.id}`).toBeLessThan(p.cloud.width / 2);
        expect(spot.y).toBeLessThan(p.cloud.y);
      }
    }
  });
});
