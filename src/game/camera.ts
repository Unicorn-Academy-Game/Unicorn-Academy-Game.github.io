import type { PhotosModel } from '../persistence/photos';
import { added, isPhoto, type Photo, removed } from '../shared/photos';

/** What a shot is, as the screen gives it: the picture and how big it is. */
export interface Frame {
  image: string;
  w: number;
  h: number;
}

export interface CameraDeps {
  model: PhotosModel;
  /** Takes a picture of the world as it stands, or nothing when the screen cannot give one. */
  shoot: () => Promise<Frame | null>;
  /** Where the player is, by the id of the place. */
  place: () => string;
  now: () => number;
  /** A number from 0 up to but not including 1. */
  random: () => number;
  /** A picture was taken, a moment before it is kept, so that whatever shows it can be ready for it. */
  taken: (photo: Photo) => void;
  /** Something the album counts happened. */
  note: (name: string) => void;
  /** A tap came to no picture, so the player can be shown that it was seen and asked to tap again. */
  missed: () => void;
}

/** A name for a picture that no other picture on any device has: when it was taken, and a few letters. */
export function nameOf(at: number, random: () => number): string {
  const tail = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${Math.max(0, Math.floor(at)).toString(36).padStart(2, '0')}${tail}`;
}

/**
 * The camera: it takes the picture of the world, keeps it in the photo album, and counts it for the
 * sticker book. Only one picture is taken at a time, so a finger that taps twice makes one. A tap
 * that comes to no picture is answered, and they can take it again.
 */
export class Camera {
  private busy = false;

  constructor(private readonly deps: CameraDeps) {}

  get taking(): boolean {
    return this.busy;
  }

  /** Takes a picture and keeps it. Answers the picture, or null when there was none to take. */
  async take(): Promise<Photo | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      // A busy moment can make the screen late once, so it is asked twice before the tap is given up.
      const frame = (await this.deps.shoot()) ?? (await this.deps.shoot());
      if (!frame) {
        this.deps.missed();
        return null;
      }
      const at = this.deps.now();
      const photo: Photo = {
        id: nameOf(at, this.deps.random),
        at,
        place: this.deps.place(),
        image: frame.image,
        w: frame.w,
        h: frame.h,
      };
      // A picture the album cannot hold would be lost the next time it is read, so it is not kept.
      if (!isPhoto(photo)) {
        this.deps.missed();
        return null;
      }
      this.deps.taken(photo);
      this.deps.model.set(added(this.deps.model.get(), photo));
      this.deps.note('photos');
      return photo;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Keeps a picture the player drew on as a new picture of its own, taken in the place the first one
   * was, which stays as it was. It counts as a drawing and not as a picture taken. Answers the
   * picture, or null when the album could not hold it.
   */
  keepDrawing(frame: Frame, place: string): Photo | null {
    const at = this.deps.now();
    const photo: Photo = { id: nameOf(at, this.deps.random), at, place, image: frame.image, w: frame.w, h: frame.h };
    if (!isPhoto(photo)) return null;
    this.deps.model.set(added(this.deps.model.get(), photo));
    this.deps.note('doodles');
    return photo;
  }

  /** Puts a picture away. It is not counted back: the sticker the player earned is theirs. */
  putAway(id: string): void {
    this.deps.model.set(removed(this.deps.model.get(), id));
  }
}
