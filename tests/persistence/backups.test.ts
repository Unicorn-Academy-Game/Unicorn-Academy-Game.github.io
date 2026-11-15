import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEEP_BACKUPS, KEEP_SNAPSHOTS, LocalStore } from '../../src/persistence/store';
import { snap } from './helpers';

let dbName = '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  dbName = `test-${Math.random().toString(16).slice(2)}`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const open = (): Promise<LocalStore> => LocalStore.open(dbName);

describe('replacing the world', () => {
  it('installs the new world and keeps the old one aside', async () => {
    const store = await open();
    const before = snap({ generation: '00000000-0000-4000-8000-0000000000a1' });
    await store.commit(before, 'recruit', 10);

    const after = snap({ generation: '00000000-0000-4000-8000-0000000000b2' });
    await store.replace(after, 'reset', 20, { save: before, reason: 'Before starting over' });

    expect((await store.current())!.save).toEqual(after);
    const backups = await store.backups();
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ at: 20, reason: 'Before starting over', save: before });
  });

  it('puts nothing aside and changes nothing when the new world cannot be stored', async () => {
    const store = await open();
    const before = snap();
    await store.commit(before, 'recruit', 10);

    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(
      store.replace(snap(), 'reset', 20, { save: before, reason: 'Before starting over' }),
    ).rejects.toMatchObject({ kind: 'quota' });
    vi.restoreAllMocks();

    expect((await store.current())!.save).toEqual(before);
    expect(await store.backups()).toEqual([]);
  });

  it('never loses a backup to the rolling history, however long play goes on', async () => {
    const store = await open();
    const old = snap();
    await store.replace(snap(), 'import', 1, { save: old, reason: 'Before importing' });
    for (let i = 0; i < KEEP_SNAPSHOTS * 3; i++) await store.commit(snap(), 'position', 100 + i);
    expect((await store.history()).length).toBe(KEEP_SNAPSHOTS);
    expect((await store.backups()).map((b) => b.save.snapshotId)).toEqual([old.snapshotId]);
  });
});

describe('the backup shelf', () => {
  it('lists the newest first and keeps only the newest few', async () => {
    const store = await open();
    const worlds = Array.from({ length: KEEP_BACKUPS + 3 }, () => snap());
    for (const [i, w] of worlds.entries()) await store.backup(w, `reason ${i}`, 100 + i);

    const kept = await store.backups();
    expect(kept).toHaveLength(KEEP_BACKUPS);
    expect(kept.map((b) => b.save.snapshotId)).toEqual(
      worlds
        .slice(3)
        .reverse()
        .map((w) => w.snapshotId),
    );
  });

  it('keeps one copy of a world that is put aside twice', async () => {
    const store = await open();
    const w = snap();
    await store.backup(w, 'first', 1);
    await store.backup(w, 'second', 2);
    const kept = await store.backups();
    expect(kept).toHaveLength(1);
    expect(kept[0]!.reason).toBe('first');
  });
});

describe('opening a database from before backups existed', () => {
  it('keeps the world, leaves alone a `sync` record that an earlier build kept, and adds the shelf', async () => {
    const before = snap();
    const old = await openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore('currentWorld');
        db.createObjectStore('snapshots', { keyPath: 'snapshotId' }).createIndex('byCreated', 'createdAt');
        db.createObjectStore('sync');
        db.createObjectStore('settings');
        db.createObjectStore('quarantine', { autoIncrement: true });
      },
    });
    const record = { snapshotId: before.snapshotId, createdAt: 5, reason: 'recruit', save: before };
    await old.put('currentWorld', record, 'current');
    await old.put('snapshots', record);
    await old.put(
      'sync',
      {
        deviceId: 'device-from-v1',
        baseRevision: 4,
        dirtySnapshotId: null,
        lastAcknowledgedSnapshotId: before.snapshotId,
        branchReason: null,
      },
      'local',
    );
    old.close();

    const store = await open();
    expect((await store.current())!.save).toEqual(before);
    expect(await store.backups()).toEqual([]);
    await store.backup(snap(), 'now it works', 6);
    expect(await store.backups()).toHaveLength(1);
  });
});
