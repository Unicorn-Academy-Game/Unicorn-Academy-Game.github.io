import type { SubjectId, WordId } from '../content/lexicon';
import type { DomainEvent, SaveReason, World } from '../domain';
import type { Outcome, Spelling, Stars, Worth } from '../learning';
import type { MapId, UnicornId, Vec2 } from '../shared/ids';
import type { KeyboardLayout, LetterCase } from '../shared/learning';
import type { LogicMap } from '../shared/map';

/** What the game asks of local storage. The controller never touches IndexedDB itself. */
export interface SavePort {
  /** Notes that the world changed in a way worth saving. The port decides when to write. */
  request(reason: SaveReason, world: World): void;
  /** Writes now and resolves when the snapshot is stored, or when storing it failed. */
  flush(world: World): Promise<void>;
}

/** What the ground sounds like under a hoof. */
export type Surface = 'soft' | 'hard';

/** The part of the world on screen, in world units. */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the herd is, as far as sound is concerned: which music and ambience belong here and what
 * the ground is made of.
 */
export interface AudioPlace {
  mapId: MapId;
  music: LogicMap['audio']['music'];
  ambience: LogicMap['audio']['ambience'];
  surfaceAt(p: Vec2): Surface;
}

/** What the game asks of sound. All of it is safe to call before audio is unlocked. */
export interface AudioPort {
  /** Starts audio from a user gesture. Safe to call on every gesture. */
  unlock(): void;
  /** Switches to a map's music and ambience. */
  enterMap(place: AudioPlace): void;
  /** Plays what a batch of simulation events sounds like, if anything. */
  events(events: readonly DomainEvent[], world: World): void;
  /** Called once a frame, for sounds that follow movement, such as footsteps. */
  frame(world: World, view: View, seconds: number): void;
  /** Stops sound while the page is hidden or interrupted. */
  suspend(): void;
  resume(): void;
}

export const silentAudio: AudioPort = {
  unlock: () => undefined,
  enterMap: () => undefined,
  events: () => undefined,
  frame: () => undefined,
  suspend: () => undefined,
  resume: () => undefined,
};

export const forgetfulSaves: SavePort = {
  request: () => undefined,
  flush: () => Promise.resolve(),
};

/**
 * Where a thing is, for something to appear at. `lift` is how high above the ground it is, for a
 * creature that flies.
 */
export interface Place {
  at: Vec2;
  lift: number;
}

/**
 * What the world tells the lesson, and all it tells. The world never asks whether learning is on or
 * what a word is: it says what happened, and the lesson decides. A game with no lesson passes none,
 * and then none of this is ever called.
 */
export interface LessonPort {
  /**
   * The player tapped something that gives something away, such as a fruit tree. True when a card
   * comes first: the tap is held, and `release` carries it out when the card is done. It is never
   * called when they close the card instead.
   */
  hold(subject: SubjectId, release: () => void): boolean;
  /**
   * The player tapped a thing and the world has answered. That may be a reason to ask for its name.
   * `where` finds the thing again, as it may have moved.
   */
  touched(subject: SubjectId, where: () => Place): void;
  /**
   * A friend who has not been found is waiting to be asked in. `join` asks her. It is safe to call
   * late, and more than once.
   */
  met(unicorn: UnicornId, join: () => void): void;
  /** Wildstar went away from a friend who was waiting. */
  away(unicorn: UnicornId): void;
  /**
   * The herd is in another place now. What the player touched and the friends who were waiting in
   * the old one are not asked about any more.
   */
  newPlace(): void;
}

/** Where something is on the screen, in CSS pixels. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Holding the world still under a card or the book, and letting it go. */
export interface Rest {
  freeze(): void;
  thaw(): void;
}

/** A word that has just gone into the player's book, for whatever shows the book to say so. */
export interface Kept {
  word: WordId;
  /** The picture of the word, as an image. */
  picture: string;
  /** The picture is a friend's head and shoulders, which sits in a round frame. */
  portrait: boolean;
  /** Where the picture and its frame were on the screen, or nothing when that is not known. */
  from: Box | null;
  /** The word is new to the player's book, not one they have spelled before. */
  fresh: boolean;
  /** How many words are in the book now. */
  collected: number;
  /** The stars the word had and has now. */
  stars: { before: Stars; after: Stars };
}

/** What a card is given when it opens. */
export interface CardOpening {
  /** The picture of the word, as an image. */
  picture: string;
  /**
   * The picture is a friend's head and shoulders, which sits in a round frame like the one in the
   * finder.
   */
  portrait: boolean;
  layout: KeyboardLayout;
  letters: LetterCase;
  /** Whether there is a voice to say the word, which is what the speaker button needs. */
  speech: boolean;
  /** The first card the player has ever seen, which says how to use it. */
  firstEver: boolean;
}

/**
 * What a card tells the lesson. The card keeps no rules: it asks, and is drawn again with what the
 * lesson says.
 */
export interface CardHandlers {
  /** A letter was pressed, on the screen or on a keyboard. */
  key: (letter: string) => void;
  help: () => void;
  say: () => void;
  /** The player closed the card with the cross or Escape. */
  close: () => void;
  /** The word is done and the player is ready to go on, by a tap or a key. */
  collect: () => void;
}

/** The card the player spells a word on, as the lesson drives it. */
export interface CardPort {
  open(s: Spelling, opening: CardOpening): void;
  /**
   * Draws the card again as the spelling stands. `peeking` is true while the whole word is being
   * shown for a moment.
   */
  render(s: Spelling, peeking: boolean): void;
  /** A key was pressed and the spelling has moved on. */
  pressed(outcome: Outcome, s: Spelling, peeking: boolean): void;
  /** The player asked for help and the key they need is shining now. */
  helped(s: Spelling, peeking: boolean): void;
  /**
   * The word is done. `text` is what the card says about it, and `worth` is what the player earned:
   * the stars they have now and had before, and whether it was a big moment.
   */
  celebrate(text: string, worth: Worth): void;
  /** Where the picture and its frame are, for them to fly to the book from. */
  pictureRect(): Box | null;
  /** Takes the card away. What it was doing is dropped. */
  close(): void;
}
