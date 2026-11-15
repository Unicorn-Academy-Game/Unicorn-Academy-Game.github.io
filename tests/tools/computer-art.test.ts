import { beforeAll, describe, expect, it } from 'vitest';
import { COMPUTER_FRAMES, COMPUTER_UNIT, SCREEN } from '../../src/shared/computer';
import type { Rgba } from '../../tools/art/core/image';
import { COMPUTER_CANVAS, renderComputer } from '../../tools/art/world/computer';

const same = (a: Rgba, b: Rgba): boolean => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
const pixel = (f: Rgba, x: number, y: number): readonly number[] =>
  Array.from(f.data.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4));

describe('the computer drawn', () => {
  let frames: Rgba[] = [];
  beforeAll(() => {
    frames = Array.from({ length: COMPUTER_FRAMES }, (_, f) => renderComputer(f));
  }, 180_000);

  it('is one picture of the size of its canvas for each frame of the waking', () => {
    expect(frames).toHaveLength(SCREEN.length);
    for (const f of frames) expect([f.width, f.height]).toEqual([COMPUTER_CANVAS.w, COMPUTER_CANVAS.h]);
  });

  it('is the same picture at the start and at the end, which is the computer at rest, and a different one in each frame between', () => {
    expect(same(frames[0]!, frames.at(-1)!)).toBe(true);
    for (let f = 1; f < COMPUTER_FRAMES - 1; f++) expect(same(frames[f]!, frames[0]!), `frame ${f}`).toBe(false);
  });

  it('stands inside its canvas with a margin of clear pixels all round, so nothing is cut off at the edge', () => {
    for (const [k, f] of frames.entries()) {
      for (let x = 0; x < f.width; x++)
        for (const y of [0, 1, f.height - 2, f.height - 1])
          expect(pixel(f, x, y)[3], `frame ${k} at ${x},${y}`).toBe(0);
      for (let y = 0; y < f.height; y++)
        for (const x of [0, 1, f.width - 2, f.width - 1]) expect(pixel(f, x, y)[3], `frame ${k} at ${x},${y}`).toBe(0);
    }
  });

  it('has its glass dark at rest and pale in the flash, in a place where no letter is', () => {
    // 58 units right of the middle of the glass, which the letters do not reach, and about the
    // glass's height: 78 units up on the screen.
    const x = Math.round(COMPUTER_CANVAS.ox + 58 * COMPUTER_UNIT);
    const y = Math.round(COMPUTER_CANVAS.oy - 78.4 * COMPUTER_UNIT);
    const rest = pixel(frames[0]!, x, y);
    const flash = pixel(frames[SCREEN.findIndex((s) => s.glass === 1)]!, x, y);
    expect(Math.max(rest[0]!, rest[1]!), 'the glass at rest is dark').toBeLessThan(80);
    expect(rest[2]!, 'and blue').toBeGreaterThan(90);
    expect(Math.min(flash[0]!, flash[1]!, flash[2]!), 'the flash is nearly white').toBeGreaterThan(190);
  });
});
