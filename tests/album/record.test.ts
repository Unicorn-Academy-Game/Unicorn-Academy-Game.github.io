import { describe, expect, it } from 'vitest';
import {
  ALBUM_VERSION,
  type AlbumRecord,
  dayOf,
  earned,
  emptyAlbum,
  mergeAlbum,
  noted,
  readAlbum,
  sameAlbum,
} from '../../src/shared/album';

const some = (): AlbumRecord => ({
  v: ALBUM_VERSION,
  counts: { 'cast:light': 12, swim: 1, 'produce:apple': 40 },
  got: { hello: 20_400, spell: 20_401 },
});

describe('reading what is stored', () => {
  it('gives an empty record for nothing, and for something that is not a record', () => {
    for (const raw of [undefined, null, 7, 'album', [], true])
      expect(readAlbum(raw)).toEqual({ album: emptyAlbum(), newer: false });
  });

  it('reads back what was written, whole', () => {
    expect(readAlbum(JSON.parse(JSON.stringify(some())))).toEqual({ album: some(), newer: false });
  });

  it('says a newer record is newer and reads it as empty, so that it can be left alone', () => {
    expect(readAlbum({ ...some(), v: ALBUM_VERSION + 1 })).toEqual({ album: emptyAlbum(), newer: true });
  });

  it('keeps what can be read and leaves out what cannot, so one bad entry never costs the rest', () => {
    const raw = JSON.parse(
      '{"v":1,"counts":{"swim":3,"Bad":2,"cast:fire":-1,"photos":2.5,"constructor":4,"__proto__":{"x":1},' +
        '"produce:pearl":5000000,"produce:ruby":1e99,"castle-grand":"yes","presents":0,"baubles":7},' +
        '"got":{"hello":5,"spell":"today","map":-2,"toString":9,"Photo":1,"swim":0}}',
    );
    const { album } = readAlbum(raw);
    expect(album.counts).toEqual({ swim: 3, 'produce:pearl': 1_000_000, baubles: 7 });
    expect(album.got).toEqual({ hello: 5, swim: 0 });
    expect(Object.getPrototypeOf(album.counts)).toBe(Object.prototype);
  });

  it('reads a record that is missing a part, and one whose parts are the wrong shape', () => {
    expect(readAlbum({ v: 1 }).album).toEqual(emptyAlbum());
    expect(readAlbum({ v: 1, counts: [1, 2], got: 'all' }).album).toEqual(emptyAlbum());
    expect(readAlbum({ counts: { swim: 2 } }).album.counts).toEqual({ swim: 2 });
  });

  it('keeps no more names than the limit, so a record that grew wild cannot fill the device', () => {
    const counts = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`n${i}`, 1]));
    expect(Object.keys(readAlbum({ v: 1, counts }).album.counts)).toHaveLength(256);
  });
});

describe('putting records together', () => {
  it('keeps the larger count and every sticker, with the earlier day for one both have', () => {
    const other: AlbumRecord = {
      v: ALBUM_VERSION,
      counts: { 'cast:light': 3, 'cast:fire': 8 },
      got: { hello: 20_300, swim: 20_500 },
    };
    expect(mergeAlbum(some(), other)).toEqual({
      v: ALBUM_VERSION,
      counts: { 'cast:light': 12, swim: 1, 'produce:apple': 40, 'cast:fire': 8 },
      got: { hello: 20_300, spell: 20_401, swim: 20_500 },
    });
  });

  it('gives the same record whichever comes first, and the same record again for itself', () => {
    const other: AlbumRecord = { v: ALBUM_VERSION, counts: { swim: 9 }, got: { spell: 3 } };
    expect(sameAlbum(mergeAlbum(some(), other), mergeAlbum(other, some()))).toBe(true);
    expect(sameAlbum(mergeAlbum(some(), some()), some())).toBe(true);
  });

  it('never loses a count or a sticker that either side has', () => {
    const a = noted(noted(emptyAlbum(), 'swim', 4), 'photos');
    const b = earned(emptyAlbum(), ['hello', 'photo'], 10);
    const both = mergeAlbum(a, b);
    expect(both.counts).toEqual({ swim: 4, photos: 1 });
    expect(Object.keys(both.got).sort()).toEqual(['hello', 'photo']);
  });
});

describe('adding to a record', () => {
  it('counts what is done, and leaves the record it was given as it was', () => {
    const start = emptyAlbum();
    const next = noted(start, 'swim');
    expect(next.counts).toEqual({ swim: 1 });
    expect(start.counts).toEqual({});
    expect(noted(next, 'swim', 4).counts).toEqual({ swim: 5 });
  });

  it('stops a count at its limit, and ignores a name or an amount that makes no sense', () => {
    const top = noted(emptyAlbum(), 'swim', 5_000_000);
    expect(top.counts.swim).toBe(1_000_000);
    expect(noted(top, 'swim')).toBe(top);
    const start = emptyAlbum();
    for (const [name, by] of [
      ['Swim', 1],
      ['', 1],
      ['swim', 0],
      ['swim', -3],
      ['swim', Number.NaN],
      ['constructor', 1],
    ] as const)
      expect(noted(start, name, by)).toBe(start);
  });

  it('records a sticker once, on the day it came, and not again', () => {
    const first = earned(emptyAlbum(), ['hello', 'spell'], 20_400);
    expect(first.got).toEqual({ hello: 20_400, spell: 20_400 });
    expect(earned(first, ['hello'], 20_999)).toBe(first);
    expect(earned(first, ['hello', 'photo'], 20_999).got).toEqual({ hello: 20_400, spell: 20_400, photo: 20_999 });
  });

  it('takes the day as a day, however the clock is wrong', () => {
    expect(dayOf(0)).toBe(0);
    expect(dayOf(86_400_000 * 20_400 + 5)).toBe(20_400);
    expect(dayOf(-5_000_000_000)).toBe(0);
    expect(dayOf(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(3_000_000);
  });

  it('says two records that say the same are the same, whatever order they were made in', () => {
    const a = noted(noted(emptyAlbum(), 'swim'), 'photos');
    const b = noted(noted(emptyAlbum(), 'photos'), 'swim');
    expect(sameAlbum(a, b)).toBe(true);
    expect(sameAlbum(a, noted(b, 'swim'))).toBe(false);
    expect(sameAlbum(a, earned(b, ['hello'], 1))).toBe(false);
  });
});
