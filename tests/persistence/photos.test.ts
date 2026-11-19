import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { PhotosModel, type PhotosStore } from '../../src/persistence/photos';
import { WRITE_DELAY_MS } from '../../src/persistence/settings';
import { LocalStore } from '../../src/persistence/store';
import { added, emptyPhotos, PHOTOS_VERSION, type Photo, type PhotosRecord, removed } from '../../src/shared/photos';
import { Clock } from '../game/clock';

let name = '';
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  name = `photos-${Math.random().toString(16).slice(2)}`;
});

const JPEG = `data:image/jpeg;base64,${'/9j/4AAQSkZJRgABAQAAAQABAAD'.padEnd(64, 'A')}`;
const shot = (n: number): Photo => ({
  id: `p${String(n).padStart(5, '0')}`,
  at: 1_000 + n,
  place: 'forest',
  image: JPEG,
  w: 640,
  h: 300,
});
const album = (...ns: number[]): PhotosRecord => ns.reduce((all, n) => added(all, shot(n)), emptyPhotos());
const ids = (record: PhotosRecord): string[] => record.shots.map((p) => p.id);

/** What is on the device, read by a connection of its own, as a second tab or a later visit would. */
async function onDisk(key = 'photos'): Promise<unknown> {
  const db = await openDB(name);
  try {
    return await db.get('learner', key);
  } finally {
    db.close();
  }
}

async function putOnDisk(value: unknown, key = 'photos'): Promise<void> {
  await LocalStore.open(name);
  const db = await openDB(name);
  try {
    await db.put('learner', value, key);
  } finally {
    db.close();
  }
}

/** A device that holds one record in memory and says what was asked of it. */
function device(overrides: Partial<PhotosStore> = {}) {
  let stored: unknown;
  const calls = { writes: 0, clears: 0 };
  const store: PhotosStore = {
    photos: async () => stored,
    updatePhotos: async (change) => {
      const next = change(stored);
      if (next) {
        stored = next;
        calls.writes += 1;
      }
      return next;
    },
    clearPhotos: async () => {
      stored = undefined;
      calls.clears += 1;
    },
    ...overrides,
  };
  return {
    store,
    calls,
    put: (value: unknown) => {
      stored = value;
    },
    get: () => stored,
  };
}

describe('the pictures, on the device', () => {
  it('starts empty and untouched when nothing is stored, and with no storage at all', async () => {
    const model = await PhotosModel.load(await LocalStore.open(name));
    expect(model.get()).toEqual(emptyPhotos());
    expect(model.untouched).toBe(true);
    expect((await PhotosModel.load(null)).get()).toEqual(emptyPhotos());
  });

  it('writes a picture shortly after it is taken, and a later visit reads it back', async () => {
    const clock = new Clock();
    const model = await PhotosModel.load(await LocalStore.open(name), clock);
    model.set(album(1));
    expect(await onDisk(), 'not yet: the write waits for a moment, in case there is more').toBeUndefined();
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(await onDisk()).toEqual(album(1));
    expect((await PhotosModel.load(await LocalStore.open(name))).get()).toEqual(album(1));
  });

  it('writes one record for a run of pictures, and nothing for a change that changes nothing', async () => {
    const clock = new Clock();
    const { store, calls } = device();
    const model = await PhotosModel.load(store, clock);
    model.set(emptyPhotos());
    clock.advance(WRITE_DELAY_MS * 2);
    await model.flush();
    expect(calls.writes).toBe(0);
    model.set(album(1));
    model.set(album(1, 2));
    model.set(album(1, 2, 3));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(1);
  });

  it('puts what it has together with what another tab stored, and loses no picture', async () => {
    const model = await PhotosModel.load(await LocalStore.open(name), new Clock());
    await putOnDisk(album(2));
    model.set(album(1));
    await model.flush();
    expect(ids((await onDisk()) as PhotosRecord)).toEqual(['p00001', 'p00002']);
    expect(ids(model.get()), 'and this tab knows the other has one').toEqual(['p00001', 'p00002']);
  });

  it('does not bring back a picture that was put away, from a tab that still holds it', async () => {
    const model = await PhotosModel.load(await LocalStore.open(name), new Clock());
    model.set(album(1, 2));
    await model.flush();
    model.set(removed(model.get(), 'p00002'));
    await model.flush();
    expect(ids((await onDisk()) as PhotosRecord)).toEqual(['p00001']);
    await putOnDisk(album(1, 2));
    model.set(removed(model.get(), 'p00001'));
    await model.flush();
    expect(ids((await onDisk()) as PhotosRecord), 'the stale tab wrote both, and both are away').toEqual([]);
  });

  it('tells a listener of a picture, and of what another tab added, and not of a change that changes nothing', async () => {
    const model = await PhotosModel.load(await LocalStore.open(name), new Clock());
    const heard: string[][] = [];
    const stop = model.subscribe((record) => heard.push(ids(record)));
    model.set(album(1));
    model.set(album(1));
    await putOnDisk(album(2));
    model.set(album(1, 3));
    await model.flush();
    expect(heard).toEqual([['p00001'], ['p00001', 'p00003'], ['p00001', 'p00002', 'p00003']]);
    stop();
    model.set(album(1, 2, 3, 4));
    expect(heard).toHaveLength(3);
  });

  it('never writes over a record that a newer version of the game wrote, and goes on in memory', async () => {
    const clock = new Clock();
    const newer = { v: PHOTOS_VERSION + 1, shots: [shot(9)], gone: [] };
    const { store, calls, put, get } = device();
    put(newer);
    const model = await PhotosModel.load(store, clock);
    expect(model.get()).toEqual(emptyPhotos());
    model.set(album(1));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(get()).toBe(newer);
    expect(ids(model.get()), 'the player still has the picture until the page closes').toEqual(['p00001']);
    expect(await model.reset(), "and a record that is not this version's is not cleared either").toBe(false);
    expect(calls.clears).toBe(0);
  });

  it('does not write over what it could not read at all', async () => {
    const clock = new Clock();
    const { store, calls } = device({
      photos: async () => {
        throw new Error('the device would not give it up');
      },
    });
    const model = await PhotosModel.load(store, clock);
    model.set(album(1));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(ids(model.get())).toEqual(['p00001']);
  });

  it('tries again after a write that failed', async () => {
    const clock = new Clock();
    let failing = true;
    const inner = device();
    const { store } = device({
      updatePhotos: async (change) => {
        if (failing) throw new Error('the disk was full');
        return inner.store.updatePhotos(change);
      },
    });
    const model = await PhotosModel.load(store, clock);
    model.set(album(1));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(inner.calls.writes).toBe(0);
    failing = false;
    await model.flush();
    expect(inner.get()).toEqual(album(1));
  });

  it('holds what a look around does and never writes it', async () => {
    const clock = new Clock();
    const { store, calls, put } = device();
    put(album(1));
    const model = (await PhotosModel.load(store, clock)).detached();
    expect(model.get()).toEqual(album(1));
    model.set(album(1, 2));
    clock.advance(WRITE_DELAY_MS * 3);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(ids(model.get())).toEqual(['p00001', 'p00002']);
  });

  it('starts again when a parent says so, and the next visit begins empty', async () => {
    const clock = new Clock();
    const model = await PhotosModel.load(await LocalStore.open(name), clock);
    model.set(album(1));
    await model.flush();
    expect(await model.reset()).toBe(true);
    expect(model.get()).toEqual(emptyPhotos());
    expect(await onDisk()).toBeUndefined();
    clock.advance(WRITE_DELAY_MS * 3);
    await model.flush();
    expect(await onDisk(), 'a write that was waiting when the player started again is gone too').toBeUndefined();
  });

  it('drops a damaged picture and keeps the rest', async () => {
    await putOnDisk({ v: PHOTOS_VERSION, shots: [shot(1), { ...shot(2), image: 'x' }, shot(3)], gone: [] });
    const model = await PhotosModel.load(await LocalStore.open(name));
    expect(ids(model.get())).toEqual(['p00001', 'p00003']);
  });
});

describe('beside the rest of what the player keeps', () => {
  it('leaves the spell book, the play record and the stickers alone, and they leave it alone', async () => {
    const store = await LocalStore.open(name);
    const book = { schemaVersion: 1, words: {} };
    const play = { v: 1, memory: { played: 2, sizes: {} }, maths: { played: 0, strands: {} } };
    const stickers = { v: 1, counts: {}, got: { hello: 20_400 } };
    await putOnDisk(book, 'profile');
    await putOnDisk(play, 'play');
    await putOnDisk(stickers, 'album');
    const model = await PhotosModel.load(store, new Clock());
    model.set(album(1));
    await model.flush();
    expect(await onDisk('profile')).toEqual(book);
    expect(await onDisk('play')).toEqual(play);
    expect(await onDisk('album')).toEqual(stickers);
    await store.clearLearner();
    await store.clearPlay();
    await store.clearAlbum();
    expect(ids((await onDisk()) as PhotosRecord), 'starting the other records again keeps the pictures').toEqual([
      'p00001',
    ]);
  });

  it('does not need a new version of the database, so a release from before ignores it', async () => {
    await LocalStore.open(name);
    const db = await openDB(name);
    try {
      expect(db.version).toBe(3);
      expect([...db.objectStoreNames].sort()).toEqual(
        ['backups', 'currentWorld', 'learner', 'quarantine', 'settings', 'snapshots'].sort(),
      );
    } finally {
      db.close();
    }
  });
});
