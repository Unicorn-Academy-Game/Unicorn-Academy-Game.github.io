import { h } from './dom';

export interface Segment<T> {
  value: T;
  label: string;
  /** A small picture beside the label, as SVG markup, for a child who does not read yet. */
  icon?: string;
}

export interface SegmentedOptions {
  /**
   * Shows only the pictures. The names are still there for a screen reader, and are what the sides
   * are called.
   */
  iconsOnly?: boolean;
}

/**
 * A switch with a name on each of its sides, one of them lit. It reads as a group of radio buttons:
 * the arrow keys move between the sides and pick as they go, and the group is one stop for Tab.
 * With two sides, a tap on the lit side flips it over, as a tap on any switch does, and with more a
 * tap picks the side it lands on.
 */
export class Segmented<T> {
  readonly node: HTMLElement;
  private readonly buttons: HTMLButtonElement[];
  private current: T;

  /** `label` is the id of the element that names the group. */
  constructor(
    private readonly sides: readonly Segment<T>[],
    label: string,
    value: T,
    private readonly onPick: (value: T) => void,
    { iconsOnly = false }: SegmentedOptions = {},
  ) {
    this.current = value;
    this.buttons = sides.map((side) => {
      const button = h('button', {
        type: 'button',
        role: 'radio',
        class: 'side',
        'aria-checked': 'false',
        tabindex: '-1',
      });
      if (side.icon) {
        const icon = h('span', { class: 'side-icon', 'aria-hidden': 'true' });
        icon.innerHTML = side.icon;
        button.append(icon);
      }
      button.append(h('span', { class: 'side-label' }, side.label));
      if (iconsOnly) button.setAttribute('aria-label', side.label);
      return button;
    });
    this.node = h(
      'div',
      { class: 'segmented', role: 'radiogroup', 'aria-labelledby': label },
      h('i', { class: 'thumb', 'aria-hidden': 'true' }),
      ...this.buttons,
    );
    this.node.style.setProperty('--count', String(sides.length));
    this.node.classList.toggle('icons-only', iconsOnly);
    this.buttons.forEach((button, i) => {
      button.addEventListener('click', () =>
        this.pick(sides.length === 2 && sides[i]!.value === this.current ? sides[1 - i]!.value : sides[i]!.value),
      );
      button.addEventListener('keydown', (event) => {
        const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (by === undefined) return;
        event.preventDefault();
        const next = this.buttons[(i + by + this.buttons.length) % this.buttons.length]!;
        next.focus();
        this.pick(sides[this.buttons.indexOf(next)]!.value);
      });
    });
    this.set(value);
  }

  /** Lights a side without telling anyone. For a choice made somewhere else. */
  set(value: T): void {
    this.current = value;
    const at = Math.max(
      0,
      this.sides.findIndex((side) => side.value === value),
    );
    this.node.style.setProperty('--at', String(at));
    this.buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i === at));
      button.tabIndex = i === at ? 0 : -1;
    });
  }

  private pick(value: T): void {
    if (value === this.current) return;
    const focused = this.node.contains(document.activeElement);
    this.set(value);
    // A tap that flipped the switch leaves focus where the tap was, which is the side that is no
    // longer lit.
    if (focused) this.buttons.find((button) => button.tabIndex === 0)?.focus({ preventScroll: true });
    this.onPick(value);
  }
}
