import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProfile, progressOf, withProgress } from '../../src/learning';
import { LearnerModel, type LearnerStore } from '../../src/persistence/learner';
import { WRITE_DELAY_MS } from '../../src/persistence/settings';
import { LocalStore } from '../../src/persistence/store';
import { LearnerProfile } from '../../src/shared/learning';
import { collect, DAY, progress, T0 } from '../learning/helpers';

/** A clock the test drives by hand: a delayed call runs only when time is moved past it. */
class HandClock {
  private t = T0;
  private timers: { at: number; fn: () => void }[] = [];
  now(): number {
    return this.t;
  }
  later(ms: number, fn: () => void): () => void {
    const entry = { at: this.t + ms, fn };
    this.timers.push(entry);
    return () => {
      this.timers = this.timers.filter((x) => x !== entry);
    };
  }
  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const x of due) x.fn();
  }
  get waiting(): number {
    return this.timers.length;
  }
}

let name = '';
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  name = `learner-${Math.random().toString(16).slice(2)}`;
});

const open = (): Promise<LocalStore> => LocalStore.open(name);

/**
 * What is stored, read by a connection of its own, the way a second tab or a later visit would see
 * it.
 */
async function onDisk(): Promise<unknown> {
  const db = await openDB(name);
  try {
    return await db.get('learner', 'profile');
  } finally {
    db.close();
  }
}

/** Puts a record on the device as it is, as a bug, an edit or another version of the game could. */
async function putOnDisk(value: unknown): Promise<void> {
  await open();
  const db = await openDB(name);
  try {
    await db.put('learner', value, 'profile');
  } finally {
    db.close();
  }
}

const frog = collect(['frog']);
const book = collect(['frog', 'duck', 'bee']);

/**
 * A device that holds one record in memory and says what was asked of it, for the cases a real one
 * will not produce on request.
 */
function device(overrides: Partial<LearnerStore> = {}) {
  const log = { updates: 0, cleared: 0, kept: [] as { raw: unknown; why: string }[] };
  const held: { record: unknown } = { record: undefined };
  const store: LearnerStore = {
    learner: async () => held.record,
    updateLearner: async (change) => {
      log.updates += 1;
      const next = change(held.record);
      if (next) held.record = next;
      return next;
    },
    clearLearner: async () => {
      log.cleared += 1;
      held.record = undefined;
    },
    quarantine: async (raw, why) => void log.kept.push({ raw, why }),
    ...overrides,
  };
  return { store, log, held };
}

describe('the book on a new device', () => {
  it('is empty, and nothing is wrong with that', async () => {
    const model = await LearnerModel.load(await open(), new HandClock());
    expect(model.get()).toEqual(emptyProfile());
    expect(model.keeping()).toBe('device');
  });

  it('is kept in memory until the page closes when there is no storage at all', async () => {
    const clock = new HandClock();
    const model = await LearnerModel.load(null, clock);
    expect(model.get()).toEqual(emptyProfile());
    model.set(book);
    await model.flush();
    expect(model.get()).toEqual(book);
    expect(model.keeping(), 'the page is as far as it goes').toBe('page');
    expect(clock.waiting, 'nothing is waiting to be written').toBe(0);
  });
});

describe('keeping what the player has learned', () => {
  it('comes back after a reload', async () => {
    const first = await LearnerModel.load(await open(), new HandClock());
    first.set(book);
    await first.flush();
    const second = await LearnerModel.load(await open(), new HandClock());
    expect(second.get()).toEqual(book);
    expect(LearnerProfile.safeParse(await onDisk()).success).toBe(true);
  });

  it('starts from the book that was there, and adds to it', async () => {
    const first = await LearnerModel.load(await open(), new HandClock());
    first.set(frog);
    await first.flush();
    const second = await LearnerModel.load(await open(), new HandClock());
    second.set(collect(['duck'], second.get()));
    await second.flush();
    const third = await LearnerModel.load(await open(), new HandClock());
    expect(Object.keys(third.get().words).sort()).toEqual(['duck', 'frog']);
  });

  it('waits for the changes to stop, then writes once with the last of them', async () => {
    const { store, log, held } = device();
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    const steps = [collect(['frog']), collect(['frog', 'duck']), collect(['frog', 'duck', 'bee'])];
    for (const step of steps) {
      model.set(step);
      clock.advance(WRITE_DELAY_MS - 50);
    }
    expect(log.updates).toBe(0);
    clock.advance(100);
    await model.flush();
    expect(log.updates).toBe(1);
    expect(held.record).toEqual(steps[2]);
  });

  it('writes straight away when the page is about to go, and only once', async () => {
    const { store, log } = device();
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    model.set(book);
    await model.flush();
    await model.flush();
    clock.advance(10 * WRITE_DELAY_MS);
    await model.flush();
    expect(log.updates).toBe(1);
    expect(clock.waiting).toBe(0);
  });

  it('does not write what has not changed', async () => {
    const { store, log } = device();
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    await model.flush();
    model.set(emptyProfile());
    model.set(JSON.parse(JSON.stringify(emptyProfile())) as LearnerProfile);
    expect(clock.waiting).toBe(0);
    await model.flush();
    expect(log.updates).toBe(0);
    model.set(book);
    await model.flush();
    model.set(JSON.parse(JSON.stringify(book)) as LearnerProfile);
    expect(clock.waiting, 'the same book again is not a change').toBe(0);
    await model.flush();
    expect(log.updates).toBe(1);
  });

  it('holds the book in memory and tries again when the device cannot store it', async () => {
    let failing = true;
    const { store, log, held } = device({
      updateLearner: async (change) => {
        if (failing) throw new Error('no room');
        const next = change(held.record);
        if (next) held.record = next;
        log.updates += 1;
        return next;
      },
    });
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    model.set(book);
    await model.flush();
    expect(model.get()).toEqual(book);
    expect(held.record).toBeUndefined();
    expect(model.keeping(), 'a full disk is not a reason to stop trying').toBe('device');
    failing = false;
    await model.flush();
    expect(held.record).toEqual(book);
  });

  it('tries again on its own after a failed write when the player does something else', async () => {
    let failing = true;
    const { store, held } = device({
      updateLearner: async (change) => {
        if (failing) throw new Error('no room');
        const next = change(held.record);
        if (next) held.record = next;
        return next;
      },
    });
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    model.set(frog);
    await model.flush();
    failing = false;
    model.set(book);
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(held.record).toEqual(book);
  });

  it('keeps writes in the order they were made', async () => {
    const order: LearnerProfile[] = [];
    let calls = 0;
    const { store } = device({
      updateLearner: async (change) => {
        calls += 1;
        // The first write is the slow one. If the second did not wait for it, the old book would
        // land last.
        await new Promise((r) => setTimeout(r, calls === 1 ? 20 : 0));
        const next = change(undefined);
        if (next) order.push(next);
        return next;
      },
    });
    const model = await LearnerModel.load(store, new HandClock());
    model.set(frog);
    void model.flush();
    model.set(book);
    await model.flush();
    expect(order).toEqual([frog, book]);
  });

  it('writes nothing it could not read back, and keeps the rest of the book', async () => {
    const model = await LearnerModel.load(await open(), new HandClock());
    // A count that is not a whole number is not something the schema keeps.
    const broken = withProgress(book, 'frog', 'spell', progress({ done: 1.5 }));
    model.set(broken);
    await model.flush();
    const read = await onDisk();
    expect(LearnerProfile.safeParse(read).success).toBe(true);
    const second = await LearnerModel.load(await open(), new HandClock());
    expect(Object.keys(second.get().words).sort()).toEqual(['bee', 'duck']);
    // And it does not go on trying to write the same thing for ever.
    const clock = new HandClock();
    const { store, log } = device();
    const third = await LearnerModel.load(store, clock);
    third.set(broken);
    await third.flush();
    await third.flush();
    expect(log.updates).toBe(1);
  });
});

describe('the store', () => {
  it('opens a database from before the book existed, keeps the world and adds the shelf', async () => {
    const old = await openDB(name, 2, {
      upgrade(db) {
        db.createObjectStore('currentWorld');
        db.createObjectStore('snapshots', { keyPath: 'snapshotId' }).createIndex('byCreated', 'createdAt');
        db.createObjectStore('sync');
        db.createObjectStore('settings');
        db.createObjectStore('quarantine', { autoIncrement: true });
        db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
      },
    });
    await old.put('settings', { muted: true }, 'device');
    old.close();

    const store = await open();
    expect(await store.learner()).toBeUndefined();
    const model = await LearnerModel.load(store, new HandClock());
    model.set(book);
    await model.flush();
    expect((await LearnerModel.load(await open(), new HandClock())).get()).toEqual(book);
    const db = await openDB(name);
    expect(await db.get('settings', 'device')).toEqual({ muted: true });
    db.close();
  });

  it('puts two writers one after the other, so neither takes away what the other stored', async () => {
    const store = await open();
    const mergeIn = (more: LearnerProfile) => (stored: unknown) => {
      const there = (stored as LearnerProfile | undefined) ?? emptyProfile();
      return { schemaVersion: 1 as const, words: { ...there.words, ...more.words } };
    };
    await Promise.all([
      store.updateLearner(mergeIn(collect(['frog']))),
      store.updateLearner(mergeIn(collect(['duck']))),
      store.updateLearner(mergeIn(collect(['bee']))),
    ]);
    expect(Object.keys(((await store.learner()) as LearnerProfile).words).sort()).toEqual(['bee', 'duck', 'frog']);
  });

  it('leaves the record as it was when the change declines, throws, or answers with something the schema refuses', async () => {
    const store = await open();
    await store.updateLearner(() => frog);
    expect(await store.updateLearner(() => null)).toBeNull();
    await expect(
      store.updateLearner(() => {
        throw new Error('no');
      }),
    ).rejects.toThrow('no');
    await expect(
      store.updateLearner(() => ({ schemaVersion: 1, words: { Frog: frog.words.frog! } })),
    ).rejects.toThrow();
    await expect(
      store.updateLearner(() => ({ schemaVersion: 4, words: {} }) as unknown as LearnerProfile),
    ).rejects.toThrow();
    // A record that says it is version 1 and holds reading is the one an older copy of the game
    // would damage.
    await expect(
      store.updateLearner(
        () => ({ schemaVersion: 1, words: { frog: { read: frog.words.frog!.spell! } } }) as unknown as LearnerProfile,
      ),
    ).rejects.toThrow();
    expect(await store.learner()).toEqual(frog);
  });

  it('can be used again after a change that failed', async () => {
    const store = await open();
    await expect(
      store.updateLearner(() => {
        throw new Error('no');
      }),
    ).rejects.toThrow();
    expect(await store.updateLearner(() => frog)).toEqual(frog);
    await store.clearLearner();
    expect(await store.learner()).toBeUndefined();
  });
});

describe('a book written by a newer version of the game', () => {
  const newer = { schemaVersion: 4, words: { frog: { spell: { level: 1, mastery: 'new shape' } } } };

  it('is left alone, and the game goes on without it', async () => {
    await putOnDisk(newer);
    const clock = new HandClock();
    const model = await LearnerModel.load(await open(), clock);
    expect(model.keeping()).toBe('newer');
    expect(model.get()).toEqual(emptyProfile());
    model.set(book);
    expect(model.get(), 'the player can still play with it this time').toEqual(book);
    expect(clock.waiting, 'nothing is waiting to be written').toBe(0);
    await model.flush();
    expect(await onDisk()).toEqual(newer);
  });

  it('is not cleared by a reset either', async () => {
    await putOnDisk(newer);
    const model = await LearnerModel.load(await open(), new HandClock());
    expect(await model.reset()).toBe(false);
    expect(await onDisk()).toEqual(newer);
  });

  it('is left alone when it appears after the page was opened', async () => {
    const clock = new HandClock();
    const model = await LearnerModel.load(await open(), clock);
    await putOnDisk(newer);
    model.set(book);
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(await onDisk()).toEqual(newer);
    expect(model.keeping()).toBe('newer');
    expect(model.get(), 'what the player did stays in memory').toEqual(book);
    model.set(collect(['frog', 'duck', 'bee', 'bird']));
    expect(clock.waiting, 'and it does not keep trying').toBe(0);
  });

  it('is told to whoever is watching where the book goes, once, at the moment it is found', async () => {
    const clock = new HandClock();
    const model = await LearnerModel.load(await open(), clock);
    const told = vi.fn();
    model.watchKeeping(told);
    model.set(book);
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(told, 'a book that is going to the device has nothing to tell').not.toHaveBeenCalled();
    await putOnDisk(newer);
    model.set(collect(['frog', 'duck', 'bee', 'bird']));
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(told).toHaveBeenCalledTimes(1);
    expect(model.keeping()).toBe('newer');
  });

  it('is not asked about again by a change that was already waiting when it was found', async () => {
    const { store, log, held } = device({
      updateLearner: async (change) => {
        await new Promise((r) => setTimeout(r, 10));
        log.updates += 1;
        const next = change(held.record);
        if (next) held.record = next;
        return next;
      },
    });
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    held.record = newer;
    model.set(frog);
    const writing = model.flush();
    model.set(book);
    await writing;
    expect(model.keeping()).toBe('newer');
    clock.advance(10 * WRITE_DELAY_MS);
    await model.flush();
    expect(log.updates, 'the second change is not written, and the record is not read for it').toBe(1);
    expect(held.record).toEqual(newer);
    expect(model.get()).toEqual(book);
  });
});

describe('who is watching where the book goes', () => {
  it('can stop watching', async () => {
    const clock = new HandClock();
    const model = await LearnerModel.load(await open(), clock);
    const told = vi.fn();
    const stop = model.watchKeeping(told);
    stop();
    await putOnDisk({ schemaVersion: 4, words: {} });
    model.set(book);
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(model.keeping()).toBe('newer');
    expect(told).not.toHaveBeenCalled();
  });
});

describe('a book the device will not give up', () => {
  it('is never written over, and the game goes on without it', async () => {
    const { store, log } = device({
      learner: async () => {
        throw new Error('the database is not well');
      },
    });
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    expect(model.keeping()).toBe('unreadable');
    expect(model.get()).toEqual(emptyProfile());
    model.set(book);
    expect(model.get()).toEqual(book);
    await model.flush();
    expect(await model.reset()).toBe(false);
    expect(log).toEqual({ updates: 0, cleared: 0, kept: [] });
    expect(clock.waiting).toBe(0);
  });
});

describe('a book that is partly unreadable', () => {
  const frogOnly = {
    schemaVersion: 1,
    words: { frog: frog.words.frog, duck: { spell: { level: 99 } }, Bee: { spell: progress() } },
  };

  it('keeps the words that can be read, and touches nothing until the player does something', async () => {
    await putOnDisk(frogOnly);
    const model = await LearnerModel.load(await open(), new HandClock());
    expect(model.keeping()).toBe('device');
    expect(Object.keys(model.get().words)).toEqual(['frog']);
    await model.flush();
    expect(await onDisk()).toEqual(frogOnly);
    expect(await (await open()).quarantined()).toEqual([]);
  });

  it('is put in the quarantine, whole, before the first write replaces it, and then the record is clean', async () => {
    await putOnDisk(frogOnly);
    const clock = new HandClock();
    const store = await open();
    const model = await LearnerModel.load(store, clock);
    model.set(collect(['bee'], model.get()));
    await model.flush();

    const kept = await store.quarantined();
    expect(kept).toHaveLength(1);
    expect(JSON.parse(kept[0]!.raw)).toEqual(frogOnly);
    expect(kept[0]!.why).toContain('2 things');
    expect(kept[0]!.at).toBe(T0);
    expect(LearnerProfile.safeParse(await onDisk()).success).toBe(true);
    expect(Object.keys(((await onDisk()) as LearnerProfile).words).sort()).toEqual(['bee', 'frog']);

    // Once it has been set aside it is not set aside again.
    const again = await LearnerModel.load(store, clock);
    again.set(collect(['bird'], again.get()));
    await again.flush();
    expect(await store.quarantined()).toHaveLength(1);
    model.set(collect(['fish'], model.get()));
    await model.flush();
    expect(await store.quarantined()).toHaveLength(1);
  });

  it('is kept as text even when it is not a book at all', async () => {
    await putOnDisk('not a book');
    const store = await open();
    const model = await LearnerModel.load(store, new HandClock());
    expect(model.get()).toEqual(emptyProfile());
    model.set(frog);
    await model.flush();
    expect((await store.quarantined()).map((q) => JSON.parse(q.raw) as unknown)).toEqual(['not a book']);
    expect(await onDisk()).toEqual(frog);
  });

  it('is not replaced when it could not be kept, and is replaced once it can', async () => {
    let keeping = false;
    const { store, log, held } = device({
      quarantine: async () => {
        if (!keeping) throw new Error('no room');
        log.kept.push({ raw: held.record, why: 'kept' });
      },
    });
    held.record = frogOnly;
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    model.set(collect(['bee'], model.get()));
    await model.flush();
    expect(held.record, 'the damaged record is still there').toEqual(frogOnly);
    expect(log.updates).toBe(0);
    keeping = true;
    await model.flush();
    expect(log.kept).toHaveLength(1);
    expect(Object.keys((held.record as LearnerProfile).words).sort()).toEqual(['bee', 'frog']);
  });
});

describe('two pages open at once', () => {
  it('both keep what they learned, and each takes in what the other added', async () => {
    const a = await LearnerModel.load(await open(), new HandClock());
    const b = await LearnerModel.load(await open(), new HandClock());
    const heard = vi.fn();
    b.subscribe(heard);
    a.set(collect(['frog']));
    b.set(collect(['duck']));
    await a.flush();
    await b.flush();
    expect(Object.keys(((await onDisk()) as LearnerProfile).words).sort()).toEqual(['duck', 'frog']);
    expect(Object.keys(b.get().words).sort(), 'b took in the word a wrote first').toEqual(['duck', 'frog']);
    expect(heard, 'once for their own change and once for what came from the other page').toHaveBeenCalledTimes(2);
    expect(Object.keys(a.get().words), 'a has not looked yet').toEqual(['frog']);
    a.set(collect(['bee'], a.get()));
    await a.flush();
    expect(Object.keys(a.get().words).sort()).toEqual(['bee', 'duck', 'frog']);
    expect(Object.keys(((await onDisk()) as LearnerProfile).words).sort()).toEqual(['bee', 'duck', 'frog']);
  });

  it('does not let a page that is behind take a star away', async () => {
    const ahead = progress({ level: 3, best: 3, done: 9, clean: 8, last: T0 + DAY, due: T0 + 4 * DAY });
    const behind = progress({ level: 0, best: 0, done: 2, clean: 2, last: T0, due: T0 });
    const a = await LearnerModel.load(await open(), new HandClock());
    const b = await LearnerModel.load(await open(), new HandClock());
    a.set(withProgress(emptyProfile(), 'frog', 'spell', ahead));
    await a.flush();
    b.set(withProgress(emptyProfile(), 'frog', 'spell', behind));
    await b.flush();
    expect(progressOf((await onDisk()) as LearnerProfile, 'frog', 'spell')).toEqual({ ...ahead });
    expect(progressOf(b.get(), 'frog', 'spell')).toEqual({ ...ahead, first: T0 });
  });
});

describe('telling the game', () => {
  it('reaches every listener at once, with the new book, and not for a book that was already there', async () => {
    const model = await LearnerModel.load(await open(), new HandClock());
    const a = vi.fn();
    const b = vi.fn();
    model.subscribe(a);
    model.subscribe(b);
    expect(a).not.toHaveBeenCalled();
    model.set(book);
    expect(a).toHaveBeenCalledExactlyOnceWith(book);
    expect(b).toHaveBeenCalledExactlyOnceWith(book);
  });

  it('says nothing when nothing changed, and nothing to a listener that has gone', async () => {
    const model = await LearnerModel.load(null, new HandClock());
    const listener = vi.fn();
    const stop = model.subscribe(listener);
    model.set(emptyProfile());
    model.set(book);
    model.set(JSON.parse(JSON.stringify(book)) as LearnerProfile);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    model.set(collect(['frog']));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not tell anyone when a write brings back nothing new', async () => {
    const model = await LearnerModel.load(await open(), new HandClock());
    const listener = vi.fn();
    model.subscribe(listener);
    model.set(book);
    await model.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('a look around that must leave the device as it found it', () => {
  it('holds the same book and never writes, and the real one is not touched', async () => {
    const real = await LearnerModel.load(await open(), new HandClock());
    real.set(frog);
    await real.flush();
    const clock = new HandClock();
    const visit = real.detached();
    expect(visit.get()).toEqual(frog);
    expect(visit.keeping(), 'a copy for a visit holds the book until the page closes').toBe('page');
    visit.set(book);
    clock.advance(10 * WRITE_DELAY_MS);
    await visit.flush();
    expect(visit.get()).toEqual(book);
    expect(real.get()).toEqual(frog);
    expect(await onDisk()).toEqual(frog);
  });

  it('can be cleared without touching the device', async () => {
    const real = await LearnerModel.load(await open(), new HandClock());
    real.set(frog);
    await real.flush();
    const visit = real.detached();
    expect(await visit.reset()).toBe(true);
    expect(visit.get()).toEqual(emptyProfile());
    expect(await onDisk()).toEqual(frog);
    expect(await (await open()).quarantined()).toEqual([]);
  });
});

describe('starting a new book', () => {
  it('puts the old one where a parent can export it, clears it, and tells the game', async () => {
    const store = await open();
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    model.set(book);
    await model.flush();
    const heard = vi.fn();
    model.subscribe(heard);
    expect(await model.reset()).toBe(true);
    expect(model.get()).toEqual(emptyProfile());
    expect(heard).toHaveBeenCalledExactlyOnceWith(emptyProfile());
    expect(await onDisk()).toBeUndefined();
    const kept = await store.quarantined();
    expect(kept).toHaveLength(1);
    expect(JSON.parse(kept[0]!.raw)).toEqual(book);
    expect(kept[0]!.why).toContain('put aside');
    expect(kept[0]!.at).toBe(T0);
    // And a book can be started in the new one.
    model.set(frog);
    await model.flush();
    expect(await onDisk()).toEqual(frog);
  });

  it('has nothing to put aside when the book is empty', async () => {
    const store = await open();
    const model = await LearnerModel.load(store, new HandClock());
    expect(await model.reset()).toBe(true);
    expect(await store.quarantined()).toEqual([]);
  });

  it('puts aside what could not be read too, not only the part that could', async () => {
    const damaged = { schemaVersion: 1, words: { frog: frog.words.frog, duck: 'swimming' } };
    await putOnDisk(damaged);
    const store = await open();
    const model = await LearnerModel.load(store, new HandClock());
    expect(await model.reset()).toBe(true);
    expect((await store.quarantined()).map((q) => JSON.parse(q.raw) as unknown)).toEqual([damaged]);
    expect(await onDisk()).toBeUndefined();
    // It was set aside once, and is not set aside again by the next write.
    model.set(frog);
    await model.flush();
    expect(await store.quarantined()).toHaveLength(1);
  });

  it('leaves the book as it was when the old one cannot be put aside', async () => {
    const { store, log, held } = device({
      quarantine: async () => {
        throw new Error('no room');
      },
    });
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    model.set(book);
    await model.flush();
    expect(await model.reset()).toBe(false);
    expect(model.get()).toEqual(book);
    expect(held.record).toEqual(book);
    expect(log.cleared).toBe(0);
  });

  it('leaves the book as it was when it cannot be cleared, and still writes what was waiting', async () => {
    const { store, held } = device({
      clearLearner: async () => {
        throw new Error('not now');
      },
    });
    const clock = new HandClock();
    const model = await LearnerModel.load(store, clock);
    model.set(frog);
    await model.flush();
    model.set(book);
    expect(await model.reset()).toBe(false);
    expect(model.get()).toEqual(book);
    clock.advance(WRITE_DELAY_MS);
    await model.flush();
    expect(held.record).toEqual(book);
  });

  it('is not undone by a change that was waiting to be written', async () => {
    const clock = new HandClock();
    const model = await LearnerModel.load(await open(), clock);
    model.set(book);
    expect(await model.reset()).toBe(true);
    clock.advance(10 * WRITE_DELAY_MS);
    await model.flush();
    expect(await onDisk()).toBeUndefined();
    expect(model.get()).toEqual(emptyProfile());
  });

  it('waits for a write that is on its way, so the old book does not land after the clearing and come back', async () => {
    const { store, held } = device({
      updateLearner: async (change) => {
        await new Promise((r) => setTimeout(r, 20));
        const next = change(held.record);
        if (next) held.record = next;
        return next;
      },
    });
    const model = await LearnerModel.load(store, new HandClock());
    model.set(book);
    void model.flush();
    expect(await model.reset()).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(held.record).toBeUndefined();
    expect(model.get()).toEqual(emptyProfile());
  });

  it('can be done in memory when there is no storage', async () => {
    const model = await LearnerModel.load(null, new HandClock());
    model.set(book);
    expect(await model.reset()).toBe(true);
    expect(model.get()).toEqual(emptyProfile());
  });
});
