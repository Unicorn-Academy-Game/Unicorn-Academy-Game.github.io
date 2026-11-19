import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { AlbumModel, type AlbumStore } from '../../src/persistence/album';
import { WRITE_DELAY_MS } from '../../src/persistence/settings';
import { LocalStore } from '../../src/persistence/store';
import { ALBUM_VERSION, type AlbumRecord, earned, emptyAlbum, noted } from '../../src/shared/album';
import { Clock } from '../game/clock';

let name = '';
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  name = `album-${Math.random().toString(16).slice(2)}`;
});

const stickers = (...ids: string[]): AlbumRecord => earned(emptyAlbum(), ids, 20_400);

/** What is on the device, read by a connection of its own, as a second tab or a later visit would. */
async function onDisk(key = 'album'): Promise<unknown> {
  const db = await openDB(name);
  try {
    return await db.get('learner', key);
  } finally {
    db.close();
  }
}

async function putOnDisk(value: unknown, key = 'album'): Promise<void> {
  await LocalStore.open(name);
  const db = await openDB(name);
  try {
    await db.put('learner', value, key);
  } finally {
    db.close();
  }
}

/** A device that holds one record in memory and says what was asked of it. */
function device(overrides: Partial<AlbumStore> = {}) {
  let stored: unknown;
  const calls = { writes: 0, clears: 0 };
  const store: AlbumStore = {
    album: async () => stored,
    updateAlbum: async (change) => {
      const next = change(stored);
      if (next) {
        stored = next;
        calls.writes += 1;
      }
      return next;
    },
    clearAlbum: async () => {
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

describe('the sticker book, on the device', () => {
  it('starts empty and untouched when nothing is stored, and with no storage at all', async () => {
    const model = await AlbumModel.load(await LocalStore.open(name));
    expect(model.get()).toEqual(emptyAlbum());
    expect(model.untouched, 'a player who has never had a book is told from one who has an empty one').toBe(true);
    expect((await AlbumModel.load(null)).get()).toEqual(emptyAlbum());
  });

  it('is not untouched once a record has been stored, even an empty one', async () => {
    await putOnDisk(emptyAlbum());
    expect((await AlbumModel.load(await LocalStore.open(name))).untouched).toBe(false);
  });

  it('writes a change shortly after it, and a later visit reads it back', async () => {
    const clock = new Clock();
    const model = await AlbumModel.load(await LocalStore.open(name), clock);
    model.set(stickers('hello'));
    expect(await onDisk(), 'not yet: the write waits for a moment, in case there is more').toBeUndefined();
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(await onDisk()).toEqual(stickers('hello'));
    expect((await AlbumModel.load(await LocalStore.open(name))).get()).toEqual(stickers('hello'));
  });

  it('writes nothing for a change that changes nothing, and one write for a run of changes', async () => {
    const clock = new Clock();
    const { store, calls } = device();
    const model = await AlbumModel.load(store, clock);
    model.set(emptyAlbum());
    clock.advance(WRITE_DELAY_MS * 2);
    await model.flush();
    expect(calls.writes).toBe(0);
    model.set(stickers('hello'));
    model.set(stickers('hello', 'spell'));
    model.set(noted(stickers('hello', 'spell'), 'swim'));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(1);
  });

  it('puts what it has together with what another tab stored, and loses neither', async () => {
    const model = await AlbumModel.load(await LocalStore.open(name), new Clock());
    await putOnDisk(stickers('swim'));
    model.set(stickers('hello'));
    await model.flush();
    expect(Object.keys(((await onDisk()) as AlbumRecord).got).sort()).toEqual(['hello', 'swim']);
    expect(Object.keys(model.get().got).sort(), 'and this tab knows what the other got').toEqual(['hello', 'swim']);
  });

  it('tells a listener of a change, and of what another tab added, and not of a change that changes nothing', async () => {
    const model = await AlbumModel.load(await LocalStore.open(name), new Clock());
    const heard: string[][] = [];
    const stop = model.subscribe((album) => heard.push(Object.keys(album.got).sort()));
    model.set(stickers('hello'));
    model.set(stickers('hello'));
    await putOnDisk(stickers('swim'));
    model.set(stickers('hello', 'spell'));
    await model.flush();
    expect(heard).toEqual([['hello'], ['hello', 'spell'], ['hello', 'spell', 'swim']]);
    stop();
    model.set(stickers('hello', 'spell', 'swim', 'photo'));
    expect(heard).toHaveLength(3);
  });

  it('never writes over a record that a newer version of the game wrote, and keeps playing in memory', async () => {
    const clock = new Clock();
    const newer = { v: ALBUM_VERSION + 1, got: { future: 1 } };
    const { store, calls, put, get } = device();
    put(newer);
    const model = await AlbumModel.load(store, clock);
    expect(model.get()).toEqual(emptyAlbum());
    model.set(stickers('hello'));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(get()).toBe(newer);
    expect(Object.keys(model.get().got), 'the player still has the sticker until the page closes').toEqual(['hello']);
    expect(await model.reset(), "and a record that is not this version's is not cleared either").toBe(false);
    expect(calls.clears).toBe(0);
  });

  it('does not write over what it could not read at all', async () => {
    const clock = new Clock();
    const { store, calls } = device({
      album: async () => {
        throw new Error('the device would not give it up');
      },
    });
    const model = await AlbumModel.load(store, clock);
    model.set(stickers('hello'));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(Object.keys(model.get().got)).toEqual(['hello']);
  });

  it('tries again after a write that failed', async () => {
    const clock = new Clock();
    let failing = true;
    const inner = device();
    const { store } = device({
      updateAlbum: async (change) => {
        if (failing) throw new Error('the disk was full');
        return inner.store.updateAlbum(change);
      },
    });
    const model = await AlbumModel.load(store, clock);
    model.set(stickers('hello'));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(inner.calls.writes).toBe(0);
    failing = false;
    await model.flush();
    expect(inner.get()).toEqual(stickers('hello'));
  });

  it('holds what a look around does and never writes it', async () => {
    const clock = new Clock();
    const { store, calls, put } = device();
    put(stickers('hello'));
    const model = (await AlbumModel.load(store, clock)).detached();
    expect(model.get()).toEqual(stickers('hello'));
    model.set(stickers('hello', 'spell'));
    clock.advance(WRITE_DELAY_MS * 3);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(Object.keys(model.get().got)).toEqual(['hello', 'spell']);
  });

  it('starts again when a parent says so, and the next visit begins empty', async () => {
    const clock = new Clock();
    const model = await AlbumModel.load(await LocalStore.open(name), clock);
    const heard: number[] = [];
    model.subscribe((album) => heard.push(Object.keys(album.got).length));
    model.set(stickers('hello'));
    await model.flush();
    expect(await model.reset()).toBe(true);
    expect(model.get()).toEqual(emptyAlbum());
    expect(heard).toEqual([1, 0]);
    expect(await onDisk()).toBeUndefined();
    clock.advance(WRITE_DELAY_MS * 3);
    await model.flush();
    expect(await onDisk(), 'a write that was waiting when the player started again is gone too').toBeUndefined();
  });
});

describe('beside the rest of what the player keeps', () => {
  it('leaves the spell book and the play record alone, and they leave it alone', async () => {
    const store = await LocalStore.open(name);
    const book = { schemaVersion: 1, words: {} };
    const play = { v: 1, memory: { played: 2, sizes: {} }, maths: { played: 0, strands: {} } };
    await putOnDisk(book, 'profile');
    await putOnDisk(play, 'play');
    const model = await AlbumModel.load(store, new Clock());
    model.set(stickers('hello'));
    await model.flush();
    expect(await onDisk('profile')).toEqual(book);
    expect(await onDisk('play')).toEqual(play);
    await store.clearLearner();
    await store.clearPlay();
    expect(await onDisk(), 'a parent who starts the spell book again keeps the stickers').toEqual(stickers('hello'));
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
