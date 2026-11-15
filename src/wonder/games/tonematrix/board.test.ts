// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { Board } from './board';
import { PART_IDS, PARTS } from './parts';
import { PRESETS } from './presets';
import { SIZE } from './scale';

const boards = () => PART_IDS.map((id) => new Board(PARTS[id]));

describe('a part of the song as the game keeps it', () => {
  it('begins on the tune it is given, which is on its grid and in plain view with nothing fading in', () => {
    for (const board of boards()) {
      board.begin(2);
      const id = board.part.id;
      expect(board.preset.id, id).toBe(PRESETS[id][2]!.id);
      expect(board.grid.count, `${id} has its tune on the grid`).toBeGreaterThan(3);
      for (const { x, y } of board.grid.tiles()) expect(board.shown[x * SIZE + y], `${id} at ${x},${y}`).toBe(1);
    }
  });

  it('goes on to the next tune in place of what was there, and round to the first after the last', () => {
    for (const board of boards()) {
      const id = board.part.id;
      board.begin(0);
      const seen = [board.preset.id];
      for (let i = 1; i < PRESETS[id].length; i++) seen.push(board.next().id);
      expect(seen, id).toEqual(PRESETS[id].map((p) => p.id));
      expect(board.next().id, `${id} comes round`).toBe(PRESETS[id][0]!.id);
    }
  });

  it('loses what the player painted when the next tune comes, and has nothing of the tune before', () => {
    for (const board of boards()) {
      board.begin(0);
      const id = board.part.id;
      const before = board.grid.tiles().length;
      board.grid.set(15, 0, true);
      board.grid.set(14, 0, true);
      board.next();
      expect(board.grid.has(15, 0) && board.grid.has(14, 0), `${id}: her tiles are gone`).toBe(false);
      expect(board.grid.tiles().length, id).not.toBe(before + 2);
    }
  });

  it('keeps the bass to one note at a step through every tune, and the other two as thick as they are written', () => {
    for (const board of boards()) {
      const id = board.part.id;
      for (let tune = 0; tune < PRESETS[id].length; tune++) {
        board.begin(tune);
        for (let x = 0; x < SIZE; x++)
          if (board.part.mono)
            expect(board.grid.inStep(x), `${id} ${PRESETS[id][tune]!.id} step ${x}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('has a limit of its own on the notes the player rings, which is the limit of its part and is shared with no other part', () => {
    const all = boards();
    expect(new Set(all.map((b) => b.ringing)).size, 'each part has its own').toBe(PART_IDS.length);
    const rung = all.map((board) => {
      // A finger on the keys for a fifth of a second, a note every hundredth, and nothing else is
      // ringing on the part.
      let allowed = 0;
      for (let i = 0; i < 20; i++) allowed += board.ringing.take(0.01 * i, 1, board.part.own.level).allowed;
      return allowed;
    });
    expect(rung, 'the most each lets through in a quarter of a second is the budget of its part').toEqual(
      all.map((b) => b.part.own.budget),
    );
    expect(rung[2]!, 'the bass has the least room').toBeLessThan(rung[1]!);
    expect(rung[1]!, 'and the beat less than the melody').toBeLessThan(rung[0]!);
    // What one part has rung is no matter to the rest.
    const [melody, beat] = all;
    melody!.ringing.clear();
    expect(beat!.ringing.take(0.5, 1, beat!.part.own.level).allowed).toBe(1);
  });

  describe('as it comes into view and leaves it', () => {
    it('comes to full view over a moment when it is chosen, and goes over a moment when it is not', () => {
      for (const board of boards()) {
        board.begin(0);
        expect(board.focus).toBe(0);
        board.tick(1 / 60, true);
        expect(board.focus, 'one frame is not the whole of it').toBeGreaterThan(0);
        expect(board.focus).toBeLessThan(0.5);
        for (let i = 0; i < 60; i++) board.tick(1 / 60, true);
        expect(board.focus).toBeGreaterThan(0.99);
        for (let i = 0; i < 60; i++) board.tick(1 / 60, false);
        expect(board.focus).toBeLessThan(0.01);
      }
    });

    it('fades a tile in when it is painted and out when it is rubbed out, and no sooner', () => {
      const board = new Board(PARTS.melody);
      board.grid.set(4, 4, true);
      board.tick(1 / 60, true);
      expect(board.shown[4 * SIZE + 4]).toBeGreaterThan(0);
      expect(board.shown[4 * SIZE + 4]).toBeLessThan(1);
      for (let i = 0; i < 60; i++) board.tick(1 / 60, true);
      expect(board.shown[4 * SIZE + 4]).toBeGreaterThan(0.99);
      board.grid.set(4, 4, false);
      for (let i = 0; i < 60; i++) board.tick(1 / 60, true);
      expect(board.shown[4 * SIZE + 4]).toBeLessThan(0.01);
    });

    it('lets the pulse of its tab die away after a note, so that only a part that is playing now glows', () => {
      const board = new Board(PARTS.beat);
      board.pulse = 1;
      for (let i = 0; i < 90; i++) board.tick(1 / 60, false);
      expect(board.pulse).toBeLessThan(0.01);
    });

    it('is the same however the frames fall, to within the eye', () => {
      const a = new Board(PARTS.melody);
      const b = new Board(PARTS.melody);
      a.grid.set(2, 2, true);
      b.grid.set(2, 2, true);
      a.pulse = 1;
      b.pulse = 1;
      for (let i = 0; i < 60; i++) a.tick(1 / 60, true);
      for (let i = 0; i < 30; i++) b.tick(1 / 30, true);
      expect(Math.abs(a.focus - b.focus)).toBeLessThan(0.02);
      expect(Math.abs(a.pulse - b.pulse)).toBeLessThan(0.01);
      expect(Math.abs(a.shown[2 * SIZE + 2]! - b.shown[2 * SIZE + 2]!)).toBeLessThan(0.02);
    });
  });

  it('goes still on calm, with everything that moves at rest and what is on the grid where it was', () => {
    for (const board of boards()) {
      board.begin(0);
      const tiles = board.grid.tiles();
      board.pulse = 1;
      board.flare.fill(1);
      board.sweep.fill(1);
      board.keyGlow.fill(1);
      board.pop.fill(0.5);
      board.calm();
      expect(board.pulse).toBe(0);
      expect(
        [...board.flare, ...board.sweep, ...board.keyGlow, ...board.pop].every((v) => v === 0),
        board.part.id,
      ).toBe(true);
      expect(board.grid.tiles(), board.part.id).toEqual(tiles);
    }
  });
});
