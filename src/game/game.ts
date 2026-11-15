import Phaser from 'phaser';
import type { Profile } from '../render/profile';
import { backingSize, chooseView } from '../render/zoom';
import type { Viewport } from './controller';
import { faults } from './faults';

/**
 * The single scene. A map is not a scene: the controller swaps what the scene shows, so global
 * services and the render loop are created once for the whole session.
 */
class WorldScene extends Phaser.Scene {
  frame: ((dtMs: number, nowMs: number) => void) | null = null;

  constructor() {
    super('world');
  }

  override update(time: number, delta: number): void {
    try {
      this.frame?.(delta, time);
    } catch (error) {
      // The engine asks for the next frame only once this one has returned, so a failure must not
      // leave it.
      faults.report('frame', error);
    }
  }
}

export interface Stage {
  game: Phaser.Game;
  scene: WorldScene;
  viewport(): Viewport;
  /**
   * Calls back with the new viewport whenever the container changes size or the pixel ratio
   * changes, or the zoom is set.
   */
  onResize(listener: (viewport: Viewport) => void): void;
  /**
   * How much closer (above 1) or farther (below 1) than the game's own choice the world is drawn.
   */
  setCloseness(closeness: number): void;
  /** Releases the observers. The game itself is destroyed by the caller. */
  dispose(): void;
}

const measure = (el: HTMLElement): { w: number; h: number } => {
  const r = el.getBoundingClientRect();
  return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
};

const BACKGROUND = '#0e1c16';

export function createStage(container: HTMLElement, profile: Profile): Promise<Stage> {
  const css = measure(container);
  let closeness = 1;
  const ratio = (): number => Math.min(window.devicePixelRatio, profile.maxDpr);
  let view = chooseView(css.w, css.h, ratio(), closeness);
  let size = backingSize(css.w, css.h, view.dpr);
  let viewport: Viewport = { cssWidth: css.w, cssHeight: css.h, dpr: view.dpr, zoom: view.zoom };
  const scene = new WorldScene();

  return new Promise((resolve, reject) => {
    let game: Phaser.Game;
    try {
      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: container,
        width: size.w,
        height: size.h,
        backgroundColor: BACKGROUND,
        scene,
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / view.dpr },
        // With smoothing on the engine turns multisampling on whatever is asked, so it is only
        // asked for where smoothing is off.
        render: {
          smoothPixelArt: profile.smoothing,
          antialiasGL: profile.multisample,
          powerPreference: 'high-performance',
        },
        input: { activePointers: 3, touch: { capture: true } },
        disableContextMenu: true,
        banner: false,
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const listeners: ((v: Viewport) => void)[] = [];
    const apply = (): void => {
      const m = measure(container);
      const next = chooseView(m.w, m.h, ratio(), closeness);
      const nextSize = backingSize(m.w, m.h, next.dpr);
      const changed =
        nextSize.w !== size.w || nextSize.h !== size.h || next.dpr !== view.dpr || next.zoom !== view.zoom;
      if (!changed) return;
      view = next;
      size = nextSize;
      viewport = { cssWidth: m.w, cssHeight: m.h, dpr: next.dpr, zoom: next.zoom };
      // The canvas is resized first. Zoom is what writes the canvas's CSS size, and at a pixel
      // ratio of 1 a resize alone leaves the CSS size as it was, so the page would show the
      // previous window's size until the next resize.
      game.scale.resize(nextSize.w, nextSize.h);
      game.scale.setZoom(1 / next.dpr);
      for (const l of listeners) l(viewport);
    };
    const observer = new ResizeObserver(apply);
    observer.observe(container);
    // A turn of the phone is announced before the window has its new shape, and a page that is slow
    // can measure the container in between. The observer is not told again of a size it was told
    // of, so the window's own resize, which comes after, measures once more.
    window.addEventListener('orientationchange', apply);
    window.addEventListener('resize', apply);
    window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', apply, { once: true });

    game.events.once(Phaser.Core.Events.READY, () => {
      scene.cameras.main.setBackgroundColor(BACKGROUND);
      resolve({
        game,
        scene,
        viewport: () => viewport,
        onResize: (l) => void listeners.push(l),
        setCloseness: (c) => {
          if (c === closeness) return;
          closeness = c;
          apply();
        },
        dispose: () => {
          observer.disconnect();
          window.removeEventListener('orientationchange', apply);
          window.removeEventListener('resize', apply);
        },
      });
    });
  });
}
