import { describe, expect, it } from 'vitest';
import { critterTop, hitTest, unicornTop } from '../../src/input/hit';
import { EAST, NORTH, NORTHEAST, NORTHWEST, SOUTHEAST, SOUTHWEST, type UnicornFacing } from '../../src/shared/compass';
import type { Vec2 } from '../../src/shared/ids';
import { lively, makeWorld } from '../domain/fixtures';

const MIN = 24;

describe('hitTest', () => {
  it('sends a tap on open ground to the ground', () => {
    const world = makeWorld();
    expect(hitTest(world, { x: 300, y: 300 }, MIN)).toEqual({ kind: 'ground', at: { x: 300, y: 300 } });
  });

  it('picks the unicorn when the tap lands on her body, above her feet', () => {
    const world = makeWorld();
    const w = world.unicorns.wildstar!;
    expect(hitTest(world, { x: w.pos.x + 20, y: w.pos.y - 50 }, MIN)).toEqual({ kind: 'unicorn', id: 'wildstar' });
  });

  it('takes the body she is drawn with: slantwise she is wider than her back and narrower than her side', () => {
    const world = makeWorld();
    const w = world.unicorns.wildstar!;
    const tapAt = (facing: UnicornFacing, dx: number) => {
      w.anim = { clip: 'idle', facing, startedAt: 0 };
      return hitTest(world, { x: w.pos.x + dx, y: w.pos.y - 63 }, MIN).kind;
    };
    expect(tapAt(NORTHEAST, 60)).toBe('unicorn');
    expect(tapAt(NORTH, 60)).toBe('ground');
    expect(tapAt(NORTHEAST, 87)).toBe('ground');
    expect(tapAt(EAST, 87)).toBe('unicorn');
    // The flipped diagonals are the same body turned about her feet.
    expect(tapAt(NORTHWEST, -60)).toBe('unicorn');
    expect(tapAt(NORTHWEST, 87)).toBe('ground');
    expect(tapAt(SOUTHEAST, 60)).toBe('unicorn');
    expect(tapAt(SOUTHWEST, -60)).toBe('unicorn');
  });

  it('does not take a tap on empty ground well beside a unicorn', () => {
    const world = makeWorld();
    const w = world.unicorns.wildstar!;
    expect(hitTest(world, { x: w.pos.x + 200, y: w.pos.y }, MIN).kind).toBe('ground');
  });

  it('prefers the unicorn over a prop it stands in front of', () => {
    const world = makeWorld();
    const w = world.unicorns.wildstar!;
    w.pos = { x: 800, y: 330 };
    expect(hitTest(world, { x: 800, y: 300 }, MIN).kind).toBe('unicorn');
  });

  it('picks a tappable prop inside its hit area', () => {
    const world = makeWorld();
    expect(hitTest(world, { x: 800, y: 280 }, MIN)).toEqual({ kind: 'prop', instanceId: 'forest/chest-1' });
  });

  it('treats a prop that only reacts to magic as ground', () => {
    const world = makeWorld();
    expect(hitTest(world, { x: 900, y: 380 }, MIN).kind).toBe('ground');
  });

  it('chooses the unicorn drawn in front when two overlap', () => {
    const world = makeWorld({ recruited: ['leaf'] });
    const a = world.unicorns.wildstar!;
    const b = world.unicorns.leaf!;
    a.pos = { x: 1000, y: 700 };
    b.pos = { x: 1060, y: 740 };
    expect(hitTest(world, { x: 1030, y: 690 }, MIN)).toEqual({ kind: 'unicorn', id: 'leaf' });
  });

  describe('two unicorns standing side by side, facing east', () => {
    const stand = (leafAt: Vec2) => {
      const world = makeWorld({ recruited: ['leaf'] });
      world.unicorns.wildstar!.pos = { x: 1000, y: 700 };
      world.unicorns.leaf!.pos = leafAt;
      for (const a of [world.unicorns.wildstar!, world.unicorns.leaf!])
        a.anim = { clip: 'idle', facing: EAST, startedAt: 0 };
      return world;
    };

    it('sends a tap in the middle of one of them to her, and not to the one drawn in front whose edge it is at', () => {
      // Leaf is 58 along and 2 nearer the camera. The tap is 25 behind Wildstar's middle and 83
      // behind Leaf's, right at the edge.
      const world = stand({ x: 1058, y: 702 });
      expect(hitTest(world, { x: 975, y: 651 }, MIN)).toEqual({ kind: 'unicorn', id: 'wildstar' });
    });

    it('sends a tap in the middle of both to the one drawn in front', () => {
      const world = stand({ x: 1058, y: 702 });
      expect(hitTest(world, { x: 1029, y: 651 }, MIN)).toEqual({ kind: 'unicorn', id: 'leaf' });
      world.unicorns.leaf!.pos = { x: 1058, y: 698 };
      expect(hitTest(world, { x: 1029, y: 651 }, MIN)).toEqual({ kind: 'unicorn', id: 'wildstar' });
    });

    it('sends a tap at the edge of both to the one whose middle it is nearer, even if she is drawn behind', () => {
      // Leaf is 120 along and 2 behind. The tap is 62 along Wildstar and 58 behind Leaf's middle.
      const world = stand({ x: 1120, y: 698 });
      expect(hitTest(world, { x: 1062, y: 650 }, MIN)).toEqual({ kind: 'unicorn', id: 'leaf' });
    });
  });

  it('keeps a small target tappable by growing it to the minimum size', () => {
    const world = makeWorld();
    // The cup's own area ends at y 1040. A tap 30 units below it lands on it only once the minimum
    // size is large.
    const tap = { x: 1000, y: 1070 };
    expect(hitTest(world, tap, 90)).toEqual({ kind: 'prop', instanceId: 'forest/cup-a' });
    expect(hitTest(world, tap, 10).kind).toBe('ground');
  });

  it('finds a friend who has not joined yet', () => {
    const world = makeWorld();
    const leaf = world.unicorns.leaf!;
    expect(hitTest(world, { x: leaf.pos.x, y: leaf.pos.y - 40 }, MIN)).toEqual({ kind: 'unicorn', id: 'leaf' });
  });

  describe('creatures', () => {
    const critterIn = (w: ReturnType<typeof makeWorld>, kind: string) => w.life.critters.find((c) => c.kind === kind)!;

    it('finds a creature where it is drawn, in the middle of its body', () => {
      const world = makeWorld({ map: lively() });
      const bunny = critterIn(world, 'bunny');
      expect(hitTest(world, { x: bunny.pos.x, y: bunny.pos.y - 30 }, MIN)).toEqual({ kind: 'critter', id: bunny.id });
    });

    it('finds one in the air where it hovers, and not on the ground below it', () => {
      const world = makeWorld({ map: lively() });
      const fairy = critterIn(world, 'fairy');
      expect(hitTest(world, { x: fairy.pos.x, y: fairy.pos.y - fairy.z - 46 }, MIN)).toEqual({
        kind: 'critter',
        id: fairy.id,
      });
      expect(hitTest(world, { x: fairy.pos.x, y: fairy.pos.y + 40 }, MIN).kind).toBe('ground');
    });

    it('keeps a tiny one tappable by growing it to the minimum size', () => {
      const world = makeWorld({ map: lively() });
      const bug = critterIn(world, 'ladybug');
      const tap = { x: bug.pos.x + 60, y: bug.pos.y - 8 };
      expect(hitTest(world, tap, 10).kind).toBe('ground');
      expect(hitTest(world, tap, 90)).toEqual({ kind: 'critter', id: bug.id });
    });

    it('goes to the creature that is drawn in front of a unicorn, and to the unicorn when the creature is behind', () => {
      const world = makeWorld({ map: lively() });
      const w = world.unicorns.wildstar!;
      const bunny = critterIn(world, 'bunny');
      w.pos = { x: 900, y: 700 };
      bunny.pos = { x: 905, y: 740 };
      bunny.prev = { ...bunny.pos };
      expect(hitTest(world, { x: 905, y: 710 }, MIN)).toEqual({ kind: 'critter', id: bunny.id });
      bunny.pos = { x: 905, y: 640 };
      bunny.prev = { ...bunny.pos };
      expect(hitTest(world, { x: 905, y: 670 }, MIN)).toEqual({ kind: 'unicorn', id: 'wildstar' });
    });

    it('goes to a creature in the air over a unicorn it hovers by', () => {
      const world = makeWorld({ map: lively() });
      const w = world.unicorns.wildstar!;
      const fairy = critterIn(world, 'fairy');
      w.pos = { x: 700, y: 700 };
      fairy.pos = { x: 700, y: 690 };
      fairy.prev = { ...fairy.pos };
      expect(hitTest(world, { x: 700, y: 690 - fairy.z - 46 }, MIN)).toEqual({ kind: 'critter', id: fairy.id });
    });

    it('goes to a creature before a prop whose area it overlaps', () => {
      const world = makeWorld({ map: lively() });
      const bird = critterIn(world, 'bird');
      bird.pos = { x: 800, y: 330 };
      bird.prev = { ...bird.pos };
      // The chest's tap area is around (800, 280).
      expect(hitTest(world, { x: 800, y: 330 - 24 }, MIN)).toEqual({ kind: 'critter', id: bird.id });
    });
  });
});

describe('the top of a body, where something that points at it hovers', () => {
  it('is where a tap stops landing on her, whichever way she faces', () => {
    const world = makeWorld();
    const w = world.unicorns.wildstar!;
    for (const facing of [EAST, NORTH, NORTHEAST, SOUTHWEST]) {
      w.anim = { clip: 'idle', facing, startedAt: 0 };
      const top = unicornTop(w);
      expect(top.x).toBe(w.pos.x);
      expect(hitTest(world, { x: top.x, y: top.y + 3 }, 0), `facing ${facing} just under`).toEqual({
        kind: 'unicorn',
        id: 'wildstar',
      });
      expect(hitTest(world, { x: top.x, y: top.y - 3 }, 0).kind, `facing ${facing} just over`).toBe('ground');
    }
  });

  it('is higher for a creature that is in the air, by how high it is', () => {
    const world = makeWorld({ map: lively() });
    const fairy = world.life.critters.find((c) => c.kind === 'fairy')!;
    const low = critterTop(fairy).y;
    fairy.z += 60;
    expect(critterTop(fairy).y).toBeCloseTo(low - 60);
    expect(hitTest(world, { x: fairy.pos.x, y: critterTop(fairy).y + 3 }, 0)).toEqual({
      kind: 'critter',
      id: fairy.id,
    });
  });
});
