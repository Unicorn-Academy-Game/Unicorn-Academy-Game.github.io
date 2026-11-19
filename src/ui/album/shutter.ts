import type { AlbumSounds } from '../../audio/album-sounds';
import type { Box } from '../../game/ports';
import { MAX_PHOTOS, type Photo } from '../../shared/photos';
import { tell } from '../book-chrome';
import { h } from '../dom';
import type { CameraChip } from './camera-chip';
import './camera.css';
import { PHOTO_LABELS, placeOf } from './photo-text';

/** How long the print is held up before it goes to the corner. */
const HOLD_MS = 1900;
/** How long it takes to fade when it does not fly, and how long a flash lasts. */
const FADE_MS = 280;
const FLASH_MS = 420;
/** How long the print waits for the flash to be over before it comes up. */
const DELAY_MS = 140;
/** How long the print takes to fly to the corner. */
const FLIGHT_MS = 560;

export interface ShutterDeps {
  /** The page's own layer, which the flash and the print go in. */
  layer: HTMLElement;
  /** Whether the parent asked for fewer effects. */
  calm: () => boolean;
  chip: Pick<CameraChip, 'box' | 'set' | 'fill' | 'pop' | 'click'>;
  /** The pictures in the album, oldest first. */
  shots: () => readonly Photo[];
  sounds: Pick<AlbumSounds, 'shutter' | 'fly'>;
  /** The player tapped the print: open the album on it. */
  open: (id: string) => void;
}

/**
 * The moment a picture is taken: a flash and a click, then the print comes up out of the bottom of
 * the screen, develops, and flies to the corner where the camera is. It never stops the game, and a
 * tap goes through everything but the print itself, which opens the album. A picture taken while
 * the last print is still up sends that one off first. With fewer effects there is no flash, and
 * the print stays still and fades.
 */
export class Shutter {
  private readonly stage: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly live: HTMLElement;
  /** The print on the screen now, and the timer that will send it off. */
  private showing: { photo: Photo; print: HTMLElement; timer: number; done: () => void } | null = null;

  constructor(private readonly deps: ShutterDeps) {
    this.flash = h('div', { class: 'camera-flash', 'aria-hidden': 'true' });
    this.live = h('p', { class: 'book-live', role: 'status', 'aria-live': 'polite' });
    this.stage = h('div', { class: 'camera-stage' }, this.flash, this.live);
    deps.layer.append(this.stage);
  }

  /** The picture that is still on its way to the corner, which the corner does not show yet. */
  get pending(): Photo | null {
    return this.showing?.photo ?? null;
  }

  /** The corner shows the newest picture that has landed, and not the one still on its way. */
  settle(): void {
    const pending = this.pending?.id;
    const shots = this.deps.shots();
    this.deps.chip.set(shots.findLast((p) => p.id !== pending) ?? null);
    this.deps.chip.fill(shots.length >= MAX_PHOTOS);
  }

  /** A tap came to no picture, and the player is asked to tap again. */
  again(): void {
    tell(this.live, PHOTO_LABELS.again);
  }

  /** A picture was taken. */
  taken(photo: Photo): void {
    const { calm, sounds, chip } = this.deps;
    this.land();
    sounds.shutter();
    chip.click();
    if (!calm()) {
      this.flash.dataset.on = 'true';
      window.setTimeout(() => delete this.flash.dataset.on, FLASH_MS);
    }
    // The album has not kept this picture yet, so a full one is still full here.
    const full = this.deps.shots().length >= MAX_PHOTOS;
    tell(this.live, `${PHOTO_LABELS.newOne} ${placeOf(photo.place)}.${full ? ` ${PHOTO_LABELS.madeRoom}` : ''}`);
    this.present(photo, full);
  }

  /** The print comes up, and in a full album it says what the oldest picture did. */
  private present(photo: Photo, full: boolean): void {
    const { calm } = this.deps;
    const print = h(
      'button',
      {
        type: 'button',
        class: 'camera-print',
        'aria-hidden': 'true',
        tabindex: -1,
        'data-calm': String(calm()),
        'data-content-id': 'camera.print',
        style: `--ratio:${photo.w} / ${photo.h}`,
        onclick: () => {
          this.land();
          this.deps.open(photo.id);
        },
      },
      h('img', { src: photo.image, alt: '', draggable: 'false' }),
      h('span', { class: 'camera-print-place' }, placeOf(photo.place)),
      full ? h('span', { class: 'camera-print-room' }, PHOTO_LABELS.madeRoom) : null,
    );
    let ended = false;
    const done = (): void => {
      if (ended) return;
      ended = true;
      window.clearTimeout(timer);
      print.remove();
      if (this.showing?.print === print) this.showing = null;
      this.settle();
      this.deps.chip.pop();
    };
    const timer = window.setTimeout(() => this.send(print, done), DELAY_MS + HOLD_MS);
    this.showing = { photo, print, timer, done };
    window.setTimeout(() => {
      if (!ended) this.stage.append(print);
    }, DELAY_MS);
    this.settle();
  }

  /** The print on the screen goes to the corner now, and does not fly. */
  private land(): void {
    this.showing?.done();
  }

  /** The print has been shown, and goes to the corner. */
  private send(print: HTMLElement, done: () => void): void {
    const { calm, chip, sounds } = this.deps;
    if (calm()) {
      print.dataset.leaving = 'true';
      window.setTimeout(done, FADE_MS);
      return;
    }
    const from = print.getBoundingClientRect();
    const to: Box = chip.box;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    print.style.setProperty('--dx', `${dx}px`);
    print.style.setProperty('--dy', `${dy}px`);
    print.style.setProperty('--shrink', String(Math.max(0.05, to.width / Math.max(1, from.width))));
    print.dataset.leaving = 'true';
    sounds.fly();
    window.setTimeout(done, FLIGHT_MS);
  }
}
