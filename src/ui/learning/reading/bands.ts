import type { Band } from '../../../game/reading-ports';
import { h } from '../../dom';
import { bandsLabel, LABELS } from './text';

/**
 * The seven bands of a round, one for each thing in it, in the colours of the rainbow. A band is
 * full for a thing that was read.
 */
export class Bands {
  readonly node: HTMLElement;
  private readonly bands: HTMLElement[] = [];

  constructor(size: 'small' | 'big') {
    this.node = h('div', {
      class: 'read-bands',
      role: 'img',
      'aria-label': LABELS.bands,
      'data-size': size,
      'data-content-id': 'reading.bands',
    });
  }

  update(bands: readonly Band[]): void {
    while (this.bands.length < bands.length) {
      const band = h('i', { style: `--i:${this.bands.length}` });
      this.bands.push(band);
      this.node.append(band);
    }
    while (this.bands.length > bands.length) this.bands.pop()!.remove();
    bands.forEach((state, at) => {
      this.bands[at]!.dataset.band = state;
    });
    this.node.setAttribute('aria-label', bandsLabel(bands));
  }
}
