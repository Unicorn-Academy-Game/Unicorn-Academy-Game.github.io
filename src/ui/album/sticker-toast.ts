import type { AlbumSounds } from '../../audio/album-sounds';
import { isPortrait, type WordId } from '../../content/lexicon';
import type { StickerDef } from '../../content/stickers';
import { tell } from '../book-chrome';
import { h } from '../dom';
import { flyPicture } from '../learning/flight';
import { ALBUM_LABELS } from './album-text';
import type { StickerChip } from './sticker-chip';

/** How long a new sticker is held up before it goes to the book, and how long when more are waiting. */
const HOLD_MS = 1700;
const HOLD_FAST_MS = 800;
/** How long it takes to fade when it does not fly. */
const FADE_MS = 280;
/** How often a sticker that has to wait for the screen looks to see if it is free. */
const WAIT_MS = 400;

export interface StickerToastDeps {
  /** The page's own layer, which the sticker and its flight go in. */
  layer: HTMLElement;
  /** Whether the parent asked for fewer effects. */
  calm: () => boolean;
  /** Nothing else has the screen, so a sticker can come up. */
  free: () => boolean;
  picture: (word: WordId) => string;
  chip: Pick<StickerChip, 'box' | 'set' | 'pop'>;
  /** How many stickers the player has, which the button counts up to as they land. */
  have: () => number;
  sounds: Pick<AlbumSounds, 'earned' | 'fly'>;
}

/**
 * The moment a sticker is earned: it slaps onto the screen with a chime and its name, and then
 * flies to the button of the book, which counts it. It never stops the game, and a tap goes
 * through it. A sticker earned while something else has the screen, such as a game, waits until
 * that is done, and several that come together come one after another, each a little quicker.
 * With fewer effects it stays still and fades.
 */
export class StickerToast {
  private readonly queue: StickerDef[] = [];
  private readonly live: HTMLElement;
  private playing = false;
  private waiting = false;

  constructor(private readonly deps: StickerToastDeps) {
    this.live = h('p', { class: 'book-live', role: 'status', 'aria-live': 'polite' });
    deps.layer.append(this.live);
  }

  /** How many stickers are on their way to the book, or waiting for their turn. */
  private get pending(): number {
    return this.queue.length + (this.playing ? 1 : 0);
  }

  /**
   * The button counts the stickers that have landed in the book, and not those still on their way.
   * It is the one place that works out what it says, so it is right whenever it is asked.
   */
  settle(): void {
    this.deps.chip.set(this.deps.have() - this.pending);
  }

  show(stickers: readonly StickerDef[]): void {
    this.queue.push(...stickers);
    this.settle();
    this.pump();
  }

  private pump(): void {
    if (this.playing || this.waiting || this.queue.length === 0) return;
    if (!this.deps.free()) {
      this.waiting = true;
      window.setTimeout(() => {
        this.waiting = false;
        this.pump();
      }, WAIT_MS);
      return;
    }
    this.present(this.queue.shift()!);
  }

  private present(sticker: StickerDef): void {
    const { calm, layer, picture, sounds } = this.deps;
    this.playing = true;
    const portrait = isPortrait(sticker.emblem);
    const src = picture(sticker.emblem);
    const frame = h(
      'span',
      { class: 'sticker-pic', 'data-kind': portrait ? 'portrait' : 'thing' },
      h('img', { src, alt: '', draggable: 'false' }),
    );
    const sparks = calm()
      ? []
      : Array.from({ length: 8 }, (_, i) => h('i', { class: 'sticker-spark', style: `--a:${i * 45}deg` }));
    const toast = h(
      'div',
      { class: 'sticker-toast', 'aria-hidden': 'true', 'data-calm': String(calm()) },
      h('div', { class: 'sticker-toast-stage' }, ...sparks, frame),
      h('p', { class: 'sticker-toast-label' }, h('small', {}, ALBUM_LABELS.newOne), h('b', {}, sticker.name)),
    );
    layer.append(toast);
    sounds.earned();
    tell(this.live, `${ALBUM_LABELS.newOne} ${sticker.name}`);
    window.setTimeout(
      () => this.send(toast, frame, { src, portrait }),
      this.queue.length >= 2 ? HOLD_FAST_MS : HOLD_MS,
    );
  }

  /** The sticker has been shown, and goes to the book. */
  private send(toast: HTMLElement, frame: HTMLElement, what: { src: string; portrait: boolean }): void {
    const { calm, layer, chip, sounds } = this.deps;
    const done = (): void => {
      toast.remove();
      this.playing = false;
      this.settle();
      chip.pop();
      this.pump();
    };
    toast.dataset.leaving = 'true';
    if (calm()) {
      window.setTimeout(done, FADE_MS);
      return;
    }
    sounds.fly();
    flyPicture(
      layer,
      { picture: what.src, portrait: what.portrait, sticker: true },
      frame.getBoundingClientRect(),
      chip.box,
      done,
    );
  }
}
