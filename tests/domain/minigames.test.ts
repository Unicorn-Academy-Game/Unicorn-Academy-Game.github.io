import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../../src/content/props';
import type { DomainEvent, World } from '../../src/domain/types';
import { dispatch, drainEvents } from '../../src/domain/world';
import { LogicMap } from '../../src/shared/map';
import { makeWorld, meadow, run } from './fixtures';

const box = (cx: number, cy: number, half: number) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });

/** The meadow with the cloud and the bowl in it. */
function treasureRoom(): LogicMap {
  const base = meadow();
  return LogicMap.parse({
    ...base,
    interactables: [
      ...base.interactables,
      {
        instanceId: 'forest/rain-maker-1',
        definitionId: 'rain-maker',
        pos: { x: 700, y: 1200 },
        hit: box(700, 1120, 80),
        approach: [{ pos: { x: 700, y: 1290 }, facing: 'north' }],
      },
    ],
  });
}

const watch = (w: World, seconds: number): DomainEvent[] => {
  const seen: DomainEvent[] = [];
  run(w, seconds, (x) => seen.push(...drainEvents(x)));
  return seen;
};

describe('the cloud and the bowl', () => {
  it('start the treasure game', () => {
    expect(PROP_DEFS['rain-maker']).toMatchObject({ tap: 'minigame', minigame: 'treasure-rain' });
  });

  it('start it once when she taps, after she has walked up to it, and it bursts into jewels', () => {
    const w = makeWorld({ map: treasureRoom(), seed: 5 });
    dispatch(w, { type: 'interact', commandId: 'rain-1', instanceId: 'forest/rain-maker-1' });
    const seen = watch(w, 8);
    expect(seen.filter((e) => e.type === 'minigame-started')).toEqual([
      { type: 'minigame-started', game: 'treasure-rain', instanceId: 'forest/rain-maker-1' },
    ]);
    expect(seen.some((e) => e.type === 'effect' && e.effect === 'gem-burst')).toBe(true);
  });

  it('can be tapped again for another round, and nothing about it is saved', () => {
    const w = makeWorld({ map: treasureRoom(), seed: 5 });
    for (let i = 0; i < 3; i++) {
      dispatch(w, { type: 'interact', commandId: `rain-${i}`, instanceId: 'forest/rain-maker-1' });
      expect(
        watch(w, 8).filter((e) => e.type === 'minigame-started'),
        `tap ${i + 1}`,
      ).toHaveLength(1);
    }
    expect(w.persistent.props['forest/rain-maker-1']).toBeUndefined();
  });
});
