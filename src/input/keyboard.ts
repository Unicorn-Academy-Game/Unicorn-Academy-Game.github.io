import type { Vec2 } from '../shared/ids';
import { SteerKeys } from './steer-keys';

export interface KeyboardSink {
  /** The way the held keys point, or null when none do. */
  lead(heading: Vec2 | null): void;
  /**
   * The F key was pressed: a way to go full screen without the mouse. Left out where there is none.
   */
  fullscreen?(): void;
}

export interface KeyboardInput {
  /** Lets go of every key, for when something else takes the keyboard. */
  release(): void;
  stop(): void;
}

/**
 * Whether the focus is somewhere letters are typed, where a key is for the text and not for
 * Wildstar.
 */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/**
 * The Command key, which is how a Mac says that every other key lifted while it was held was not
 * heard.
 */
const isCommand = (e: KeyboardEvent): boolean => e.key === 'Meta' || e.code === 'MetaLeft' || e.code === 'MetaRight';

/**
 * WASD and the arrow keys lead Wildstar, for a keyboard in front of a game, and F goes full screen.
 * A key that is held down with a modifier, or pressed while letters are being typed, or while the
 * game has been put behind something else, is not for her. A key that goes up is always heard, so
 * one that went down for her is never left held.
 *
 * Almost always. A Mac sends no key-up for a key that is let go while Command is down, so a
 * direction held when Command goes down would lead her for ever. Command going down, or up, lets go
 * of every key.
 */
export function listenForKeys(sink: KeyboardSink, enabled: () => boolean): KeyboardInput {
  const keys = new SteerKeys();
  const say = (): void => sink.lead(keys.heading());

  const down = (e: KeyboardEvent): void => {
    if (isCommand(e)) {
      release();
      return;
    }
    if (!enabled() || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.code === 'KeyF' && sink.fullscreen) {
      if (!e.repeat) sink.fullscreen();
      e.preventDefault();
      return;
    }
    if (!keys.down(e.code)) return;
    e.preventDefault();
    say();
  };
  const up = (e: KeyboardEvent): void => {
    if (isCommand(e)) {
      release();
      return;
    }
    if (keys.up(e.code)) say();
  };
  const release = (): void => {
    keys.clear();
    say();
  };
  const hide = (): void => {
    if (document.visibilityState === 'hidden') release();
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', hide);
  return {
    release,
    stop() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hide);
      release();
    },
  };
}
