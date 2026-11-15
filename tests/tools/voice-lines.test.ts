import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_CLIPS } from '../../src/learning/course-clips';
import { linesJson } from '../../tools/voice/lines-json';

describe('the list of clips the voice generator speaks', () => {
  it('is the list the game asks from, so a clip the game needs is never one the voice was not given', () => {
    expect(readFileSync('tools/voice/lines.json', 'utf8'), 'run `pnpm voice:lines` to write it again').toBe(
      linesJson(),
    );
  });

  it('has an id, the words as they are shown, and at most how they are said and the sentence they are cut from, so the generator reads plain data', () => {
    const rows = JSON.parse(readFileSync('tools/voice/lines.json', 'utf8')) as Record<string, unknown>[];
    expect(rows).toHaveLength(ALL_CLIPS.length);
    for (const row of rows) {
      expect(
        Object.keys(row)
          .filter((key) => key !== 'say' && key !== 'frame')
          .sort(),
      ).toEqual(['id', 'text']);
      if ('say' in row) expect(row.say).not.toBe(row.text);
      if ('frame' in row)
        expect(row.frame, `${row.id}: the sentence has the words in it`).toContain(`[${row.say ?? row.text}`);
    }
  });
});
