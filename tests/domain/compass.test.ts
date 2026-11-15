import { describe, expect, it } from 'vitest';
import { allFacings, CLIP_TIMING, shownFacings } from '../../src/shared/clips';
import {
  angleOf,
  COMPASS_EIGHT,
  COMPASS_FOUR,
  cardinalOf,
  EAST,
  FACING_COUNT,
  FACING_STEP,
  facingAmong,
  facingAt,
  facingFor,
  facingLabel,
  facingNamed,
  facingOfCardinal,
  mirrorOf,
  NORTH,
  NORTHEAST,
  NORTHWEST,
  nearestAmong,
  parseFacing,
  SOUTH,
  SOUTHEAST,
  SOUTHWEST,
  sideOf,
  stepsBetween,
  stepToward,
  straightFacingFor,
  TURN_HYSTERESIS,
  UNICORN_FACINGS,
  type UnicornFacing,
  unicornFacingFor,
  vecOf,
  WEST,
} from '../../src/shared/compass';
import { CLIP_NAMES, FACINGS, type Facing, type Vec2 } from '../../src/shared/ids';

const at = (degrees: number): Vec2 => ({
  x: Math.cos((degrees * Math.PI) / 180),
  y: Math.sin((degrees * Math.PI) / 180),
});
const DIAGONALS = [NORTHEAST, SOUTHEAST, SOUTHWEST, NORTHWEST] as const;

/**
 * A repeatable stream of numbers from 0 up to 1, so a test that draws at random draws the same
 * thing every run.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the ring of facings', () => {
  it('has thirty-two, numbered from 0 clockwise on the map, each 11.25 degrees from the next', () => {
    expect(UNICORN_FACINGS).toHaveLength(32);
    expect(UNICORN_FACINGS.map(Number)).toEqual(Array.from({ length: 32 }, (_, i) => i));
    expect((FACING_STEP * 180) / Math.PI).toBe(11.25);
    expect(FACING_COUNT * FACING_STEP).toBeCloseTo(2 * Math.PI, 14);
  });

  it('names the eight of the old compass four steps apart, east first, and the four of everyone else among them', () => {
    expect(COMPASS_EIGHT).toEqual([EAST, SOUTHEAST, SOUTH, SOUTHWEST, WEST, NORTHWEST, NORTH, NORTHEAST]);
    COMPASS_EIGHT.forEach((f, i) => {
      expect(f).toBe(i * 4);
      expect(stepsBetween(f, COMPASS_EIGHT[(i + 1) % 8]!)).toBe(4);
    });
    expect(COMPASS_FOUR).toEqual([EAST, SOUTH, WEST, NORTH]);
  });

  it('point where they say on the map, a unit step each, and the named ones exactly', () => {
    for (const f of UNICORN_FACINGS) {
      const v = vecOf(f);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
      expect(v.x).toBeCloseTo(Math.cos(angleOf(f)), 12);
      expect(v.y).toBeCloseTo(Math.sin(angleOf(f)), 12);
    }
    const D = Math.SQRT1_2;
    expect(COMPASS_EIGHT.map(vecOf)).toEqual([
      { x: 1, y: 0 },
      { x: D, y: D },
      { x: 0, y: 1 },
      { x: -D, y: D },
      { x: -1, y: 0 },
      { x: -D, y: -D },
      { x: 0, y: -1 },
      { x: D, y: -D },
    ]);
    expect(vecOf(NORTHEAST).y).toBeLessThan(0);
    expect(vecOf(SOUTHWEST).x).toBeLessThan(0);
  });

  it('turn clockwise on the map as the number rises, and the angle runs from -pi to pi like atan2', () => {
    for (const f of UNICORN_FACINGS) {
      const a = angleOf(f);
      expect(a).toBeGreaterThan(-Math.PI);
      expect(a).toBeLessThanOrEqual(Math.PI);
      const next = ((f + 1) % FACING_COUNT) as UnicornFacing;
      const turn = Math.atan2(Math.sin(angleOf(next) - a), Math.cos(angleOf(next) - a));
      expect(turn).toBeCloseTo(FACING_STEP, 12);
    }
    expect(angleOf(SOUTH)).toBe(Math.PI / 2);
    expect(angleOf(WEST)).toBe(Math.PI);
    expect(angleOf(NORTH)).toBe(-Math.PI / 2);
    expect(angleOf(NORTHWEST)).toBe(-(3 * Math.PI) / 4);
  });

  it('gives back a copy of a direction, so nobody can change the compass by changing a heading', () => {
    const v = vecOf(EAST);
    v.x = 9;
    expect(vecOf(EAST)).toEqual({ x: 1, y: 0 });
  });

  it('count steps both ways round the circle, up to half of it', () => {
    for (const a of UNICORN_FACINGS) {
      expect(stepsBetween(a, a)).toBe(0);
      expect(stepsBetween(a, facingAt(a + 16))).toBe(16);
      expect(stepsBetween(a, facingAt(a + 1))).toBe(1);
      expect(stepsBetween(a, facingAt(a - 1))).toBe(1);
      for (const b of UNICORN_FACINGS) {
        expect(stepsBetween(a, b)).toBe(stepsBetween(b, a));
        expect(stepsBetween(a, b)).toBeLessThanOrEqual(16);
        for (const c of [0, 5, 13, 22, 31] as const)
          expect(stepsBetween(a, c)).toBeLessThanOrEqual(stepsBetween(a, b) + stepsBetween(b, c));
      }
    }
  });

  it('wrap a count of steps round the ring in either direction, however far', () => {
    expect(facingAt(0)).toBe(0);
    expect(facingAt(32)).toBe(0);
    expect(facingAt(33)).toBe(1);
    expect(facingAt(-1)).toBe(31);
    expect(facingAt(-33)).toBe(31);
    expect(facingAt(3200 + 7)).toBe(7);
    expect(facingAt(-0)).toBe(0);
    expect(facingAt(7.6)).toBe(8);
  });

  it('read and write as the manifest keys them, and only exactly so', () => {
    for (const f of UNICORN_FACINGS) expect(parseFacing(String(f))).toBe(f);
    for (const bad of ['', '-1', '32', '1.5', '01', ' 1', '1 ', '1e1', 'east', 'NaN', '0x1'])
      expect(parseFacing(bad), JSON.stringify(bad)).toBeUndefined();
  });

  it('say their name when they have one and their number when they do not', () => {
    expect(facingLabel(NORTHWEST)).toBe('20 (northwest)');
    expect(facingLabel(EAST)).toBe('0 (east)');
    expect(facingLabel(5)).toBe('5');
    for (const f of COMPASS_EIGHT) expect(facingNamed(facingLabel(f).replace(/^\d+ \((.*)\)$/, '$1'))).toBe(f);
    expect(facingNamed('upwards')).toBeUndefined();
    expect(facingNamed('5')).toBeUndefined();
  });
});

describe('the mirror of a facing', () => {
  it('is its horizontal flip: the same way up the map, turned left to right', () => {
    for (const f of UNICORN_FACINGS) {
      expect(vecOf(mirrorOf(f)).x).toBeCloseTo(-vecOf(f).x, 12);
      expect(vecOf(mirrorOf(f)).y).toBeCloseTo(vecOf(f).y, 12);
      expect(mirrorOf(mirrorOf(f))).toBe(f);
    }
  });

  it('leaves north and south where they are, swaps east and west, and sends the diagonals across', () => {
    expect([NORTH, SOUTH].map(mirrorOf)).toEqual([NORTH, SOUTH]);
    expect([EAST, WEST].map(mirrorOf)).toEqual([WEST, EAST]);
    expect([NORTHEAST, NORTHWEST, SOUTHEAST, SOUTHWEST].map(mirrorOf)).toEqual([
      NORTHWEST,
      NORTHEAST,
      SOUTHWEST,
      SOUTHEAST,
    ]);
  });

  it('keeps a facing on the same side of the screen as the side view it leans to, mirrored', () => {
    for (const f of UNICORN_FACINGS) if (mirrorOf(f) !== f) expect(sideOf(mirrorOf(f))).toBe(mirrorOf(sideOf(f)));
  });
});

describe('the side view a facing leans to', () => {
  it('is west for every facing that points left on the screen, east for every one that points right, and east for straight up and down', () => {
    for (const f of UNICORN_FACINGS) {
      const x = vecOf(f).x;
      expect(sideOf(f), `facing ${f}`).toBe(x < -1e-9 ? WEST : EAST);
    }
    expect([NORTH, SOUTH].map(sideOf)).toEqual([EAST, EAST]);
    expect([NORTHWEST, SOUTHWEST].map(sideOf)).toEqual([WEST, WEST]);
    expect(sideOf(facingAt(WEST + 1))).toBe(WEST);
    expect(sideOf(facingAt(WEST - 1))).toBe(WEST);
  });
});

describe('the four-way facing for a unicorn who stands in any of the 32', () => {
  it('is itself for a cardinal and the side view she leans to for a diagonal', () => {
    for (const f of FACINGS) expect(cardinalOf(facingOfCardinal(f))).toBe(f);
    expect(Object.fromEntries(DIAGONALS.map((f) => [f, cardinalOf(f)]))).toEqual({
      [NORTHEAST]: 'east',
      [SOUTHEAST]: 'east',
      [NORTHWEST]: 'west',
      [SOUTHWEST]: 'west',
    });
  });

  it('is the cardinal she is nearest, and for the ones exactly between, the side view', () => {
    for (const f of UNICORN_FACINGS) {
      const near = Math.min(...COMPASS_FOUR.map((c) => stepsBetween(f, c)));
      expect(stepsBetween(f, facingOfCardinal(cardinalOf(f))), String(f)).toBe(near);
      expect(near).toBeLessThanOrEqual(4);
    }
  });

  it('takes the same side on the left of the screen as the right, mirrored', () => {
    const mirrorName = (c: Facing): Facing => (c === 'east' ? 'west' : c === 'west' ? 'east' : c);
    for (const f of UNICORN_FACINGS) expect(cardinalOf(mirrorOf(f))).toBe(mirrorName(cardinalOf(f)));
  });

  it('turns a four-way facing into the same direction on the ring and back', () => {
    for (const f of FACINGS) {
      expect(COMPASS_FOUR).toContain(facingOfCardinal(f));
      expect(cardinalOf(facingOfCardinal(f))).toBe(f);
    }
    expect(facingOfCardinal('east')).toBe(EAST);
    expect(facingOfCardinal('south')).toBe(SOUTH);
    expect(facingOfCardinal('west')).toBe(WEST);
    expect(facingOfCardinal('north')).toBe(NORTH);
  });
});

describe('choosing among the facings a clip has', () => {
  const FOUR: readonly UnicornFacing[] = [EAST, NORTH, WEST, SOUTH];
  const SIDES: readonly UnicornFacing[] = [EAST, WEST];

  it('gives the facing itself when the clip has it', () => {
    for (const f of UNICORN_FACINGS) expect(nearestAmong(UNICORN_FACINGS, f)).toBe(f);
    for (const f of FOUR) expect(nearestAmong(FOUR, f)).toBe(f);
    for (const f of COMPASS_EIGHT) expect(nearestAmong(COMPASS_EIGHT, f)).toBe(f);
  });

  it('takes the side view for a diagonal when the clip has only four, never the back or the front', () => {
    expect(nearestAmong(FOUR, NORTHEAST)).toBe(EAST);
    expect(nearestAmong(FOUR, SOUTHEAST)).toBe(EAST);
    expect(nearestAmong(FOUR, NORTHWEST)).toBe(WEST);
    expect(nearestAmong(FOUR, SOUTHWEST)).toBe(WEST);
  });

  it('takes the side she is nearer to when the clip has only sides, and east when she is facing away or toward the viewer', () => {
    expect(nearestAmong(SIDES, WEST)).toBe(WEST);
    expect(nearestAmong(SIDES, SOUTHWEST)).toBe(WEST);
    expect(nearestAmong(SIDES, NORTHEAST)).toBe(EAST);
    expect(nearestAmong(SIDES, NORTH)).toBe(EAST);
    expect(nearestAmong(SIDES, SOUTH)).toBe(EAST);
  });

  it('is stable whatever order the clip lists its facings in', () => {
    for (const want of UNICORN_FACINGS) {
      expect(nearestAmong([...FOUR].reverse(), want)).toBe(nearestAmong(FOUR, want));
      expect(nearestAmong([...SIDES].reverse(), want)).toBe(nearestAmong(SIDES, want));
    }
  });

  it('takes the nearest by turning when a clip lacks the mirror of a diagonal it has', () => {
    const NW_ONLY: readonly UnicornFacing[] = [NORTHWEST, NORTH, WEST];
    expect(nearestAmong(NW_ONLY, NORTHEAST)).toBe(NORTH);
    expect(nearestAmong(NW_ONLY, SOUTHEAST)).toBe(WEST);
  });

  it('gives a facing between two of the eight the nearer one, and between two equally near the one nearer a side view', () => {
    expect(nearestAmong(COMPASS_EIGHT, 1)).toBe(EAST);
    expect(nearestAmong(COMPASS_EIGHT, 3)).toBe(SOUTHEAST);
    expect(nearestAmong(COMPASS_EIGHT, 2)).toBe(EAST);
    expect(nearestAmong(COMPASS_EIGHT, 6)).toBe(SOUTHEAST);
    expect(nearestAmong(COMPASS_EIGHT, 10)).toBe(SOUTHWEST);
    expect(nearestAmong(COMPASS_EIGHT, 26)).toBe(NORTHEAST);
    expect(nearestAmong(COMPASS_EIGHT, 22)).toBe(NORTHWEST);
    expect(nearestAmong(COMPASS_EIGHT, 30)).toBe(EAST);
    expect(nearestAmong(COMPASS_EIGHT, 18)).toBe(WEST);
  });

  it('chooses as it did when facings were names, wherever the old rule did not turn on the order of the list', () => {
    const NAMES = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'] as const;
    type Name = (typeof NAMES)[number];
    const steps = (a: Name, b: Name): number => {
      const d = Math.abs(NAMES.indexOf(a) - NAMES.indexOf(b));
      return Math.min(d, 8 - d);
    };
    const was = (among: readonly Name[], want: Name): Name => {
      const rank = (f: Name): number =>
        steps(f, want) * 4 + (f === 'east' || f === 'west' ? 0 : 2) + (f === 'west' ? 1 : 0);
      return among.reduce((best, f) => (rank(f) < rank(best) ? f : best));
    };
    const ring = (n: Name): UnicornFacing => (NAMES.indexOf(n) * 4) as UnicornFacing;
    let compared = 0;
    let oldWasArbitrary = 0;
    for (let mask = 1; mask < 256; mask++) {
      const among = NAMES.filter((_, i) => mask & (1 << i));
      for (const want of NAMES) {
        const answers = new Set<Name>();
        for (let r = 0; r < among.length; r++) {
          const turned = [...among.slice(r), ...among.slice(0, r)];
          answers.add(was(turned, want));
          answers.add(was([...turned].reverse(), want));
        }
        if (answers.size > 1) {
          oldWasArbitrary++;
          continue;
        }
        compared++;
        expect(nearestAmong(among.map(ring), ring(want)), `${among.join(',')} for ${want}`).toBe(
          ring(was(among, want)),
        );
      }
    }
    expect(compared).toBeGreaterThan(1800);
    expect(oldWasArbitrary).toBeGreaterThan(0);
  });

  it('is, for any set of facings, one of them, no further off than any other, and the same in any order', () => {
    const next = seeded(7);
    for (let round = 0; round < 300; round++) {
      const among = UNICORN_FACINGS.filter(() => next() < 0.15);
      if (among.length === 0) continue;
      const shuffled = [...among].sort(() => next() - 0.5);
      for (const want of UNICORN_FACINGS) {
        const got = nearestAmong(among, want);
        expect(among).toContain(got);
        expect(stepsBetween(got, want)).toBe(Math.min(...among.map((f) => stepsBetween(f, want))));
        expect(nearestAmong(shuffled, want), `${among} for ${want}`).toBe(got);
      }
    }
  });
});

describe('turning toward a heading with four facings, as people and creatures do', () => {
  // The turn rule the game had before unicorns got diagonals. People must keep turning exactly like
  // this.
  const FACING_ANGLE_OLD: Record<Facing, number> = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 };
  const diff = (a: number, b: number): number => {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  };
  function was(heading: Vec2, current: Facing, hysteresis = 0.2): Facing {
    if (heading.x === 0 && heading.y === 0) return current;
    const a = Math.atan2(heading.y, heading.x);
    if (diff(a, FACING_ANGLE_OLD[current]) <= Math.PI / 4 + hysteresis) return current;
    let best: Facing = current;
    let bestD = Infinity;
    for (const f of ['east', 'south', 'west', 'north'] as const) {
      const d = diff(a, FACING_ANGLE_OLD[f]);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  it('is what it was for every heading, every current facing and every slack', () => {
    for (const hysteresis of [0, 0.2, 0.5])
      for (const current of FACINGS)
        for (let degrees = -360; degrees <= 360; degrees += 0.5)
          expect(facingFor(at(degrees), current, hysteresis)).toBe(was(at(degrees), current, hysteresis));
  });

  it('never gives a diagonal', () => {
    for (let degrees = 0; degrees < 360; degrees += 1) expect(FACINGS).toContain(facingFor(at(degrees), 'east'));
  });
});

describe('stepping toward a facing', () => {
  it('moves the steps asked for the short way, and no farther than the facing it is going to', () => {
    for (const from of UNICORN_FACINGS) {
      for (const to of UNICORN_FACINGS) {
        const away = stepsBetween(from, to);
        for (let steps = 0; steps <= FACING_COUNT / 2 + 1; steps++) {
          const got = stepToward(from, to, steps);
          expect(stepsBetween(from, got), `${from} to ${to} by ${steps}`).toBe(Math.min(steps, away));
          expect(stepsBetween(got, to), `${from} to ${to} by ${steps}`).toBe(Math.max(0, away - steps));
        }
      }
    }
  });

  it('gets there by repeating, one step at a time, without once turning back', () => {
    for (const from of UNICORN_FACINGS) {
      for (const to of UNICORN_FACINGS) {
        let at = from;
        for (let left = stepsBetween(from, to); left > 0; left--) {
          const next = stepToward(at, to, 1);
          expect(stepsBetween(next, to), `${at} to ${to}`).toBe(left - 1);
          at = next;
        }
        expect(at).toBe(to);
      }
    }
  });

  it('takes the clockwise way, as the map shows it, to a facing exactly opposite', () => {
    expect(stepToward(EAST, WEST, 3)).toBe(3);
    expect(stepToward(WEST, EAST, 3)).toBe(19);
    expect(stepToward(SOUTH, NORTH, 3)).toBe(11);
    expect(stepToward(NORTH, SOUTH, 3)).toBe(27);
    for (const from of UNICORN_FACINGS)
      expect(stepToward(from, facingAt(from + FACING_COUNT / 2), 1), String(from)).toBe(facingAt(from + 1));
  });

  it('goes round the ring and not through the middle of the numbers', () => {
    expect(stepToward(1, 30, 3)).toBe(30);
    expect(stepToward(30, 1, 3)).toBe(1);
    expect(stepToward(2, 29, 1)).toBe(1);
    expect(stepToward(29, 2, 1)).toBe(30);
  });
});

describe('turning toward a heading, as a unicorn does', () => {
  const STEP = 360 / FACING_COUNT;
  const slackDegrees = (TURN_HYSTERESIS * 180) / Math.PI;

  it('lands on the facing a heading points at, from wherever she was facing', () => {
    for (const current of UNICORN_FACINGS)
      for (const f of UNICORN_FACINGS) expect(unicornFacingFor(vecOf(f), current, 0), `${current} to ${f}`).toBe(f);
    for (const current of UNICORN_FACINGS)
      for (const f of UNICORN_FACINGS)
        expect(unicornFacingFor(vecOf(f), current), `${current} to ${f} with the slack`).toBe(f);
  });

  it('turns to the nearest facing without slack, on either side of the boundary halfway to the next', () => {
    for (const f of UNICORN_FACINGS) {
      const boundary = f * STEP + STEP / 2;
      const next = ((f + 1) % FACING_COUNT) as UnicornFacing;
      expect(unicornFacingFor(at(boundary - 0.05), next, 0), `${f} short of its boundary`).toBe(f);
      expect(unicornFacingFor(at(boundary + 0.05), f, 0), `${f} past its boundary`).toBe(next);
    }
  });

  it('keeps her facing while she is not moving', () => {
    for (const f of UNICORN_FACINGS) expect(unicornFacingFor({ x: 0, y: 0 }, f)).toBe(f);
  });

  it('does not flicker when the path wobbles across a boundary, whichever side she was on', () => {
    const wobbles = (start: UnicornFacing, boundary: number, slack?: number): Set<UnicornFacing> => {
      const wobble = slackDegrees * 0.9;
      let facing = start;
      const seen = new Set<UnicornFacing>();
      for (let i = 0; i < 200; i++) {
        facing = unicornFacingFor(at(boundary + (i % 2 === 0 ? wobble : -wobble)), facing, slack);
        seen.add(facing);
      }
      return seen;
    };
    for (const f of UNICORN_FACINGS) {
      const boundary = f * STEP + STEP / 2;
      const next = ((f + 1) % FACING_COUNT) as UnicornFacing;
      expect([...wobbles(f, boundary)], `from ${f}`).toEqual([f]);
      expect([...wobbles(next, boundary)], `from ${next}`).toEqual([next]);
    }
    // Without the slack the same path does flicker, so the slack is what holds her steady.
    expect(wobbles(EAST, STEP / 2, 0).size).toBe(2);
  });

  it('still turns once the heading is past the slack, and not before', () => {
    let facing: UnicornFacing = EAST;
    for (const degrees of [0, 3, STEP / 2 + slackDegrees - 0.05]) facing = unicornFacingFor(at(degrees), facing);
    expect(facing).toBe(EAST);
    facing = unicornFacingFor(at(STEP / 2 + slackDegrees + 0.05), facing);
    expect(facing).toBe(1);
    for (const degrees of [STEP, STEP * 1.2, STEP * 1.5 + slackDegrees - 0.05])
      facing = unicornFacingFor(at(degrees), facing);
    expect(facing).toBe(1);
    facing = unicornFacingFor(at(STEP * 1.5 + slackDegrees + 0.05), facing);
    expect(facing).toBe(2);
  });

  it('visits all thirty-two in order, once each, when the heading turns once round either way', () => {
    for (const way of [1, -1]) {
      const visited: UnicornFacing[] = [EAST];
      let facing: UnicornFacing = EAST;
      for (let degrees = 0; degrees <= 360; degrees += 0.25) {
        facing = unicornFacingFor(at(way * degrees), facing);
        if (facing !== visited[visited.length - 1]) visited.push(facing);
      }
      const round = way === 1 ? [...UNICORN_FACINGS] : [EAST, ...[...UNICORN_FACINGS].reverse().slice(0, -1)];
      expect(visited, `turning ${way === 1 ? 'clockwise' : 'the other way'}`).toEqual([...round, EAST]);
    }
  });

  it('gives each facing about a thirty-second of the turn, a little more with the slack on both sides', () => {
    const span = new Map<UnicornFacing, [number, number]>();
    let facing: UnicornFacing = EAST;
    for (let degrees = 0; degrees <= 360; degrees += 0.05) {
      facing = unicornFacingFor(at(degrees), facing);
      const seen = span.get(facing);
      span.set(facing, seen ? [seen[0], degrees] : [degrees, degrees]);
    }
    for (const f of UNICORN_FACINGS) {
      if (f === EAST) continue;
      const [from, to] = span.get(f)!;
      expect(to - from, `facing ${f}`).toBeGreaterThan(STEP - 0.2);
      expect(to - from, `facing ${f}`).toBeLessThan(STEP + 2 * slackDegrees + 0.2);
    }
  });

  it('is never turned more than half a step and the slack away from where she is headed, and the slack is small beside a step', () => {
    expect(slackDegrees).toBeGreaterThan(0);
    expect(slackDegrees).toBeLessThan(STEP / 2);
    const pick = seeded(7);
    let facing: UnicornFacing = EAST;
    for (let i = 0; i < 20000; i++) {
      const degrees = pick() * 360;
      facing = unicornFacingFor(
        at(degrees),
        pick() < 0.5 ? facing : (Math.floor(pick() * FACING_COUNT) as UnicornFacing),
      );
      let off = Math.abs(degrees - facing * STEP) % 360;
      if (off > 180) off = 360 - off;
      expect(off, `${degrees} degrees turned to ${facing}`).toBeLessThanOrEqual(STEP / 2 + slackDegrees + 1e-9);
    }
  });

  it('holds a direction exactly on any of the 32 as that facing', () => {
    for (const f of UNICORN_FACINGS) {
      let facing: UnicornFacing = EAST;
      for (let i = 0; i < 3; i++) facing = unicornFacingFor(vecOf(f), facing);
      expect(facing).toBe(f);
    }
  });

  it('turns a gesture she makes in only the four straight views by the four straight facings', () => {
    for (const f of UNICORN_FACINGS) expect(COMPASS_FOUR).toContain(straightFacingFor(vecOf(f), f));
    expect(straightFacingFor(vecOf(NORTHEAST), EAST)).toBe(EAST);
    expect(straightFacingFor(vecOf(SOUTH), EAST, 0)).toBe(SOUTH);
  });
});

describe('turning toward a heading with all thirty-two facings', () => {
  it('lands on the facing a heading points at, from wherever she was facing', () => {
    for (const current of UNICORN_FACINGS)
      for (const f of UNICORN_FACINGS)
        expect(facingAmong(UNICORN_FACINGS, vecOf(f), current, 0), `${current} to ${f}`).toBe(f);
  });

  it('turns at the boundary halfway to the next, 5.625 degrees from each, and holds inside the slack', () => {
    const slack = 0.03;
    expect(facingAmong(UNICORN_FACINGS, at(5.6), 1, 0)).toBe(0);
    expect(facingAmong(UNICORN_FACINGS, at(5.65), 0, 0)).toBe(1);
    const edge = 5.625 + (slack * 180) / Math.PI;
    expect(facingAmong(UNICORN_FACINGS, at(edge - 0.05), 0, slack)).toBe(0);
    expect(facingAmong(UNICORN_FACINGS, at(edge + 0.05), 0, slack)).toBe(1);
  });

  it('does not flicker when the path wobbles across a boundary inside the slack, whichever side she was on', () => {
    const slack = 0.05;
    const wobble = ((slack * 180) / Math.PI) * 0.9;
    for (const start of [0, 1] as const) {
      let facing: UnicornFacing = start;
      const seen = new Set<UnicornFacing>();
      for (let i = 0; i < 200; i++) {
        facing = facingAmong(UNICORN_FACINGS, at(5.625 + (i % 2 === 0 ? wobble : -wobble)), facing, slack);
        seen.add(facing);
      }
      expect([...seen], `from ${start}`).toEqual([start]);
    }
  });

  it('visits all thirty-two in order, once each, when the heading turns once round', () => {
    const visited: UnicornFacing[] = [EAST];
    let facing: UnicornFacing = EAST;
    for (let degrees = 0; degrees <= 360; degrees += 0.25) {
      facing = facingAmong(UNICORN_FACINGS, at(degrees), facing, 0.03);
      if (facing !== visited[visited.length - 1]) visited.push(facing);
    }
    expect(visited).toEqual([...UNICORN_FACINGS, EAST]);
  });
});

describe('a facing among a few, where a wanted one is not an option', () => {
  it('turns by the same rule whatever the facings are', () => {
    const sides = [EAST, WEST] as const;
    expect(facingAmong(sides, at(10), WEST, 0)).toBe(EAST);
    expect(facingAmong(sides, at(170), EAST, 0)).toBe(WEST);
  });
});

describe('which facings each clip is shown in', () => {
  it('lists the eight for standing and walking, drawing the northwest and southwest and flipping the others', () => {
    for (const name of ['idle', 'walk'] as const) {
      expect([...shownFacings(name)].sort((a, b) => a - b)).toEqual([...COMPASS_EIGHT].sort((a, b) => a - b));
      expect([...CLIP_TIMING[name].mirrored!].sort((a, b) => a - b)).toEqual(
        [SOUTHEAST, NORTHEAST].sort((a, b) => a - b),
      );
      expect(CLIP_TIMING[name].facings).toEqual(expect.arrayContaining([NORTHWEST, SOUTHWEST]));
    }
  });

  it('keeps every other clip to the facings it was drawn in', () => {
    for (const name of CLIP_NAMES) {
      if (name === 'idle' || name === 'walk') continue;
      expect(CLIP_TIMING[name].mirrored).toBeUndefined();
      expect(shownFacings(name).every((f) => COMPASS_FOUR.includes(f) || f === NORTHWEST || f === SOUTHWEST)).toBe(
        true,
      );
    }
  });

  it('draws the other twenty-six facings of standing and walking in fine sheets, which are every facing the first sheet does not draw', () => {
    for (const name of ['idle', 'walk'] as const) {
      const fine = CLIP_TIMING[name].fine!;
      expect(fine).toHaveLength(26);
      expect(new Set(fine).size).toBe(26);
      expect([...fine].sort((a, b) => a - b)).toEqual(
        UNICORN_FACINGS.filter((f) => !CLIP_TIMING[name].facings.includes(f)),
      );
      expect([...allFacings(name)].sort((a, b) => a - b)).toEqual([...UNICORN_FACINGS]);
    }
  });

  it('draws in a fine sheet the two facings the first sheet shows flipped, so a flip is replaced by the picture drawn for the facing', () => {
    for (const name of ['idle', 'walk'] as const)
      for (const f of CLIP_TIMING[name].mirrored!) expect(CLIP_TIMING[name].fine).toContain(f);
  });

  it('has no fine facings for any other clip, which keep the facings they were drawn in', () => {
    for (const name of CLIP_NAMES) {
      if (name === 'idle' || name === 'walk') continue;
      expect(CLIP_TIMING[name].fine).toBeUndefined();
      expect([...allFacings(name)]).toEqual([...shownFacings(name)]);
    }
  });

  it('only flips a facing that is not drawn, from a facing that is', () => {
    for (const name of CLIP_NAMES) {
      const timing = CLIP_TIMING[name];
      for (const f of timing.mirrored ?? []) {
        expect(timing.facings).not.toContain(f);
        expect(timing.facings).toContain(mirrorOf(f));
      }
      expect(new Set(shownFacings(name)).size).toBe(shownFacings(name).length);
    }
  });
});
