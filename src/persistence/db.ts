import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { DeviceSettings, WorldSaveV1 } from '../shared/save';

/** One committed snapshot with the reason it was taken. */
export interface SnapshotRecord {
  snapshotId: string;
  createdAt: number;
  reason: string;
  save: WorldSaveV1;
}

/** Data that failed validation, kept as text so a parent can still export it. */
export interface QuarantineRecord {
  at: number;
  why: string;
  raw: string;
}

/**
 * A world a parent action put aside before it changed anything: a reset, an import or a restore.
 * The rolling history trims itself every few saves, and these must outlast that.
 */
export interface BackupRecord {
  id?: number;
  at: number;
  reason: string;
  save: WorldSaveV1;
}

interface UnicornDb extends DBSchema {
  /** The latest committed snapshot, kept apart so starting the game reads one record. */
  currentWorld: { key: 'current'; value: SnapshotRecord };
  snapshots: { key: string; value: SnapshotRecord; indexes: { byCreated: number } };
  settings: { key: 'device'; value: DeviceSettings };
  quarantine: { key: number; value: QuarantineRecord };
  backups: { key: number; value: BackupRecord };
  /**
   * What the player has learned, under `profile`. It is not part of the world, so a world that
   * starts again does not take it away. Whatever is stored is read with `readProfile`, which is why
   * the type says nothing about it. Under `play` is what they have done at the memory and maths
   * tables, read with `readPlay`.
   */
  learner: { key: 'profile' | 'play'; value: unknown };
}

export type Db = IDBPDatabase<UnicornDb>;

const DB_NAME = 'unicorn-academy';
/**
 * Version 2 added `backups`. Version 3 added `learner`. A database made by an earlier build of the
 * game can still hold a `sync` store and an `edition` entry. Nothing reads them.
 */
export const DB_VERSION = 3;

/** What the page can be told while the database opens. */
export interface OpenNotice {
  /**
   * Another window still has the database open at an older version, and the browser will not
   * upgrade it until that window lets go. The open does not fail. It goes on by itself once the
   * other window is closed, so this is the time to say so.
   */
  blocked?: () => void;
}

export function openUnicornDb(name = DB_NAME, notice: OpenNotice = {}): Promise<Db> {
  return openDB<UnicornDb>(name, DB_VERSION, {
    blocked: () => notice.blocked?.(),
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('currentWorld');
        db.createObjectStore('snapshots', { keyPath: 'snapshotId' }).createIndex('byCreated', 'createdAt');
        db.createObjectStore('settings');
        db.createObjectStore('quarantine', { autoIncrement: true });
      }
      if (oldVersion < 2) db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
      if (oldVersion < 3) db.createObjectStore('learner');
    },
  });
}
