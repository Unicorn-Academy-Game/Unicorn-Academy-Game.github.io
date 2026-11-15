import type { Cue } from '../../../game/reading-ports';

/**
 * What the screen does for a cue. The session says what happened, and this says what is to be seen
 * of it, so the drawing code only has to play each effect and the choice of what to show is a plain
 * function.
 */
export type Effect =
  /** A tile or a word is lit, with a pop. */
  | { readonly kind: 'pop'; readonly piece: number }
  /** One that was lit already is touched again, with a smaller pop. */
  | { readonly kind: 'pulse'; readonly piece: number }
  /** One that was not next only nudges. */
  | { readonly kind: 'nudge'; readonly piece: number }
  /** The pieces come together, with a sweep of light. */
  | { readonly kind: 'join' }
  /**
   * A piece, or the whole of the word, shines for a while: `after` seconds from now, for `seconds`.
   */
  | { readonly kind: 'light'; readonly piece: number | null; readonly after: number; readonly seconds: number }
  /** The player asked for once more. */
  | { readonly kind: 'ask' };

export function effectsOf(cue: Cue): Effect[] {
  switch (cue.kind) {
    case 'touched':
      return [{ kind: 'pop', piece: cue.at }];
    case 'again':
      return [{ kind: 'pulse', piece: cue.at }];
    case 'bounced':
      return [{ kind: 'nudge', piece: cue.at }];
    case 'joined':
      return [{ kind: 'join' }];
    case 'voiced':
      return cue.marks.map(
        (mark): Effect => ({ kind: 'light', piece: mark.at, after: mark.after, seconds: mark.seconds }),
      );
    case 'asked':
      return [{ kind: 'ask' }];
  }
}
