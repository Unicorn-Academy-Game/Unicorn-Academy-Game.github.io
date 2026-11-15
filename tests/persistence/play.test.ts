import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayModel, type PlayStore } from '../../src/persistence/play';
import { WRITE_DELAY_MS } from '../../src/persistence/settings';
import { LocalStore } from '../../src/persistence/store';
import { emptyPlay, PLAY_VERSION, type PlayRecord } from '../../src/shared/play';
import { Clock } from '../game/clock';

let name = '';
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  name = `play-${Math.random().toString(16).slice(2)}`;
});

const won = (pairs: string, best: number, stars: 1 | 2 | 3 = 2): PlayRecord => ({
  v: PLAY_VERSION,
  memory: { played: 1, sizes: { [pairs]: { wins: 1, best, stars } } },
  maths: { played: 0, strands: {} },
});

/**
 * What is on the device, read by a connection of its own, the way a second tab or a later visit
 * would see it.
 */
async function onDisk(): Promise<unknown> {
  const db = await openDB(name);
  try {
    return await db.get('learner', 'play');
  } finally {
    db.close();
  }
}

async function putOnDisk(value: unknown): Promise<void> {
  await LocalStore.open(name);
  const db = await openDB(name);
  try {
    await db.put('learner', value, 'play');
  } finally {
    db.close();
  }
}

/**
 * A device that holds one record in memory and says what was asked of it, for the cases a real one
 * will not produce on request.
 */
function device(overrides: Partial<PlayStore> = {}) {
  let stored: unknown;
  const calls = { reads: 0, writes: 0, clears: 0 };
  const store: PlayStore = {
    play: async () => {
      calls.reads += 1;
      return stored;
    },
    updatePlay: async (change) => {
      const next = change(stored);
      if (next) {
        stored = next;
        calls.writes += 1;
      }
      return next;
    },
    clearPlay: async () => {
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

describe('what the player has done at the tables, on the device', () => {
  it('starts empty when nothing is stored, and with no storage at all', async () => {
    const store = await LocalStore.open(name);
    expect((await PlayModel.load(store)).get()).toEqual(emptyPlay());
    expect((await PlayModel.load(null)).get()).toEqual(emptyPlay());
  });

  it('writes a change shortly after it, and a later visit reads it back', async () => {
    const clock = new Clock();
    const store = await LocalStore.open(name);
    const model = await PlayModel.load(store, clock);
    model.set(won('3', 7));
    expect(await onDisk(), 'not yet: the write waits for a moment, in case there is more').toBeUndefined();
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(await onDisk()).toEqual(won('3', 7));
    const later = await PlayModel.load(await LocalStore.open(name));
    expect(later.get()).toEqual(won('3', 7));
  });

  it('writes nothing for a change that changes nothing, and no more than one write for a run of changes', async () => {
    const clock = new Clock();
    const { store, calls } = device();
    const model = await PlayModel.load(store, clock);
    model.set(emptyPlay());
    clock.advance(WRITE_DELAY_MS * 2);
    await model.flush();
    expect(calls.writes).toBe(0);
    model.set(won('3', 9));
    model.set(won('3', 7));
    model.set(won('3', 5, 3));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(1);
  });

  it('puts what it has together with what another tab stored, and loses neither', async () => {
    const clock = new Clock();
    const store = await LocalStore.open(name);
    const model = await PlayModel.load(store, clock);
    await putOnDisk(won('8', 30, 1));
    model.set(won('3', 7));
    await model.flush();
    const merged = (await onDisk()) as PlayRecord;
    expect(Object.keys(merged.memory.sizes).sort()).toEqual(['3', '8']);
    expect(Object.keys(model.get().memory.sizes).sort(), 'and this tab knows what the other did').toEqual(['3', '8']);
  });

  it('never writes over a record that a newer version of the game wrote, and keeps playing in memory', async () => {
    const clock = new Clock();
    const newer = { v: PLAY_VERSION + 1, memory: { played: 99 } };
    const { store, calls, put, get } = device();
    put(newer);
    const model = await PlayModel.load(store, clock);
    expect(model.get()).toEqual(emptyPlay());
    model.set(won('3', 7));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(get()).toBe(newer);
    expect(model.get().memory.sizes['3']?.best, 'the player still has their stars until the page closes').toBe(7);
    expect(await model.reset(), "and a record that is not this version's is not cleared either").toBe(false);
    expect(calls.clears).toBe(0);
  });

  it('notices a newer record that appears while the page is open, and stops writing', async () => {
    const clock = new Clock();
    const { store, calls, put } = device();
    const model = await PlayModel.load(store, clock);
    put({ v: PLAY_VERSION + 1 });
    model.set(won('3', 7));
    await model.flush();
    expect(calls.writes).toBe(0);
    model.set(won('3', 5));
    await model.flush();
    expect(calls.writes).toBe(0);
  });

  it('does not write over what it could not read at all', async () => {
    const clock = new Clock();
    const { store, calls } = device({
      play: async () => {
        throw new Error('the device would not give it up');
      },
    });
    const model = await PlayModel.load(store, clock);
    model.set(won('3', 7));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(model.get().memory.sizes['3']?.best).toBe(7);
  });

  it('tries again after a write that failed', async () => {
    const clock = new Clock();
    let failing = true;
    const inner = device();
    const { store } = device({
      updatePlay: async (change) => {
        if (failing) throw new Error('the disk was full');
        return inner.store.updatePlay(change);
      },
    });
    const model = await PlayModel.load(store, clock);
    model.set(won('3', 7));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(inner.calls.writes).toBe(0);
    failing = false;
    await model.flush();
    expect(inner.get()).toEqual(won('3', 7));
  });

  it('holds what a look around does and never writes it', async () => {
    const clock = new Clock();
    const { store, calls, put } = device();
    put(won('3', 7));
    const model = (await PlayModel.load(store, clock)).detached();
    expect(model.get()).toEqual(won('3', 7));
    model.set(won('3', 2, 3));
    clock.advance(WRITE_DELAY_MS * 3);
    await model.flush();
    expect(calls.writes).toBe(0);
    expect(model.get().memory.sizes['3']?.best).toBe(2);
  });

  it('starts again when a parent says so, and the next visit begins empty', async () => {
    const clock = new Clock();
    const store = await LocalStore.open(name);
    const model = await PlayModel.load(store, clock);
    model.set(won('3', 7));
    await model.flush();
    expect(await model.reset()).toBe(true);
    expect(model.get()).toEqual(emptyPlay());
    expect(await onDisk()).toBeUndefined();
    clock.advance(WRITE_DELAY_MS * 3);
    await model.flush();
    expect(await onDisk(), 'a write that was waiting when the player started again is gone too').toBeUndefined();
  });

  it('says no, and keeps what the player has, when the clearing does not work', async () => {
    const { store } = device({
      clearPlay: async () => {
        throw new Error('no');
      },
    });
    const model = await PlayModel.load(store, new Clock());
    model.set(won('3', 7));
    expect(await model.reset()).toBe(false);
    expect(model.get().memory.sizes['3']?.best).toBe(7);
  });
});
