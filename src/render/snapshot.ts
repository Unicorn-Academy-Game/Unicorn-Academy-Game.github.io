import Phaser from 'phaser';
import { type Shot, squeeze } from './squeeze';

/** The longest side of a picture, in pixels. The screen is drawn smaller to fit. */
const SIDE = 720;
/**
 * How long to wait for the game to draw before giving up, in milliseconds. A phone that is busy
 * starting can take a second or more over one frame, and a tap that comes to nothing is worse than
 * a short wait. The camera asks twice, so the whole wait is twice this.
 */
const WAIT_MS = 2500;

/**
 * What the screen shows right now, as a small picture. Only what the game draws is in it: the
 * buttons and the words round the world are not, so a picture is the world and nothing else.
 *
 * The drawing is only there to be copied while the game is drawing, so the copy is made as soon as
 * the next frame is done. Answers null when the game does not draw within a moment, as when the
 * page is in the background, or the picture cannot be made.
 */
export function takeShot(game: Phaser.Game): Promise<Shot | null> {
  return new Promise((resolve) => {
    const giveUp = window.setTimeout(() => {
      game.events.off(Phaser.Core.Events.POST_RENDER, copy);
      resolve(null);
    }, WAIT_MS);
    function copy(): void {
      window.clearTimeout(giveUp);
      resolve(shotOf(game.canvas));
    }
    game.events.once(Phaser.Core.Events.POST_RENDER, copy);
  });
}

/** Draws a canvas smaller and squeezes it until it is small enough to keep. */
export function shotOf(canvas: HTMLCanvasElement): Shot | null {
  if (!(canvas.width > 0 && canvas.height > 0)) return null;
  const scale = Math.min(1, SIDE / Math.max(canvas.width, canvas.height));
  const w = Math.max(16, Math.round(canvas.width * scale));
  const h = Math.max(16, Math.round(canvas.height * scale));
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  const context = copy.getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, w, h);
  return squeeze(copy);
}
