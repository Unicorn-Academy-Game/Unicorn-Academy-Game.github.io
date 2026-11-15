import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_VERSION } from '../../src/persistence/db';
import { LocalStore } from '../../src/persistence/store';

let name = '';
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  name = `blocked-${Math.random().toString(16).slice(2)}`;
});

/**
 * The device as the release before this one left it: the database at version 2, and a copy of that
 * game still open in another window.
 */
const windowFromBefore = () =>
  openDB(name, 2, {
    upgrade(db) {
      db.createObjectStore('currentWorld');
      db.createObjectStore('snapshots', { keyPath: 'snapshotId' }).createIndex('byCreated', 'createdAt');
      db.createObjectStore('sync');
      db.createObjectStore('settings');
      db.createObjectStore('quarantine', { autoIncrement: true });
      db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
    },
  });

describe('opening the database while another window still has an older one open', () => {
  it('says so while it waits, and goes on by itself when that window lets go, with the world untouched', async () => {
    const before = await windowFromBefore();
    await before.put('settings', { muted: true }, 'device');

    const blocked = vi.fn();
    let opened = false;
    const opening = LocalStore.open(name, { blocked }).then((store) => {
      opened = true;
      return store;
    });

    await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(1));
    // The browser holds the upgrade until the other window lets go, so nothing is open yet.
    expect(opened).toBe(false);

    before.close();
    const store = await opening;
    expect(opened).toBe(true);
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(await store.learner()).toBeUndefined();
    const db = await openDB(name);
    expect(db.version).toBe(DB_VERSION);
    expect(await db.get('settings', 'device')).toEqual({ muted: true });
    db.close();
  });

  it('says nothing when nothing is in the way, on a new device and on one that only needs the upgrade', async () => {
    const fresh = vi.fn();
    await LocalStore.open(name, { blocked: fresh });
    expect(fresh).not.toHaveBeenCalled();

    globalThis.indexedDB = new IDBFactory();
    (await windowFromBefore()).close();
    const upgrading = vi.fn();
    await LocalStore.open(name, { blocked: upgrading });
    expect(upgrading).not.toHaveBeenCalled();
  });
});
