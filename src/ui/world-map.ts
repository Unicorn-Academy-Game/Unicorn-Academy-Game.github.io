import { ISLAND_PINS, PALACE_SPOTS, type Pin, pinFor, type Spot } from '../content/world-map';
import type { Rest } from '../game/ports';
import type { MapId } from '../shared/ids';
import { h, trapFocus } from './dom';
import { ICON_CLOSE } from './learning/icons';
import type { OverlayDeps } from './overlay';
import { GLYPHS, islandArt } from './world-map-art';
import './world-map.css';

export interface WorldMapDeps extends OverlayDeps {
  /** Holds the world still while the map is open. */
  rest: Rest;
  /** The place the herd is in now, so the map can say so. */
  here: () => MapId;
  /** A place was picked. The map is already shut and the world awake. */
  go: (to: Spot['to']) => void;
  sounds: { open(): void; turn(): void };
}

const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7"/></svg>';

type View = 'island' | 'palace';

/**
 * The map of the island. Tapping a place takes the herd there at once, the way a door would, so a
 * child who wants to be on the beach does not have to walk there. The palace opens onto its own
 * page of rooms, each a button. On a phone held upright, where the picture would be too small to
 * read, the island is a grid of the same buttons.
 */
export class WorldMap {
  private root: HTMLElement | null = null;
  private view: View = 'island';
  private untrap: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private opener: HTMLElement | null = null;

  constructor(private readonly deps: WorldMapDeps) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** The page on show, for tests. */
  get page(): View | null {
    return this.root ? this.view : null;
  }

  /** Opens the map. `opener` is what gets focus back when it shuts, and is what has focus when left out. */
  open(opener?: HTMLElement): void {
    if (this.root) return;
    this.view = 'island';
    this.opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.root = h('div', {
      class: 'worldmap',
      'data-calm': String(this.deps.calm()),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Map of the island',
    });
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    // A tap on the dark round the map shuts it. A tap on the map itself never does.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
    this.render();
    this.deps.host.dataset.worldmap = 'true';
    this.deps.mount(this.root);
    this.untrap = trapFocus(this.root);
    this.unlisten = this.listen();
    this.deps.rest.freeze();
    this.deps.sounds.open();
    this.focusFirst();
  }

  close(): void {
    if (!this.root) return;
    this.unlisten?.();
    this.untrap?.();
    this.unlisten = null;
    this.untrap = null;
    this.root.remove();
    this.root = null;
    delete this.deps.host.dataset.worldmap;
    this.deps.rest.thaw();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  /** Goes to a place: the map shuts first, so the world is awake to be moved. */
  private pick(spot: Spot): void {
    this.close();
    this.deps.go(spot.to);
  }

  private show(view: View): void {
    if (!this.root || this.view === view) return;
    this.view = view;
    this.deps.sounds.turn();
    this.render();
    this.focusFirst();
  }

  private render(): void {
    if (!this.root) return;
    this.root.dataset.view = this.view;
    this.root.replaceChildren(this.view === 'island' ? this.island() : this.palace());
  }

  private focusFirst(): void {
    const first = this.root?.querySelector<HTMLElement>('[data-here="true"], .wm-spot, .wm-pin');
    first?.focus({ preventScroll: true });
  }

  private closeButton(): HTMLButtonElement {
    const shut = h('button', { type: 'button', class: 'wm-shut', 'aria-label': 'Close the map' });
    shut.innerHTML = ICON_CLOSE;
    shut.addEventListener('click', () => this.close());
    return shut;
  }

  private island(): HTMLElement {
    const here = pinFor(this.deps.here());
    const art = h('div', { class: 'wm-stage' });
    art.innerHTML = islandArt();
    for (const pin of ISLAND_PINS) art.append(this.pin(pin, pin.id === here));
    const list = h(
      'div',
      { class: 'wm-grid', role: 'group', 'aria-label': 'Places' },
      ...ISLAND_PINS.map((pin) => this.card(pin, pin.id === here)),
    );
    return h(
      'div',
      { class: 'wm-sheet' },
      h('h2', { class: 'wm-title' }, 'Where shall we go?'),
      this.closeButton(),
      art,
      list,
    );
  }

  private palace(): HTMLElement {
    const here = this.deps.here();
    const back = h('button', { type: 'button', class: 'wm-back', 'aria-label': 'Back to the island' });
    back.innerHTML = BACK_ICON;
    back.addEventListener('click', () => this.show('island'));
    return h(
      'div',
      { class: 'wm-sheet wm-sheet-palace' },
      h('h2', { class: 'wm-title' }, 'The palace'),
      back,
      this.closeButton(),
      h(
        'div',
        { class: 'wm-rooms', role: 'group', 'aria-label': 'Rooms of the palace' },
        ...PALACE_SPOTS.map((spot) => this.card(spot, spot.to.mapId === here)),
      ),
    );
  }

  /** A place on the picture, which is a round button with its name under it. */
  private pin(pin: Pin, here: boolean): HTMLButtonElement {
    const disc = h('span', { class: 'wm-disc', 'aria-hidden': 'true' });
    disc.innerHTML = GLYPHS[pin.glyph];
    const button = h(
      'button',
      {
        type: 'button',
        class: 'wm-pin',
        'data-spot': pin.id,
        'data-here': String(here),
        'aria-label': pin.opens ? `${pin.label}, its rooms` : pin.label,
        ...(here ? { 'aria-current': 'location' } : {}),
        style: `left:${pin.at.x / 10}%;top:${pin.at.y / 10}%;--tint:${pin.tint}`,
      },
      disc,
      h('span', { class: 'wm-name' }, pin.label),
    );
    button.addEventListener('click', () => this.choose(pin));
    return button;
  }

  /** A place as a card, for the rooms of the palace and the island on a screen too narrow for the picture. */
  private card(spot: Spot | Pin, here: boolean): HTMLButtonElement {
    const disc = h('span', { class: 'wm-disc', 'aria-hidden': 'true' });
    disc.innerHTML = GLYPHS[spot.glyph];
    const opens = 'opens' in spot && spot.opens !== undefined;
    const button = h(
      'button',
      {
        type: 'button',
        class: 'wm-spot',
        'data-spot': spot.id,
        'data-here': String(here),
        'aria-label': opens ? `${spot.label}, its rooms` : spot.label,
        ...(here ? { 'aria-current': 'location' } : {}),
        style: `--tint:${spot.tint}`,
      },
      disc,
      h('span', { class: 'wm-name' }, spot.label),
    );
    button.addEventListener('click', () => this.choose(spot));
    return button;
  }

  private choose(spot: Spot | Pin): void {
    if ('opens' in spot && spot.opens === 'palace') this.show('palace');
    else this.pick(spot);
  }

  /** Escape goes back a page, and then shuts the map. */
  private listen(): () => void {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.view === 'palace') this.show('island');
      else this.close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }
}
