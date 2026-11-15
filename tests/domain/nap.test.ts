import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../../src/content/props';
import { isNapping } from '../../src/domain/systems/leader';
import type { Crown, DomainEvent, World } from '../../src/domain/types';
import { dispatch, drainEvents } from '../../src/domain/world';
import { EAST } from '../../src/shared/compass';
import { LogicMap } from '../../src/shared/map';
import { makeWorld, meadow, run } from './fixtures';

const box = (cx: number, cy: number, half: number) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });
const BED = 'forest/nap-bed-1';
const STAND = 'forest/crown-1';

/**
 * The meadow with a bed to sleep in and a crown on its stand, in the open where nothing is in the
 * way.
 */
function bedroom(): LogicMap {
  const base = meadow();
  return LogicMap.parse({
    ...base,
    interactables: [
      ...base.interactables,
      {
        instanceId: BED,
        definitionId: 'nap-bed',
        pos: { x: 700, y: 1200 },
        hit: box(700, 1120, 90),
        approach: [{ pos: { x: 700, y: 1252 }, facing: 'east' }],
      },
      {
        instanceId: STAND,
        definitionId: 'crown-stand',
        pos: { x: 1000, y: 1200 },
        hit: box(1000, 1120, 60),
        approach: [{ pos: { x: 1000, y: 1256 }, facing: 'north' }],
      },
    ],
  });
}

const tap = (w: World, instanceId: string): void =>
  dispatch(w, { type: 'interact', commandId: `t-${instanceId}`, instanceId });
const watch = (w: World, seconds: number): DomainEvent[] => {
  const seen: DomainEvent[] = [];
  run(w, seconds, (x) => seen.push(...drainEvents(x)));
  return seen;
};
const dreams = (seen: DomainEvent[]): number => seen.filter((e) => e.type === 'effect' && e.effect === 'dream').length;
const asleep = (): World => {
  const w = makeWorld({ map: bedroom(), seed: 5 });
  tap(w, BED);
  run(w, 14);
  return w;
};

describe('the bed she naps in', () => {
  it('is a seat she lies down in, and the throne is the only other', () => {
    expect(PROP_DEFS['nap-bed']!.seat).toMatchObject({ nap: true });
    expect(PROP_DEFS.throne!.seat?.nap).toBeUndefined();
  });

  it('puts her to sleep when she has walked to it, her head to the east and her eyes shut, and not while she is on the way', () => {
    const w = makeWorld({ map: bedroom(), seed: 5 });
    tap(w, BED);
    run(w, 0.5);
    expect(isNapping(w)).toBe(false);
    run(w, 14);
    expect(w.leader.seat).toBe(BED);
    expect(isNapping(w)).toBe(true);
    expect(w.unicorns.wildstar!.anim).toMatchObject({ clip: 'rest', facing: EAST });
  });

  it('keeps her asleep for as long as she is left, through a spell, and goes back to sleep after it', () => {
    const w = asleep();
    dispatch(w, { type: 'cast', commandId: 'spell', unicornId: 'wildstar' });
    run(w, 6);
    expect(isNapping(w)).toBe(true);
    run(w, 30);
    expect(isNapping(w)).toBe(true);
    expect(w.unicorns.wildstar!.anim.clip).toBe('rest');
  });

  it("lets her breathe out z's while she sleeps, a few seconds apart, from where her head lies, and none while she is awake", () => {
    const w = makeWorld({ map: bedroom(), seed: 5 });
    expect(dreams(watch(w, 20))).toBe(0);
    tap(w, BED);
    run(w, 12);
    drainEvents(w);
    const seen = watch(w, 13);
    expect(dreams(seen)).toBeGreaterThanOrEqual(4);
    expect(dreams(seen)).toBeLessThanOrEqual(6);
    const first = seen.find((e) => e.type === 'effect' && e.effect === 'dream') as { at: { x: number; y: number } };
    const head = w.unicorns.wildstar!.pos;
    expect(first.at.x, 'to the east of her middle, where her head is').toBeGreaterThan(head.x);
    expect(first.at.y, 'high above where she stood').toBeLessThan(head.y - 100);
  });

  it("wakes her the moment she is sent anywhere, and the z's stop", () => {
    const w = asleep();
    dispatch(w, { type: 'move', commandId: 'up', destination: { x: 1000, y: 1500 } });
    expect(w.leader.seat).toBeNull();
    expect(isNapping(w)).toBe(false);
    drainEvents(w);
    expect(dreams(watch(w, 10))).toBe(0);
    expect(w.unicorns.wildstar!.anim.clip).not.toBe('rest');
  });
});

describe('the crown', () => {
  const crown = (w: World): boolean => w.crown.worn;

  it('goes on her head when she taps it on its stand, and back on the stand when she taps again', () => {
    const w = makeWorld({ map: bedroom(), seed: 5 });
    expect(crown(w)).toBe(false);
    tap(w, STAND);
    run(w, 14);
    expect(crown(w)).toBe(true);
    tap(w, STAND);
    run(w, 8);
    expect(crown(w)).toBe(false);
  });

  it('is taken only once however long she watches it, and sends up dust from her head when it is', () => {
    const w = makeWorld({ map: bedroom(), seed: 5 });
    tap(w, STAND);
    const seen = watch(w, 30);
    expect(crown(w)).toBe(true);
    const dust = seen.filter((e) => e.type === 'effect' && e.effect === 'fairy-dust');
    expect(dust.length).toBeGreaterThanOrEqual(1);
  });

  it('stays on her head through every door, because every world shares it', () => {
    const shared: Crown = { worn: false };
    const first = makeWorld({ map: bedroom(), seed: 5, crown: shared });
    tap(first, STAND);
    run(first, 14);
    expect(shared.worn).toBe(true);
    const next = makeWorld({ map: meadow(), seed: 6, crown: shared });
    expect(next.crown.worn).toBe(true);
    expect(makeWorld({ map: meadow(), seed: 7 }).crown.worn, 'a new game starts with the crown on its stand').toBe(
      false,
    );
  });

  it('is on a stand and nowhere else', () => {
    const takes = Object.values(PROP_DEFS).filter((d) => d.crown);
    expect(takes.map((d) => d.id)).toEqual(['crown-stand']);
  });
});
