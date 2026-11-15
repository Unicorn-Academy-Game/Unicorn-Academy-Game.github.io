import type { Haze } from '../content/seasons';
import { h } from './dom';
import './haze.css';

/**
 * A veil of colour over the world: cool and pale in winter, warm in autumn, a blush in spring. It
 * is a layer of the page over the picture and under the buttons, so it never touches a tap, and it
 * comes and goes slowly when the place changes.
 */
export class SkyHaze {
  readonly node: HTMLElement = h('div', { class: 'sky-haze', 'aria-hidden': 'true' });

  /** The veil that is over the world now, or null for none. The colour stays while it fades out. */
  set(haze: Haze | null): void {
    if (haze) this.node.style.background = haze.color;
    this.node.style.opacity = haze ? String(haze.alpha) : '0';
  }
}
