import { describe, expect, it } from 'vitest';
import {
  added,
  emptyPhotos,
  MAX_IMAGE_CHARS,
  MAX_PHOTOS,
  mergePhotos,
  PHOTOS_VERSION,
  type Photo,
  type PhotosRecord,
  readPhotos,
  removed,
  samePhotos,
} from '../../src/shared/photos';

const JPEG = `data:image/jpeg;base64,${'/9j/4AAQSkZJRgABAQAAAQABAAD'.padEnd(64, 'A')}`;

function photo(n: number, over: Partial<Photo> = {}): Photo {
  return { id: `p${String(n).padStart(5, '0')}`, at: 1_000 + n, place: 'forest', image: JPEG, w: 640, h: 300, ...over };
}

const record = (...shots: Photo[]): PhotosRecord => ({ v: PHOTOS_VERSION, shots, gone: [] });
const ids = (r: PhotosRecord): string[] => r.shots.map((p) => p.id);

describe('reading what is stored', () => {
  it('reads nothing as an empty record', () => {
    for (const raw of [undefined, null, 5, 'x', [], true])
      expect(readPhotos(raw)).toEqual({ photos: emptyPhotos(), newer: false });
  });

  it('reads a record it wrote', () => {
    const mine = record(photo(1), photo(2));
    expect(readPhotos(JSON.parse(JSON.stringify(mine)))).toEqual({ photos: mine, newer: false });
  });

  it('leaves a record from a newer version alone and says so', () => {
    expect(readPhotos({ v: PHOTOS_VERSION + 1, shots: [photo(1)], gone: [] })).toEqual({
      photos: emptyPhotos(),
      newer: true,
    });
  });

  it('keeps the pictures it can read and drops the ones it cannot', () => {
    const bad = [
      { ...photo(3), id: 'NO' },
      { ...photo(4), image: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAA' },
      { ...photo(5), image: `data:image/jpeg;base64,${'A'.repeat(MAX_IMAGE_CHARS)}` },
      { ...photo(6), w: 3 },
      { ...photo(7), h: 1.5 },
      { ...photo(8), at: -1 },
      { ...photo(9), place: 'Forest!' },
      { ...photo(10), image: `${JPEG}"><script>` },
      'text',
      null,
    ];
    const read = readPhotos({ v: 1, shots: [photo(1), ...bad, photo(2)], gone: [] });
    expect(ids(read.photos)).toEqual(['p00001', 'p00002']);
  });

  it('puts pictures in the order they were taken, once each', () => {
    const read = readPhotos({ v: 1, shots: [photo(3), photo(1), photo(3), photo(2)], gone: [] });
    expect(ids(read.photos)).toEqual(['p00001', 'p00002', 'p00003']);
  });

  it('does not bring back a picture that was put away', () => {
    const read = readPhotos({ v: 1, shots: [photo(1), photo(2)], gone: ['p00001', 'not an id', 7] });
    expect(ids(read.photos)).toEqual(['p00002']);
    expect(read.photos.gone).toEqual(['p00001']);
  });

  it('keeps only the newest when a record holds too many', () => {
    const many = Array.from({ length: MAX_PHOTOS + 5 }, (_, i) => photo(i));
    const read = readPhotos({ v: 1, shots: many, gone: [] });
    expect(read.photos.shots).toHaveLength(MAX_PHOTOS);
    expect(read.photos.shots[0]!.id).toBe(photo(5).id);
  });
});

describe('putting records together', () => {
  it('holds every picture either has', () => {
    expect(ids(mergePhotos(record(photo(1), photo(3)), record(photo(2), photo(3))))).toEqual([
      'p00001',
      'p00002',
      'p00003',
    ]);
  });

  it('gives the same record whichever comes first', () => {
    const a: PhotosRecord = { ...record(photo(1), photo(2)), gone: ['p00009'] };
    const b: PhotosRecord = { ...record(photo(2), photo(3)), gone: ['p00001'] };
    expect(samePhotos(mergePhotos(a, b), mergePhotos(b, a))).toBe(true);
    expect(ids(mergePhotos(a, b))).toEqual(['p00002', 'p00003']);
  });

  it('keeps what it already had when it is put together with itself', () => {
    const a = record(photo(1), photo(2));
    expect(samePhotos(mergePhotos(a, a), a)).toBe(true);
  });

  it('lets the oldest go when the album is full', () => {
    let full = emptyPhotos();
    for (let i = 0; i < MAX_PHOTOS; i++) full = added(full, photo(i));
    const next = added(full, photo(MAX_PHOTOS));
    expect(next.shots).toHaveLength(MAX_PHOTOS);
    expect(next.shots[0]!.id).toBe(photo(1).id);
    expect(next.shots.at(-1)!.id).toBe(photo(MAX_PHOTOS).id);
  });
});

describe('adding and putting away', () => {
  it('adds a picture at the end', () => {
    expect(ids(added(record(photo(1)), photo(2)))).toEqual(['p00001', 'p00002']);
  });

  it('puts one away and remembers it, so a second tab cannot bring it back', () => {
    const away = removed(record(photo(1), photo(2)), 'p00001');
    expect(ids(away)).toEqual(['p00002']);
    expect(away.gone).toEqual(['p00001']);
    expect(ids(mergePhotos(away, record(photo(1), photo(2))))).toEqual(['p00002']);
    expect(ids(added(away, photo(1)))).toEqual(['p00002']);
  });

  it('leaves the record as it was when the picture is not there', () => {
    const mine = record(photo(1));
    expect(removed(mine, 'p00007')).toBe(mine);
  });

  it('does not write a record that says what it said', () => {
    expect(samePhotos(record(photo(1)), record(photo(1)))).toBe(true);
    expect(samePhotos(record(photo(1)), record(photo(2)))).toBe(false);
    expect(samePhotos(record(photo(1)), removed(record(photo(1), photo(2)), 'p00002'))).toBe(false);
  });
});
