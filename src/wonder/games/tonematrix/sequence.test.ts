// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { KIT } from '../../../shared/kit';
import { Band, CHORDS, type Layer, type Style } from '../../engine/band';
import { recorder } from '../../sound';
import { Grid } from './grid';
import { PARTS, rowOfDrum } from './parts';
import { levelOfCrowd, noteOfY, SIZE, trimOfY } from './scale';
import { LEGATO_GAP, panOf, Sequence } from './sequence';

/** A tempo of 120 beats a minute, which is a step of an eighth of a second. */
const STEP = 0.125;
const melody = (g: Grid): Sequence => new Sequence(g, PARTS.melody);

describe('what a step plays', () => {
  it('is a note for each tile that is on, from the top, at the pitch of its row', () => {
    const g = new Grid();
    g.set(3, 12, true);
    g.set(3, 0, true);
    g.set(3, 7, true);
    const hits = melody(g).hits(3, STEP)!;
    expect(hits.map((h) => h.midi)).toEqual([noteOfY(0), noteOfY(7), noteOfY(12)]);
    expect(
      hits.map((h) => h.midi),
      'G6, D5 and D4',
    ).toEqual([91, 74, 62]);
  });

  it('is as loud as its row and the number that sound together make each note', () => {
    const g = new Grid();
    for (let y = 0; y < SIZE; y++) g.set(5, y, true);
    g.set(6, 4, true);
    const seq = melody(g);
    expect(seq.hits(6, STEP)![0]!.gain).toBe(trimOfY(4));
    const full = seq.hits(5, STEP)!;
    expect(full).toHaveLength(SIZE);
    full.forEach((h, y) => {
      expect(h.gain, `row ${y}`).toBe(levelOfCrowd(SIZE) * trimOfY(y));
    });
  });

  it('is nothing for a step with no tile on', () => {
    expect(melody(new Grid()).hits(9, STEP)).toBeNull();
  });

  it('is heard from the left for the first step to the right for the last, and the middle is the middle', () => {
    expect(panOf(0)).toBeLessThan(0);
    expect(panOf(SIZE - 1)).toBeGreaterThan(0);
    expect(panOf(0)).toBeCloseTo(-panOf(SIZE - 1), 9);
    expect(panOf(7) + panOf(8)).toBeCloseTo(0, 9);
    for (let s = 1; s < SIZE; s++) expect(panOf(s)).toBeGreaterThan(panOf(s - 1));
    expect(Math.abs(panOf(0))).toBeLessThan(0.4);
  });
});

describe('what the picture is told', () => {
  it('is the tiles that were given to the band, even if the grid has changed since, and only once', () => {
    const g = new Grid();
    g.set(2, 5, true);
    g.set(2, 9, true);
    const seq = melody(g);
    seq.hits(2, STEP);
    g.set(2, 5, false);
    g.set(2, 1, true);
    expect(seq.took(2)).toEqual([5, 9]);
    expect(seq.took(2)).toEqual([]);
  });

  it('is nothing for a step that was never asked for, as one the band was too late to play', () => {
    const g = new Grid();
    g.set(4, 4, true);
    const seq = melody(g);
    expect(seq.took(4)).toEqual([]);
    seq.hits(4, STEP);
    seq.forget();
    expect(seq.took(4)).toEqual([]);
  });

  it('is nothing when the step it was last asked for had no tiles, though it had some before', () => {
    const g = new Grid();
    g.set(1, 1, true);
    const seq = melody(g);
    seq.hits(1, STEP);
    g.clear();
    seq.hits(1, STEP);
    expect(seq.took(1)).toEqual([]);
  });
});

describe('the grid played by a band', () => {
  it('plays each tile on its sixteenth, in the pitch of its row, and is told the step at the moment it sounds', () => {
    const g = new Grid();
    g.set(0, 15, true);
    g.set(4, 3, true);
    g.set(4, 10, true);
    g.set(15, 0, true);
    const seq = melody(g);
    const layer: Layer = {
      voice: 'ping',
      joins: 0,
      gain: 0.7,
      bus: 'effects',
      play: ({ step, seconds }) => seq.hits(step, seconds / SIZE),
    };
    const style: Style = {
      name: 'matrix',
      tempo: 120,
      human: 0,
      lookahead: 0.1,
      progression: [CHORDS.C],
      layers: [layer],
    };
    const sound = recorder();
    const band = new Band(sound, new Rng(1), style);
    const told: { step: number; at: number; rows: readonly number[] }[] = [];
    band.onStep = (step) => told.push({ step, at: sound.now(), rows: seq.took(step) });
    band.start();
    for (let t = 0; t < 4.2; t += 1 / 60) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    const played = sound.played.filter((p) => 'midi' in p);
    const firstLoop = played.slice(0, 4).map((p) => ('midi' in p ? p.midi : 0));
    expect(firstLoop).toEqual([noteOfY(15), noteOfY(3), noteOfY(10), noteOfY(0)]);
    expect(played.length).toBeGreaterThanOrEqual(8);
    const starts = played.map((p) => p.at);
    expect(starts[1]! - starts[0]!).toBeCloseTo(4 * 0.125, 6);
    expect(starts[3]! - starts[1]!).toBeCloseTo(11 * 0.125, 6);
    for (const p of played) expect(p.options).toMatchObject({ bus: 'effects' });
    const steps = told.filter((t) => t.rows.length > 0);
    expect(steps.slice(0, 3).map((t) => [t.step, [...t.rows]])).toEqual([
      [0, [15]],
      [4, [3, 10]],
      [15, [0]],
    ]);
    for (const t of steps.slice(0, 3)) {
      const sounded = played.find((p) => Math.abs(p.at - t.at) < 0.03);
      expect(sounded, `a note sounds at step ${t.step}`).toBeDefined();
    }
  });
});

describe('what a beat plays', () => {
  const beat = (g: Grid): Sequence => new Sequence(g, PARTS.beat);

  it('is a drum for each tile that is on, from the top, asked for by the number of the drum', () => {
    const g = new Grid();
    for (const drum of ['kick', 'hatClosed', 'snare'] as const) g.set(2, rowOfDrum(drum), true);
    const hits = beat(g).hits(2, STEP)!;
    expect(hits.map((h) => h.midi)).toEqual([KIT.hatClosed, KIT.snare, KIT.kick]);
  });

  it('puts each drum where it sits in the kit, and not where its step is', () => {
    const g = new Grid();
    g.set(0, rowOfDrum('kick'), true);
    g.set(15, rowOfDrum('kick'), true);
    g.set(7, rowOfDrum('hatClosed'), true);
    const seq = beat(g);
    expect(seq.hits(0, STEP)![0]!.pan).toBe(0);
    expect(seq.hits(15, STEP)![0]!.pan, 'the last step is not on the right for a kick').toBe(0);
    expect(seq.hits(7, STEP)![0]!.pan).toBe(PARTS.beat.rows[rowOfDrum('hatClosed')]!.pan);
    expect(PARTS.beat.rows[rowOfDrum('hatClosed')]!.pan).toBeGreaterThan(0);
  });

  it('is as loud as its row and the number that sound together make each drum, and is not held', () => {
    const g = new Grid();
    for (const drum of ['kick', 'snare', 'hatClosed']) g.set(4, rowOfDrum(drum as 'kick'), true);
    const hits = beat(g).hits(4, STEP)!;
    expect(hits).toHaveLength(3);
    for (const h of hits) {
      const row = PARTS.beat.rows.find((r) => r.midi === h.midi)!;
      expect(h.gain).toBeCloseTo(PARTS.beat.level(3) * row.trim, 9);
      expect(h.seconds, 'a drum rings as long as it rings').toBeUndefined();
    }
  });
});

describe('what the bass plays', () => {
  const bass = (g: Grid): Sequence => new Sequence(g, PARTS.bass);
  const line = (): Grid => {
    const g = new Grid(true);
    g.set(0, 13, true);
    g.set(4, 12, true);
    g.set(10, 11, true);
    return g;
  };

  it('is held until the next note begins, less a breath, so that a line has no gaps and its notes do not run together', () => {
    const seq = bass(line());
    expect(seq.hits(0, STEP)![0]!.seconds).toBeCloseTo(4 * STEP - LEGATO_GAP, 9);
    expect(seq.hits(4, STEP)![0]!.seconds).toBeCloseTo(6 * STEP - LEGATO_GAP, 9);
    expect(seq.hits(10, STEP)![0]!.seconds, 'the last note goes on round the loop to the first').toBeCloseTo(
      6 * STEP - LEGATO_GAP,
      9,
    );
  });

  it('is held for the whole bar when a note is the only one, and then lets go before it comes round again', () => {
    const g = new Grid(true);
    g.set(5, 10, true);
    expect(bass(g).hits(5, STEP)![0]!.seconds).toBeCloseTo(SIZE * STEP - LEGATO_GAP, 9);
  });

  it('is held for less at a faster tempo and for more at a slower one, by the same number of steps', () => {
    const seq = bass(line());
    const fast = seq.hits(0, STEP / 1.35)![0]!.seconds!;
    const slow = seq.hits(0, STEP / 0.7)![0]!.seconds!;
    expect(fast).toBeLessThan(4 * STEP);
    expect(slow).toBeGreaterThan(4 * STEP);
    expect((fast + LEGATO_GAP) * 1.35).toBeCloseTo(4 * STEP, 9);
  });

  it('is never held for less than a moment, even for notes on every step at the fastest tempo', () => {
    const g = new Grid(true);
    for (let x = 0; x < SIZE; x++) g.set(x, 12, true);
    for (let x = 0; x < SIZE; x++)
      expect(bass(g).hits(x, 0.02)![0]!.seconds!, `step ${x}`).toBeGreaterThanOrEqual(0.06);
  });

  it('is in the middle of the speakers for every step, and as loud as the row it is on', () => {
    const seq = bass(line());
    for (const [x, y] of [
      [0, 13],
      [4, 12],
      [10, 11],
    ] as const) {
      const hit = seq.hits(x, STEP)![0]!;
      expect(hit.pan, `step ${x}`).toBe(0);
      expect(hit.gain, `step ${x}`).toBe(PARTS.bass.rows[y]!.trim);
      expect(hit.midi, `step ${x}`).toBe(PARTS.bass.rows[y]!.midi);
    }
  });
});
