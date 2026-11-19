import { isCinema, isFree, isQuiet, labelOf, type ScreenId } from '../content/wonders';
import { Rng } from '../domain/rng';
import type { UnicornId } from '../shared/ids';
import { clamp } from '../shared/math';
import type { SpriteBank } from '../wonder/engine/bank';
import { STARS } from '../wonder/engine/meter';
import { type Quality, Stage } from '../wonder/engine/stage';
import { createWonder } from '../wonder/registry';
import { SILENT, type WonderSound } from '../wonder/sound';
import type { WonderHandle, WonderPhase } from '../wonder/wonder';
import { deviceCalm, h, trapFocus } from './dom';
import type { OverlayDeps } from './overlay';

export interface WonderDeps extends OverlayDeps {
  /** The pictures the world has loaded, cut up for the games. */
  bank: () => SpriteBank | null;
  sound: () => WonderSound;
  /**
   * The quality each game starts at, which the device's profile sets. A slow tablet starts at the
   * lowest.
   */
  quality: Quality;
  /** The friends the player has found, Wildstar first. */
  herd: () => readonly UnicornId[];
  /** A fresh seed for each game, so no two rounds are the same. */
  seed: () => number;
  /**
   * The screen is being taken: whatever was leading the player must let go and the world stops
   * listening.
   */
  onOpen: (game: ScreenId) => void;
  /** The game fills the screen, so the world behind it can rest. */
  onShown: () => void;
  /**
   * The screen is about to be given back, so the world can wake and be there when the picture
   * opens.
   */
  onClosing: () => void;
  /** The game is gone: the world listens again. */
  onClose: (closed: WonderClosed) => void;
}

/**
 * Which game was closed, and whether the player had seen it through to its finale. A game that
 * never started is none.
 */
interface WonderClosed {
  game: ScreenId | null;
  finished: boolean;
}

/** The toy a game opens from. */
export interface WonderSite {
  game: ScreenId;
  look?: string | undefined;
  /** The middle of the toy on the screen, in CSS pixels. The picture opens from here. */
  at: { x: number; y: number };
}

/** How long the picture takes to open or to close over the world. */
const IRIS_MS = 640;
const FADE_MS = 240;
/** How long a star takes to fly to the meter. */
const FLIGHT_MS = 900;
/** Stars that are earned together fly one after the other. */
const FLIGHT_GAP_MS = 190;
/**
 * An opening or closing that has not ended this long after it should have is ended by hand, so the
 * screen can never be stuck.
 */
const SLACK_MS = 500;
/**
 * How long a scene that is only watched stays on its last picture before it gives the screen back.
 */
const CINEMA_HOLD_MS = 700;

const STAR_PATH = 'M12 2.3l2.85 6.05 6.6.85-4.85 4.55 1.25 6.55L12 17.1l-5.85 3.2 1.25-6.55L2.55 9.2l6.6-.85z';
const star = (): string => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/><path d="M23 4v6h-6"/></svg>';
const ICON_DONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.8l5 5L19.5 7"/></svg>';

type Where = 'opening' | 'open' | 'closing';

/** What a screen reader hears of the meter. */
const starsLabel = (stars: number): string => `${stars} of ${STARS} stars`;

/**
 * Whether the browser can animate the ring's radius. Without it the picture still opens, just
 * without the ring.
 */
const canAnimateRing = (): boolean => typeof CSS !== 'undefined' && 'registerProperty' in CSS;

/**
 * The screen around a playground game: the picture that opens from the toy like an iris, the five
 * stars along the top that fill as the player plays, a way out that is never far, and after the
 * finale a button to play again and a button to be done. There is no word on it anywhere. The game
 * itself is drawn by its own stage, and this does nothing but hold it, tell it how they are and
 * hand the screen back.
 */
export class WonderOverlay {
  private node: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private stageEl!: HTMLElement;
  private meterEl!: HTMLElement;
  private slots: HTMLElement[] = [];
  private finish!: HTMLElement;
  private stage: Stage | null = null;
  private wonder: WonderHandle | null = null;
  private where: Where = 'closing';
  private site: WonderSite | null = null;
  private frame = 0;
  private lit = 0;
  private flying = 0;
  private slept = false;
  private wantClose = false;
  /**
   * The finale has begun at least once since the game opened, even if the player has started it
   * over since.
   */
  private seenThrough = false;
  private cleanups: (() => void)[] = [];
  private animations = new Set<Animation>();
  private timers = new Set<number>();

  constructor(private readonly deps: WonderDeps) {}

  /**
   * The sound of the screen around the game: the opening, the stars, the closing. A game that is to
   * be heard on its own has none.
   */
  private chrome(): WonderSound {
    return this.site && isQuiet(this.site.game) ? SILENT : this.deps.sound();
  }

  get isOpen(): boolean {
    return this.node !== null;
  }

  /** What is going on, for tests. */
  get state(): {
    open: boolean;
    where: Where;
    game: ScreenId | null;
    phase: WonderPhase | null;
    stars: number;
    lit: number;
    flying: number;
    slept: boolean;
  } {
    return {
      open: this.node !== null,
      where: this.where,
      game: this.site?.game ?? null,
      phase: this.wonder?.phase ?? null,
      stars: this.wonder?.stars ?? 0,
      lit: this.lit,
      flying: this.flying,
      slept: this.slept,
    };
  }

  /** The game and its stage, for tests and for looking at the game. */
  get inside(): { stage: Stage; wonder: WonderHandle } | null {
    return this.stage && this.wonder ? { stage: this.stage, wonder: this.wonder } : null;
  }

  open(site: WonderSite): void {
    if (this.node) return;
    this.site = site;
    this.where = 'opening';
    this.wantClose = false;
    this.seenThrough = false;
    this.slept = false;
    this.lit = 0;
    this.flying = 0;
    this.build(site.game);
    const node = this.node!;
    this.deps.host.dataset.wonder = 'true';
    this.deps.mount(node);
    this.deps.onOpen(site.game);

    const calm = this.deps.calm();
    const sound = this.deps.sound();
    node.dataset.calm = String(calm);
    try {
      const rect = node.getBoundingClientRect();
      this.stage = new Stage({ host: this.stageEl, calm, quality: this.deps.quality });
      this.wonder = createWonder(site.game, {
        bank: this.deps.bank(),
        rng: new Rng(this.deps.seed()),
        calm,
        look: site.look ?? 'default',
        herd: this.deps.herd(),
        sound,
        from: {
          x: clamp(site.at.x / Math.max(1, rect.width), 0, 1),
          y: clamp(site.at.y / Math.max(1, rect.height), 0, 1),
        },
        onStar: (stars) => this.starEarned(stars),
        onFinale: () => this.phaseChanged('finale'),
        onAfter: () => this.phaseChanged('after'),
      });
      this.stage.play(this.wonder);
      this.stage.start();
      // A scene that is watched has nothing to wait for, so it begins as the picture opens and is
      // already moving when it is whole.
      if (isCinema(site.game)) this.wonder.celebrate();
    } catch (error) {
      // A game that cannot start must never leave the player looking at a blank screen with the
      // world shut out.
      console.error(error);
      this.gone();
      return;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', onKey);
    this.cleanups.push(() => document.removeEventListener('keydown', onKey), trapFocus(node));
    this.frame = requestAnimationFrame(() => this.watch());

    this.chrome().fx('whoosh', { gain: 0.8 });
    this.iris(true, () => {
      this.where = 'open';
      this.deps.onShown();
      this.slept = true;
      if (this.wantClose) this.close();
    });
  }

  /**
   * Gives the screen back. A game that is still opening is let finish first, so the picture never
   * jumps.
   */
  close(): void {
    if (!this.node) return;
    if (this.where === 'opening') {
      this.wantClose = true;
      return;
    }
    if (this.where === 'closing') return;
    this.where = 'closing';
    this.deps.onClosing();
    this.slept = false;
    this.chrome().fx('poof', { gain: 0.6 });
    this.iris(false, () => this.gone());
  }

  /** Starts the game over from its first moment, as the button after the finale does. */
  again(): void {
    if (!this.wonder || !this.node || this.where !== 'open') return;
    this.wonder.restart();
    this.lit = 0;
    this.flying = 0;
    this.node.dataset.phase = 'play';
    this.finish.hidden = true;
    for (const slot of this.slots) this.setStar(slot, 0);
    this.writeLabel(0);
  }

  private build(game: ScreenId): void {
    this.stageEl = h('div', { class: 'wonder-stage' });
    this.slots = [];
    this.meterEl = h('div', {
      class: 'wonder-stars',
      role: 'img',
      'aria-label': starsLabel(0),
      'data-content-id': 'wonder.stars',
    });
    for (let i = 0; i < STARS; i++) {
      const slot = h('span', { class: 'wonder-star', 'data-on': 'false' });
      slot.innerHTML = `${star()}<span class="lit">${star()}</span>`;
      this.slots.push(slot);
      this.meterEl.append(slot);
    }
    const done = h('button', {
      type: 'button',
      class: 'round wonder-done',
      'aria-label': 'Done',
      'data-content-id': 'wonder.done',
      onclick: () => this.close(),
    });
    done.innerHTML = ICON_X;

    const again = h('button', {
      type: 'button',
      class: 'wonder-btn again',
      'aria-label': 'Play again',
      'data-content-id': 'wonder.again',
      onclick: () => this.again(),
    });
    again.innerHTML = ICON_AGAIN;
    const finished = h('button', {
      type: 'button',
      class: 'wonder-btn finished',
      'aria-label': 'All done',
      'data-content-id': 'wonder.finished',
      onclick: () => this.close(),
    });
    finished.innerHTML = ICON_DONE;
    this.finish = h('div', { class: 'wonder-finish', role: 'group', 'aria-label': 'What next' }, again, finished);
    this.finish.hidden = true;
    // A scene that is only watched has no stars to show and no round to play again: it ends by
    // itself, and the way out is always there. A game with nothing to earn has no stars to show
    // either.
    if (isCinema(game) || isFree(game)) this.meterEl.hidden = true;

    this.node = h(
      'div',
      {
        class: 'wonder',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': labelOf(game),
        'data-game': game,
        'data-phase': 'play',
        'data-where': 'opening',
        'data-cinema': String(isCinema(game)),
      },
      this.stageEl,
      this.meterEl,
      done,
      this.finish,
    );
  }

  private starEarned(stars: number): void {
    this.writeLabel(stars);
    const slot = this.slots[stars - 1];
    if (!slot || !this.node) return;
    if (this.deps.calm()) {
      this.light(slot, stars);
      return;
    }
    const delay = this.flying * FLIGHT_GAP_MS;
    this.flying += 1;
    this.later(delay, () => this.fly(slot, stars));
  }

  private phaseChanged(phase: WonderPhase): void {
    if (!this.node) return;
    this.seenThrough = true;
    this.node.dataset.phase = phase;
    const watched = this.site !== null && isCinema(this.site.game);
    this.finish.hidden = watched || phase !== 'after';
    if (watched) {
      // The last picture is held for a beat and then the player is given the screen back, with no
      // button to find.
      if (phase === 'after') this.later(CINEMA_HOLD_MS, () => this.close());
      return;
    }
    if (phase === 'after') this.chrome().fx('twinkle', { gain: 0.5 });
  }

  /** A big star appears where the player is looking, turns, and flies to its place in the meter. */
  private fly(slot: HTMLElement, stars: number): void {
    const node = this.node;
    if (!node || this.where === 'closing') {
      this.flying = Math.max(0, this.flying - 1);
      return;
    }
    const box = node.getBoundingClientRect();
    const to = slot.getBoundingClientRect();
    const big = stars === STARS;
    const size = big ? 150 : 100;
    const flyer = h('span', { class: 'wonder-flyer', 'aria-hidden': 'true', 'data-big': String(big) });
    flyer.innerHTML = star();
    flyer.style.width = `${size}px`;
    flyer.style.height = `${size}px`;
    node.append(flyer);
    const ox = box.width / 2;
    const oy = box.height * 0.42;
    const tx = to.left + to.width / 2 - box.left;
    const ty = to.top + to.height / 2 - box.top;
    const at = (x: number, y: number, scale: number, turn: number): string =>
      `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale}) rotate(${turn}deg)`;
    const small = to.width / size;
    const flight = this.animate(
      flyer,
      [
        { transform: at(ox, oy, 0.1, -40), opacity: 0, offset: 0 },
        { transform: at(ox, oy, 1.15, 8), opacity: 1, offset: 0.26, easing: 'ease-in-out' },
        { transform: at(ox, oy, 1, 0), opacity: 1, offset: 0.46, easing: 'cubic-bezier(0.5, 0, 0.9, 0.4)' },
        { transform: at(tx, ty, small, 360), opacity: 1, offset: 1 },
      ],
      FLIGHT_MS,
    );
    this.chrome().fx('swell', { gain: 0.35, size: big ? 1 : 0.5 });
    let landed = false;
    const land = (): void => {
      if (landed) return;
      landed = true;
      flyer.remove();
      this.flying = Math.max(0, this.flying - 1);
      this.light(slot, stars);
    };
    if (flight) flight.finished.then(land, () => undefined);
    this.later(FLIGHT_MS + SLACK_MS, land);
  }

  /** The star in the meter is on, with a pop and a little ring. */
  private light(slot: HTMLElement, stars: number): void {
    if (!this.node) return;
    this.lit = Math.max(this.lit, stars);
    this.setStar(slot, 1);
    slot.dataset.pop = 'false';
    void slot.offsetWidth;
    slot.dataset.pop = 'true';
    if (!this.deps.calm()) {
      const ring = h('i', { class: 'wonder-ring', 'aria-hidden': 'true' });
      slot.append(ring);
      this.later(700, () => ring.remove());
    }
    this.chrome().fx('ding', { gain: 0.5, step: stars - 1 });
  }

  private setStar(slot: HTMLElement, fill: number): void {
    slot.dataset.on = String(fill >= 1);
    slot.style.setProperty('--fill', fill.toFixed(2));
    if (fill < 1) delete slot.dataset.pop;
  }

  private writeLabel(stars: number): void {
    this.meterEl.setAttribute('aria-label', starsLabel(stars));
  }

  /**
   * The star the player is working toward fills a little with every bit of play, so they can see
   * that it all counts.
   */
  private watch(): void {
    if (!this.node) return;
    this.frame = requestAnimationFrame(() => this.watch());
    const wonder = this.wonder;
    const next = this.slots[this.lit];
    // A star that is earned but still flying in is not yet lit, and the one after it waits.
    if (!wonder || !next || wonder.phase !== 'play' || this.flying > 0 || wonder.stars > this.lit) return;
    const wanted = (Math.round(wonder.progress * 50) / 50).toFixed(2);
    if (next.style.getPropertyValue('--fill') !== wanted) next.style.setProperty('--fill', wanted);
  }

  /**
   * Opens the picture from the toy, or closes it back onto the toy. A bright ring runs along the
   * edge. With calm effects or reduced motion it is a plain fade instead.
   */
  private iris(opening: boolean, then: () => void): void {
    const node = this.node;
    const site = this.site;
    if (!node || !site) return;
    node.dataset.where = opening ? 'opening' : 'closing';
    const box = node.getBoundingClientRect();
    const x = clamp(site.at.x, 0, box.width);
    const y = clamp(site.at.y, 0, box.height);
    const reach = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y)) + 8;
    const calm = this.deps.calm() || deviceCalm();
    const used: Animation[] = [];
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      for (const animation of used) animation.cancel();
      node.style.clipPath = '';
      node.style.opacity = '';
      this.ring?.remove();
      this.ring = null;
      node.dataset.where = opening ? 'open' : 'closed';
      then();
    };
    const run = (el: HTMLElement, keyframes: Keyframe[], duration: number, easing: string): Animation | null => {
      const animation = this.animate(el, keyframes, duration, easing);
      if (animation) used.push(animation);
      return animation;
    };

    if (calm) {
      const fade = run(
        node,
        opening ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        FADE_MS,
        'linear',
      );
      if (fade) fade.finished.then(end, () => undefined);
      this.later(FADE_MS + SLACK_MS, end);
      return;
    }

    const from = opening ? 0 : reach;
    const to = opening ? reach : 0;
    const easing = opening ? 'cubic-bezier(0.22, 0.7, 0.2, 1)' : 'cubic-bezier(0.6, 0, 0.7, 0.3)';
    node.style.clipPath = `circle(${from}px at ${x}px ${y}px)`;
    const cut = run(
      node,
      [{ clipPath: `circle(${from}px at ${x}px ${y}px)` }, { clipPath: `circle(${to}px at ${x}px ${y}px)` }],
      IRIS_MS,
      easing,
    );
    if (canAnimateRing()) {
      const ring = h('i', { class: 'wonder-iris', 'aria-hidden': 'true' });
      ring.style.setProperty('--x', `${x}px`);
      ring.style.setProperty('--y', `${y}px`);
      this.ring = ring;
      this.deps.host.append(ring);
      run(
        ring,
        [
          { '--iris': `${from}px`, opacity: 1 },
          { '--iris': `${to}px`, opacity: opening ? 0.85 : 1 },
        ],
        IRIS_MS,
        easing,
      );
    }
    // Held at its last frame until the end, so the picture never flashes whole before it goes.
    if (cut) cut.finished.then(end, () => undefined);
    this.later(IRIS_MS + SLACK_MS, end);
  }

  private animate(el: HTMLElement, keyframes: Keyframe[], duration: number, easing = 'linear'): Animation | null {
    if (typeof el.animate !== 'function') return null;
    const animation = el.animate(keyframes, { duration, easing, fill: 'both' });
    this.animations.add(animation);
    const forget = (): void => void this.animations.delete(animation);
    animation.finished.then(forget, forget);
    return animation;
  }

  private later(ms: number, run: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      run();
    }, ms);
    this.timers.add(id);
  }

  private gone(): void {
    const closed: WonderClosed = { game: this.site?.game ?? null, finished: this.seenThrough };
    cancelAnimationFrame(this.frame);
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    for (const undo of this.cleanups) undo();
    this.cleanups = [];
    this.wonder?.dispose();
    this.stage?.dispose();
    this.ring?.remove();
    this.ring = null;
    this.node?.remove();
    this.node = null;
    this.wonder = null;
    this.stage = null;
    this.site = null;
    this.slots = [];
    this.flying = 0;
    this.lit = 0;
    this.where = 'closing';
    delete this.deps.host.dataset.wonder;
    this.deps.onClose(closed);
  }
}
