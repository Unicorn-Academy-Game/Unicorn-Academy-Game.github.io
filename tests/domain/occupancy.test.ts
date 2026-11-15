import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/domain/config';
import { claimOn, homePlace, PASSING, passesThrough, ROOM } from '../../src/domain/occupancy';
import { unicornList } from '../../src/domain/ops';
import type { World } from '../../src/domain/types';
import { dispatch } from '../../src/domain/world';
import type { UnicornId } from '../../src/shared/ids';
import { distance, makeWorld, meadow, run } from './fixtures';

const FRIENDS: UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];

/** Two unicorns that are both standing, and for how long they have been nearer than `closer`. */
function standingTogether(world: World, seconds: number, closer: number): { longest: number; who: string } {
  const since = new Map<string, number>();
  let longest = 0;
  let who = '';
  run(world, seconds, (w) => {
    const all = unicornList(w);
    const live = new Set<string>();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        if (a.speed > 5 || b.speed > 5 || distance(a.pos, b.pos) >= closer) continue;
        const key = `${a.id}+${b.id}`;
        live.add(key);
        if (!since.has(key)) since.set(key, w.time);
        const held = w.time - since.get(key)!;
        if (held > longest) {
          longest = held;
          who = `${key} at t=${w.time.toFixed(1)} (${a.state.kind}, ${b.state.kind})`;
        }
      }
    }
    for (const key of [...since.keys()]) if (!live.has(key)) since.delete(key);
  });
  return { longest, who };
}

describe('nobody settles on top of anybody', () => {
  it.each([3, 11, 29, 47])(
    'a herd left alone in an open field never stands inside itself (seed %i)',
    (seed) => {
      const world = makeWorld({ map: meadow(), recruited: FRIENDS, seed });
      const { longest, who } = standingTogether(world, 150, CONFIG.herd.personal * 0.7);
      expect(longest, who).toBeLessThan(1);
    },
    120_000,
  );

  it('a herd that has been walked about stops standing inside itself too', () => {
    const world = makeWorld({ map: meadow(), recruited: FRIENDS, seed: 5 });
    for (const [i, to] of [
      { x: 900, y: 900 },
      { x: 600, y: 600 },
      { x: 1000, y: 1000 },
      { x: 500, y: 900 },
    ].entries()) {
      dispatch(world, { type: 'move', commandId: `m${i}`, destination: to });
      run(world, 14);
    }
    const { longest, who } = standingTogether(world, 60, CONFIG.herd.personal * 0.7);
    expect(longest, who).toBeLessThan(1);
  }, 120_000);
});

describe('who holds a place', () => {
  it('counts a unicorn standing there, and one on its way there', () => {
    const world = makeWorld({ map: meadow(), recruited: ['leaf', 'glacier'], seed: 2 });
    run(world, 1);
    const leaf = world.unicorns.leaf!;
    expect(claimOn(world, leaf.pos, [])).toBe('leaf');
    expect(claimOn(world, leaf.pos, ['leaf', 'wildstar', 'glacier'])).toBeNull();
    const far = { x: leaf.pos.x + ROOM * 5, y: leaf.pos.y };
    expect(claimOn(world, far, [])).toBeNull();
    // On its way: still nowhere near the place, but the place is spoken for.
    world.unicorns.glacier!.state = {
      kind: 'approaching',
      activity: 'graze',
      anchorId: 'forest/graze-1',
      slot: 0,
      partner: null,
      deadline: world.time + 10,
      to: far,
    };
    expect(claimOn(world, far, ['leaf'])).toBe('glacier');
    expect(claimOn(world, far, ['glacier'])).toBeNull();
  });

  it('counts the place a unicorn that is not following would go back to', () => {
    const world = makeWorld({ map: meadow(), recruited: ['leaf', 'glacier'], seed: 2 });
    run(world, 1);
    const glacier = world.unicorns.glacier!;
    const home = homePlace(world, glacier);
    glacier.pos = { x: home.x + 400, y: home.y };
    glacier.prev = { ...glacier.pos };
    glacier.state = { kind: 'seeking', until: world.time + 5 };
    expect(claimOn(world, home, ['leaf'])).toBe('glacier');
  });

  it('does not route past a unicorn that is standing in the way, but does past one that is walking', () => {
    const world = makeWorld({ map: meadow(), recruited: ['leaf'], seed: 2 });
    run(world, 1);
    const leaf = world.unicorns.leaf!;
    // Wildstar is somewhere else, so leaf is the only one the routes could pass.
    world.unicorns.wildstar!.pos = { x: 100, y: 1500 };
    const from = { x: leaf.pos.x - 300, y: leaf.pos.y };
    const through = [{ x: leaf.pos.x + 300, y: leaf.pos.y }];
    const around = [
      { x: leaf.pos.x - 300, y: leaf.pos.y + PASSING * 3 },
      { x: leaf.pos.x + 300, y: leaf.pos.y + PASSING * 3 },
    ];
    leaf.speed = 0;
    expect(passesThrough(world, from, through, 'glacier')).toBe(true);
    expect(passesThrough(world, from, around, 'glacier')).toBe(false);
    expect(passesThrough(world, from, through, 'leaf')).toBe(false);
    leaf.speed = 120;
    expect(passesThrough(world, from, through, 'glacier')).toBe(false);
  });
});

describe('a plan that is refused is never started', () => {
  /**
   * Every time a follower started an activity walk and gave it up again within a quarter of a
   * second.
   */
  function takenBack(world: World, seconds: number): string[] {
    const seen = new Map<UnicornId, { kind: string; at: number }>();
    const found: string[] = [];
    run(world, seconds, (w) => {
      for (const u of unicornList(w)) {
        const before = seen.get(u.id);
        if (before && before.kind !== u.state.kind) {
          const held = w.time - before.at;
          if (u.state.kind === 'following' && before.kind === 'approaching' && held < 0.25)
            found.push(
              `${u.id} set off to an activity and went back after ${held.toFixed(2)} s at t=${w.time.toFixed(2)}`,
            );
        }
        if (!before || before.kind !== u.state.kind) seen.set(u.id, { kind: u.state.kind, at: w.time });
      }
    });
    return found;
  }

  it.each([3, 11, 29])(
    'does not set off and turn straight back (seed %i)',
    (seed) => {
      const world = makeWorld({ map: meadow(), recruited: FRIENDS, seed });
      expect(takenBack(world, 120)).toEqual([]);
    },
    120_000,
  );
});
