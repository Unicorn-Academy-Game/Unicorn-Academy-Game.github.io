// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { KIT } from '../../../shared/kit';
import { Grid } from './grid';
import { bassNoteOfRow, PART_IDS, PARTS, type PartId } from './parts';
import { fillWith, PRESETS, type Preset } from './presets';
import { noteOfY, SIZE } from './scale';

const preset = (part: PartId, id: string): Preset => PRESETS[part].find((p) => p.id === id)!;
const gridOf = (part: PartId, id: string): Grid => {
  const g = new Grid(PARTS[part].mono);
  fillWith(g, preset(part, id));
  return g;
};
/** The notes (or the drums) of each step, high to low, so a tune is read as a list. */
const heard = (part: PartId, g: Grid): number[][] =>
  Array.from({ length: SIZE }, (_, x) => g.rowsOf(x).map((y) => PARTS[part].rows[y]!.midi));

describe('the tunes that come ready made for every part', () => {
  it('are a grid of 16 rows of 16 each, five for a part, and have different names within a part', () => {
    for (const part of PART_IDS) {
      expect(PRESETS[part], part).toHaveLength(5);
      expect(new Set(PRESETS[part].map((p) => p.id)).size, part).toBe(PRESETS[part].length);
      for (const p of PRESETS[part]) {
        expect(p.art, `${part} ${p.id}`).toHaveLength(SIZE);
        for (const row of p.art) expect(row, `${part} ${p.id}`).toMatch(/^[.#]{16}$/);
      }
    }
  });

  it('have the names they have always had for the melody, so a tune a child has chosen has the name it had', () => {
    expect(PRESETS.melody.map((p) => p.id)).toEqual(['box', 'mountain', 'heart', 'rain', 'lamb']);
    expect(PRESETS.beat.map((p) => p.id)).toEqual(['pulse', 'groove', 'march', 'samba', 'sparkle']);
    expect(PRESETS.bass.map((p) => p.id)).toEqual(['bounce', 'roots', 'walk', 'hill', 'wave']);
  });

  it('put every tile on a grid of the part, with none put out to make room, even for the bass, which is one note at a time', () => {
    for (const part of PART_IDS) {
      for (const p of PRESETS[part]) {
        const drawn = p.art.join('').split('#').length - 1;
        expect(gridOf(part, p.id).count, `${part} ${p.id}`).toBe(drawn);
      }
    }
  });

  it('are not too sparse to be a tune and not so thick that a step is loud', () => {
    for (const { id } of PRESETS.melody) {
      const g = gridOf('melody', id);
      expect(g.count, id).toBeGreaterThanOrEqual(7);
      for (let x = 0; x < SIZE; x++) expect(g.inStep(x), `${id} step ${x}`).toBeLessThanOrEqual(2);
    }
    for (const { id } of PRESETS.beat) {
      const g = gridOf('beat', id);
      expect(g.count, id).toBeGreaterThanOrEqual(7);
      expect(g.count, id).toBeLessThanOrEqual(24);
      for (let x = 0; x < SIZE; x++) expect(g.inStep(x), `${id} step ${x}`).toBeLessThanOrEqual(3);
    }
    for (const { id } of PRESETS.bass) {
      const g = gridOf('bass', id);
      expect(g.count, id).toBeGreaterThanOrEqual(3);
      for (let x = 0; x < SIZE; x++) expect(g.inStep(x), `${id} step ${x}`).toBeLessThanOrEqual(1);
    }
  });

  it('fill a grid in place of what was there', () => {
    const g = gridOf('melody', 'rain');
    expect(g.count).toBe(8);
    fillWith(g, preset('melody', 'lamb'));
    expect(g.count).toBe(7);
    expect(g.has(1, 14), 'a tile of the rain is gone').toBe(false);
  });
});

describe('the tunes of the melody', () => {
  it('play Mary had a little lamb, E D C D E E E', () => {
    const tune = heard('melody', gridOf('melody', 'lamb')).map((notes) => notes[0] ?? null);
    expect(tune.filter((n) => n !== null)).toEqual([64, 62, 60, 62, 64, 64, 64]);
    expect(tune[0]).toBe(64);
    expect(tune[14]).toBeNull();
  });

  it('play the scale up and then down, the same on the way back', () => {
    const tune = heard('melody', gridOf('melody', 'mountain')).map((notes) => notes[0]!);
    expect(tune.slice(0, 8)).toEqual([60, 62, 64, 67, 69, 72, 74, 76]);
    expect(tune.slice(8)).toEqual([...tune.slice(0, 8)].reverse());
  });

  it('play the music box with the left hand on the beats and the right hand between them, and end a step above the start', () => {
    const tune = heard('melody', gridOf('melody', 'box'));
    for (const x of [0, 4, 8, 12]) expect(tune[x], `beat ${x}`).toHaveLength(1);
    for (const x of [2, 6, 10, 14]) expect(tune[x], `between ${x}`).toHaveLength(1);
    expect(tune[0]![0], 'it starts on C').toBe(60);
    expect(tune[14]![0], 'and ends on D, which leads back to C').toBe(74);
  });

  it('make a heart that sounds the same read from the right as from the left, two notes at a time', () => {
    const tune = heard('melody', gridOf('melody', 'heart'));
    expect(gridOf('melody', 'heart').count).toBe(26);
    for (let k = 0; k <= 6; k++) expect(tune[8 - k], `${k} steps either side of the middle`).toEqual(tune[8 + k]);
    for (let x = 2; x <= 14; x++) expect(tune[x], `step ${x}`).toHaveLength(2);
    for (const x of [0, 1, 15]) expect(tune[x], `step ${x} is outside it`).toEqual([]);
  });

  it('keep the rain high, in the top half of the notes, and with a step of quiet between most drops', () => {
    const tune = heard('melody', gridOf('melody', 'rain'));
    for (const notes of tune) for (const n of notes) expect(n).toBeGreaterThan(noteOfY(SIZE / 2));
    expect(tune.filter((notes) => notes.length > 0)).toHaveLength(8);
  });
});

describe('the beats', () => {
  const kit = (id: string): number[][] => heard('beat', gridOf('beat', id));
  const stepsOf = (id: string, drum: keyof typeof KIT): number[] =>
    kit(id)
      .map((drums, x) => (drums.includes(KIT[drum]) ? x : -1))
      .filter((x) => x >= 0);

  it('begin with the pulse: the kick on the beats, the snare on the second and the fourth, and the hat between', () => {
    expect(stepsOf('pulse', 'kick')).toEqual([0, 4, 8, 12]);
    expect(stepsOf('pulse', 'snare')).toEqual([4, 12]);
    expect(stepsOf('pulse', 'hatClosed')).toEqual([2, 6, 10, 14]);
  });

  it('give the groove a kick that is behind the beat and a hat that opens before it comes round', () => {
    expect(stepsOf('groove', 'kick')).toEqual([0, 6, 10]);
    expect(stepsOf('groove', 'hatClosed')).toHaveLength(8);
    expect(stepsOf('groove', 'hatOpen')).toEqual([15]);
  });

  it('give the march a fill of the three toms down the last three steps, from the high one to the low one', () => {
    expect([stepsOf('march', 'tomHigh'), stepsOf('march', 'tomMid'), stepsOf('march', 'tomLow')]).toEqual([
      [13],
      [14],
      [15],
    ]);
  });

  it('let the samba go round the clave and keep the shaker going on every other step', () => {
    expect(stepsOf('samba', 'cowbell')).toEqual([0, 3, 6, 10, 12]);
    expect(stepsOf('samba', 'shaker')).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it('keep the sparkle soft, with no kick and no snare under it', () => {
    for (const drums of kit('sparkle')) {
      expect(drums).not.toContain(KIT.kick);
      expect(drums).not.toContain(KIT.snare);
    }
  });

  it('are all on a grid of drums in which every tile is a drum of the kit, struck on its own row', () => {
    const numbers = new Set<number>(Object.values(KIT));
    for (const { id } of PRESETS.beat)
      for (const drums of kit(id)) for (const d of drums) expect(numbers, id).toContain(d);
  });
});

describe('the bass lines', () => {
  const line = (id: string): (number | null)[] => heard('bass', gridOf('bass', id)).map((notes) => notes[0] ?? null);
  const played = (id: string): number[] => line(id).filter((n): n is number => n !== null);
  const C2 = 36;
  const G2 = 43;

  it('are all between C2 and C4, which is where a bass is, and none of them is a note the speaker of a phone cannot make', () => {
    for (const { id } of PRESETS.bass) {
      for (const n of played(id)) {
        expect(n, id).toBeGreaterThanOrEqual(bassNoteOfRow(2));
        expect(n, id).toBeLessThanOrEqual(60);
      }
    }
  });

  it('bounce between the root and the root an octave up, on the steps between the beats where the kick of the pulse is not', () => {
    const steps = line('bounce').flatMap((n, x) => (n === null ? [] : [x]));
    expect(steps).toEqual([2, 6, 10, 14]);
    expect(played('bounce')).toEqual([C2, C2 + 12, C2, C2 + 12]);
  });

  it('start on the root, which is the note of the chord the melody starts on, for the lines that start on a beat', () => {
    for (const id of ['roots', 'walk', 'hill']) expect(line(id)[0], id).toBe(C2);
  });

  it('walk up the chord C E G, a step up to A, and back down by G and E', () => {
    expect(played('walk')).toEqual([C2, 40, G2, 45, G2, 40]);
  });

  it('go up the hill a note at a time and come down it, and the two sides are the same notes', () => {
    const tune = played('hill');
    expect(tune).toEqual([36, 38, 40, 43, 45, 43, 40, 38]);
    expect(tune.slice(0, 5), 'up to the top').toEqual([...tune.slice(0, 5)].sort((a, b) => a - b));
    expect(tune.slice(5), 'and down by the notes it came up by').toEqual(tune.slice(1, 4).reverse());
  });
});
