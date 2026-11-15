import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { type IDBPDatabase, openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, dispatch, toSave } from '../../src/domain';
import { loadWorld } from '../../src/persistence/load';
import { type SaveClock, SaveService, type SaveStatus } from '../../src/persistence/save-service';
import { KEEP_SNAPSHOTS, LocalStore } from '../../src/persistence/store';
import { DEFAULT_SETTINGS } from '../../src/shared/save';
import { distance, leaderOf, makeWorld, run, teleport } from '../domain/fixtures';

const MAPS = ['forest', 'palace-garden', 'treasure-house', 'palace-hall', 'stable', 'playground'] as const;

/** A clock the test drives by hand. `later` callbacks run only when told to. */
class ManualClock implements SaveClock {
  t = 1_000;
  timers: { at: number; fn: () => void }[] = [];
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
}

let ids = 0;
const newId = (): string => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
let dbName = '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  dbName = `test-${Math.random().toString(16).slice(2)}`;
  ids = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const open = (): Promise<LocalStore> => LocalStore.open(dbName);
/** A second connection, used to damage stored data the way a bug or a bad edit could. */
const raw = (): Promise<IDBPDatabase> => openDB(dbName);

describe('saving and loading', () => {
  it('a flushed world comes back from a fresh browser session with its friends, props and place', async () => {
    const store = await open();
    const service = new SaveService(store, new ManualClock(), newId);
    const world = makeWorld({ recruited: ['leaf', 'storm'] });
    dispatch(world, { type: 'interact', commandId: 'c1', instanceId: 'forest/chest-1' });
    run(world, 12);
    await service.flush(world);
    expect(service.status.state).toBe('saved');
    store.close();

    const reopened = await open();
    const outcome = await loadWorld(reopened, MAPS, 5);
    expect(outcome.kind).toBe('resume');
    if (outcome.kind !== 'resume') return;
    const again = createWorld({
      map: world.map,
      persistent: outcome.plan.persistent,
      seed: outcome.plan.seed,
      arrival: outcome.plan.arrival,
    });
    expect(again.persistent.recruited).toEqual(['wildstar', 'leaf', 'storm']);
    expect(again.persistent.props).toEqual(world.persistent.props);
    expect(distance(leaderOf(again).pos, leaderOf(world).pos)).toBeLessThan(0.001);
  });

  it('an empty database loads as a fresh start', async () => {
    const store = await open();
    expect(await loadWorld(store, MAPS, 5)).toEqual({ kind: 'fresh', damaged: false });
  });

  it('keeps the newest ten snapshots and drops the older ones', async () => {
    const store = await open();
    const clock = new ManualClock();
    const service = new SaveService(store, clock, newId);
    const world = makeWorld();
    for (let i = 0; i < KEEP_SNAPSHOTS + 6; i++) {
      clock.t += 10;
      teleport(world, 'wildstar', { x: 800 - i * 5, y: 700 });
      await service.flush(world);
    }
    const history = await store.history();
    expect(history).toHaveLength(KEEP_SNAPSHOTS);
    const times = history.map((h) => h.createdAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect((await store.current())!.snapshotId).toBe(history[0]!.snapshotId);
  });

  it('writes bursts of requests as one or two commits that end on the newest state', async () => {
    const store = await open();
    const commit = vi.spyOn(store, 'commit');
    const service = new SaveService(store, new ManualClock(), newId);
    const world = makeWorld();
    for (let i = 0; i < 8; i++) {
      teleport(world, 'wildstar', { x: 700 + i * 10, y: 700 });
      service.request('position', world);
    }
    await service.flush(world);
    expect(commit.mock.calls.length).toBeLessThanOrEqual(3);
    const last = await store.current();
    expect(last!.save.wildstar.position.x).toBeCloseTo(770, 3);
  });
});

describe('when saving fails', () => {
  it('says so, keeps playing from memory, and recovers on a later try without ever claiming it saved in between', async () => {
    const store = await open();
    const clock = new ManualClock();
    const service = new SaveService(store, clock, newId);
    const seen: SaveStatus['state'][] = [];
    service.subscribe((s) => seen.push(s.state));
    const world = makeWorld();

    const quota = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await service.flush(world);
    expect(service.status).toMatchObject({ state: 'failed', kind: 'quota' });
    expect(seen).not.toContain('saved');

    // Moving on while storage is full only waits for the timer, it does not retry on every request.
    quota.mockClear();
    for (let i = 0; i < 5; i++) service.request('position', world);
    await Promise.resolve();
    expect(quota).not.toHaveBeenCalled();

    quota.mockRestore();
    clock.advance(120_000);
    await vi.waitFor(() => expect(service.status.state).toBe('saved'));
    expect((await store.current())!.save.worldGeneration).toBe(world.persistent.worldGeneration);
  });

  it('a full disk on the first try is retried with a shorter history and the new save lands whole', async () => {
    const store = await open();
    const service = new SaveService(store, new ManualClock(), newId);
    await service.flush(makeWorld({ recruited: ['leaf'] }));

    const original = IDBObjectStore.prototype.put;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      calls += 1;
      if (calls === 2) throw new DOMException('full', 'QuotaExceededError');
      return original.apply(this, args);
    });
    await service.flush(makeWorld({ recruited: ['leaf', 'river'] }));
    expect(service.status.state).toBe('saved');
    expect((await store.current())!.save.recruited).toEqual(['wildstar', 'leaf', 'river']);
    expect(await store.history()).toHaveLength(2);
  });

  it('a transaction that fails halfway commits nothing, so the previous save stays current', async () => {
    const store = await open();
    const service = new SaveService(store, new ManualClock(), newId);
    await service.flush(makeWorld({ recruited: ['leaf'] }));
    const before = await store.current();

    const original = IDBObjectStore.prototype.put;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      calls += 1;
      if (calls % 2 === 0) throw new DOMException('full', 'QuotaExceededError');
      return original.apply(this, args);
    });
    await service.flush(makeWorld({ recruited: ['leaf', 'river'] }));
    expect(service.status).toMatchObject({ state: 'failed', kind: 'quota' });
    vi.restoreAllMocks();
    expect((await store.current())!.snapshotId).toBe(before!.snapshotId);
    expect(await store.history()).toHaveLength(1);
  });

  it('reports unavailable storage and still lets the game run', async () => {
    const service = new SaveService(null, new ManualClock(), newId);
    await service.flush(makeWorld());
    expect(service.status).toMatchObject({ state: 'failed', kind: 'unavailable' });
  });
});

describe('damaged data', () => {
  async function saveThree(store: LocalStore): Promise<string[]> {
    const clock = new ManualClock();
    const service = new SaveService(store, clock, newId);
    const world = makeWorld();
    const out: string[] = [];
    for (const x of [600, 650, 700]) {
      clock.t += 10;
      teleport(world, 'wildstar', { x, y: 700 });
      await service.flush(world);
      out.push((await store.current())!.snapshotId);
    }
    return out;
  }

  it('falls back to the newest snapshot that still validates and keeps the broken one aside', async () => {
    const store = await open();
    const [first, second, third] = await saveThree(store);
    const db = await raw();
    const record = (await store.history()).find((h) => h.snapshotId === third)!;
    await db.put('snapshots', { ...record, save: { ...record.save, recruited: ['leaf'] } });
    await db.put('currentWorld', { ...record, save: { ...record.save, recruited: ['leaf'] } }, 'current');

    const outcome = await loadWorld(store, MAPS, 99);
    expect(outcome.kind).toBe('resume');
    if (outcome.kind !== 'resume') return;
    expect(outcome.skipped).toBe(1);
    expect(outcome.plan.arrival).toMatchObject({ kind: 'saved', position: { x: 650, y: 700 } });
    expect((await store.current())!.snapshotId).toBe(second);
    expect((await store.history()).map((h) => h.snapshotId)).toEqual([second, first]);
    expect(await store.quarantined()).toHaveLength(1);

    // The same bad record is not set aside again on the next start.
    await loadWorld(store, MAPS, 100);
    expect(await store.quarantined()).toHaveLength(1);
  });

  it('starts fresh when nothing validates, and keeps what it could not read', async () => {
    const store = await open();
    await saveThree(store);
    const db = await raw();
    for (const r of await db.getAll('snapshots')) await db.put('snapshots', { ...r, save: { nonsense: true } });
    await db.put('currentWorld', { snapshotId: 'x', createdAt: 1, reason: 'x', save: 'garbage' }, 'current');
    expect(await loadWorld(store, MAPS, 7)).toEqual({ kind: 'fresh', damaged: true });
    expect((await store.quarantined()).length).toBeGreaterThanOrEqual(3);
    expect(await store.current()).toBeNull();
  });

  it('refuses to touch a save written by a newer build', async () => {
    const store = await open();
    await saveThree(store);
    const db = await raw();
    const current = (await store.current())!;
    await db.put('currentWorld', { ...current, save: { ...current.save, schemaVersion: 2 } }, 'current');
    expect(await loadWorld(store, MAPS, 7)).toEqual({ kind: 'too-new' });
    expect(await store.quarantined()).toHaveLength(0);
    expect(await store.history()).toHaveLength(3);
  });
});

describe('device records', () => {
  it('settings round trip and fall back to defaults when unreadable', async () => {
    const store = await open();
    expect(await store.settings()).toEqual(DEFAULT_SETTINGS);
    await store.saveSettings({ ...DEFAULT_SETTINGS, musicVolume: 0.25, muted: true });
    expect(await store.settings()).toMatchObject({ musicVolume: 0.25, muted: true });
    const db = await raw();
    await db.put('settings', { musicVolume: 9 }, 'device');
    expect(await store.settings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('a save is valid by construction', () => {
  it('every snapshot the game writes parses', async () => {
    const world = makeWorld({ recruited: ['leaf', 'glacier', 'river', 'cinder', 'storm'] });
    expect(toSave(world, newId()).recruited).toHaveLength(6);
  });
});
