import { describe, expect, it } from 'vitest';
import { EFFECT_IDS } from '../../src/content/activities';
import { PROP_DEFS } from '../../src/content/props';
import { reseat } from '../../src/domain/systems/footing';
import type { DomainEvent, World } from '../../src/domain/types';
import { dispatch, drainEvents } from '../../src/domain/world';
import { SOUND_FAMILIES } from '../../src/shared/audio';
import { facingOfCardinal } from '../../src/shared/compass';
import { LogicMap } from '../../src/shared/map';
import { makeWorld, meadow, run, steer } from './fixtures';

const DELIGHTS = Object.values(PROP_DEFS).filter((d) => d.tap === 'delight');
const box = (cx: number, cy: number, half: number) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });

/** The meadow with a harp, a throne to sit in and a palace door that leads on to another place. */
function hall(): LogicMap {
  const base = meadow();
  return LogicMap.parse({
    ...base,
    portals: [
      ...base.portals,
      {
        portalId: 'to-palace',
        bounds: { x: 600, y: 1360, w: 120, h: 30 },
        approach: { x: 660, y: 1330 },
        door: 'forest/palace-1',
        to: { mapId: 'palace-hall', spawnId: 'from-garden' },
      },
    ],
    interactables: [
      ...base.interactables,
      {
        instanceId: 'forest/harp-1',
        definitionId: 'harp',
        pos: { x: 700, y: 1200 },
        hit: box(700, 1120, 80),
        approach: [{ pos: { x: 700, y: 1290 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/throne-1',
        definitionId: 'throne',
        pos: { x: 1000, y: 1200 },
        hit: box(1000, 1120, 80),
        approach: [{ pos: { x: 1000, y: 1290 }, facing: 'south' }],
      },
      {
        instanceId: 'forest/palace-1',
        definitionId: 'palace-door',
        pos: { x: 660, y: 1400 },
        hit: box(660, 1380, 80),
        approach: [{ pos: { x: 660, y: 1330 }, facing: 'north' }],
      },
    ],
  });
}

const world = (): World => makeWorld({ map: hall(), seed: 77 });
const watch = (w: World, seconds: number): DomainEvent[] => {
  const seen: DomainEvent[] = [];
  run(w, seconds, (x) => seen.push(...drainEvents(x)));
  return seen;
};
const tap = (w: World, instanceId: string): void =>
  dispatch(w, { type: 'interact', commandId: `t-${instanceId}`, instanceId });

describe('things to enjoy', () => {
  it('each say what they do, with an effect and a sound that exist', () => {
    expect(DELIGHTS.length).toBeGreaterThan(0);
    for (const d of DELIGHTS) {
      expect(d.delight, `${d.id} has a delight`).toBeDefined();
      expect(EFFECT_IDS, d.id).toContain(d.delight!.effect);
      expect(d.delight!.sound in SOUND_FAMILIES, d.id).toBe(true);
      expect(d.delight!.seconds, d.id).toBeGreaterThan(0);
      expect(d.delight!.hop, d.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('sparkle, sound and hop at the prop when she casts at it, and nothing about it is saved', () => {
    const w = world();
    tap(w, 'forest/harp-1');
    const seen = watch(w, 6);
    const harp = PROP_DEFS.harp!.delight!;
    const activity = seen.filter((e) => e.type === 'prop-activity' && e.instanceId === 'forest/harp-1');
    expect(activity).toEqual([
      { type: 'prop-activity', instanceId: 'forest/harp-1', activity: 'delight', seconds: harp.seconds },
    ]);
    const sparkle = seen.find((e) => e.type === 'effect' && e.effect === harp.effect);
    expect(sparkle, 'the effect starts').toBeDefined();
    // It starts up in the air, where the harp's strings are, not on the floor.
    expect(w.interactables.get('forest/harp-1')!.pos.y - (sparkle as { at: { y: number } }).at.y).toBe(harp.lift);
    expect(w.persistent.props['forest/harp-1']).toBeUndefined();
  });

  it('can be tapped again and again without ever running out', () => {
    const w = world();
    for (let i = 0; i < 3; i++) {
      tap(w, 'forest/harp-1');
      const seen = watch(w, 6);
      expect(
        seen.filter((e) => e.type === 'prop-activity' && e.activity === 'delight'),
        `tap ${i + 1}`,
      ).toHaveLength(1);
    }
  });
});

describe('the throne', () => {
  const throne = 'forest/throne-1';

  it('is a seat, and nothing else that is only enjoyed is but the bed she naps in', () => {
    expect(PROP_DEFS.throne!.seat).toBeDefined();
    expect(DELIGHTS.filter((d) => d.seat).map((d) => d.id)).toEqual(['throne', 'nap-bed']);
  });

  it('seats her when she has walked to it, and not while she is on the way', () => {
    const w = world();
    tap(w, throne);
    run(w, 0.5);
    expect(w.leader.seat).toBeNull();
    run(w, 12);
    expect(w.leader.seat).toBe(throne);
    expect(w.unicorns.wildstar!.anim.facing).toBe(facingOfCardinal('south'));
  });

  it('still bursts with light and sound, once, as she takes her seat', () => {
    const w = world();
    tap(w, throne);
    const seen = watch(w, 14);
    const delight = PROP_DEFS.throne!.delight!;
    expect(seen.filter((e) => e.type === 'prop-activity' && e.instanceId === throne)).toEqual([
      { type: 'prop-activity', instanceId: throne, activity: 'delight', seconds: delight.seconds },
    ]);
    expect(seen.some((e) => e.type === 'effect' && e.effect === delight.effect)).toBe(true);
  });

  it('keeps her seated through a spell, and for as long as she is not told to go anywhere', () => {
    const w = world();
    tap(w, throne);
    run(w, 12);
    dispatch(w, { type: 'cast', commandId: 'spell', unicornId: 'wildstar' });
    run(w, 6);
    expect(w.leader.seat).toBe(throne);
    run(w, 30);
    // The herd has long stopped, and she has not got up to graze or turned her side to the room.
    expect(w.leader.seat).toBe(throne);
    expect(w.unicorns.wildstar!.state.kind).toBe('leading');
    expect(w.unicorns.wildstar!.anim).toMatchObject({ clip: 'idle', facing: facingOfCardinal('south') });
  });

  it('is sat in again when it is tapped again', () => {
    const w = world();
    tap(w, throne);
    run(w, 12);
    drainEvents(w);
    tap(w, throne);
    const seen = watch(w, 8);
    expect(w.leader.seat).toBe(throne);
    expect(seen.filter((e) => e.type === 'prop-activity' && e.activity === 'delight')).toHaveLength(1);
  });

  it('is left the moment she is sent anywhere, by a tap on the ground or a finger held down', () => {
    const w = world();
    tap(w, throne);
    run(w, 12);
    expect(w.leader.seat).toBe(throne);
    dispatch(w, { type: 'move', commandId: 'away', destination: { x: 1000, y: 1500 } });
    expect(w.leader.seat).toBeNull();
    run(w, 6);
    expect(w.leader.seat).toBeNull();

    tap(w, throne);
    run(w, 12);
    expect(w.leader.seat).toBe(throne);
    steer(w, { x: 1, y: 0 });
    expect(w.leader.seat).toBeNull();
  });

  it('is left when she is put down somewhere else', () => {
    const w = world();
    tap(w, throne);
    run(w, 12);
    expect(w.leader.seat).toBe(throne);
    expect(reseat(w, 'stalled')).toBe(true);
    expect(w.leader.seat).toBeNull();
  });

  it('is left for another thing to enjoy, which she then has no seat in', () => {
    const w = world();
    tap(w, throne);
    run(w, 12);
    tap(w, 'forest/harp-1');
    expect(w.leader.seat).toBeNull();
    run(w, 14);
    expect(w.leader.seat).toBeNull();
  });
});

describe('the palace door', () => {
  it('greets her with a glow and a rainbow, then lets her in a moment later', () => {
    const w = world();
    tap(w, 'forest/palace-1');
    const seen: DomainEvent[] = [];
    let greeted = -1,
      entered = -1;
    run(w, 14, (x) => {
      const now = drainEvents(x);
      seen.push(...now);
      if (greeted < 0 && now.some((e) => e.type === 'prop-activity' && e.activity === 'palace-welcome'))
        greeted = x.time;
      if (entered < 0 && now.some((e) => e.type === 'portal-entered')) entered = x.time;
    });
    expect(greeted, 'the welcome plays').toBeGreaterThan(0);
    expect(seen.some((e) => e.type === 'effect' && e.effect === 'door-glow')).toBe(true);
    expect(seen.some((e) => e.type === 'effect' && e.effect === 'rainbow-arc')).toBe(true);
    expect(entered, 'she goes in').toBeGreaterThan(greeted);
    expect(entered - greeted, 'she waits for the welcome').toBeGreaterThan(1);
    expect(seen.filter((e) => e.type === 'portal-entered')).toHaveLength(1);
  });
});
