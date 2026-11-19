import { type AlbumRecord, emptyAlbum, mergeAlbum, readAlbum, sameAlbum } from '../shared/album';
import { type RecordDevice, type RecordKind, RecordModel } from './record-model';
import type { SaveClock } from './save-service';
import type { LocalStore } from './store';

/** What the sticker book needs of the device: reading it, writing it and clearing it. */
export type AlbumStore = Pick<LocalStore, 'album' | 'updateAlbum' | 'clearAlbum'>;

const ALBUM: RecordKind<AlbumRecord> = {
  empty: emptyAlbum,
  read: (raw) => {
    const { album, newer } = readAlbum(raw);
    return { value: album, newer };
  },
  merge: mergeAlbum,
  same: sameAlbum,
};

const deviceOf = (store: AlbumStore | null): RecordDevice<AlbumRecord> | null =>
  store && {
    read: () => store.album(),
    update: (change) => store.updateAlbum(change),
    clear: () => store.clearAlbum(),
  };

/**
 * The stickers the player has earned, on this device. A write is a merge with what is stored, so a
 * second tab can never take a sticker away. See `RecordModel` for the rest.
 */
export class AlbumModel extends RecordModel<AlbumRecord> {
  constructor(
    initial: AlbumRecord,
    device: RecordDevice<AlbumRecord> | null,
    clock?: Pick<SaveClock, 'later'>,
    locked?: boolean,
    untouched?: boolean,
  ) {
    super(ALBUM, initial, device, clock, locked, untouched);
  }

  static async load(store: AlbumStore | null, clock?: Pick<SaveClock, 'later'>): Promise<AlbumModel> {
    const device = deviceOf(store);
    const { value, locked, untouched } = await RecordModel.fetch(ALBUM, device);
    return new AlbumModel(value, device, clock, locked, untouched);
  }

  /** A copy that writes nothing, for a visit that must leave the device as it found it. */
  detached(): AlbumModel {
    return new AlbumModel(this.get(), null, this.clock, false, this.untouched);
  }
}
