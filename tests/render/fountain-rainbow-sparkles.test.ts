import { describe, expect, it, vi } from 'vitest';
import { ARCH, HORN_TIPS, WATER } from '../../src/content/fountain-horns';
import { PAINT, paintFront, RAINBOW, shimmerCrest } from '../../src/content/fountain-rainbow';
import { playEffect } from '../../src/render/fx/library';
import type { Spec } from '../../src/render/fx/system';
import { Counted } from './fx-box';

// The effects system takes its two blend modes from Phaser, which cannot be loaded without a
// window.
vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

/** The host of the rainbow, which the sparkles are measured from. */
const AT = { x: 2400, y: 1400 };
const HALF = HORN_TIPS.right.x;

/** The real effects system, which also writes down when each particle was asked for. */
class Watched extends Counted {
  time = 0;
  readonly seen: { time: number; spec: Spec }[] = [];

  override spawn(spec: Spec): void {
    this.seen.push({ time: this.time, spec });
    super.spawn(spec);
  }

  override update(dtMs: number): void {
    this.time += Math.min(dtMs, 100) / 1000;
    super.update(dtMs);
  }

  run(seconds: number): void {
    for (let i = 0; i < Math.round(seconds * 60); i++) this.frame();
  }

  /**
   * Asks for the sparkles of a rainbow that will stand for `seconds` more, as the world does when
   * it comes up or is given more time.
   */
  light(seconds: number, reduced = false, sparkles = 1): void {
    playEffect(this, { id: 'fountain-rainbow', at: AT, seconds }, reduced, sparkles);
  }

  where(test: (spec: Spec) => boolean, from = 0, to = Infinity): { time: number; spec: Spec }[] {
    return this.seen.filter((s) => s.time >= from && s.time < to && test(s.spec));
  }
}

/**
 * A rainbow that is cast, and then again `again` seconds into its life, when the world gives it the
 * time it has left up to its cap. It is run on for `tail` seconds after the rainbow ends, which is
 * long enough for the last grain of glitter to come down.
 */
function played(options: { again?: number; reduced?: boolean; sparkles?: number; tail?: number } = {}): Watched {
  const fx = new Watched(7);
  fx.light(RAINBOW.life, options.reduced, options.sparkles);
  const total = options.again === undefined ? RAINBOW.life : Math.min(RAINBOW.cap, options.again + RAINBOW.life);
  if (options.again !== undefined) {
    fx.run(options.again);
    fx.light(total - options.again, options.reduced, options.sparkles);
  }
  fx.run(total - (options.again ?? 0) + (options.tail ?? 4));
  return fx;
}

const grain = (s: Spec): boolean => s.sprite === 'fx-dot';
/**
 * What a grain of glitter leaves where it comes down: the one particle that is on the ground of the
 * water and not a grain.
 */
const landing = (s: Spec): boolean => s.y !== AT.y && !grain(s);
const glow = (s: Spec): boolean => s.sprite === 'fx-glow';
const twinkle = (s: Spec): boolean => s.anim === 'life' && s.y === AT.y;
/**
 * The sparkles that ride the arch: not the horns, not the glitter and not what it leaves on the
 * water.
 */
const edge = (s: Spec): boolean => s.y === AT.y && !grain(s) && !glow(s) && !twinkle(s);
const falling = (s: Spec): boolean => (s.gravity ?? 0) > 0;

/**
 * Where on the arch a sparkle was put, found back from where it is: which side, how far along from
 * the horn (0) to the apex (1), and how many arches out it is, which is 1 on the middle of the
 * bands.
 */
function locate(s: Spec): { side: 'left' | 'right'; share: number; ring: number } {
  const u = -(s.x - AT.x) / HALF;
  // A grain of glitter stands on the ground of the water it will come down on, so its height above
  // the line between the horns is less than its own.
  const v = ((s.z ?? 0) - (s.y - AT.y)) / ARCH.rise;
  const angle = Math.atan2(v, u);
  return {
    side: u > 0 ? 'left' : 'right',
    share: (u > 0 ? angle : Math.PI - angle) / (Math.PI / 2),
    ring: Math.hypot(u, v),
  };
}

describe('a source that is kept going', () => {
  it('starts once, and a second call for it only makes it run longer', () => {
    const fx = new Counted(1);
    const ticks: number[] = [];
    expect(fx.keep('a', 1, 0.25, (age) => ticks.push(age))).toBe(true);
    fx.update(100);
    expect(fx.keep('a', 2, 0.25, () => ticks.push(-1))).toBe(false);
    for (let i = 0; i < 160; i++) fx.update(1000 / 60);
    expect(
      ticks.every((t) => t >= 0),
      'the second call started nothing of its own',
    ).toBe(true);
    expect(
      ticks.length,
      'it ran for the time the second call gave it, a tick every quarter of a second',
    ).toBeGreaterThanOrEqual(8);
    expect(ticks.length).toBeLessThanOrEqual(10);
  });

  it('is not cut short by a call that asks for less than it has left', () => {
    const fx = new Counted(1);
    let last = 0;
    fx.keep('a', 2, 0.25, (age) => (last = age));
    fx.update(100);
    fx.keep('a', 0.3, 0.25, () => undefined);
    for (let i = 0; i < 150; i++) fx.update(1000 / 60);
    expect(last).toBeGreaterThan(1.5);
  });

  it('is started again by a call after it has ended, and tells each of its ticks how long it has run and how long it has left', () => {
    const fx = new Counted(1);
    const told: [number, number][] = [];
    fx.keep('a', 0.5, 0.25, (age, left) => told.push([age, left]));
    for (let i = 0; i < 60; i++) fx.update(1000 / 60);
    expect(told.map(([age, left]) => age + left)).toEqual([0.5, 0.5]);
    expect(told.map(([age]) => age)).toEqual([0, 0.25]);
    expect(fx.keep('a', 0.5, 0.25, () => undefined)).toBe(true);
  });

  it('keeps sources of different names apart', () => {
    const fx = new Counted(1);
    expect(fx.keep('a', 1, 0.25, () => undefined)).toBe(true);
    expect(fx.keep('b', 1, 0.25, () => undefined)).toBe(true);
  });
});

describe('the sparkles of the rainbow over the fountain', () => {
  describe('how many there are', () => {
    it('are never more than 60 alive at once at full quality, and about two fifths of that when effects are reduced', () => {
      const full = played();
      const reduced = played({ reduced: true });
      expect(full.peak, 'at full quality').toBeLessThanOrEqual(60);
      expect(full.peak, 'at full quality there is something to see').toBeGreaterThanOrEqual(30);
      expect(reduced.peak, 'when reduced').toBeLessThanOrEqual(24);
      expect(reduced.peak, 'when reduced there is still something').toBeGreaterThan(0);
      expect(played({ sparkles: 0.6 }).peak, 'with a profile that throws fewer').toBeLessThan(full.peak);
    });

    it('are no more when the rainbow is given more time, and no more at its cap', () => {
      for (const again of [0.3, 1.8, 4])
        expect(played({ again }).peak, `given more time at ${again}`).toBeLessThanOrEqual(60);
    });

    it('are all gone soon after the rainbow is, with the last of the glitter down', () => {
      for (const options of [{}, { reduced: true }, { again: 2 }]) {
        expect(played(options).liveCount, JSON.stringify(options)).toBe(0);
      }
    });
  });

  describe('at the horns', () => {
    it('light up with a glow and a four-point twinkle as the rainbow comes up, and with only the twinkle when effects are reduced', () => {
      for (const reduced of [false, true]) {
        const fx = played({ reduced });
        const start = (test: (s: Spec) => boolean): number[] =>
          fx
            .where(test, 0, 0.1)
            .map(({ spec }) => spec.x - AT.x)
            .sort((a, b) => a - b);
        expect(start(twinkle), `twinkles, reduced ${reduced}`).toEqual([HORN_TIPS.left.x, HORN_TIPS.right.x]);
        expect(start(glow), `glows, reduced ${reduced}`).toEqual(reduced ? [] : [HORN_TIPS.left.x, HORN_TIPS.right.x]);
        for (const { spec } of fx.where((s) => glow(s) || twinkle(s)))
          expect(spec.y, 'on the line between the horns').toBe(AT.y);
      }
    });

    it('light up once, and are not lit again by more time being given', () => {
      const again = played({ again: 2 });
      expect(again.where(glow, 0, 0.1)).toHaveLength(2);
      expect(again.where(twinkle, 0, 0.1)).toHaveLength(2);
      const alone = played();
      for (const [from, to] of [
        [1, 3],
        [2.2, 4.2],
      ])
        expect(again.where(glow, from, to).length, `${from} to ${to}`).toBe(alone.where(glow, from, to).length);
    });

    it('stay lit while the rainbow stands, and the last glow is dimmer and comes as it ends', () => {
      const fx = played();
      const glows = fx.where(glow);
      for (let from = 0.5; from < RAINBOW.life - 1; from += 1)
        expect(fx.where(glow, from, from + 1).length, `from ${from}`).toBeGreaterThan(0);
      const last = glows[glows.length - 1]!;
      expect(last.time).toBeGreaterThan(RAINBOW.life - 1);
      expect(last.spec.alpha!).toBeLessThan(glows[0]!.spec.alpha!);
    });
  });

  describe('on the arch', () => {
    it('trail the paint as it grows from the horns, each side at the front of it, and never ahead of it', () => {
      const fx = played();
      const trail = fx.where(edge, PAINT.begin, 0.9);
      expect(trail.length).toBeGreaterThan(10);
      for (const { time, spec } of trail) {
        const { share } = locate(spec);
        expect(share, `at ${time.toFixed(2)}`).toBeLessThanOrEqual(paintFront(time) + 0.08);
        expect(share, `at ${time.toFixed(2)}`).toBeGreaterThanOrEqual(paintFront(time) - 0.2);
      }
      expect(new Set(trail.map((t) => locate(t.spec).side))).toEqual(new Set(['left', 'right']));
      const mean = (xs: typeof trail): number => xs.reduce((sum, t) => sum + locate(t.spec).share, 0) / xs.length;
      expect(
        mean(trail.slice(trail.length / 2)) - mean(trail.slice(0, trail.length / 2)),
        'they travel from the horns to the apex',
      ).toBeGreaterThan(0.25);
    });

    it('ride the crest of the wave of light while the arch stands', () => {
      const fx = played();
      const glints = fx.where(edge, RAINBOW.form + 0.1, RAINBOW.life - RAINBOW.fade - 0.1);
      expect(glints.length).toBeGreaterThan(30);
      for (const { time, spec } of glints) {
        const [crest, share] = [shimmerCrest(time), locate(spec).share];
        expect(Math.min(Math.abs(share - crest), 1 - Math.abs(share - crest)), `at ${time.toFixed(2)}`).toBeLessThan(
          0.08,
        );
      }
    });

    it('are shed from the apex to the horns as the arch comes apart, and are not shed before it does', () => {
      const fx = played();
      const shed = fx.where((s) => edge(s) && falling(s));
      expect(shed.length).toBeGreaterThan(10);
      expect(shed[0]!.time, 'the first one').toBeGreaterThanOrEqual(RAINBOW.life - RAINBOW.fade - 0.1);
      const mean = (xs: typeof shed): number => xs.reduce((sum, t) => sum + locate(t.spec).share, 0) / xs.length;
      expect(
        mean(shed.slice(0, shed.length / 3)) - mean(shed.slice((shed.length * 2) / 3)),
        'they go down the arch',
      ).toBeGreaterThan(0.3);
      expect(
        fx.where((s) => edge(s) && !falling(s), RAINBOW.life - RAINBOW.fade + 0.3),
        'none of the rest after the fade is under way',
      ).toEqual([]);
    });

    it('stay on the bands of the arch', () => {
      for (const options of [{}, { reduced: true }, { again: 2 }]) {
        for (const { time, spec } of played(options).where(edge)) {
          expect(spec.y).toBe(AT.y);
          expect(spec.z!, `at ${time.toFixed(2)}`).toBeGreaterThanOrEqual(0);
          const { ring } = locate(spec);
          expect(ring, `at ${time.toFixed(2)}`).toBeGreaterThan(1 - (ARCH.bands * ARCH.band) / 2 / ARCH.rise - 0.02);
          expect(ring, `at ${time.toFixed(2)}`).toBeLessThan(1 + (ARCH.bands * ARCH.band) / 2 / ARCH.rise + 0.02);
        }
      }
    });
  });

  describe('on the water', () => {
    it('is glitter that lets go of the arch low down and comes down on the front of the basin as tiny sparkles on the water', () => {
      const fx = played();
      const grains = fx.where(grain);
      expect(grains.length).toBeGreaterThan(15);
      for (const { spec } of grains) expect(locate(spec).share, 'it lets go of the lower half').toBeLessThan(0.6);
      const landed = fx.where(landing);
      expect(landed.length, 'most of it comes down in the time it has').toBeGreaterThanOrEqual(grains.length - 3);
      for (const { spec } of landed) {
        const [x, y] = [(spec.x - AT.x - WATER.x) / WATER.rx, (spec.y - AT.y - WATER.y) / WATER.ry];
        expect(Math.hypot(x, y), `at ${spec.x}, ${spec.y}`).toBeLessThan(0.95);
        expect(y, 'in front of the middle of the water').toBeGreaterThan(0);
      }
    });

    it('takes a good two seconds to come down and drifts in toward the basin', () => {
      const fx = played();
      for (const { spec } of fx.where(grain)) {
        expect(spec.life).toBeGreaterThan(2.5);
        expect(Math.sign(spec.vx!) === Math.sign(AT.x - spec.x) || Math.abs(spec.vx!) < 5, 'toward the middle').toBe(
          true,
        );
      }
    });

    it('throws less than half the glitter when effects are reduced', () => {
      expect(played({ reduced: true }).where(grain).length).toBeLessThanOrEqual(played().where(grain).length * 0.5);
    });
  });

  describe('when the rainbow is given more time', () => {
    it('goes on with the same sparkles and not another set, so it is no busier than a rainbow that is not', () => {
      const again = played({ again: 2 });
      const alone = played();
      for (const kind of [edge, grain, glow, twinkle])
        expect(again.where(kind, 2.5, 5).length).toBe(alone.where(kind, 2.5, 5).length);
    });

    it('goes on for as long as the rainbow does, and is shed when the arch comes apart and not when it was going to', () => {
      const alone = played();
      const longer = played({ again: 2 });
      const end = Math.min(RAINBOW.cap, 2 + RAINBOW.life);
      expect(
        alone.where(edge, RAINBOW.life + 0.1),
        'a rainbow that is not given more time has none after its end',
      ).toEqual([]);
      expect(longer.where(edge, RAINBOW.life + 0.1).length, 'one that is has them to its end').toBeGreaterThan(5);
      const shed = longer.where((s) => edge(s) && falling(s));
      expect(shed[0]!.time, 'the first it sheds').toBeGreaterThanOrEqual(end - RAINBOW.fade - 0.1);
      expect(shed[shed.length - 1]!.time).toBeLessThanOrEqual(end);
      expect(longer.where(glow).at(-1)!.time, 'the horns are lit to the end').toBeGreaterThan(end - 1);
    });
  });
});
