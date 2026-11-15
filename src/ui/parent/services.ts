import type { LearnerProfile } from '../../learning';
import type { OfflineStatus } from '../../offline/status';
import type { Durable } from '../../persistence/durable';
import type { ReplaceResult, ReplaceSource, SetAside, ShelfEntry } from '../../persistence/keeper';
import type { Keeping } from '../../persistence/learner';
import type { SaveStatus } from '../../persistence/save-service';
import type { VisitKind } from '../../persistence/visit';
import type { ProfileId } from '../../render/profile';
import type { WorldSummary } from '../../shared/exchange';
import type { DeviceSettings } from '../../shared/save';
import type { Fullscreen } from '../fullscreen';
import type { Caught } from './text';

/**
 * Everything the parent controls need from the rest of the game, as the narrow set of things they
 * use. The game wires the real services in. A test page wires made-up ones in, which is how every
 * state of these pages can be looked at.
 */

export interface Source<T> {
  get(): T;
  /** Calls `listener` with each new value. Returns a way to stop. */
  subscribe(listener: (value: T) => void): () => void;
}

export interface WorldControls {
  /** The world on this device, or null when there is none. */
  current(): Promise<WorldSummary | null>;
  exportWorld(): Promise<{ filename: string; text: string } | null>;
  /** The copies put aside on this device, newest first. */
  shelf(): Promise<ShelfEntry[]>;
  preview(source: ReplaceSource): Promise<WorldSummary | null>;
  replace(source: ReplaceSource): Promise<ReplaceResult>;
  damagedData(): Promise<SetAside[]>;
}

/**
 * How starting a new book went. `refused` is a book this device would not put away, and nothing
 * changed.
 */
export type StartNewResult = 'started' | 'refused';

interface LearningControls {
  /**
   * The Spell Book as it stands. It changes while the controls are open when the game is played in
   * another tab, and when a new one is started.
   */
  book: Source<LearnerProfile>;
  /**
   * Where what is spelled is going. Read when it is needed, since a write can find the record
   * locked at any time.
   */
  keeping(): Keeping;
  /**
   * Whether the browser has promised not to clear what is kept on this device. `check` reads what
   * it says now.
   */
  durable: Source<Durable> & { check(): Promise<Durable> };
  /** Starts a new book. The old one is put aside on this device first. */
  startNew(): Promise<StartNewResult>;
  /** The Spell Book as a file to keep. */
  save(): { filename: string; text: string };
  /**
   * Puts a book from a file together with this one. Nothing it holds is taken away, and adding the
   * same one again changes nothing.
   */
  add(book: LearnerProfile): void;
  /**
   * Changes the book on a parent's word, as starting the player further on in the reading course
   * does.
   */
  change(update: (book: LearnerProfile) => LearnerProfile): void;
}

export interface OfflineControls {
  status: Source<OfflineStatus>;
  /** Switches to the newer version. The game is saved first and then restarts. */
  update(): Promise<void>;
  /** Asks again for whatever could not be kept, and looks for a newer version. */
  retry(): void;
  /**
   * Keeps every spoken lesson on the device. Until it is asked, a lesson is kept once it has been
   * heard.
   */
  keepSpoken(): void;
  /**
   * Throws away everything kept for offline play. The game is saved first and then loads afresh,
   * which needs a connection.
   */
  repair(): Promise<void>;
}

export interface AboutInfo {
  name: string;
  version: string;
  contentVersion: string;
  /** Where the source code of this copy is, or null when this build does not know. */
  source: string | null;
  /** What the game has put right by itself since this page opened, as it stands when asked. */
  caught(): Caught;
}

export interface ParentServices {
  settings: Source<DeviceSettings> & { update(patch: Partial<DeviceSettings>): void };
  /**
   * Whether this opening carries on with the saved world, starts from the beginning and leaves it
   * alone, or is a look around.
   */
  visit: VisitKind;
  /** How the game is drawing this opening. The low-end choice takes effect on the next one. */
  profile: ProfileId;
  saves: Source<SaveStatus>;
  /** Null where this browser cannot show the page full screen. */
  fullscreen: Fullscreen | null;
  world: WorldControls;
  learning: LearningControls;
  offline: OfflineControls | null;
  about: AboutInfo;
  now(): number;
  /** A short sound for a setting that was just changed, so the new level can be heard. */
  confirmSound(): void;
  download(file: { filename: string; text: string }): void;
}
