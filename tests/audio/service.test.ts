import { beforeEach, describe, expect, it } from 'vitest';
import { GameAudio } from '../../src/audio/service';
import type { View } from '../../src/game/ports';
import { EAST } from '../../src/shared/compass';
import { UNICORN_IDS } from '../../src/shared/ids';
import { ALL, makeWorld } from '../domain/fixtures';
import { FAKE_ASSETS, FakeEngine, FOREST, GARDEN, STABLE, settle, TREASURE } from './fakes';

const VIEW: View = { x: 0, y: 0, w: 1000, h: 600 };
const tapAt = (x: number, y: number) => ({
  type: 'command-accepted' as const,
  commandId: 'c',
  command: 'move' as const,
  at: { x, y },
});

let engine: FakeEngine;
let audio: GameAudio;
const world = makeWorld({ recruited: ALL.filter((id) => id !== 'wildstar') });

/**
 * A service whose chance always lands in the middle, so jitter is neutral and the numbers are
 * exact.
 */
const make = (): GameAudio => new GameAudio({ engine, assets: FAKE_ASSETS, random: () => 0.5 });
beforeEach(() => {
  engine = new FakeEngine();
  audio = make();
});

describe('before the first tap', () => {
  it('fetches the first sheets in the background and starts nothing', () => {
    expect(engine.prefetched).toEqual([FAKE_ASSETS.sheets.core.file, FAKE_ASSETS.sheets.magic.file]);
    expect(engine.unlocked).toBe(0);
  });

  it("knows where the herd is without making a sound, and fetches that map's loops", () => {
    audio.enterMap(FOREST);
    expect(engine.prefetched.slice(2)).toEqual([
      FAKE_ASSETS.loops['music-forest'].file,
      FAKE_ASSETS.loops['ambience-forest'].file,
    ]);
    expect(engine.loopCalls).toEqual([]);
  });

  it('plays nothing for events or footsteps, and does not mind being asked', () => {
    audio.enterMap(FOREST);
    audio.events([tapAt(10, 10)], world);
    audio.frame(world, VIEW, 1 / 30);
    expect(engine.plays).toEqual([]);
  });
});

describe('the first tap', () => {
  it('opens audio, then decodes the sheets one after another, the one the first sounds need first', async () => {
    audio.enterMap(FOREST);
    audio.unlock();
    expect(engine.unlocked).toBe(1);
    await settle();
    expect(engine.loaded).toEqual(['core', 'magic', 'objects']);
  });

  it('starts the music and the ambience of the map it is on, crossing in over about two seconds', () => {
    audio.enterMap(FOREST);
    audio.unlock();
    expect(engine.loops.music).toEqual({ id: 'music-forest', gain: 1, fade: 1.8 });
    expect(engine.loops.ambience).toEqual({ id: 'ambience-forest', gain: 1, fade: 1.8 });
  });

  it('starts the loops of a map it only learns about after the tap', () => {
    audio.unlock();
    expect(engine.loopCalls).toEqual([]);
    audio.enterMap(GARDEN);
    expect(engine.loops.music?.id).toBe('music-garden');
    expect(engine.loops.ambience?.id).toBe('ambience-garden');
  });

  it('does not decode everything again on the next tap, and wakes the audio if it was put to sleep', () => {
    audio.enterMap(FOREST);
    audio.unlock();
    audio.unlock();
    expect(engine.unlocked).toBe(2);
    expect(engine.resumed).toBe(1);
    expect(engine.loopCalls).toHaveLength(2);
  });

  it('survives a loop that will not decode, and carries on in silence', async () => {
    engine.failLoops = true;
    audio.enterMap(FOREST);
    audio.unlock();
    await settle();
    audio.events([tapAt(10, 10)], world);
    expect(engine.plays).toHaveLength(1);
  });
});

describe('music and ambience follow the map', () => {
  beforeEach(() => {
    audio.unlock();
  });

  it('gives each outdoor map its own music and ambience', () => {
    audio.enterMap(FOREST);
    expect([engine.loops.music?.id, engine.loops.ambience?.id]).toEqual(['music-forest', 'ambience-forest']);
    audio.enterMap(GARDEN);
    expect([engine.loops.music?.id, engine.loops.ambience?.id]).toEqual(['music-garden', 'ambience-garden']);
  });

  it("plays the garden theme quietly and softened indoors, with the room's own ambience", () => {
    audio.enterMap(TREASURE);
    expect(engine.loops.music).toEqual({ id: 'music-garden', gain: 0.55, lowpass: 2400, fade: 1.8 });
    expect(engine.loops.ambience).toEqual({ id: 'ambience-treasure-room', gain: 1, fade: 1.8 });
    audio.enterMap(STABLE);
    expect(engine.loops.ambience?.id).toBe('ambience-stable-room');
  });

  it('keeps the same piece of music playing from the garden to a room, so it does not start over', () => {
    audio.enterMap(GARDEN);
    audio.enterMap(TREASURE);
    const [outside, inside] = engine.loopCalls.filter((c) => c.slot === 'music').map((c) => c.request);
    expect(outside!.id).toBe(inside!.id);
    expect(inside!.lowpass).toBeDefined();
    expect(outside!.lowpass).toBeUndefined();
    // And back out again, open and full.
    audio.enterMap(GARDEN);
    expect(engine.loops.music).toEqual({ id: 'music-garden', gain: 1, fade: 1.8 });
  });
});

describe('a place inside a map that sounds different', () => {
  const at = (x: number, y: number) => {
    const w = makeWorld({ recruited: ALL.filter((id) => id !== 'wildstar') });
    w.unicorns.wildstar!.pos = { x, y };
    return w;
  };

  beforeEach(() => {
    audio.enterMap(FOREST);
    audio.unlock();
  });

  it("crosses to the manor yard's night when the leader walks to the manor, and back to the forest when she leaves", () => {
    audio.frame(at(400, 400), VIEW, 1 / 30);
    expect(engine.loops.ambience?.id).toBe('ambience-forest');
    audio.frame(at(2688, 1460), VIEW, 1 / 30);
    expect(engine.loops.ambience).toEqual({ id: 'ambience-manor-yard', gain: 1, fade: 1.8 });
    audio.frame(at(400, 400), VIEW, 1 / 30);
    expect(engine.loops.ambience?.id).toBe('ambience-forest');
  });

  it('does not flicker between the two at the edge of the yard', () => {
    audio.frame(at(2688, 1460 + 540), VIEW, 1 / 30);
    audio.frame(at(2688, 1460 + 580), VIEW, 1 / 30);
    audio.frame(at(2688, 1460 + 540), VIEW, 1 / 30);
    audio.frame(at(2688, 1460 + 580), VIEW, 1 / 30);
    expect(engine.loopCalls.filter((c) => c.slot === 'ambience').map((c) => c.request.id)).toEqual([
      'ambience-forest',
      'ambience-manor-yard',
    ]);
  });

  it("keeps the yard's night out of every other map", () => {
    audio.enterMap(GARDEN);
    audio.frame(at(2688, 1460), VIEW, 1 / 30);
    expect(engine.loops.ambience?.id).toBe('ambience-garden');
  });

  it("starts the yard's night from the first frame when audio opens while she is standing in it", () => {
    engine = new FakeEngine();
    audio = make();
    audio.enterMap(FOREST);
    audio.frame(at(2688, 1460), VIEW, 1 / 30);
    audio.unlock();
    expect(engine.loops.ambience?.id).toBe('ambience-forest');
    audio.frame(at(2688, 1460), VIEW, 1 / 30);
    expect(engine.loops.ambience?.id).toBe('ambience-manor-yard');
  });
});

describe('what happens is heard', () => {
  beforeEach(async () => {
    audio.enterMap(FOREST);
    audio.unlock();
    await settle();
    audio.frame(world, VIEW, 1 / 30);
  });

  it('answers a tap in the middle of the screen at full level and centred', () => {
    audio.events([tapAt(500, 300)], world);
    expect(engine.plays).toEqual([{ family: 'tap', variant: 0, gain: 0.8, pan: 0, rate: 1, delay: 0 }]);
  });

  it('leans a sound toward the side of the screen it comes from, and softens it past the edge', () => {
    audio.events([tapAt(1000, 300)], world);
    expect(engine.plays[0]!.pan).toBeCloseTo(0.6);
    expect(engine.plays[0]!.gain).toBeCloseTo(0.8 * 0.75);
    engine.clock = 5;
    audio.events([tapAt(-3000, 300)], world);
    expect(engine.plays[1]!.pan).toBeCloseTo(-0.6);
    expect(engine.plays[1]!.gain).toBeCloseTo(0.8 * 0.35);
  });

  it('plays a sound centred and at its own level when it has not yet been told what is on screen', async () => {
    const early = make();
    early.enterMap(FOREST);
    early.unlock();
    await settle();
    early.events([tapAt(9000, 9000)], world);
    expect(engine.plays[0]).toMatchObject({ family: 'tap', pan: 0, gain: 0.8 });
  });

  it('plays a sound with no place centred and at its own level', () => {
    audio.events([{ type: 'friend-recruited', unicornId: 'leaf' }], world);
    expect(engine.plays[0]).toMatchObject({ family: 'recruit', pan: 0, gain: 1 });
  });

  it('passes on how long to wait, so a drink is heard when the muzzle meets the water', () => {
    audio.events([{ type: 'activity-started', actorId: 'river', activityId: 'drink' }], world);
    expect(engine.plays[0]).toMatchObject({ family: 'drink', delay: 0.5 });
  });

  it('plays nothing for what is only a picture', () => {
    audio.events(
      [
        { type: 'effect', effect: 'sparkle', at: { x: 1, y: 1 }, seconds: 1 },
        { type: 'save-needed', reason: 'prop' },
      ],
      world,
    );
    expect(engine.plays).toEqual([]);
  });

  it('never picks the same take twice in a row for a sound with several', () => {
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      engine.clock = i * 10;
      audio.events([{ type: 'effect', effect: 'treasure-sparkle', at: { x: 400, y: 300 }, seconds: 1 }], world);
      seen.push(engine.plays[i]!.variant);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('lets pitch and level wander a little from take to take', async () => {
    let turn = 0;
    const wandering = new GameAudio({ engine, assets: FAKE_ASSETS, random: () => [0, 1, 0.25, 0.75][turn++ % 4]! });
    wandering.enterMap(FOREST);
    wandering.unlock();
    await settle();
    wandering.frame(world, VIEW, 1 / 30);
    for (let i = 0; i < 12; i++) {
      engine.clock = i * 10;
      wandering.events([{ type: 'effect', effect: 'hearts', at: { x: 500, y: 300 }, seconds: 1 }], world);
    }
    const rates = engine.plays.map((p) => p.rate);
    const gains = engine.plays.map((p) => p.gain);
    expect(new Set(rates).size).toBeGreaterThan(1);
    expect(new Set(gains).size).toBeGreaterThan(1);
    for (const r of rates) expect(Math.abs(r - 1)).toBeLessThanOrEqual(0.015 + 1e-9);
    for (const g of gains) expect(Math.abs(g / 0.8 - 1)).toBeLessThanOrEqual(0.08 + 1e-9);
  });
});

describe('a sheet that has not finished decoding', () => {
  it('is simply not played yet, while the sounds that are ready still play', async () => {
    engine.stuck.add('magic');
    audio.enterMap(FOREST);
    audio.unlock();
    await settle();
    const at = world.unicorns.leaf!.pos;
    audio.events([{ type: 'cast-released', castId: 'x', unicornId: 'leaf', at }, tapAt(10, 10)], world);
    expect(engine.plays.map((p) => p.family)).toEqual(['tap']);
  });
});

describe('a crowded moment', () => {
  it('lets four spells at once begin and cuts off only the oldest, over a short fade', async () => {
    audio.enterMap(FOREST);
    audio.unlock();
    await settle();
    const casts = (['wildstar', 'leaf', 'glacier', 'river'] as const).map((unicornId, i) => ({
      type: 'cast-released' as const,
      castId: `c${i}`,
      unicornId,
      at: { x: 500, y: 300 },
    }));
    audio.events(casts, world);
    expect(engine.plays.map((p) => p.family)).toEqual(['spell-light', 'spell-nature', 'spell-ice', 'spell-water']);
    expect(engine.stops.map((s) => s.voice.family)).toEqual(['spell-light']);
    expect(engine.stops[0]!.fade).toBeGreaterThan(0);
    expect(engine.stops[0]!.fade).toBeLessThanOrEqual(0.1);
  });

  it('forgets a sound once it has ended, so the next one is not held back by it', async () => {
    audio.enterMap(FOREST);
    audio.unlock();
    await settle();
    for (let i = 0; i < 6; i++) {
      engine.clock = i * 2;
      audio.events([{ type: 'command-refused', commandId: `r${i}`, at: { x: 500, y: 300 } }], world);
    }
    expect(engine.plays).toHaveLength(6);
    expect(engine.stops).toEqual([]);
  });
});

describe('footsteps', () => {
  it('follow the herd across the map, on whatever the ground is', async () => {
    const hard = { ...FOREST, surfaceAt: () => 'hard' as const };
    audio.enterMap(hard);
    audio.unlock();
    await settle();
    const w = makeWorld();
    w.unicorns.wildstar!.speed = 150;
    w.unicorns.wildstar!.anim = { clip: 'walk', facing: EAST, startedAt: 0 };
    const at = w.unicorns.wildstar!.pos;
    const view: View = { x: at.x - 400, y: at.y - 300, w: 800, h: 600 };
    for (let i = 0; i < 60; i++) {
      engine.clock = i / 30;
      audio.frame(w, view, 1 / 30);
    }
    const steps = engine.plays.filter((p) => p.family === 'hoof-hard');
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(engine.plays.every((p) => p.family === 'hoof-hard')).toBe(true);
  });

  it('are not heard until audio is open, and not on a map the service has not been told about', async () => {
    const w = makeWorld();
    w.unicorns.wildstar!.speed = 150;
    w.unicorns.wildstar!.anim = { clip: 'walk', facing: EAST, startedAt: 0 };
    for (let i = 0; i < 60; i++) audio.frame(w, VIEW, 1 / 30);
    audio.unlock();
    await settle();
    for (let i = 0; i < 60; i++) audio.frame(w, VIEW, 1 / 30);
    expect(engine.plays).toEqual([]);
  });
});

describe('settings and sleep', () => {
  it("hands the player's mix to the engine as it changes", () => {
    audio.setMix({ musicVolume: 0.2, effectsVolume: 0.9, muted: true });
    expect(engine.mix).toEqual({ musicVolume: 0.2, effectsVolume: 0.9, muted: true });
  });

  it('suspends and resumes with the page', () => {
    audio.suspend();
    audio.resume();
    expect([engine.suspended, engine.resumed]).toEqual([1, 1]);
  });

  it('shows what the engine reports, for tests that look from outside', async () => {
    audio.enterMap(GARDEN);
    audio.unlock();
    await settle();
    expect(audio.stats()).toMatchObject({
      state: 'running',
      sheets: ['core', 'magic', 'objects'],
      loops: { music: 'music-garden', ambience: 'ambience-garden' },
    });
  });
});

describe('all six unicorns', () => {
  it('each greet with a voice of their own', async () => {
    audio.enterMap(FOREST);
    audio.unlock();
    await settle();
    for (const [i, id] of UNICORN_IDS.entries()) {
      engine.clock = i * 5;
      audio.events([{ type: 'greeting-started', unicornId: id, at: { x: 500, y: 300 } }], world);
    }
    expect(engine.plays.map((p) => p.family)).toEqual(UNICORN_IDS.map((id) => `voice-${id}`));
    expect(engine.plays.every((p) => p.delay === 0.35)).toBe(true);
  });
});
