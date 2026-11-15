import { drawPic, type Pic, type SpriteBank } from '../../engine/bank';
import { lighten, type RGB } from '../../engine/color';
import { TAU, wrap } from '../../engine/ease';
import { gemImage } from '../../engine/gems';
import { glowAt } from '../../engine/paint';
import { pictureOf } from '../../engine/particles';
import { PRIZE, type Prize } from './kinds';
import { creatureSprite, flowerSprite, GEMS, isCreature } from './looks';

/**
 * What a prize looks like: the picture of it that floats inside a bubble, and the same picture when
 * it is let out. A prize that is a creature or a flower is the world's own picture of it, so it is
 * the very one that comes out of the bubble and lives in the garden. The others, a note, a star, a
 * heart, a gem, are drawn in code, in the colour of the prize.
 */

/**
 * How a creature looks when it floats in a bubble: the clip it is shown in and how big its biggest
 * frame is, which sets how big it is drawn.
 */
interface Pose {
  readonly clip: string;
  /** A single frame to hold still on, for a clip that is a movement, like a leap. */
  readonly still?: number;
  /** The longest side of the biggest frame, in the picture's pixels. */
  readonly widest: number;
  /** How much of its box it fills, because some are airy and some are solid. */
  readonly fill: number;
}

const POSES = {
  butterfly: { clip: 'flutter', widest: 48, fill: 1 },
  fish: { clip: 'leap', still: 1, widest: 47, fill: 1.05 },
  bird: { clip: 'fly', widest: 52, fill: 1 },
  ladybug: { clip: 'fly', widest: 31, fill: 0.78 },
  bee: { clip: 'fly', widest: 32, fill: 0.9 },
  snail: { clip: 'crawl', widest: 45, fill: 1 },
  fairy: { clip: 'fly', widest: 104, fill: 1.12 },
} as const satisfies Record<string, Pose>;

/**
 * The sprite of a prize that is a picture from the world, and how big to draw it, or nothing for
 * the ones drawn in code.
 */
function spriteOf(
  prize: Prize,
  look: number,
): {
  readonly bundle: string;
  readonly name: string;
  readonly still?: number;
  readonly widest: number;
  readonly fill: number;
} | null {
  if (isCreature(prize))
    return { bundle: 'life', name: creatureSprite(prize, look, POSES[prize].clip), ...POSES[prize] };
  if (prize === 'flower') return { bundle: 'playground', name: flowerSprite(look), widest: 65, fill: 1 };
  if (prize === 'rainbow') return { bundle: 'fx', name: 'fx-rainbow', widest: 192, fill: 1.5 };
  return null;
}

/**
 * Where each of the prizes in a bubble sits, from its middle as shares of the bubble's radius, and
 * how much room each has, also as a share of it.
 */
export function spotsOf(n: number): readonly (readonly [number, number, number])[] {
  if (n <= 1) return [[0, 0, 0.62]];
  if (n === 2)
    return [
      [-0.38, 0.05, 0.43],
      [0.38, -0.05, 0.43],
    ];
  return [
    [0, -0.4, 0.38],
    [-0.42, 0.28, 0.38],
    [0.42, 0.28, 0.38],
  ];
}

export interface Seen {
  /** Where the middle of it is, and the radius of the room it has, in units. */
  readonly x: number;
  readonly y: number;
  readonly fit: number;
  /** The seconds its animation has run. */
  readonly t: number;
  /** Which of its looks, and which way it faces. */
  readonly look: number;
  readonly flip?: boolean;
  /** A turn about its middle, in radians, and a stretch (1 is none) for a squash on landing. */
  readonly turn?: number;
  readonly squash?: number;
  readonly alpha?: number;
}

/** The picture of this prize in this look `seconds` into its animation, if its page is loaded. */
function pictureFor(bank: SpriteBank | null, prize: Prize, look: number, seconds: number): Pic | null {
  const s = spriteOf(prize, look);
  if (!bank || !s) return null;
  return s.still === undefined ? bank.sprite(s.bundle, s.name, seconds) : bank.spriteFrame(s.bundle, s.name, s.still);
}

/**
 * The picture of a prize that is a picture from the world, and how wide it is drawn, in units, when
 * it has room for a circle of radius `fit`.
 */
export function pictureSized(
  bank: SpriteBank | null,
  prize: Prize,
  look: number,
  fit: number,
): { readonly pic: Pic; readonly size: number } | null {
  const s = spriteOf(prize, look);
  const pic = bank && s ? pictureFor(bank, prize, look, 0) : null;
  if (!s || !pic) return null;
  return { pic, size: pic.sw * ((fit * 2) / s.widest) * s.fill };
}

/** Draws a prize. The glow behind it is on the light, so it lights the bubble from inside. */
export function paintPrize(
  g: CanvasRenderingContext2D,
  light: CanvasRenderingContext2D,
  bank: SpriteBank | null,
  prize: Prize,
  s: Seen,
  glow = 1,
): void {
  const def = PRIZE[prize];
  const turn = s.turn ?? 0;
  const squash = s.squash ?? 1;
  const alpha = s.alpha ?? 1;
  if (glow > 0.01) glowAt(light, s.x, s.y, s.fit * 3.1, def.color, 0.34 * glow * alpha);
  const sprite = spriteOf(prize, s.look);
  if (sprite) {
    const pic = pictureFor(bank, prize, s.look, s.t);
    if (!pic) return;
    const scale = ((s.fit * 2) / sprite.widest) * sprite.fill;
    drawPic(g, pic, s.x, s.y, {
      mid: true,
      scale,
      rot: turn,
      flip: s.flip ?? false,
      sx: 1 + (1 - squash) * 0.5,
      sy: squash,
      alpha,
    });
    return;
  }
  const side = s.fit * 2;
  const before = g.globalAlpha;
  g.globalAlpha = before * alpha;
  g.save();
  g.translate(s.x, s.y);
  if (turn) g.rotate(turn);
  g.scale(1 + (1 - squash) * 0.5, squash);
  if (prize === 'gem') {
    const img = gemImage(GEMS[wrap(s.look, GEMS.length)]!);
    g.drawImage(img, -side * 0.5, -side * 0.5, side, side);
  } else {
    const color = def.color;
    const img = pictureOf(
      prize === 'star' ? 'star5' : prize === 'heart' ? 'heart' : 'note',
      color[0],
      color[1],
      color[2],
    );
    if (img) g.drawImage(img, -side * 0.55, -side * 0.55, side * 1.1, side * 1.1);
  }
  g.restore();
  g.globalAlpha = before;
}

/**
 * A ring of little lights that turns round a prize that is a rare one, so it can be told from the
 * others at a glance.
 */
export function paintSparkleRing(
  light: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  color: RGB,
): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = t * 1.7 + (i / n) * TAU;
    const pulse = 0.55 + 0.45 * Math.sin(t * 5 + i * 1.9);
    glowAt(
      light,
      x + Math.cos(a) * r,
      y + Math.sin(a) * r * 0.92,
      9 + 5 * pulse,
      lighten(color, 0.55),
      0.8 * pulse,
      'spark',
    );
  }
}
