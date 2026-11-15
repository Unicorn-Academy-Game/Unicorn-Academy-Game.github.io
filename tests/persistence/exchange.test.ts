import { describe, expect, it } from 'vitest';
import { EXPORT_APP, exportFile, parseImport, summarize } from '../../src/shared/exchange';
import { MAX_SAVE_BYTES } from '../../src/shared/save';
import { snap } from './helpers';

const AT = '2026-10-24T09:30:00.000Z';

describe('the export file', () => {
  it('is named for the game and the day, and reads back as the same world', () => {
    const save = snap({ recruited: ['wildstar', 'leaf'] });
    const { filename, text } = exportFile(save, AT);
    expect(filename).toBe('unicorn-academy-2026-10-24.json');
    expect(parseImport(text)).toEqual({ ok: true, save });
  });

  it('holds the world and when it was made, and nothing else that could identify anyone', () => {
    const { text } = exportFile(snap(), AT);
    const file = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(['app', 'exportedAt', 'format', 'save']);
    expect(file.app).toBe(EXPORT_APP);
    expect(text).not.toMatch(/token|cookie|authorization|email|deviceId/i);
  });
});

describe('importing a file', () => {
  it('refuses a file that names some other app', () => {
    const save = snap({ recruited: ['wildstar', 'storm'] });
    const other = JSON.stringify({ app: 'some-other-game', format: 1, exportedAt: AT, save });
    expect(parseImport(other)).toMatchObject({ ok: false });
  });

  it('accepts a bare save, which is what the damaged-data export holds', () => {
    const save = snap();
    expect(parseImport(JSON.stringify(save))).toEqual({ ok: true, save });
  });

  it.each([
    ['text that is not JSON', 'this is not a world'],
    ['JSON that is not an object', '42'],
    ['null', 'null'],
    ['an object with nothing in it', '{}'],
    [
      'a wrapper around a broken save',
      JSON.stringify({ app: EXPORT_APP, format: 1, exportedAt: AT, save: { schemaVersion: 1 } }),
    ],
    [
      'a wrapper from another app',
      JSON.stringify({ app: 'someone-elses-game', format: 1, exportedAt: AT, save: snap() }),
    ],
    [
      'a wrapper with something extra added',
      JSON.stringify({ app: EXPORT_APP, format: 1, exportedAt: AT, save: snap(), extra: 1 }),
    ],
  ])('refuses %s, and says so in words a parent can read', (_name, text) => {
    const result = parseImport(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^That (file|world)/);
  });

  it('tells a parent when the file came from a newer version of the game', () => {
    const newer = { ...snap(), schemaVersion: 2 };
    const result = parseImport(JSON.stringify(newer));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toMatch(/newer version/);
  });

  it('refuses a file that is far too big without trying to read it', () => {
    const result = parseImport(' '.repeat(MAX_SAVE_BYTES + 10_000));
    expect(result).toEqual({ ok: false, reason: 'That file is too big to be a saved world.' });
  });

  it('refuses a world with a friend listed twice, because the save rules say so', () => {
    const bad = JSON.stringify(snap({ recruited: ['wildstar', 'leaf', 'leaf'] }));
    expect(parseImport(bad)).toMatchObject({ ok: false });
  });
});

describe('summarizing a world for a parent', () => {
  it('counts the friends and the places', () => {
    expect(
      summarize(snap({ recruited: ['wildstar', 'leaf', 'storm'], visitedMaps: ['forest', 'stable'], mapId: 'stable' })),
    ).toEqual({ friends: 3, places: 2, mapId: 'stable' });
  });
});
