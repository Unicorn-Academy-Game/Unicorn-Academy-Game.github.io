import type { UnicornId } from '../../shared/ids';
import { drawPic, type SpriteBank } from './bank';

/** How far below the middle of a unicorn's body her hooves are, in the picture's own pixels. */
export const FEET = 44;

/** What a unicorn is doing, which says which of her pictures to draw. */
export type Mode =
  /** Running along a rainbow, her legs going as far as she goes. */
  | 'run'
  /** In the air, her legs stretched out. */
  | 'air'
  /** Standing in the water, breathing. */
  | 'idle'
  /** Standing in the water, her own special move. */
  | 'sign'
  /** Casting, for joy. */
  | 'cheer';

/** How one unicorn looks at one moment: where, how turned and squashed, and which picture. */
export interface Look {
  /** The middle of her body. */
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  mode: Mode;
  /** How far her legs have run, for `run`. */
  dist: number;
  /** Seconds into the clip, for the modes that play one. */
  clock: number;
}

export const newLook = (): Look => ({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, mode: 'run', dist: 0, clock: 0 });

/** How far a unicorn goes in one stride of her walk, in the picture's own pixels. */
export const STRIDE = 152;
/** The frame of her walk in which her legs are stretched out, held while she is in the air. */
const AIR_FRAME = 2;

/**
 * Draws one unicorn as she looks. She is turned about her hooves, which are `FEET` below the middle
 * of her body, so that her hooves stay on the rainbow when it tilts, and are above her when she is
 * upside down in the loop.
 */
export function drawRider(
  g: CanvasRenderingContext2D,
  bank: SpriteBank | null,
  id: UnicornId,
  look: Look,
  scale: number,
): void {
  if (!bank) return;
  const frame = (() => {
    switch (look.mode) {
      case 'run':
        return bank.unicorn(id, 'walk', 'east', (look.dist / (STRIDE * scale)) * bank.clipSeconds(id, 'walk', 'east'));
      case 'air':
        return bank.unicorn(id, 'walk', 'east', (AIR_FRAME + 0.5) * (bank.clipSeconds(id, 'walk', 'east') / 8));
      case 'idle':
        return bank.unicorn(id, 'idle', 'east', look.clock);
      case 'sign':
        return bank.unicorn(id, 'signature-idle', 'east', look.clock);
      case 'cheer':
        return bank.unicorn(id, 'cast', 'east', look.clock);
    }
  })();
  if (!frame) return;
  const sin = Math.sin(look.rot);
  const cos = Math.cos(look.rot);
  drawPic(g, frame.pic, look.x - sin * FEET, look.y + cos * FEET, { scale, sx: look.sx, sy: look.sy, rot: look.rot });
}

/** How long a unicorn's hop of joy takes, and how high it goes. */
export const HOP_SECONDS = 0.58;
const HOP_HEIGHT = 54;
/** How long she is squashed on landing. */
const SQUASH_SECONDS = 0.22;

/**
 * How a unicorn looks `since` seconds after she started a hop: how far off the ground, and how
 * stretched (above 0) or squashed (below it). She is longest and thinnest while she is going fast,
 * round at the top of it, and flat for a moment on landing.
 */
export function hopShape(
  since: number,
  out: { lift: number; stretch: number } = { lift: 0, stretch: 0 },
): { lift: number; stretch: number } {
  out.lift = 0;
  out.stretch = 0;
  if (since < 0) return out;
  if (since < HOP_SECONDS) {
    const u = since / HOP_SECONDS;
    out.lift = HOP_HEIGHT * (1 - (2 * u - 1) ** 2);
    out.stretch = 0.16 * Math.abs(1 - 2 * u) ** 1.5;
    // Down for an instant first, to jump from.
    if (u < 0.1) out.stretch = -0.12 * Math.sin((u / 0.1) * Math.PI);
  } else if (since < HOP_SECONDS + SQUASH_SECONDS) {
    out.stretch = -0.2 * Math.sin(((since - HOP_SECONDS) / SQUASH_SECONDS) * Math.PI);
  }
  return out;
}
