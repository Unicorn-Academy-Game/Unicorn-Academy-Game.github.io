import { describe, expect, it } from 'vitest';
import {
  COLUMN_PITCH,
  COLUMNS,
  COMPUTER_FPS,
  COMPUTER_FRAMES,
  COMPUTER_UNIT,
  glowOf,
  KEYBOARD,
  LIT,
  lightAt,
  offsetOfColumn,
  SCREEN,
  timeOfColumn,
} from '../../src/shared/computer';
import { WORLD_PITCH } from '../../tools/art/world/scene';

const columns = Array.from({ length: COLUMNS }, (_, c) => c);
const frames = Array.from({ length: COMPUTER_FRAMES }, (_, f) => f);
const litIn = (frame: number): number[] => columns.filter((c) => glowOf(c, lightAt(frame)) > LIT);

describe('the waking of the computer', () => {
  it('starts and ends with the computer at rest: no key lit, the glass dark and the word on it at its own size', () => {
    for (const f of [0, COMPUTER_FRAMES - 1]) {
      expect(litIn(f), `frame ${f}`).toEqual([]);
      expect(SCREEN[f], `frame ${f}`).toEqual({ glass: 0, letters: 1 });
    }
  });

  it('lights every column of keys in some frame', () => {
    for (const c of columns)
      expect(
        frames.some((f) => litIn(f).includes(c)),
        `column ${c}`,
      ).toBe(true);
  });

  it('goes along the keys from the first to the last, so the columns lit in a later frame are further along', () => {
    const lit = frames.map(litIn).filter((l) => l.length > 0);
    for (let i = 1; i < lit.length; i++)
      expect(Math.min(...lit[i]!), `after frame ${i}`).toBeGreaterThan(Math.min(...lit[i - 1]!));
  });

  it('flashes the glass once and has its letters hidden while it does, then lets the letters jump and settle', () => {
    expect(SCREEN.filter((s) => s.glass === 1)).toHaveLength(1);
    const flash = SCREEN.findIndex((s) => s.glass === 1);
    expect(SCREEN[flash]!.letters).toBe(0);
    const after = SCREEN.slice(flash + 1).map((s) => s.letters);
    expect(after[0]).toBeGreaterThan(1.1);
    for (let i = 1; i < after.length; i++) expect(after[i]!, `step ${i}`).toBeLessThanOrEqual(after[i - 1]!);
    expect(after.at(-1)).toBe(1);
  });

  it('sends a spark up from a column at the moment the light is on it', () => {
    for (const c of columns) expect(lightAt(timeOfColumn(c) * COMPUTER_FPS), `column ${c}`).toBeCloseTo(c, 9);
  });

  it('is over before the computer has finished its own frames, and goes up in time from column to column', () => {
    expect(timeOfColumn(COLUMNS - 1)).toBeLessThan((COMPUTER_FRAMES - 1) / COMPUTER_FPS);
    for (const c of columns.slice(1)) expect(timeOfColumn(c)).toBeGreaterThan(timeOfColumn(c - 1));
  });

  it('is the same on both sides of the middle, and has a column a pitch from the next', () => {
    expect(offsetOfColumn(0)).toBeCloseTo(-offsetOfColumn(COLUMNS - 1), 9);
    expect(offsetOfColumn(5)).toBeCloseTo(0, 9);
    expect(offsetOfColumn(6) - offsetOfColumn(5)).toBeCloseTo(COLUMN_PITCH * COMPUTER_UNIT, 9);
  });

  it('puts the keys where the model, seen from the pitch the world is drawn at, has them: 45 units out and 46 up', () => {
    expect(KEYBOARD.down).toBeCloseTo(Math.sin(WORLD_PITCH) * 45 * COMPUTER_UNIT, 9);
    expect(KEYBOARD.up).toBeCloseTo(Math.cos(WORLD_PITCH) * 46 * COMPUTER_UNIT, 9);
  });
});
