import { describe, expect, it } from 'vitest';
import { LEVELS, TUNED } from '../../src/audio/synth/kit';
import { WonderSynth } from '../../src/audio/synth/synth';
import { DRUMS, drumOf, KIT } from '../../src/shared/kit';
import { PARTS } from '../../src/wonder/games/tonematrix/parts';
import { fakeRig } from './web-audio-fake';

const seeded = (): (() => number) => {
  let a = 1;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

const make = () => {
  const rig = fakeRig();
  const synth = new WonderSynth(() => rig.graph(), seeded(), {});
  return { rig, synth };
};

/** What the synth keeps for good, and so is never a leftover of a sound. */
const KEPT = new Set(['destination', 'bus-effects', 'bus-music', 'convolver', 'shaper']);

/** The notes of the key the rest of the game is in, as numbers from the C an octave counts from. */
const IN_KEY = new Set([0, 2, 4, 7, 9]);

describe('the kit of the tone matrix', () => {
  it('gives every drum a number of its own, and finds the drum from the number', () => {
    const numbers = DRUMS.map((drum) => KIT[drum]);
    expect(new Set(numbers).size).toBe(DRUMS.length);
    for (const drum of DRUMS) expect(drumOf(KIT[drum]), drum).toBe(drum);
    expect(drumOf(0)).toBeUndefined();
    expect(drumOf(60)).toBeUndefined();
  });

  it('puts every drum that is tuned on a note of the key the rest of the game is in, so it never sounds against the melody or the bass', () => {
    const tuned = Object.values(TUNED).flat();
    expect(tuned.length).toBeGreaterThan(8);
    for (const midi of tuned) expect(IN_KEY.has(midi % 12), `note ${midi}`).toBe(true);
  });

  it('has a level for every drum that is a number worth having', () => {
    for (const drum of DRUMS) {
      expect(LEVELS[drum], drum).toBeGreaterThan(0.1);
      expect(LEVELS[drum], drum).toBeLessThan(2);
    }
  });

  it('plays every drum with a few nodes, none of it after two seconds, and lets every node go when it has ended', () => {
    for (const drum of DRUMS) {
      const { rig, synth } = make();
      rig.ctx.currentTime = 1;
      synth.note('kit', KIT[drum]);
      expect(synth.busy, drum).toBe(1);
      expect(synth.nodes, `${drum} is made of ${synth.nodes} nodes`).toBeLessThanOrEqual(16);
      const sources = rig.ctx.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource');
      expect(sources.length, drum).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source.starts[0]!, `${drum} starts`).toBeGreaterThanOrEqual(1);
        expect(source.stops[0]! - 1, `${drum} rings for`).toBeLessThan(2);
      }
      rig.ctx.currentTime += 2.5;
      rig.ctx.finish();
      expect(synth.busy, `${drum} after it ended`).toBe(0);
      expect(
        rig.ctx.nodes.filter((n) => !KEPT.has(n.kind) && !n.disconnected).map((n) => n.kind),
        `${drum} leaves nothing behind`,
      ).toEqual([]);
    }
  });

  it('makes drums that do not all sound the same, so that no two rows of the grid are one sound', () => {
    const shapes = DRUMS.map((drum) => {
      const { rig, synth } = make();
      synth.note('kit', KIT[drum]);
      const sources = rig.ctx.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource');
      const filters = rig.ctx.nodes.filter((n) => n.kind === 'biquad');
      return `${sources.length} sources, ${filters.length} filters, ${Math.max(...sources.flatMap((n) => n.stops)).toFixed(3)} s`;
    });
    // Drums made of the same few parts may share a shape (the two blocks, the kick and a tom), but
    // they are not all one.
    expect(new Set(shapes).size).toBeGreaterThanOrEqual(8);
  });

  it('plays a note that is no drum as a snare, so a wrong number is still a sound of the right kind', () => {
    const count = (midi: number): number => {
      const { synth } = make();
      synth.note('kit', midi);
      return synth.nodes;
    };
    expect(count(60)).toBe(count(KIT.snare));
    expect(count(0)).toBe(count(KIT.snare));
  });

  it('plays the drums that are noise from the noise of the rig, and the ones that are tones as tones', () => {
    const kinds = (drum: (typeof DRUMS)[number]): { noise: number; tones: number } => {
      const { rig, synth } = make();
      synth.note('kit', KIT[drum]);
      return { noise: rig.ctx.count('bufferSource'), tones: rig.ctx.count('oscillator') };
    };
    expect(kinds('shaker').noise).toBeGreaterThan(0);
    expect(kinds('shaker').tones).toBe(0);
    expect(kinds('crash').noise).toBeGreaterThan(0);
    expect(kinds('clap').tones).toBe(0);
    expect(kinds('triangle').noise).toBe(0);
    expect(kinds('triangle').tones).toBeGreaterThan(2);
    expect(kinds('kick').tones).toBeGreaterThan(1);
  });
});

describe('the bass of the tone matrix', () => {
  it('holds for as long as it is asked, and lets go over a few hundredths of a second so that the next note is not smeared', () => {
    const { rig, synth } = make();
    rig.ctx.currentTime = 1;
    synth.note('sub', 43, { seconds: 1.5 });
    const stops = rig.ctx.nodes.filter((n) => n.kind === 'oscillator').map((n) => n.stops[0]! - 1);
    expect(Math.max(...stops)).toBeGreaterThanOrEqual(1.5);
    expect(Math.max(...stops)).toBeLessThan(1.5 + 0.2);
  });

  it('ends, and lets every node go, on every note of its range', () => {
    for (const { midi } of PARTS.bass.rows) {
      const { rig, synth } = make();
      synth.note('sub', midi, { seconds: 0.25 });
      expect(synth.busy, `${midi}`).toBe(1);
      rig.ctx.currentTime += 2;
      rig.ctx.finish();
      expect(synth.busy, `${midi} after it ended`).toBe(0);
      expect(
        rig.ctx.nodes.filter((n) => !KEPT.has(n.kind) && !n.disconnected).map((n) => n.kind),
        `${midi} leaves nothing behind`,
      ).toEqual([]);
    }
  });

  it('is on the note it is asked for', () => {
    const { rig, synth } = make();
    synth.note('sub', 43);
    const tones = rig.ctx.nodes
      .filter((n) => n.kind === 'oscillator')
      .map((n) => (n.frequency as { value: number }).value);
    expect(tones.length).toBeGreaterThanOrEqual(2);
    for (const hz of tones) expect(hz).toBeCloseTo(97.999, 2);
  });

  it('is a single note at a time of a few nodes, which is what a line of bass is', () => {
    const { synth } = make();
    synth.note('sub', 31);
    expect(synth.nodes).toBeLessThanOrEqual(10);
  });
});

describe('the whole song of the tone matrix with every tile of all three parts lit', () => {
  /** A bar at the middle speed, in sixteenths: a step lasts an eighth of a second. */
  const STEP = 0.125;

  /**
   * Asks for a bar of the loop as the game does, a step ahead of its time: every drum, every note
   * of the melody, and a bass note.
   */
  function bar(budget: number): {
    peak: number;
    bass: number;
    bassMade: number;
    synth: WonderSynth;
    rig: ReturnType<typeof fakeRig>;
  } {
    const rig = fakeRig();
    const synth = new WonderSynth(() => rig.graph(), seeded(), {}, budget);
    let peak = 0;
    let bass = 0;
    let bassMade = 0;
    for (let step = 0; step < 16; step++) {
      rig.ctx.currentTime = step * STEP;
      for (const row of PARTS.beat.rows)
        synth.note('kit', row.midi, {
          gain: PARTS.beat.loop * PARTS.beat.level(16) * row.trim,
          pan: row.pan ?? 0,
          bus: 'effects',
        });
      for (const row of PARTS.melody.rows)
        synth.note('ping', row.midi, { gain: PARTS.melody.loop * PARTS.melody.level(16) * row.trim, bus: 'effects' });
      const before = rig.ctx.count('oscillator');
      synth.note('sub', PARTS.bass.rows[2 + ((step * 5) % 12)]!.midi, {
        gain: PARTS.bass.loop,
        seconds: STEP,
        bus: 'effects',
      });
      bass++;
      if (rig.ctx.count('oscillator') > before) bassMade++;
      peak = Math.max(peak, synth.nodes);
    }
    return { peak, bass, bassMade, synth, rig };
  }

  it("stays inside the synth's budget of nodes, on a laptop and on a small tablet", () => {
    for (const budget of [600, 250]) expect(bar(budget).peak, `a budget of ${budget}`).toBeLessThanOrEqual(budget);
  });

  it('never turns a note of the bass away, because it is the one voice that holds the other two up', () => {
    for (const budget of [600, 250]) {
      const { bass, bassMade } = bar(budget);
      expect(bassMade, `a budget of ${budget}`).toBe(bass);
    }
  });

  it('lets every node go when the bar is over, so that the next one starts from nothing', () => {
    const { rig, synth } = bar(600);
    rig.ctx.currentTime += 6;
    rig.ctx.finish();
    expect(synth.busy).toBe(0);
    expect(synth.nodes).toBe(0);
  });
});
