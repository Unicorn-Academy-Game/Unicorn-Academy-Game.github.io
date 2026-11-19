import type { AlbumRecord } from '../shared/album';
import { LearnerProfile } from '../shared/learning';
import type { PhotosRecord } from '../shared/photos';
import type { PlayRecord } from '../shared/play';
import { DEFAULT_SETTINGS, DeviceSettings, MAX_SAVE_BYTES, readSettings, WorldSaveV1 } from '../shared/save';
import {
  type BackupRecord,
  type Db,
  type OpenNotice,
  openUnicornDb,
  type QuarantineRecord,
  type SnapshotRecord,
} from './db';

/** The part of an IndexedDB object store that setting a world aside uses. */
interface BackupStore {
  add(value: BackupRecord): Promise<unknown>;
  count(): Promise<number>;
  openCursor(): Promise<BackupCursor | null>;
}
interface BackupCursor {
  value: BackupRecord;
  delete(): Promise<void>;
  continue(): Promise<BackupCursor | null>;
}

/** Local snapshots kept, newest first. */
export const KEEP_SNAPSHOTS = 10;
const KEEP_QUARANTINED = 5;
/** Worlds a parent action has put aside, which no amount of playing pushes out. */
export const KEEP_BACKUPS = 8;

/** What a write does besides storing the snapshot. */
interface WriteOptions {
  /**
   * A world to put aside, in the same transaction, so there is never a moment with the old world
   * gone and no backup.
   */
  backup?: { save: WorldSaveV1; reason: string } | null;
}

export type StoreFailure = 'quota' | 'unavailable' | 'error';

export class StoreError extends Error {
  constructor(
    readonly kind: StoreFailure,
    message: string,
    options?: { cause: unknown },
  ) {
    super(message, options);
    this.name = 'StoreError';
  }
}

const isQuota = (e: unknown): boolean =>
  e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

/**
 * Local storage for the world: the current snapshot, a short history, the device settings and what
 * the player has learned. Every commit is one transaction, so a reload sees all of it or none of
 * it.
 */
export class LocalStore {
  private constructor(private readonly db: Db) {}

  static async open(name?: string, notice?: OpenNotice): Promise<LocalStore> {
    try {
      return new LocalStore(await openUnicornDb(name, notice));
    } catch (error) {
      throw new StoreError('unavailable', 'This browser would not open local storage.', { cause: error });
    }
  }

  /**
   * Stores a snapshot as the current one and trims the history. Throws a StoreError on failure,
   * after trying once more with a shorter history if the failure was a full disk.
   */
  async commit(save: WorldSaveV1, reason: string, now: number): Promise<void> {
    await this.store(save, reason, now, {});
  }

  /**
   * Installs a different world as the current one, as a parent's reset, import or restore does, and
   * puts the world it replaces aside in the same transaction.
   */
  async replace(
    save: WorldSaveV1,
    reason: string,
    now: number,
    backup: { save: WorldSaveV1; reason: string } | null,
  ): Promise<void> {
    await this.store(save, reason, now, { backup });
  }

  /** Puts a world aside without changing the current one. */
  async backup(save: WorldSaveV1, reason: string, now: number): Promise<void> {
    const tx = this.db.transaction('backups', 'readwrite');
    await this.putBackup(tx.objectStore('backups'), { save, reason }, now);
    await tx.done;
  }

  /** The worlds that were put aside, newest first, unvalidated. */
  async backups(): Promise<BackupRecord[]> {
    return (await this.db.getAll('backups')).reverse();
  }

  private async putBackup(
    store: BackupStore,
    backup: { save: WorldSaveV1; reason: string },
    now: number,
  ): Promise<void> {
    // The same world put aside twice is kept once.
    for (let cursor = await store.openCursor(); cursor; cursor = await cursor.continue()) {
      if (cursor.value.save.snapshotId === backup.save.snapshotId) return;
    }
    await store.add({ at: now, reason: backup.reason, save: backup.save });
    let excess = (await store.count()) - KEEP_BACKUPS;
    for (let cursor = await store.openCursor(); cursor && excess > 0; cursor = await cursor.continue()) {
      await cursor.delete();
      excess -= 1;
    }
  }

  private async store(save: WorldSaveV1, reason: string, now: number, options: WriteOptions): Promise<void> {
    const size = JSON.stringify(save).length;
    if (size > MAX_SAVE_BYTES)
      throw new StoreError('error', `The save is ${size} bytes, over the ${MAX_SAVE_BYTES} limit.`);
    const record: SnapshotRecord = { snapshotId: save.snapshotId, createdAt: now, reason, save };
    try {
      await this.write(record, KEEP_SNAPSHOTS, options, now);
    } catch (error) {
      if (!isQuota(error)) throw new StoreError('error', 'The snapshot could not be stored.', { cause: error });
      try {
        await this.write(record, 2, options, now);
      } catch (again) {
        throw new StoreError(isQuota(again) ? 'quota' : 'error', 'The device has no room left to save.', {
          cause: again,
        });
      }
    }
  }

  private async write(record: SnapshotRecord, keep: number, options: WriteOptions, now: number): Promise<void> {
    const tx = this.db.transaction(['currentWorld', 'snapshots', 'backups'], 'readwrite');
    const done = tx.done;
    done.catch(() => undefined);
    try {
      if (options.backup) await this.putBackup(tx.objectStore('backups'), options.backup, now);
      const snapshots = tx.objectStore('snapshots');
      await snapshots.put(record);
      await tx.objectStore('currentWorld').put(record, 'current');

      // Trim from the oldest. The newest `keep` stay, and so does the snapshot just written.
      let excess = (await snapshots.count()) - keep;
      if (excess > 0) {
        let cursor = await snapshots.index('byCreated').openCursor();
        while (cursor && excess > 0) {
          if (cursor.value.snapshotId !== record.snapshotId) {
            await cursor.delete();
            excess -= 1;
          }
          cursor = await cursor.continue();
        }
      }
      await done;
    } catch (error) {
      // An error thrown in our own code leaves the transaction open. Abort it so nothing
      // half-written is committed.
      try {
        tx.abort();
      } catch {
        // Already finished.
      }
      throw error;
    }
  }

  /** The current snapshot as stored, unvalidated. Callers validate before trusting it. */
  async current(): Promise<SnapshotRecord | null> {
    return (await this.db.get('currentWorld', 'current')) ?? null;
  }

  /** The history, newest first, unvalidated. */
  async history(): Promise<SnapshotRecord[]> {
    return (await this.db.getAllFromIndex('snapshots', 'byCreated')).reverse();
  }

  async settings(): Promise<DeviceSettings> {
    return readSettings(await this.db.get('settings', 'device')) ?? { ...DEFAULT_SETTINGS };
  }

  async saveSettings(settings: DeviceSettings): Promise<void> {
    await this.db.put('settings', DeviceSettings.parse(settings), 'device');
  }

  /**
   * What is stored of what the player has learned, as it is and unchecked, or nothing. Callers read
   * it with `readProfile`.
   */
  async learner(): Promise<unknown> {
    return await this.db.get('learner', 'profile');
  }

  /**
   * Reads what is stored of what the player has learned, hands it to `change`, and stores what
   * `change` gives back, all in one transaction, so two tabs that both write cannot each overwrite
   * what the other just stored. `change` answers null to leave the record as it is. What it gives
   * back must be a profile the schema accepts, and one that is not leaves the old record in place.
   * The answer is what was stored, or null when nothing was.
   */
  async updateLearner(change: (stored: unknown) => LearnerProfile | null): Promise<LearnerProfile | null> {
    const tx = this.db.transaction('learner', 'readwrite');
    const done = tx.done;
    done.catch(() => undefined);
    const store = tx.objectStore('learner');
    // Nothing is written before the last thing that can throw, so a throw leaves a transaction that
    // commits empty.
    const next = change(await store.get('profile'));
    const valid = next ? LearnerProfile.parse(next) : null;
    if (valid) await store.put(valid, 'profile');
    await done;
    return valid;
  }

  /** Forgets what the player has learned. */
  async clearLearner(): Promise<void> {
    await this.db.delete('learner', 'profile');
  }

  /**
   * What is stored of what the player has done at the memory and maths tables, as it is and
   * unchecked, or nothing. Callers read it with `readPlay`.
   */
  async play(): Promise<unknown> {
    return await this.db.get('learner', 'play');
  }

  /**
   * Reads what is stored of what the player has done at the tables, hands it to `change`, and
   * stores what `change` gives back, all in one transaction, as `updateLearner` does for the book.
   * `change` answers null to leave the record as it is. The answer is what was stored, or null when
   * nothing was.
   */
  async updatePlay(change: (stored: unknown) => PlayRecord | null): Promise<PlayRecord | null> {
    return await this.updateKept('play', change);
  }

  /** Forgets what the player has done at the tables. */
  async clearPlay(): Promise<void> {
    await this.db.delete('learner', 'play');
  }

  /**
   * What is stored of the sticker book, as it is and unchecked, or nothing. Callers read it with
   * `readAlbum`.
   */
  async album(): Promise<unknown> {
    return await this.db.get('learner', 'album');
  }

  /** As `updatePlay`, for the sticker book. */
  async updateAlbum(change: (stored: unknown) => AlbumRecord | null): Promise<AlbumRecord | null> {
    return await this.updateKept('album', change);
  }

  /** Forgets the sticker book. */
  async clearAlbum(): Promise<void> {
    await this.db.delete('learner', 'album');
  }

  /**
   * What is stored of the pictures the player took, as it is and unchecked, or nothing. Callers
   * read it with `readPhotos`.
   */
  async photos(): Promise<unknown> {
    return await this.db.get('learner', 'photos');
  }

  /** As `updatePlay`, for the pictures. */
  async updatePhotos(change: (stored: unknown) => PhotosRecord | null): Promise<PhotosRecord | null> {
    return await this.updateKept('photos', change);
  }

  /** Forgets the pictures. */
  async clearPhotos(): Promise<void> {
    await this.db.delete('learner', 'photos');
  }

  /**
   * Reads one of the records that the player keeps beside the book, hands it to `change`, and
   * stores what `change` gives back, in one transaction. Nothing is written before the last thing
   * that can throw.
   */
  private async updateKept<T>(
    key: 'play' | 'album' | 'photos',
    change: (stored: unknown) => T | null,
  ): Promise<T | null> {
    const tx = this.db.transaction('learner', 'readwrite');
    const done = tx.done;
    done.catch(() => undefined);
    const store = tx.objectStore('learner');
    const next = change(await store.get(key));
    if (next) await store.put(next, key);
    await done;
    return next;
  }

  /** Keeps unreadable data as text for the parent to export, newest few only. */
  async quarantine(raw: unknown, why: string, now: number): Promise<void> {
    let text: string;
    try {
      text = JSON.stringify(raw) ?? String(raw);
    } catch {
      text = String(raw);
    }
    const tx = this.db.transaction('quarantine', 'readwrite');
    const store = tx.objectStore('quarantine');
    await store.add({ at: now, why, raw: text.slice(0, MAX_SAVE_BYTES) });
    let excess = (await store.count()) - KEEP_QUARANTINED;
    let cursor = await store.openCursor();
    while (cursor && excess > 0) {
      await cursor.delete();
      excess -= 1;
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async quarantined(): Promise<QuarantineRecord[]> {
    return (await this.db.getAll('quarantine')).reverse();
  }

  /**
   * Drops snapshots that failed validation, once they have been quarantined, and points `current`
   * at a good one if there is one. Without this a damaged record would be checked and set aside
   * again on every start.
   */
  async discard(ids: readonly string[], adopt: SnapshotRecord | null): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(['currentWorld', 'snapshots'], 'readwrite');
    for (const id of ids) await tx.objectStore('snapshots').delete(id);
    const current = await tx.objectStore('currentWorld').get('current');
    if (adopt) await tx.objectStore('currentWorld').put(adopt, 'current');
    else if (current && ids.includes(current.snapshotId)) await tx.objectStore('currentWorld').delete('current');
    await tx.done;
  }

  close(): void {
    this.db.close();
  }
}

/** Asks the browser to keep this site's data when storage is tight. A grant is not a promise. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** The first snapshot in a list that passes validation, with how many newer ones did not. */
export function firstValid(records: readonly SnapshotRecord[]): { record: SnapshotRecord; skipped: number } | null {
  for (let i = 0; i < records.length; i++) {
    const parsed = WorldSaveV1.safeParse(records[i]!.save);
    if (parsed.success) return { record: { ...records[i]!, save: parsed.data }, skipped: i };
  }
  return null;
}
