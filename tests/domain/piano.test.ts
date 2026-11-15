import { describe, expect, it } from 'vitest';
import {
  fingerAt,
  noteOfKey,
  offsetOfKey,
  PIANO_FPS,
  PIANO_FRAMES,
  PIANO_KEYS,
  pressOf,
  timeOfKey,
} from '../../src/shared/piano';

const keys = Array.from({ length: PIANO_KEYS }, (_, k) => k);
const frames = Array.from({ length: PIANO_FRAMES }, (_, f) => f);

describe('the run up the piano', () => {
  it('starts and ends with the piano at rest', () => {
    for (const f of [0, PIANO_FRAMES - 1])
      for (const k of keys) expect(pressOf(k, fingerAt(f)), `key ${k} in frame ${f}`).toBe(0);
  });

  it('puts the finger on every key of the key in some frame, hard enough to light it', () => {
    for (const k of keys)
      expect(Math.max(...frames.map((f) => pressOf(k, fingerAt(f)))), `key ${k}`).toBeGreaterThan(0.5);
  });

  it('sends a note up from a key at the moment the finger is on it', () => {
    for (const k of keys) expect(fingerAt(timeOfKey(k) * PIANO_FPS), `key ${k}`).toBeCloseTo(k, 9);
  });

  it('goes from the low end to the high end, so the notes rise', () => {
    for (const k of keys.slice(1)) expect(timeOfKey(k)).toBeGreaterThan(timeOfKey(k - 1));
  });

  it('is over before the piano has finished its own frames', () => {
    expect(timeOfKey(PIANO_KEYS - 1)).toBeLessThan((PIANO_FRAMES - 1) / PIANO_FPS);
  });

  it('is the same on both sides of the middle', () => {
    expect(offsetOfKey(0)).toBeCloseTo(-offsetOfKey(PIANO_KEYS - 1), 9);
    expect(offsetOfKey(6) + offsetOfKey(7)).toBeCloseTo(0, 9);
  });
});

describe('the notes of the keys', () => {
  it('gives the five notes of the key, C D E G A, to the white keys that are not F or B, in both octaves', () => {
    expect(keys.map(noteOfKey)).toEqual([0, 1, 2, null, 3, 4, null, 0, 1, 2, null, 3, 4, null]);
  });
});
