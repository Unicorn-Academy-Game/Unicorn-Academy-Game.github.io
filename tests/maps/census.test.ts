import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FACING_COUNT, stepsBetween, type UnicornFacing } from '../../src/shared/compass';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId } from '../../src/shared/ids';
import { mapContext } from '../../tools/maps/build-maps';
import { compileAll } from '../../tools/maps/compile';
import { type Census, type CensusOptions, report, runCensus } from '../../tools/qa/census-core';
import { ParticleWatch } from '../render/fx-box';

/**
 * What looks wrong to a child, counted over simulated play on every real map: unicorns that flicker
 * between poses, jump instead of walking, or stand inside each other. The numbers are a net under
 * the herd's behavior, not a goal: a change that makes them worse has made the game look worse.
 * `pnpm exec tsx tools/qa/census.ts` prints the same census with the details of each episode.
 *
 * Three plays: tapping where to go, leading with a finger held on the screen the way a child drags
 * it, and a finger that does everything a finger can, which is only held to the rules that can
 * never be broken.
 *
 * The same plays are drawn with the real effects system (see `tests/render/fx-box.ts`), to count
 * the particles alive at once.
 */

// The effects system takes its two blend modes from Phaser, which cannot be loaded without a
// window.
vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

/**
 * The most particles that may be alive at once. The pool holds more, so that tapping everything
 * never finds it empty.
 */
const MOST_PARTICLES = 250;

// The census taps a prop picked by chance, so every toy added to a map re-rolls the plays that
// reach it. The counts below sit a count or two above what any one roll has shown, and a change
// that makes the herd look worse moves them by far more than that. The beach, the river, the magic
// hall, the witch's hut and the Santa grove took the herd from nineteen places to twenty-four and
// the time played from 228 minutes to 288, and the palace rooms now hold more people to walk round,
// so the counts were set again from that roll: eight strays in the taps (two of them one event
// played from two starts), thirty twitches and fifty-eight followers stacked in the held play.
const TAPS: CensusOptions = { minutes: 3, seeds: 4, fast: 0.25, close: 60 };
const HELD: CensusOptions = { ...TAPS, steering: 0.7, styles: [0, 2, 4] };
const WILD: CensusOptions = { minutes: 2, seeds: 2, fast: 0.25, close: 60, steering: 0.9, styles: [1, 3] };

let maps: Record<MapId, CompiledMap['logic']>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'unicorn-census-'));
  try {
    const out = compileAll('assets/maps', dir, mapContext());
    maps = Object.fromEntries(
      out.map((o) => [
        o.id,
        CompiledMap.parse(JSON.parse(readFileSync(join(dir, o.file.replace(/^maps\//, '')), 'utf8'))).logic,
      ]),
    ) as Record<MapId, CompiledMap['logic']>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);

type Flicker = Census['flickers'][number];

/** What the census of one play is judged on, with the text that shows why when it fails. */
function judged(options: CensusOptions): {
  census: () => Census;
  particles: () => ParticleWatch['worst'];
  explain: () => string;
  share: (under: number) => number;
} {
  let census: Census;
  const watch = new ParticleWatch();
  beforeAll(() => {
    census = runCensus(maps, { ...options, inspect: watch.inspect });
  }, 600_000);
  return {
    census: () => census,
    particles: () => watch.worst,
    explain: () => `\n${report(census, options).join('\n')}`,
    share: (under) => (100 * census.closeness.under[under]!) / census.closeness.seconds,
  };
}

const isClip = (f: Flicker, pattern: string): boolean => f.field === 'clip' && f.pattern === pattern;
/** Two taps on the same unicorn a moment apart are two casts with a breath between them. */
const asked = (f: Flicker): boolean => isClip(f, 'cast > idle > cast');
/** Wildstar stopping for the length of one search when she is sent somewhere new is open work. */
const leaderStop = (f: Flicker): boolean => isClip(f, 'walk > idle > walk') && f.during.startsWith('leading');
/**
 * Her own idle moments (a look about, a rest, a nuzzle) start when she has stood still long enough.
 * A finger that comes down a moment after one has begun takes her away at once: she is under the
 * player's hand, so answering beats finishing the pose. The pose turns her to look at something and
 * the finger turns her back, which is one more event and not a second kind. Eight facings show it
 * where four hid it, when the way she was led and the way she looked fell in the same quarter.
 */
const leaderIdles = (f: Flicker): boolean =>
  f.where.endsWith(` wildstar.${f.field}`) &&
  f.during.startsWith('leading') &&
  f.during.includes('| performing:') &&
  (f.field === 'facing' || (f.field === 'clip' && /^idle > [a-z-]+ > idle$/.test(f.pattern)));
/** One step of the eight facings she was first drawn with, which is four of the thirty-two. */
const OLD_STEP = FACING_COUNT / 8;
/** How many steps round the ring the picture went out in a flicker of the facing. */
const swing = (f: Flicker): number => {
  const [from, to] = f.pattern.split(' > ').map(Number) as [UnicornFacing, UnicornFacing];
  return stepsBetween(from, to);
};
/**
 * The picture out and back by less than one step of the eight facings. Eight could not show that,
 * so the census never counted it. The picture turns at most three steps in a tick, so a facing
 * undone inside a quarter of a second is nearly always one. They come where a unicorn leaves a pose
 * and sets off, or leaves the path back for the trail. They are counted on their own, and a herd
 * that twitches more than it did still fails.
 */
const twitch = (f: Flicker): boolean => f.field === 'facing' && swing(f) < OLD_STEP;

describe('the herd, played for a while on every map', () => {
  const { census, particles, explain, share } = judged(TAPS);

  it('plays every map', () => {
    expect(census().herdMinutes).toBe(MAP_IDS.length * TAPS.seeds * TAPS.minutes);
  });

  it('breaks no structural rule', () => {
    expect(census().violations, explain()).toEqual({});
  });

  it('never finds Wildstar meant to move and standing still', () => {
    expect(census().leaderResets.stalled, explain()).toBe(0);
    // A tap is answered from the main ground of the place, so from taps alone she is almost never
    // set down.
    expect(census().leaderResets.misplaced, explain()).toBeLessThanOrEqual(2);
  });

  it('never moves a unicorn faster than it walks, apart from the turn of a hairpin', () => {
    expect(census().jumps.worst, explain()).toBeLessThanOrEqual(20);
    // A follower that has caught up on a long run is pushed aside as it passes, a jump of up to its
    // running speed, 14 units a step. The garden, the stable, the throne room and the treasure
    // house have about twenty each.
    expect(census().jumps.count / census().jumps.steps, explain()).toBeLessThan(0.00019);
  });

  it('does not make a unicorn change what it is doing and change it straight back', () => {
    const strays = census().flickers.filter((f) => !asked(f) && !leaderStop(f) && !twitch(f));
    expect(strays.length, explain()).toBeLessThanOrEqual(9);
    // Nobody who is not leading flickers between walking and standing.
    expect(
      census().flickers.filter((f) => f.pattern === 'walk > idle > walk' && !leaderStop(f)),
      explain(),
    ).toEqual([]);
  });

  it('seldom turns a picture a step or three to one side and straight back', () => {
    expect(census().flickers.filter(twitch).length, explain()).toBeLessThanOrEqual(20);
  });

  it('keeps unicorns out of each other', () => {
    // Wildstar walking back through the herd is a pass, which is brief and side to side. Two
    // followers inside each other is the bug.
    const followers = census().stacks.filter((s) => !s.pair.includes('wildstar'));
    // Two followers released from a nuzzle at the same moment may cross as they rejoin the trail.
    // Six rooms of the palace share a north-west corner, (133, 416), where Wildstar stops with the
    // herd east of her. When she sets off east the followers run back to the start of her trail and
    // pass through each other on the way, at 31 and 43 apart for 0.5 s and 0.7 s, so that one pair
    // of crossings is counted in all six rooms at the same second.
    expect(followers.length, explain()).toBeLessThanOrEqual(27);
    expect(census().stacks.length / census().herdMinutes, explain()).toBeLessThan(0.34);
    expect(share(45), explain()).toBeLessThan(1.5);
    expect(share(60), explain()).toBeLessThan(3);
  });

  it('brings the herd in clear of itself on every map', () => {
    for (const a of census().arrivals)
      expect(Math.min(a.nearest, a.settled), `${a.where}${explain()}`).toBeGreaterThan(40);
  });

  it('does that over enough play to mean something', () => {
    expect(census().arrivals.length).toBeGreaterThan(20);
    expect(census().jumps.steps).toBeGreaterThan(100_000);
  });

  it('reports itself', () => {
    expect(report(census(), TAPS).join('\n')).toContain('minutes of herd time played');
  });

  it('lights the screen with no more particles than may be alive at once', () => {
    expect(particles().live, `the busiest moment was ${particles().where}`).toBeLessThanOrEqual(MOST_PARTICLES);
    // A count that was never made would pass the line above.
    expect(particles().live, 'the play should light the screen').toBeGreaterThan(100);
  });
});

describe('the herd, led by a finger held on the screen', () => {
  const { census, particles, explain, share } = judged(HELD);

  it('plays every map, mostly with the finger down', () => {
    expect(census().herdMinutes).toBe(MAP_IDS.length * HELD.seeds * HELD.minutes);
    expect(census().jumps.steps).toBeGreaterThan(100_000);
  });

  it('breaks no structural rule, and never has to pick anyone up and put them back', () => {
    // Every unicorn is standable at every step, never slides further than it can walk, and the
    // trail still ends at Wildstar.
    expect(census().violations, explain()).toEqual({});
    // A follower who cannot find her way back is put on the trail. That is one play in every three
    // or four, so four seeds see one or two.
    expect(census().relocations, explain()).toBeLessThanOrEqual(5);
  });

  it('never finds Wildstar meant to move and standing still, and seldom has to set her down', () => {
    expect(census().leaderResets.stalled, explain()).toBe(0);
    // A finger can lead her into a nook that no route can start from, and the tap that follows puts
    // her back on open ground.
    expect(census().leaderResets.misplaced, explain()).toBeLessThanOrEqual(8);
  });

  it('moves no unicorn further in a step than the cap, give or take the push out of a wall', () => {
    expect(census().jumps.worst, explain()).toBeLessThanOrEqual(16);
    expect(census().jumps.count / census().jumps.steps, explain()).toBeLessThan(0.0007);
  });

  it('does not make anyone change what they are doing and change it straight back', () => {
    const strays = census().flickers.filter((f) => !asked(f) && !leaderStop(f) && !leaderIdles(f) && !twitch(f));
    expect(strays.length, explain()).toBeLessThanOrEqual(3);
    expect(
      census().flickers.filter((f) => f.pattern === 'walk > idle > walk' && !leaderStop(f)),
      explain(),
    ).toEqual([]);
  });

  it('seldom turns a picture a step or three to one side and straight back', () => {
    expect(census().flickers.filter(twitch).length, explain()).toBeLessThanOrEqual(32);
  });

  it('keeps followers out of each other, and Wildstar from standing on anyone for long', () => {
    // A finger that turns right round walks her back through the herd, and a small room holds six
    // unicorns only just. The longest stand-off is the north hall of the treasure house, one
    // unicorn wide and shorter than the herd is long. A finger held against a wall keeps her where
    // she is, and followers who have come to their places beside her stand there until she moves. A
    // pair that is stuck stays so to the end of the visit, which is why the longest stand-off is
    // bounded as well as the number of them.
    const followers = census().stacks.filter((s) => !s.pair.includes('wildstar'));
    expect(followers.length, explain()).toBeLessThanOrEqual(68);
    expect(census().stacks.length / census().herdMinutes, explain()).toBeLessThan(1.9);
    expect(share(30), explain()).toBeLessThan(1.6);
    expect(share(45), explain()).toBeLessThan(4.3);
    expect(share(60), explain()).toBeLessThan(8);
    expect(Math.max(0, ...census().stacks.map((s) => s.seconds)), explain()).toBeLessThan(45);
  });

  it('brings the herd in clear of itself through every door', () => {
    for (const a of census().arrivals)
      expect(Math.min(a.nearest, a.settled), `${a.where}${explain()}`).toBeGreaterThan(40);
  });

  it('lights the screen with no more particles than may be alive at once', () => {
    expect(particles().live, `the busiest moment was ${particles().where}`).toBeLessThanOrEqual(MOST_PARTICLES);
    expect(particles().live, 'the play should light the screen').toBeGreaterThan(100);
  });
});

describe('the herd, led by a finger that goes everywhere', () => {
  const { census, explain } = judged(WILD);

  it('still breaks no structural rule, and still keeps everyone on their feet', () => {
    expect(census().herdMinutes).toBe(MAP_IDS.length * WILD.seeds * WILD.minutes);
    expect(census().violations, explain()).toEqual({});
    expect(census().relocations, explain()).toBeLessThanOrEqual(2);
    expect(census().jumps.worst, explain()).toBeLessThanOrEqual(16);
    expect(census().leaderResets.stalled, explain()).toBe(0);
    expect(census().leaderResets.misplaced, explain()).toBeLessThanOrEqual(4);
  });
});
