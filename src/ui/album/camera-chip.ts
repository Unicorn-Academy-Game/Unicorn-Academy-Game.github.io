import type { Box } from '../../game/ports';
import type { Photo } from '../../shared/photos';
import { deviceCalm, flag, h } from '../dom';
import './camera.css';
import { ICON_CAMERA } from './photo-icons';
import { PHOTO_LABELS, photoLabel } from './photo-text';

export interface CameraChipDeps {
  /** Whether the parent asked for fewer effects. */
  calm: () => boolean;
  /** The player tapped the camera. */
  snap: () => void;
  /** The player tapped the newest picture. */
  open: () => void;
}

/**
 * The camera in the corner: a button that takes a picture, and, once there is one, the newest
 * picture beside it as a small print that opens the album, the way a phone's camera does. A picture
 * that has just been taken lands on the print, so it is the player who sees the album grow.
 */
export class CameraChip {
  readonly node: HTMLElement;
  private readonly take: HTMLButtonElement;
  private readonly thumb: HTMLButtonElement;
  private readonly image: HTMLImageElement;

  constructor(private readonly deps: CameraChipDeps) {
    const icon = h('span', { class: 'bookchip-icon', 'aria-hidden': 'true' });
    icon.innerHTML = ICON_CAMERA;
    this.take = h(
      'button',
      {
        type: 'button',
        class: 'camera-take',
        'data-content-id': 'camera.take',
        'aria-label': PHOTO_LABELS.take,
        onclick: () => this.deps.snap(),
      },
      icon,
    );
    this.image = h('img', { alt: '', draggable: 'false' });
    this.thumb = h(
      'button',
      {
        type: 'button',
        class: 'camera-thumb',
        'data-content-id': 'camera.album',
        'aria-label': PHOTO_LABELS.open,
        hidden: true,
        onclick: () => this.deps.open(),
      },
      this.image,
    );
    this.node = h('div', { class: 'bookchip camerachip' }, this.take, this.thumb);
  }

  /** The newest picture as it stands now, with no ceremony. Nothing hides the print. */
  set(newest: Photo | null): void {
    this.thumb.hidden = newest === null;
    if (!newest) {
      this.image.removeAttribute('src');
      return;
    }
    if (this.image.getAttribute('src') !== newest.image) this.image.src = newest.image;
    this.thumb.setAttribute('aria-label', `${PHOTO_LABELS.open}. ${photoLabel(newest.place, false)}`);
  }

  /** The shutter has just closed. */
  click(): void {
    if (!this.deps.calm()) flag(this.node, 'snap', 420);
  }

  /**
   * The tap came to no picture: the button shakes a little, which is a way to say that it was seen.
   * With fewer effects it holds still and lights a ring for a moment instead.
   */
  miss(): void {
    const calm = this.deps.calm() || deviceCalm();
    flag(this.take, 'miss', calm ? 1400 : 520, calm ? 'still' : 'true');
  }

  /** Whether the album is full, which a screen reader hears before a tap puts the oldest picture away. */
  fill(full: boolean): void {
    this.take.setAttribute('aria-label', full ? PHOTO_LABELS.takeFull : PHOTO_LABELS.take);
  }

  /** A picture has landed on the print. */
  pop(): void {
    if (!this.deps.calm()) flag(this.thumb.hidden ? this.take : this.thumb, 'gain', 800);
  }

  /** Where a picture flying here should end up. */
  get box(): Box {
    return (this.thumb.hidden ? this.take : this.thumb).getBoundingClientRect();
  }
}
