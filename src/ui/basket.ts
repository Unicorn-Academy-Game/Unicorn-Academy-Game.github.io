import { PRODUCE, PRODUCE_IDS, type ProduceId } from '../content/produce';
import type { ProduceIcons } from '../render/produce-icons';
import { h } from './dom';
import { Fade } from './fade';

/**
 * How many flying icons may be in the air at once. A tree drops four, and a herd can gather several
 * in a second.
 */
const MAX_FLYING = 10;
const FLIGHT_MS = 640;

export type Counts = Readonly<Partial<Record<ProduceId, number>>>;

/** How many have been gathered in all. */
export const total = (counts: Counts): number => PRODUCE_IDS.reduce((sum, id) => sum + (counts[id] ?? 0), 0);

/**
 * What a screen reader says about the basket: each kind with its count, in the order the kinds are
 * listed, or that it is empty.
 */
export function basketLabel(counts: Counts): string {
  const parts = PRODUCE_IDS.filter((id) => (counts[id] ?? 0) > 0).map((id) => {
    const n = counts[id]!;
    return `${n} ${n === 1 ? PRODUCE[id].word : PRODUCE[id].plural}`;
  });
  return parts.length === 0 ? 'Basket, empty' : `Basket, ${parts.join(', ')}`;
}

interface Chip {
  node: HTMLElement;
  count: HTMLElement;
  n: number;
}

/**
 * The basket in the corner: a chip for each kind of fruit or vegetable the player has gathered this
 * visit, with how many. It is empty and out of sight until the first one. It is never saved and
 * never full, so it is only for the joy of the number going up. An icon flies from where the piece
 * lay to its chip, unless the parent asked for fewer effects. Ten seconds after the last one it
 * fades out of the way, and the next one brings it back.
 */
export class Basket {
  readonly node: HTMLElement;
  private readonly chips = new Map<ProduceId, Chip>();
  private readonly timers = new Map<HTMLElement, number>();
  private readonly fade = new Fade((seen) => {
    if (seen) delete this.node.dataset.resting;
    else this.node.dataset.resting = 'true';
  });
  private flying = 0;

  /** `overlay` is where flying icons go. `calm` says whether the parent asked for fewer effects. */
  constructor(
    private readonly overlay: HTMLElement,
    private readonly icons: ProduceIcons,
    private readonly calm: () => boolean,
  ) {
    this.node = h('div', { class: 'basket', role: 'group', 'aria-label': basketLabel({}) });
    this.node.hidden = true;
  }

  /** How many of each the player has gathered. */
  get counts(): Counts {
    return Object.fromEntries([...this.chips].map(([id, c]) => [id, c.n]));
  }

  /**
   * One more of this kind. `from` is where it was on the screen, in CSS pixels, if that is known
   * and on it.
   */
  collect(id: ProduceId, from: { x: number; y: number } | null): void {
    const chip = this.chips.get(id) ?? this.add(id);
    const wasEmpty = this.node.hidden;
    chip.n += 1;
    chip.count.textContent = String(chip.n);
    this.node.hidden = false;
    if (wasEmpty) this.restart(this.node, 'arrive', 520);
    this.node.dataset.total = String(total(this.counts));
    this.node.setAttribute('aria-label', basketLabel(this.counts));
    this.fade.touch();
    if (from && !this.calm()) this.fly(id, from, chip);
    else this.pop(chip);
  }

  private add(id: ProduceId): Chip {
    const count = h('b', { class: 'basket-count' }, '0');
    const node = h(
      'span',
      { class: 'basket-chip', 'data-produce': id, title: PRODUCE[id].word },
      h('img', { src: this.icons[id], alt: '', draggable: 'false' }),
      count,
    );
    const chip: Chip = { node, count, n: 0 };
    // Chips stay in the order the kinds are listed, so a new one never makes the others jump about.
    const after = PRODUCE_IDS.slice(PRODUCE_IDS.indexOf(id) + 1).find((other) => this.chips.has(other));
    this.node.insertBefore(node, after ? this.chips.get(after)!.node : null);
    this.chips.set(id, chip);
    return chip;
  }

  private pop(chip: Chip): void {
    this.restart(chip.node, 'pop', 520);
  }

  /** An icon leaves where the piece lay and lands on its chip, which pops when it arrives. */
  private fly(id: ProduceId, from: { x: number; y: number }, chip: Chip): void {
    if (this.flying >= MAX_FLYING) {
      this.pop(chip);
      return;
    }
    const to = chip.node.getBoundingClientRect();
    const size = 36;
    const icon = h('img', {
      class: 'basket-flyer',
      src: this.icons[id],
      alt: '',
      draggable: 'false',
      'aria-hidden': 'true',
    });
    icon.style.width = `${size}px`;
    icon.style.left = `${from.x - size / 2}px`;
    icon.style.top = `${from.y - size}px`;
    this.overlay.append(icon);
    this.flying += 1;
    const dx = to.left + to.width / 2 - from.x;
    const dy = to.top + to.height / 2 - (from.y - size / 2);
    const finish = (): void => {
      icon.remove();
      this.flying -= 1;
      this.pop(chip);
    };
    if (typeof icon.animate !== 'function') {
      finish();
      return;
    }
    const flight = icon.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 46}px) scale(1.25)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0.95, offset: 1 },
      ],
      { duration: FLIGHT_MS, easing: 'cubic-bezier(0.45, 0, 0.75, 0.6)' },
    );
    flight.onfinish = finish;
    flight.oncancel = finish;
  }

  /**
   * Plays a one-off animation by setting a flag the stylesheet reacts to and taking it away after
   * it has run.
   */
  private restart(node: HTMLElement, flag: string, ms: number): void {
    window.clearTimeout(this.timers.get(node));
    delete node.dataset[flag];
    void node.offsetWidth;
    node.dataset[flag] = 'true';
    this.timers.set(
      node,
      window.setTimeout(() => delete node.dataset[flag], ms),
    );
  }
}
