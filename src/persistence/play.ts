import { emptyPlay, mergePlay, type PlayRecord, readPlay, samePlay } from '../shared/play';
import { type RecordDevice, type RecordKind, RecordModel } from './record-model';
import type { SaveClock } from './save-service';
import type { LocalStore } from './store';

/**
 * What the tables need of the device: reading what the player has done, writing it, and clearing
 * it.
 */
export type PlayStore = Pick<LocalStore, 'play' | 'updatePlay' | 'clearPlay'>;

const PLAY: RecordKind<PlayRecord> = {
  empty: emptyPlay,
  read: (raw) => {
    const { play, newer } = readPlay(raw);
    return { value: play, newer };
  },
  merge: mergePlay,
  same: samePlay,
};

const deviceOf = (store: PlayStore | null): RecordDevice<PlayRecord> | null =>
  store && { read: () => store.play(), update: (change) => store.updatePlay(change), clear: () => store.clearPlay() };

/**
 * What the player has done at the memory and maths tables, on this device. A write is a merge with
 * what is stored, so a second tab can never take a star away. See `RecordModel` for the rest.
 */
export class PlayModel extends RecordModel<PlayRecord> {
  constructor(
    initial: PlayRecord,
    device: RecordDevice<PlayRecord> | null,
    clock?: Pick<SaveClock, 'later'>,
    locked?: boolean,
  ) {
    super(PLAY, initial, device, clock, locked);
  }

  static async load(store: PlayStore | null, clock?: Pick<SaveClock, 'later'>): Promise<PlayModel> {
    const device = deviceOf(store);
    const { value, locked } = await RecordModel.fetch(PLAY, device);
    return new PlayModel(value, device, clock, locked);
  }

  /** A copy that writes nothing, for a visit that must leave the device as it found it. */
  detached(): PlayModel {
    return new PlayModel(this.get(), null, this.clock);
  }
}
