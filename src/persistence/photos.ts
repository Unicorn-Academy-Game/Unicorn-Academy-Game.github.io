import { emptyPhotos, mergePhotos, type PhotosRecord, readPhotos, samePhotos } from '../shared/photos';
import { type RecordDevice, type RecordKind, RecordModel } from './record-model';
import type { SaveClock } from './save-service';
import type { LocalStore } from './store';

/** What the photo album needs of the device: reading it, writing it and clearing it. */
export type PhotosStore = Pick<LocalStore, 'photos' | 'updatePhotos' | 'clearPhotos'>;

const PHOTOS: RecordKind<PhotosRecord> = {
  empty: emptyPhotos,
  read: (raw) => {
    const { photos, newer } = readPhotos(raw);
    return { value: photos, newer };
  },
  merge: mergePhotos,
  same: samePhotos,
};

const deviceOf = (store: PhotosStore | null): RecordDevice<PhotosRecord> | null =>
  store && {
    read: () => store.photos(),
    update: (change) => store.updatePhotos(change),
    clear: () => store.clearPhotos(),
  };

/**
 * The pictures the player has taken, on this device. A write is a merge with what is stored, so a
 * second tab can never take a picture away. See `RecordModel` for the rest.
 */
export class PhotosModel extends RecordModel<PhotosRecord> {
  constructor(
    initial: PhotosRecord,
    device: RecordDevice<PhotosRecord> | null,
    clock?: Pick<SaveClock, 'later'>,
    locked?: boolean,
    untouched?: boolean,
  ) {
    super(PHOTOS, initial, device, clock, locked, untouched);
  }

  static async load(store: PhotosStore | null, clock?: Pick<SaveClock, 'later'>): Promise<PhotosModel> {
    const device = deviceOf(store);
    const { value, locked, untouched } = await RecordModel.fetch(PHOTOS, device);
    return new PhotosModel(value, device, clock, locked, untouched);
  }

  /** A copy that writes nothing, for a visit that must leave the device as it found it. */
  detached(): PhotosModel {
    return new PhotosModel(this.get(), null, this.clock, false, this.untouched);
  }
}
