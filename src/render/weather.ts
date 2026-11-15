import type Phaser from 'phaser';
import type { Fall } from '../content/seasons';
import { DEPTH } from './depth';
import { countFor, type Flake, feelOf, makeFlakes, type Placed, place, type View } from './weather-field';

/**
 * What a picture is drawn from: a row of letters for each row of pixels, a letter for each colour,
 * and a space for clear.
 */
interface Pixel {
  rows: readonly string[];
  colours: Readonly<Record<string, string>>;
}

const LEAF = (body: string, vein: string): Pixel => ({
  rows: [' bbb  ', 'bvvbb ', ' bbbbb', '  bb  '],
  colours: { b: body, v: vein },
});
const PETAL = (body: string, light: string): Pixel => ({
  rows: [' bb ', 'blbb', ' bb '],
  colours: { b: body, l: light },
});

/**
 * The pictures of each kind, a few shapes or colours so that no two neighbours look the same. They
 * are pixel art like everything else.
 */
const PICTURES: Readonly<Record<Fall, readonly Pixel[]>> = {
  snow: [
    { rows: ['ww', 'ww'], colours: { w: '#ffffff' } },
    { rows: [' s ', 'sws', ' s '], colours: { w: '#ffffff', s: '#e9f3ff' } },
    { rows: ['cwc', 'wWw', 'cwc'], colours: { W: '#ffffff', w: '#f3f9ff', c: '#cfe3ff' } },
    { rows: [' ww ', 'wWWw', 'wWWw', ' ww '], colours: { W: '#ffffff', w: '#dcecff' } },
  ],
  leaves: [
    LEAF('#d9482b', '#a82f1f'),
    LEAF('#ee8a2b', '#c2631a'),
    LEAF('#f0c23d', '#c99a22'),
    LEAF('#a8622e', '#7d4520'),
  ],
  petals: [PETAL('#ffb3d1', '#ffe0ec'), PETAL('#fff6fa', '#ffd2e4'), PETAL('#ff8fbd', '#ffc2da')],
};

/** Room round each picture in its frame, so smoothing never pulls in the colour of the next. */
const PAD = 2;

const weatherTexture = (fall: Fall): string => `weather:${fall}`;

/** The kind's pictures on one small sheet, once. The frames are named by their number. */
function makeSheet(scene: Phaser.Scene, fall: Fall): void {
  const key = weatherTexture(fall);
  if (scene.textures.exists(key)) return;
  const pictures = PICTURES[fall];
  const side = 2 * PAD + Math.max(...pictures.flatMap((p) => [p.rows.length, ...p.rows.map((r) => r.length)]));
  const texture = scene.textures.createCanvas(key, side * pictures.length, side);
  if (!texture) throw new Error(`could not make the ${fall} sheet`);
  const ctx = texture.getContext();
  pictures.forEach((picture, i) => {
    const left = i * side + PAD + Math.floor((side - 2 * PAD - Math.max(...picture.rows.map((r) => r.length))) / 2);
    const top = PAD + Math.floor((side - 2 * PAD - picture.rows.length) / 2);
    picture.rows.forEach((row, y) => {
      [...row].forEach((letter, x) => {
        const colour = picture.colours[letter];
        if (!colour) return;
        ctx.fillStyle = colour;
        ctx.fillRect(left + x, top + y, 1, 1);
      });
    });
    texture.add(String(i), 0, i * side, 0, side, side);
  });
  texture.refresh();
}

/**
 * Over everything that stands on the ground, and the effects, and not the way out arrows, which are
 * in the page.
 */
const DEPTH_OF_FALL = DEPTH.foreground + 20_000;

/**
 * What falls from the sky over an open place: snow, leaves or petals. A pool of pictures is moved
 * each frame by `weather-field`. There are as many in the air as the view calls for, fewer on a
 * device that is short of graphics, and none for a parent who has asked for calm.
 */
export class WeatherView {
  private fall: Fall | null = null;
  private flakes: readonly Flake[] = [];
  private images: Phaser.GameObjects.Image[] = [];
  private seconds = 0;
  private shown = 0;
  private calm = false;
  private readonly spot: Placed = { x: 0, y: 0, angle: 0, alpha: 0, variant: 0 };

  /** `quality` is the share of the usual number that is in the air, from 0 to 1. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly quality: number,
  ) {}

  /** What falls from now on, or nothing. */
  set(fall: Fall | null): void {
    if (fall === this.fall) return;
    this.clear();
    this.fall = fall;
    if (!fall) return;
    makeSheet(this.scene, fall);
    this.flakes = makeFlakes(fall, Math.round(feelOf(fall).most * this.quality));
    this.images = this.flakes.map((flake) =>
      this.scene.add.image(0, 0, weatherTexture(fall), String(flake.variant)).setDepth(DEPTH_OF_FALL).setVisible(false),
    );
    this.shown = 0;
  }

  /** A parent who wants calm has nothing fall. */
  setCalm(on: boolean): void {
    this.calm = on;
    if (on) this.limit(0);
  }

  /** Moves what falls over the world area the camera shows. */
  update(dtMs: number, view: View): void {
    const fall = this.fall;
    if (!fall || this.calm) return;
    this.seconds += Math.min(dtMs, 250) / 1000;
    const count = Math.min(this.flakes.length, countFor(fall, view, this.quality));
    for (let i = 0; i < count; i++) {
      place(this.flakes[i]!, fall, this.seconds, view, this.spot);
      this.images[i]!.setPosition(this.spot.x, this.spot.y)
        .setRotation(this.spot.angle)
        .setAlpha(this.spot.alpha)
        .setVisible(true);
    }
    this.limit(count);
  }

  /** How many are on screen now, for a test. */
  get visible(): number {
    return this.shown;
  }

  destroy(): void {
    this.clear();
  }

  /** Shows the first `count` and hides the rest. */
  private limit(count: number): void {
    for (let i = count; i < this.shown; i++) this.images[i]?.setVisible(false);
    this.shown = count;
  }

  private clear(): void {
    for (const image of this.images) image.destroy();
    this.images = [];
    this.flakes = [];
    this.shown = 0;
  }
}
