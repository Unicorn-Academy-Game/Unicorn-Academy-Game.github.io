import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/domain/config';
import { animate } from '../../src/domain/ops';
import { startInPlace } from '../../src/domain/systems/idle';
import type { Performing, UnicornActor, World } from '../../src/domain/types';
import { dispatch, step } from '../../src/domain/world';
import { allFacings, CLIP_TIMING } from '../../src/shared/clips';
import {
  EAST,
  FACING_COUNT,
  facingAt,
  facingLabel,
  NORTH,
  NORTHEAST,
  NORTHWEST,
  SOUTH,
  SOUTHEAST,
  SOUTHWEST,
  sideOf,
  stepsBetween,
  UNICORN_FACINGS,
  type UnicornFacing,
  WEST,
} from '../../src/shared/compass';
import { CLIP_NAMES, type ClipName } from '../../src/shared/ids';
import { lcg } from '../random';
import { ALL, halt, hold, leaderOf, makeWorld, meadow, run, serpentine, steer, teleport } from './fixtures';

/** What `animate` reads and writes of a unicorn. */
interface Body {
  facing: UnicornFacing;
  anim: { clip: ClipName; facing: UnicornFacing; startedAt: number };
}
const body = (clip: ClipName, facing: UnicornFacing, startedAt = 0): Body => ({
  facing,
  anim: { clip, facing, startedAt },
});

/**
 * Asks for `clip` facing `facing` once a tick for `ticks` ticks, and says what was drawn after
 * each.
 */
function over(
  actor: Body,
  world: World,
  clip: ClipName,
  facing: UnicornFacing,
  ticks: number,
): { clip: ClipName; facing: UnicornFacing }[] {
  const drawn: { clip: ClipName; facing: UnicornFacing }[] = [];
  for (let i = 0; i < ticks; i++) {
    world.time += CONFIG.step;
    animate(actor, world, clip, facing);
    drawn.push({ clip: actor.anim.clip, facing: actor.anim.facing });
  }
  return drawn;
}

describe('turning what is drawn toward the facing she means', () => {
  it('goes through the facings between, a step a tick when the turn is short, and says where she means to go from the start', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('walk', EAST);
    const drawn: UnicornFacing[] = [];
    for (let i = 0; i < 6; i++) {
      animate(actor, world, 'walk', SOUTHEAST);
      drawn.push(actor.anim.facing);
      expect(actor.facing, `tick ${i}`).toBe(SOUTHEAST);
    }
    expect(drawn).toEqual([1, 2, 3, 4, 4, 4]);
  });

  it('turns farther faster, never more than the most in a tick, and settles a step at a time without going past', () => {
    const world = makeWorld({ recruited: [] });
    for (const [from, to] of [
      [EAST, WEST],
      [NORTH, SOUTH],
      [3, 20],
      [29, 12],
      [0, 9],
      [14, 15],
    ] as const) {
      const actor = body('walk', from);
      const sizes: number[] = [];
      let left = stepsBetween(from, to);
      for (let ticks = 0; left > 0 && ticks < 40; ticks++) {
        const before = actor.anim.facing;
        animate(actor, world, 'walk', to);
        sizes.push(stepsBetween(before, actor.anim.facing));
        // Each tick is nearer by exactly what it turned.
        expect(stepsBetween(actor.anim.facing, to), `${from} to ${to}`).toBe(left - sizes[sizes.length - 1]!);
        left = stepsBetween(actor.anim.facing, to);
      }
      expect(actor.anim.facing, `${from} to ${to}`).toBe(to);
      for (const size of sizes) {
        expect(size).toBeGreaterThanOrEqual(1);
        expect(size).toBeLessThanOrEqual(CONFIG.turn.fastest);
      }
      // The last steps come one at a time, and no step is bigger than the one before once she has
      // begun to settle.
      expect(sizes[sizes.length - 1]).toBe(1);
      const peak = sizes.indexOf(Math.max(...sizes));
      for (let i = peak + 1; i < sizes.length; i++)
        expect(sizes[i]!, `${from} to ${to}: ${sizes.join(' ')}`).toBeLessThanOrEqual(sizes[i - 1]!);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(stepsBetween(from, to));
    }
  });

  it('takes half a turn in about a quarter of a second, which is quick and is not a jump', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('walk', EAST);
    const drawn = over(actor, world, 'walk', WEST, 30).map((d) => d.facing);
    const arrived = drawn.indexOf(WEST) + 1;
    expect(arrived).toBeGreaterThanOrEqual(6);
    expect(arrived).toBeLessThanOrEqual(10);
    expect(arrived / CONFIG.stepHz).toBeLessThan(0.35);
  });

  it('turns the short way round the ring, and the clockwise way when two are opposite', () => {
    const world = makeWorld({ recruited: [] });
    const around = body('walk', 2);
    expect(over(around, world, 'walk', 30, 4).map((d) => d.facing)).toEqual([1, 0, 31, 30]);
    const back = body('walk', 30);
    expect(over(back, world, 'walk', 2, 4).map((d) => d.facing)).toEqual([31, 0, 1, 2]);
    const through = (from: UnicornFacing, to: UnicornFacing): UnicornFacing[] =>
      over(body('walk', from), world, 'walk', to, 12).map((d) => d.facing);
    // Clockwise on the map is east, south, west, north: from east to west she goes by the south,
    // and from west to east by the north.
    expect(
      through(EAST, WEST).every((f) => f >= 1 && f <= WEST),
      'east to west',
    ).toBe(true);
    expect(
      through(WEST, EAST).every((f) => (f >= WEST && f < FACING_COUNT) || f === EAST),
      'west to east',
    ).toBe(true);
    expect(
      through(NORTH, SOUTH).every((f) => f >= NORTH || f <= SOUTH),
      'north to south',
    ).toBe(true);
    expect(
      through(SOUTH, NORTH).every((f) => f >= SOUTH && f <= NORTH),
      'south to north',
    ).toBe(true);
  });

  it('is not a new pose: the clip goes on from where it was, and a change of clip begins it again', () => {
    const world = makeWorld({ recruited: [] });
    world.time = 5;
    const actor = body('idle', EAST, 1);
    over(actor, world, 'idle', SOUTHWEST, 6);
    expect(actor.anim.startedAt, 'a turn in standing').toBe(1);
    const now = world.time;
    animate(actor, world, 'walk', SOUTHWEST);
    expect(actor.anim.clip).toBe('walk');
    expect(actor.anim.startedAt, 'standing to walking').toBe(now);
    expect(actor.anim.facing, 'she walks on facing the way she was turned').not.toBe(EAST);
  });

  it('goes on to turn when asked again for the same facing, so a turn that is not told again still finishes', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('walk', EAST);
    animate(actor, world, 'walk', SOUTH);
    const drawn: UnicornFacing[] = [];
    // The caller says nothing new: it hands back the facing she means, which is what her facing
    // says.
    for (let i = 0; i < 12; i++) {
      animate(actor, world, 'walk', actor.facing);
      drawn.push(actor.anim.facing);
    }
    expect(drawn[drawn.length - 1]).toBe(SOUTH);
    expect(drawn).toEqual([...drawn].sort((a, b) => a - b));
    expect(actor.facing).toBe(SOUTH);
  });

  it('stands where she is when she means the facing she is drawn in', () => {
    const world = makeWorld({ recruited: [] });
    for (const f of UNICORN_FACINGS) {
      const actor = body('walk', f);
      animate(actor, world, 'walk', f);
      expect(actor.anim, facingLabel(f)).toEqual({ clip: 'walk', facing: f, startedAt: 0 });
    }
  });

  it('turns walking and standing both, and is never drawn in a facing the clip lacks', () => {
    const world = makeWorld({ recruited: [] });
    for (const clip of ['walk', 'idle'] as const) {
      for (const from of UNICORN_FACINGS) {
        for (const to of [0, 5, 12, 19, 25, 31] as const) {
          const actor = body(clip, from);
          for (const d of over(actor, world, clip, to, 10)) expect(allFacings(d.clip)).toContain(d.facing);
        }
      }
    }
  });
});

describe('a pose that is drawn only in a few facings', () => {
  it('is taken up once she is turned to one it has, and she stands and turns until then', () => {
    const world = makeWorld({ recruited: [] });
    for (const [from, side] of [
      [NORTHEAST, EAST],
      [SOUTHEAST, EAST],
      [NORTHWEST, WEST],
      [SOUTHWEST, WEST],
      [NORTH, EAST],
      [SOUTH, EAST],
    ] as const) {
      const actor = body('walk', from);
      const drawn = over(actor, world, 'graze', from, 12);
      const taken = drawn.findIndex((d) => d.clip === 'graze');
      expect(taken, facingLabel(from)).toBeGreaterThan(0);
      for (const d of drawn.slice(0, taken)) expect(d.clip, `${facingLabel(from)} while she turns`).toBe('idle');
      // She never snaps into it: what is drawn before is on the way, and the pose has the side she
      // leans to.
      expect(stepsBetween(drawn[taken - 1]!.facing, side), facingLabel(from)).toBeLessThanOrEqual(CONFIG.turn.fastest);
      for (const d of drawn.slice(taken)) expect(d, facingLabel(from)).toEqual({ clip: 'graze', facing: side });
      expect(actor.facing, facingLabel(from)).toBe(side);
      expect(sideOf(from)).toBe(side);
    }
  });

  it('begins at once when she is already turned to a side, and goes on from the side she was drawn in', () => {
    const world = makeWorld({ recruited: [] });
    for (const side of [EAST, WEST] as const) {
      const standing = body('idle', side);
      animate(standing, world, 'graze', side);
      expect(standing.anim).toMatchObject({ clip: 'graze', facing: side });
      // A step short of it she is there in the same tick, and two short of it a tick later.
      const near = body('idle', facingAt(side + 1));
      animate(near, world, 'graze', near.facing);
      expect(near.anim, `a step from ${side}`).toMatchObject({ clip: 'graze', facing: side });
      const two = body('idle', facingAt(side + 2));
      expect(
        over(two, world, 'graze', two.facing, 2).map((d) => d.clip),
        `two steps from ${side}`,
      ).toEqual(['idle', 'graze']);
    }
  });

  it('turns from the side she was drawn in when she goes back to walking, and not from the way she was before the pose', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('walk', NORTHEAST);
    over(actor, world, 'graze', NORTHEAST, 12);
    expect(actor.anim).toMatchObject({ clip: 'graze', facing: EAST });
    const drawn = over(actor, world, 'walk', SOUTHWEST, 3);
    expect(drawn[0]).toEqual({ clip: 'walk', facing: 3 });
    expect(drawn.map((d) => d.clip)).toEqual(['walk', 'walk', 'walk']);
  });

  it('is not waited for when the world waits on its frames: a cast is taken up at once, in the nearest of its four', () => {
    const world = makeWorld({ recruited: [] });
    expect(CLIP_TIMING.cast.releaseFrame).toBeDefined();
    for (const from of UNICORN_FACINGS) {
      const actor = body('idle', from);
      animate(actor, world, 'cast', from);
      expect(actor.anim.clip, facingLabel(from)).toBe('cast');
      expect(allFacings('cast')).toContain(actor.anim.facing);
      expect(actor.facing).toBe(actor.anim.facing);
    }
  });

  it('takes the nearest of its facings at once when she is already in a pose that has few', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('graze', EAST);
    animate(actor, world, 'drink', WEST);
    expect(actor.anim).toMatchObject({ clip: 'drink', facing: WEST });
  });

  it('is the same for every clip that has fewer than all the facings, and for none that has them all', () => {
    const world = makeWorld({ recruited: [] });
    for (const name of CLIP_NAMES) {
      const actor = body('idle', NORTHEAST);
      animate(actor, world, name, NORTHEAST);
      const every = allFacings(name).length === FACING_COUNT;
      const waits = !every && CLIP_TIMING[name].releaseFrame === undefined;
      expect(actor.anim.clip === 'idle' || actor.anim.clip === name, name).toBe(true);
      // Only a clip she cannot be turned through the facings of is waited for, and a cast, which
      // the world times by its frames, is not.
      expect(actor.anim.clip === 'idle' && name !== 'idle', name).toBe(waits);
    }
  });
});

describe('a pose she is turning to, and is called away from or has done with before it is shown', () => {
  /**
   * A herd on the meadow with Cinder set to graze, turned to face `from` and drawn standing, so
   * that the graze is not yet on the screen.
   */
  function grazingFrom(from: UnicornFacing): { world: World; cinder: UnicornActor } {
    const world = makeWorld({ map: meadow(), recruited: ALL.filter((id) => id !== 'wildstar') });
    const cinder = world.unicorns.cinder!;
    cinder.anim = { clip: 'idle', facing: from, startedAt: world.time };
    cinder.facing = from;
    startInPlace(world, cinder, 'graze');
    return { world, cinder };
  }
  const ticksOver = (seconds: number): number => Math.round(seconds * CONFIG.stepHz);
  /** Every clip she is drawn in over `ticks` ticks of the world. */
  const drawnOver = (world: World, cinder: UnicornActor, ticks: number): ClipName[] => {
    const clips: ClipName[] = [];
    for (let i = 0; i < ticks; i++) {
      step(world);
      clips.push(cinder.anim.clip);
    }
    return clips;
  };

  it('is turned to standing, and is not on the screen yet', () => {
    const { cinder } = grazingFrom(NORTH);
    expect(cinder.state.kind).toBe('performing');
    expect(cinder.anim.clip).toBe('idle');
    expect(stepsBetween(cinder.anim.facing, cinder.facing)).toBeGreaterThan(CONFIG.turn.fastest);
  });

  it('is dropped at once when Wildstar sets off, and is never shown for a blink', () => {
    const { world, cinder } = grazingFrom(NORTH);
    steer(world, { x: 0, y: 1 });
    const clips = drawnOver(world, cinder, ticksOver(0.6));
    expect(clips).not.toContain('graze');
    expect(cinder.state.kind).not.toBe('performing');
  });

  it('is shown for a moment before she goes, once it is on the screen', () => {
    const { world, cinder } = grazingFrom(NORTH);
    for (let i = 0; i < 10 && cinder.anim.clip !== 'graze'; i++) step(world);
    expect(cinder.anim.clip).toBe('graze');
    steer(world, { x: 0, y: 1 });
    // The pose has only just begun, and she is not drawn twitching into an activity and out again.
    expect(drawnOver(world, cinder, ticksOver(0.1))).toEqual(new Array(ticksOver(0.1)).fill('graze'));
    // She is out of it by the time the window for ending what she is doing has gone.
    const rest = drawnOver(world, cinder, ticksOver(CONFIG.idle.cancelWithin));
    expect(rest[rest.length - 1]).not.toBe('graze');
  });

  it('is not shown for a tick when its time is up on the tick she would be turned to it', () => {
    const { world, cinder } = grazingFrom(facingAt(EAST - 2));
    (cinder.state as Performing).endsAt = world.time;
    expect(cinder.anim.clip).toBe('idle');
    step(world);
    expect(cinder.state.kind).not.toBe('performing');
    expect(cinder.anim.clip).not.toBe('graze');
  });
});

describe('a turn is not flicked straight back', () => {
  const ticksIn = (seconds: number): number => Math.round(seconds * CONFIG.stepHz);
  const facings = (actor: Body, world: World, to: UnicornFacing, ticks: number): UnicornFacing[] =>
    over(actor, world, 'walk', to, ticks).map((d) => d.facing);

  it('holds a short turn back the other way for longer than a quarter of a second, and not for much longer', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('walk', 8);
    expect(facings(actor, world, 10, 1)).toEqual([9]);
    // The heading swings back over the line between two facings, and she keeps the one she has, so
    // that the picture is not turned and turned back inside a quarter of a second.
    expect(new Set(facings(actor, world, 8, ticksIn(0.23)))).toEqual(new Set([9]));
    // A heading that has really gone back is followed soon after.
    expect(facings(actor, world, 8, ticksIn(0.3)).pop()).toBe(8);
  });

  it('makes a turn back of a quarter turn at once, and holds one of a third of that', () => {
    const world = makeWorld({ recruited: [] });
    for (const [steps, made] of [
      [3, false],
      [8, true],
    ] as const) {
      const actor = body('walk', 0);
      expect(facings(actor, world, 1, 1)).toEqual([1]);
      const back = facingAt(1 - steps);
      expect(stepsBetween(1, back)).toBe(steps);
      expect(facings(actor, world, back, 1)[0] !== 1, `${steps} steps back`).toBe(made);
    }
  });

  it('holds nothing once the moment has passed, and nothing for a turn that goes on the same way', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('walk', 8);
    facings(actor, world, 10, 1);
    facings(actor, world, 9, ticksIn(0.5));
    expect(facings(actor, world, 8, 1)).toEqual([8]);
    expect(facings(body('walk', 8), world, 12, 6)).toEqual([9, 10, 11, 12, 12, 12]);
  });

  it('is remembered through a change of clip, and held standing as walking', () => {
    const world = makeWorld({ recruited: [] });
    const actor = body('walk', 8);
    over(actor, world, 'walk', 10, 1);
    const standing = over(actor, world, 'idle', 8, ticksIn(0.2));
    expect(standing.map((d) => d.clip)).toEqual(new Array(ticksIn(0.2)).fill('idle'));
    expect(new Set(standing.map((d) => d.facing))).toEqual(new Set([9]));
  });

  it('is a record kept for each unicorn, so that one who turns does not hold another', () => {
    const world = makeWorld({ recruited: [] });
    const a = body('walk', 8);
    const b = body('walk', 8);
    facings(a, world, 10, 1);
    expect(facings(b, world, 7, 1)).toEqual([7]);
  });
});

describe('looking about', () => {
  it('turns her at least thirty degrees each time, by many different amounts, to a facing she can be drawn in', () => {
    const turns = new Set<number>();
    let looks = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = makeWorld({ recruited: ['storm', 'cinder', 'glacier'], seed });
      const last = new Map<string, UnicornFacing>();
      run(w, 150, () => {
        for (const u of Object.values(w.unicorns)) {
          if (!u) continue;
          const lookingAbout = u.state.kind === 'performing' && u.state.activity === 'look-around';
          const was = last.get(u.id);
          last.set(u.id, u.facing);
          if (!lookingAbout || was === undefined || u.facing === was) continue;
          looks++;
          turns.add(stepsBetween(u.facing, was));
          // A look about is a turn of at least thirty degrees, or nobody would see it was one.
          expect(stepsBetween(u.facing, was) * (360 / FACING_COUNT), `${u.id}, seed ${seed}`).toBeGreaterThanOrEqual(
            30,
          );
          expect(allFacings(u.anim.clip)).toContain(u.anim.facing);
        }
      });
    }
    // Enough looks happened to say something, and a look about is not always the same quarter turn.
    expect(looks).toBeGreaterThan(20);
    expect(turns.size).toBeGreaterThan(5);
  });
});

describe('what a herd does in play', () => {
  /**
   * Plays a herd for a while with a scripted finger and returns the most facings any unicorn is
   * turned in one tick, and what she was doing.
   */
  function mostTurnedInATick(
    map: ReturnType<typeof meadow>,
    seed: number,
    seconds: number,
    drive: (w: World, tick: number) => void,
  ): { most: number; at: string } {
    const w = makeWorld({ map, recruited: ALL.filter((id) => id !== 'wildstar'), seed });
    const was = new Map<string, { clip: ClipName; facing: UnicornFacing }>();
    let most = 0;
    let at = '';
    for (let tick = 0; tick < seconds * CONFIG.stepHz; tick++) {
      drive(w, tick);
      step(w);
      for (const u of Object.values(w.unicorns)) {
        if (!u) continue;
        const before = was.get(u.id);
        was.set(u.id, { clip: u.anim.clip, facing: u.anim.facing });
        if (!before) continue;
        const turned = stepsBetween(before.facing, u.anim.facing);
        // A cast is taken up at once, in the nearest of its four, which is the one thing that turns
        // a unicorn at once.
        if (u.anim.clip === 'cast' && before.clip !== 'cast') continue;
        if (turned > most) {
          most = turned;
          at = `${u.id} ${before.clip} ${facingLabel(before.facing)} to ${u.anim.clip} ${facingLabel(u.anim.facing)} (${u.state.kind}) at ${w.time.toFixed(2)} s`;
        }
      }
    }
    return { most, at };
  }

  // Two turns can fall in one tick: a path's last leg and the pose she takes up when she gets there
  // each ask her to be turned.
  const MOST = 2 * CONFIG.turn.fastest;

  it('never turns anyone more than two turns in one tick while a finger leads her all over the meadow and the walled maze', () => {
    for (const [map, name] of [
      [meadow(), 'meadow'],
      [serpentine(), 'serpentine'],
    ] as const) {
      for (const seed of [1, 2, 3]) {
        let heading = 0.3 * seed;
        let until = 0;
        let held = true;
        const next = lcg(seed * 7919);
        const { most, at } = mostTurnedInATick(map, seed, 90, (w, tick) => {
          if (tick >= until) {
            const r = next();
            held = r > 0.12;
            heading += r < 0.45 ? (next() - 0.5) * 0.5 : r < 0.8 ? (next() - 0.5) * 2.2 : (next() - 0.5) * 2 * Math.PI;
            until = tick + Math.round((0.3 + next() * 1.8) * CONFIG.stepHz);
          }
          if (held) steer(w, { x: Math.cos(heading), y: Math.sin(heading) });
          else halt(w);
        });
        expect(most, `${name} ${seed}: ${at}`).toBeLessThanOrEqual(MOST);
      }
    }
  });

  it('never turns anyone more than two turns in one tick while taps send her across the map and the herd wanders and looks about', () => {
    for (const [map, name] of [
      [meadow(), 'meadow'],
      [serpentine(), 'serpentine'],
    ] as const) {
      for (const seed of [1, 2, 3]) {
        let again = 0;
        let tapped = 0;
        const next = lcg(seed * 104729);
        const { most, at } = mostTurnedInATick(map, seed, 120, (w, tick) => {
          if (tick >= again) {
            dispatch(w, {
              type: 'move',
              commandId: `m${++tapped}`,
              destination: { x: 150 + next() * 1500, y: 150 + next() * 1300 },
            });
            again = tick + Math.round((2 + next() * 6) * CONFIG.stepHz);
          }
        });
        expect(most, `${name} ${seed}: ${at}`).toBeLessThanOrEqual(MOST);
      }
    }
  });

  it('never flicks a picture away and back within a quarter of a second while a finger wanders', () => {
    const quarter = Math.round(0.25 * CONFIG.stepHz);
    /**
     * The times a series of facings goes to one and straight back to the one before it, within a
     * quarter of a second.
     */
    const flicks = (series: UnicornFacing[]): number => {
      const runs: { facing: UnicornFacing; ticks: number }[] = [];
      for (const facing of series) {
        const last = runs[runs.length - 1];
        if (last?.facing === facing) last.ticks++;
        else runs.push({ facing, ticks: 1 });
      }
      return runs.filter((run, i) => i >= 2 && run.facing === runs[i - 2]!.facing && runs[i - 1]!.ticks <= quarter)
        .length;
    };
    let turns = 0;
    for (const [wobble, every] of [
      [0.6, 2],
      [1.2, 3],
    ] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const w = makeWorld({ map: meadow(), recruited: ALL.filter((id) => id !== 'wildstar'), seed });
        const next = lcg(seed * 7919);
        let angle = next() * 2 * Math.PI;
        const seen = new Map<string, UnicornFacing[]>();
        for (let tick = 0; tick < 60 * CONFIG.stepHz; tick++) {
          if (tick % every === 0) {
            angle += (next() - 0.5) * wobble;
            steer(w, { x: Math.cos(angle), y: Math.sin(angle) });
          }
          step(w);
          for (const u of Object.values(w.unicorns)) if (u) seen.set(u.id, [...(seen.get(u.id) ?? []), u.anim.facing]);
        }
        for (const [id, series] of seen) {
          expect(flicks(series), `${id}, wobble ${wobble}, seed ${seed}`).toBe(0);
          turns += series.filter((f, i) => i > 0 && f !== series[i - 1]).length;
        }
      }
    }
    // The finger turned them about a great deal, so that nothing flicked is not for want of
    // turning.
    expect(turns).toBeGreaterThan(5000);
  });

  it('turns her through every facing as a finger goes once round, one step at a time', () => {
    const world = makeWorld({ recruited: [] });
    const seen: UnicornFacing[] = [];
    let angle = 0;
    for (let i = 0; i < 7 * CONFIG.stepHz; i++) {
      angle -= 0.04;
      hold(world, { x: Math.cos(angle), y: Math.sin(angle) }, CONFIG.step);
      const facing = leaderOf(world).anim.facing;
      if (seen[seen.length - 1] !== facing) seen.push(facing);
    }
    expect(new Set(seen).size).toBe(FACING_COUNT);
    seen.forEach((f, i) => {
      if (i > 0) expect(stepsBetween(seen[i - 1]!, f), `${seen[i - 1]} to ${f}`).toBe(1);
    });
  });

  it('turns her toward a finger that points the other way when she stands, in about a quarter of a second, and not in a jump', () => {
    const world = makeWorld({ recruited: [] });
    teleport(world, 'wildstar', { x: 700, y: 800 });
    run(world, 0.5);
    expect(leaderOf(world).anim).toMatchObject({ clip: 'idle', facing: EAST });
    const faces: UnicornFacing[] = [];
    hold(world, { x: -1, y: 0 }, 0.6, (w) => faces.push(leaderOf(w).anim.facing));
    expect(faces[0]).not.toBe(WEST);
    expect(faces).toContain(WEST);
    expect((faces.indexOf(WEST) + 1) / CONFIG.stepHz).toBeLessThan(0.35);
    faces.forEach((f, i) => {
      if (i > 0) expect(stepsBetween(faces[i - 1]!, f)).toBeLessThanOrEqual(CONFIG.turn.fastest);
    });
  });

  it('turns her round the circle she runs when a finger swings right round while she is at a run, a step or so a tick', () => {
    const world = makeWorld({ recruited: [] });
    teleport(world, 'wildstar', { x: 700, y: 800 });
    hold(world, { x: 1, y: 0 }, 0.5);
    const faces: UnicornFacing[] = [];
    hold(world, { x: -1, y: 0 }, 1, (w) => faces.push(leaderOf(w).anim.facing));
    expect(faces).toContain(WEST);
    // She runs a circle of a set size, so the turn takes the time it takes her to run half of it,
    // and she is drawn at each step of it.
    expect(new Set(faces).size).toBeGreaterThan(12);
    faces.forEach((f, i) => {
      if (i > 0) expect(stepsBetween(faces[i - 1]!, f)).toBeLessThanOrEqual(2);
    });
  });
});
