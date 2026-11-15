import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET, WonderSynth } from '../../src/audio/synth/synth';
import { PROFILES } from '../../src/render/profile';
import { FX_NAMES, VOICE_NAMES } from '../../src/wonder/sound';
import { type FakeNode, fakeRig } from './web-audio-fake';

const seeded = (): (() => number) => {
  let a = 1;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

const make = (trims = {}, budget?: number) => {
  const rig = fakeRig();
  const synth = new WonderSynth(() => rig.graph(), seeded(), trims, budget);
  return { rig, synth };
};

/**
 * The nodes a sound makes for itself: not the ceilings and the room, which stay for the next one.
 */
const KEPT = new Set(['destination', 'bus-effects', 'bus-music', 'convolver', 'shaper']);
const stopsOf = (n: FakeNode): number[] => n.stops;
const eventsOf = (n: FakeNode): Array<{ kind: string; args: unknown[] }> =>
  (n.gain as unknown as { events: Array<{ kind: string; args: unknown[] }> }).events;

describe('the wonder synth, around the sounds', () => {
  it('makes nothing while there is no context or it cannot be heard, and does not throw', () => {
    const none = new WonderSynth(() => null);
    expect(() => none.fx('star')).not.toThrow();
    expect(() => none.note('bell', 72)).not.toThrow();
    expect(none.now()).toBe(0);
    const { rig, synth } = make();
    rig.hear(false);
    synth.fx('boom');
    synth.note('bell', 72);
    expect(synth.busy).toBe(0);
    expect(rig.ctx.nodes.length).toBe(2 + 1); // The two buses and the destination, and nothing else.
  });

  it('can make every sound and every instrument, and lets every node go when each has ended', () => {
    const { rig, synth } = make();
    for (const name of FX_NAMES) {
      synth.fx(name, { size: 0.5, step: 2 });
      expect(synth.busy, name).toBeGreaterThan(0);
      rig.ctx.currentTime += 0.1;
      rig.ctx.finish();
      expect(synth.busy, `${name} after it ended`).toBe(0);
    }
    for (const voice of VOICE_NAMES) {
      synth.note(voice, 69);
      rig.ctx.currentTime += 0.1;
      rig.ctx.finish();
      expect(synth.busy, voice).toBe(0);
    }
    // Everything a sound made is let go but the buses, the destination, the room and the ceilings,
    // which stay for the next sound.
    const kept = new Set(['destination', 'bus-effects', 'bus-music', 'convolver', 'shaper']);
    const leaked = rig.ctx.nodes.filter((n) => !kept.has(n.kind) && !n.disconnected);
    expect(leaked.map((n) => n.kind)).toEqual([]);
  });

  it('starts every source it makes after now and stops it at or after it starts', () => {
    const { rig, synth } = make();
    rig.ctx.currentTime = 3;
    synth.fx('launch', { delay: 0.5 });
    const sources = rig.ctx.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource');
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.starts.length, s.kind).toBe(1);
      expect(s.starts[0]!).toBeGreaterThanOrEqual(3.5);
      expect(s.stops[0]!).toBeGreaterThanOrEqual(s.starts[0]!);
    }
  });

  it('starts noise on a whole sample of the clock and from a whole sample of the noise, because Safari dulls noise played from in between', () => {
    const { rig, synth } = make();
    rig.ctx.currentTime = 1.000013;
    synth.fx('whoosh', { delay: 0.00137 });
    synth.note('hat', 72);
    const noise = rig.ctx.nodes.filter((n) => n.kind === 'bufferSource');
    expect(noise.length).toBeGreaterThanOrEqual(2);
    const whole = (seconds: number): boolean =>
      Math.abs(seconds * rig.ctx.sampleRate - Math.round(seconds * rig.ctx.sampleRate)) < 1e-6;
    for (const n of noise) {
      expect(whole(n.starts[0]!), `starts at ${n.starts[0]}`).toBe(true);
      expect(whole(n.offsets[0]!), `plays from ${n.offsets[0]}`).toBe(true);
    }
  });

  it('makes a sound asked for twice at the same moment once, and different ones both', () => {
    const { rig, synth } = make();
    synth.fx('pop');
    const once = rig.ctx.count('oscillator');
    synth.fx('pop');
    expect(rig.ctx.count('oscillator')).toBe(once);
    synth.fx('pop', { pitch: 3 });
    expect(rig.ctx.count('oscillator')).toBeGreaterThan(once);
    // Once the moment has passed it is a new sound.
    rig.ctx.currentTime += 0.2;
    const before = rig.ctx.count('oscillator');
    synth.fx('pop');
    expect(rig.ctx.count('oscillator')).toBeGreaterThan(before);
  });

  it('never keeps more nodes sounding than its budget, whatever it is asked for and however fast', () => {
    const { rig, synth } = make();
    const worst: string[] = [];
    for (let i = 0; i < 800; i++) {
      rig.ctx.currentTime = i * 0.02;
      synth.fx(FX_NAMES[i % FX_NAMES.length]!, { pitch: i % 13, step: i % 5, size: (i % 10) / 10 });
      if (i % 3 === 0)
        synth.note(VOICE_NAMES[i % VOICE_NAMES.length]!, 48 + (i % 30), { bus: i % 2 === 0 ? 'music' : 'effects' });
      if (synth.nodes > DEFAULT_BUDGET) worst.push(`${synth.nodes} nodes at ${rig.ctx.currentTime.toFixed(2)} s`);
    }
    expect(worst).toEqual([]);
    expect(synth.nodes).toBeGreaterThan(DEFAULT_BUDGET / 2);
  });

  it('is given a budget that holds the biggest sound three times over, at the smallest the game uses', () => {
    const sizes = [
      ...FX_NAMES.map((name) => ({ label: name, ask: (s: WonderSynth) => s.fx(name, { size: 1, step: 2 }) })),
      ...VOICE_NAMES.map((voice) => ({ label: voice, ask: (s: WonderSynth) => s.note(voice, 69) })),
    ].map(({ label, ask }) => {
      const { synth } = make();
      ask(synth);
      return { label, nodes: synth.nodes };
    });
    const biggest = sizes.reduce((a, b) => (b.nodes > a.nodes ? b : a));
    expect(biggest.nodes * 3, `${biggest.label} is made of ${biggest.nodes} nodes`).toBeLessThanOrEqual(
      Math.min(...Object.values(PROFILES).map((p) => p.soundBudget)),
    );
  });

  it('lets a sound go for a new one when the budget is full, taking it down to nothing in a few hundredths of a second', () => {
    const { rig, synth } = make({}, 20);
    synth.note('bell', 72);
    const bell = rig.ctx.nodes.filter((n) => n.kind === 'oscillator');
    const first = synth.nodes;
    expect(synth.busy).toBe(1);
    rig.ctx.currentTime = 0.5;
    synth.note('bell', 74);
    expect(synth.busy, 'the second bell took the place of the first').toBe(1);
    expect(synth.nodes).toBe(first);
    const ramp = eventsOf(rig.ctx.nodes.find((n) => n.kind === 'gain')!).find(
      (e) => e.kind === 'linearRampToValueAtTime',
    )!;
    expect(ramp.args[0], 'the first bell is taken down to nothing').toBe(0);
    expect(ramp.args[1] as number).toBeGreaterThan(0.5);
    expect(ramp.args[1] as number).toBeLessThan(0.56);
    expect(
      bell.some((o) => stopsOf(o).length === 2),
      'and its sources are stopped there',
    ).toBe(true);
    for (const o of bell) {
      if (stopsOf(o).length === 2) expect(stopsOf(o)[1]!).toBeLessThan(0.6);
    }
  });

  it('stops only the sources that would still be sounding, because a second stop replaces the first and would lengthen a short one', () => {
    const { rig, synth } = make({}, 80);
    synth.fx('star', { step: 0 });
    const star = rig.ctx.nodes.filter((n) => n.kind === 'oscillator');
    const spread = star.map((o) => stopsOf(o)[0]!);
    expect(Math.min(...spread)).toBeLessThan(0.9);
    expect(Math.max(...spread)).toBeGreaterThan(1.5);
    rig.ctx.currentTime = 0.9;
    synth.fx('star', { step: 2, pitch: 3 });
    for (const o of star) {
      const first = spread[star.indexOf(o)]!;
      expect(stopsOf(o).length, `a source that stops at ${first.toFixed(2)} s`).toBe(first > 0.95 ? 2 : 1);
    }
  });

  it('keeps a sound that must be heard for one that need not be, and gives it up only for another that must be', () => {
    const { rig, synth } = make({}, 80);
    synth.fx('star', { step: 0 });
    const star = rig.ctx.nodes.filter((n) => n.kind === 'oscillator');
    expect(synth.nodes).toBeLessThanOrEqual(80);
    rig.ctx.currentTime = 0.3;
    const before = rig.ctx.nodes.length;
    synth.note('bell', 72);
    expect(synth.busy, 'a bell does not take the place of a star').toBe(1);
    expect(
      rig.ctx.nodes
        .slice(before)
        .filter((n) => !KEPT.has(n.kind))
        .every((n) => n.disconnected),
      'what was built for the bell was let go',
    ).toBe(true);
    expect(
      star.every((o) => stopsOf(o).length === 1),
      'the star was not touched',
    ).toBe(true);
    rig.ctx.currentTime = 0.6;
    synth.fx('star', { step: 2, pitch: 3 });
    expect(synth.busy, 'another star does').toBe(1);
    expect(
      star.some((o) => stopsOf(o).length === 2),
      'the first star was let go',
    ).toBe(true);
  });

  it('lets go of what the clock says is over, and of what was cut short, without waiting to be told', () => {
    const { rig, synth } = make();
    for (let i = 0; i < 30; i++) {
      rig.ctx.currentTime = i * 0.03;
      synth.fx('twinkle', { pitch: i });
    }
    expect(synth.busy).toBeGreaterThan(10);
    rig.ctx.currentTime = 12;
    synth.fx('tap');
    expect(synth.busy, 'only the tap is left').toBe(1);
    const alive = rig.ctx.nodes.filter((n) => !KEPT.has(n.kind) && !n.disconnected);
    expect(alive.length, "every node but the tap's was let go").toBe(synth.nodes);
  });

  it('lets go of the sound with least left to ring, only as many as the new sound needs, and not one that has not begun', () => {
    const { rig, synth } = make({}, 45);
    // Asked for out of order, as the band's notes are, a note two seconds ahead before one that is
    // sounding now.
    synth.note('bell', 72, { delay: 2 });
    synth.note('bell', 74);
    rig.ctx.currentTime = 0.1;
    synth.note('bell', 76);
    const [ahead, first, second] = [0, 1, 2].map((i) =>
      rig.ctx.nodes.filter((n) => n.kind === 'oscillator').slice(i * 6, i * 6 + 6),
    );
    expect(synth.busy).toBe(3);
    rig.ctx.currentTime = 0.2;
    synth.note('bell', 77);
    expect(synth.busy, 'one went for one').toBe(3);
    expect(
      first!.some((o) => stopsOf(o).length === 2),
      'the one that has least left went',
    ).toBe(true);
    expect(
      second!.every((o) => stopsOf(o).length === 1),
      'the next was left',
    ).toBe(true);
    expect(
      ahead!.every((o) => stopsOf(o).length === 1),
      'and the one that has not begun, though it was asked for first',
    ).toBe(true);
  });

  it('lets a quiet sound go before a loud one that began first and has as long to ring', () => {
    const { rig, synth } = make({}, 45);
    synth.note('bell', 72);
    rig.ctx.currentTime = 0.1;
    synth.note('bell', 74, { gain: 0.2 });
    rig.ctx.currentTime = 0.2;
    synth.note('bell', 76);
    const [loud, quiet] = [0, 1].map((i) =>
      rig.ctx.nodes.filter((n) => n.kind === 'oscillator').slice(i * 6, i * 6 + 6),
    );
    rig.ctx.currentTime = 0.3;
    synth.note('bell', 77);
    expect(
      quiet!.some((o) => stopsOf(o).length === 2),
      'the quiet one went, though it began after the loud one',
    ).toBe(true);
    expect(
      loud!.every((o) => stopsOf(o).length === 1),
      'the loud one was left',
    ).toBe(true);
  });

  it('starts every budget empty when it is given another context, so sounds of one that is gone hold no place in the next', () => {
    const { rig } = make();
    let current = rig;
    const moving = new WonderSynth(() => current.graph(), seeded(), {}, 80);
    moving.fx('star', { step: 0 });
    expect(moving.busy).toBe(1);
    current = fakeRig();
    // The star of the old context is never heard to end and is one that must be heard, so if it
    // held its place a bell would never be made.
    moving.note('bell', 72);
    expect(moving.busy).toBe(1);
    expect(current.ctx.count('oscillator')).toBeGreaterThan(0);
    expect(moving.nodes).toBeLessThan(20);
  });

  it('when the mix is full, does not make a light sound, but still makes one that matters, quietly', () => {
    const { rig, synth } = make();
    for (let i = 0; i < 6; i++) synth.fx('boom', { pitch: i });
    const full = synth.busy;
    expect(full).toBe(6);
    synth.fx('twinkle');
    synth.fx('tap');
    expect(synth.busy).toBe(full);
    synth.fx('boom', { pitch: 9 });
    expect(synth.busy).toBe(full + 1);
    // The last boom went in at its floor, well under the level the first did.
    const levels = rig.ctx.nodes.filter((n) => n.kind === 'gain').map((n) => (n.gain as { value: number }).value);
    expect(Math.min(...levels.slice(-40))).toBeLessThan(0.3);
  });

  it('sets the level of a sound from what the game asked for and the trim it has', () => {
    const { rig, synth } = make({ star: 0.5 });
    synth.fx('star', { gain: 0.8 });
    const level = rig.ctx.nodes.find((n) => n.kind === 'gain')!;
    expect((level.gain as { value: number }).value).toBeCloseTo(0.4, 5);
  });

  it('pans a sound only when it was asked to', () => {
    const { rig, synth } = make();
    synth.fx('tap');
    const centred = rig.ctx.count('panner');
    rig.ctx.currentTime += 0.2;
    synth.fx('tap', { pan: 0.7 });
    expect(rig.ctx.count('panner')).toBe(centred + 1);
    const panner = rig.ctx.nodes.filter((n) => n.kind === 'panner').at(-1)!;
    expect((panner.pan as { value: number }).value).toBeCloseTo(0.7, 5);
    rig.ctx.currentTime += 0.2;
    synth.fx('tap', { pan: 9 });
    expect((rig.ctx.nodes.filter((n) => n.kind === 'panner').at(-1)!.pan as { value: number }).value).toBe(1);
  });

  it('plays what the player plays on the effects and music on the music, never the other way', () => {
    const { rig, synth } = make();
    synth.note('pad', 60, { bus: 'music' });
    // Each level has a ceiling in front of it, and a sound goes in at the ceiling of the level it
    // is for.
    const ceilingOf = (bus: FakeNode): FakeNode =>
      rig.ctx.nodes.find((n) => n.kind === 'shaper' && n.connections.includes(bus))!;
    const onto = (bus: FakeNode): number => rig.ctx.nodes.filter((n) => n.connections.includes(ceilingOf(bus))).length;
    expect(onto(rig.music)).toBeGreaterThan(0);
    expect(onto(rig.effects)).toBe(0);
    rig.ctx.currentTime += 0.2;
    synth.note('bell', 72);
    expect(onto(rig.effects)).toBeGreaterThan(0);
  });

  it('builds its noise and its room once for all the sounds it makes', () => {
    const { rig, synth } = make();
    synth.fx('star');
    const built = rig.ctx.buffers.length;
    expect(built).toBeGreaterThanOrEqual(1);
    for (const name of FX_NAMES) {
      rig.ctx.currentTime += 0.2;
      synth.fx(name);
    }
    expect(rig.ctx.buffers.length).toBe(built);
    expect(rig.ctx.count('convolver')).toBe(1);
  });

  it('starts over with a new context, as when the page has been asleep and the engine made another', () => {
    const { rig, synth } = make();
    synth.fx('star');
    const first = rig.ctx.buffers.length;
    const other = fakeRig();
    let current = rig;
    const moving = new WonderSynth(() => current.graph(), seeded());
    moving.fx('star');
    current = other;
    moving.fx('star');
    expect(other.ctx.buffers.length).toBe(first);
    expect(other.ctx.nodes.some((n) => n.kind === 'oscillator')).toBe(true);
  });

  it('gives a note a length of its own, and the sounds that should ring hold for as long as asked', () => {
    const { rig, synth } = make();
    synth.note('pad', 60, { seconds: 4 });
    const stops = rig.ctx.nodes.filter((n) => n.kind === 'oscillator').map((n) => n.stops[0]!);
    expect(Math.max(...stops)).toBeGreaterThanOrEqual(4);
  });
});
