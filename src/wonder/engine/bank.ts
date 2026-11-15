import { frameAt, resolveClip } from '../../render/clips';
import { pageTexture, unicornTexture } from '../../render/keys';
import { facingOfCardinal } from '../../shared/compass';
import type { Facing, UnicornId } from '../../shared/ids';
import type { Manifest } from '../../shared/manifest';
import { css, type RGB } from './color';

/**
 * One picture cut from an atlas, with the point it is anchored by. Everything is in source pixels.
 */
export interface Pic {
  readonly image: CanvasImageSource;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  /**
   * The anchor (a unicorn's hooves, a prop's base) measured from the top left of the cut rectangle.
   */
  readonly ax: number;
  readonly ay: number;
}

/**
 * A unicorn's picture and where her horn, muzzle and back are, measured from her anchor in source
 * pixels.
 */
export interface UnicornFrame {
  readonly pic: Pic;
  readonly anchors: Readonly<Record<string, readonly [number, number]>>;
}

export interface DrawOptions {
  /** Size multiplier. */
  scale?: number;
  /** Stretch along each axis on top of `scale`, for squash and stretch. */
  sx?: number;
  sy?: number;
  /** Turns about the anchor, in radians. */
  rot?: number;
  flip?: boolean;
  alpha?: number;
  /**
   * (x, y) is the middle of the picture, and it turns and stretches about its middle, instead of
   * about its anchor.
   */
  mid?: boolean;
}

/** Draws a picture with its anchor at (x, y), or its middle there if `mid` is set. */
export function drawPic(ctx: CanvasRenderingContext2D, pic: Pic, x: number, y: number, o: DrawOptions = {}): void {
  const scale = o.scale ?? 1;
  const sx = scale * (o.sx ?? 1) * (o.flip ? -1 : 1);
  const sy = scale * (o.sy ?? 1);
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.003) return;
  const plain = !o.rot && sx > 0 && sy > 0;
  const ax = o.mid ? pic.sw / 2 : pic.ax;
  const ay = o.mid ? pic.sh / 2 : pic.ay;
  const before = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = before * alpha;
  if (plain && sx === sy) {
    ctx.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, x - ax * sx, y - ay * sy, pic.sw * sx, pic.sh * sy);
  } else {
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(sx, sy);
    ctx.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, -ax, -ay, pic.sw, pic.sh);
    ctx.restore();
  }
  ctx.globalAlpha = before;
}

/**
 * Cuts the pictures the world already loaded into shapes the games can draw: a unicorn at any
 * moment of any clip, and any sprite of any bundle that is up. The games therefore look like the
 * world, and nothing is downloaded twice.
 */
export class SpriteBank {
  private readonly variants = new WeakMap<object, Map<string, Pic>>();

  constructor(
    private readonly manifest: Manifest,
    /** The loaded image for a texture key, or nothing if that texture is not up. */
    private readonly source: (texture: string) => CanvasImageSource | undefined,
  ) {}

  hasSprite(bundleId: string, name: string): boolean {
    const bundle = this.manifest.bundles[bundleId];
    const sprite = bundle?.sprites[name];
    return !!sprite && this.source(pageTexture(bundleId, sprite.frames[0]!.page)) !== undefined;
  }

  /** A sprite of a bundle `seconds` into its animation, or nothing if its page is not loaded. */
  sprite(bundleId: string, name: string, seconds = 0): Pic | null {
    const sprite = this.manifest.bundles[bundleId]?.sprites[name];
    if (!sprite) return null;
    const ms = seconds * 1000;
    let index = 0;
    if (sprite.frames.length > 1) {
      const total = sprite.frames.reduce((sum, f) => sum + f.ms, 0);
      let t = sprite.loop ? ((ms % total) + total) % total : Math.min(Math.max(0, ms), total - 1);
      index = sprite.frames.length - 1;
      for (let i = 0; i < sprite.frames.length; i++) {
        t -= sprite.frames[i]!.ms;
        if (t < 0) {
          index = i;
          break;
        }
      }
    }
    return this.spriteFrame(bundleId, name, index);
  }

  spriteFrame(bundleId: string, name: string, index: number): Pic | null {
    const sprite = this.manifest.bundles[bundleId]?.sprites[name];
    if (!sprite) return null;
    const f = sprite.frames[((index % sprite.frames.length) + sprite.frames.length) % sprite.frames.length]!;
    const rect = this.manifest.bundles[bundleId]!.pages[f.page]!.rects[f.rect]!;
    const image = this.source(pageTexture(bundleId, f.page));
    if (!image) return null;
    return {
      image,
      sx: rect.x,
      sy: rect.y,
      sw: rect.w,
      sh: rect.h,
      ax: sprite.origin[0] - rect.ox,
      ay: sprite.origin[1] - rect.oy,
    };
  }

  frameCount(bundleId: string, name: string): number {
    return this.manifest.bundles[bundleId]?.sprites[name]?.frames.length ?? 0;
  }

  /** The unicorn's frame `seconds` into a clip, or nothing if her sheet is not loaded. */
  unicorn(id: UnicornId, clip: string, facing: Facing, seconds = 0): UnicornFrame | null {
    const asset = this.manifest.unicorns[id];
    const image = this.source(unicornTexture(id));
    if (!asset || !image) return null;
    const c = resolveClip(asset, clip, facingOfCardinal(facing));
    const frame = c.frames[frameAt(c, seconds * 1000)]!;
    const rect = asset.atlas.rects[frame.rect]!;
    const pic: Pic = {
      image,
      sx: rect.x,
      sy: rect.y,
      sw: rect.w,
      sh: rect.h,
      ax: asset.origin[0] - rect.ox,
      ay: asset.origin[1] - rect.oy,
    };
    const anchors: Record<string, readonly [number, number]> = {};
    for (const [name, p] of Object.entries(frame.anchors ?? {}))
      anchors[name] = [p[0] - asset.origin[0], p[1] - asset.origin[1]];
    return { pic, anchors };
  }

  /**
   * How far into a clip her magic leaves her, in seconds. A clip with no release moment releases at
   * its end.
   */
  releaseSeconds(id: UnicornId, clip: string, facing: Facing): number {
    const asset = this.manifest.unicorns[id];
    if (!asset) return 0;
    const c = resolveClip(asset, clip, facingOfCardinal(facing));
    const upTo = c.releaseFrame ?? c.frames.length - 1;
    return c.frames.slice(0, upTo).reduce((sum, f) => sum + f.ms, 0) / 1000;
  }

  /** How long one pass through a unicorn clip lasts, in seconds. */
  clipSeconds(id: UnicornId, clip: string, facing: Facing): number {
    const asset = this.manifest.unicorns[id];
    if (!asset) return 1;
    return resolveClip(asset, clip, facingOfCardinal(facing)).frames.reduce((sum, f) => sum + f.ms, 0) / 1000;
  }

  /**
   * A copy of a picture with something done to it, made once and kept. `paint` receives a canvas
   * the size of the cut rectangle that already holds the picture, and draws over it. This is how a
   * unicorn is put into the dark.
   */
  variant(pic: Pic, key: string, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): Pic {
    let byKey = this.variants.get(pic.image);
    if (!byKey) {
      byKey = new Map();
      this.variants.set(pic.image, byKey);
    }
    const id = `${pic.sx},${pic.sy},${pic.sw},${pic.sh},${key}`;
    const found = byKey.get(id);
    if (found) return found;
    const canvas = document.createElement('canvas');
    canvas.width = pic.sw;
    canvas.height = pic.sh;
    const g = canvas.getContext('2d')!;
    g.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, 0, 0, pic.sw, pic.sh);
    paint(g, pic.sw, pic.sh);
    const made: Pic = { image: canvas, sx: 0, sy: 0, sw: pic.sw, sh: pic.sh, ax: pic.ax, ay: pic.ay };
    byKey.set(id, made);
    return made;
  }

  /**
   * A copy darkened and coloured the way light of this colour would colour it: every pixel times
   * the colour. This is how a unicorn is put into the dark and keeps her own colours. The wash of
   * `tinted` is for a coat of colour on top instead.
   */
  shaded(pic: Pic, color: RGB): Pic {
    return this.variant(pic, `shade:${color.join('.')}`, (g, w, h) => {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = css(color);
      g.fillRect(0, 0, w, h);
      // Multiply paints over the empty parts too, so what the picture did not have is taken away
      // again.
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, 0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    });
  }

  /**
   * A copy washed with a colour over only the pixels the picture has: dusk, moonlight, a rim of
   * firelight.
   */
  tinted(pic: Pic, color: RGB, amount: number, mode: GlobalCompositeOperation = 'source-atop'): Pic {
    const q = Math.round(amount * 20);
    return this.variant(pic, `tint:${color.join('.')}:${q}:${mode}`, (g, w, h) => {
      g.globalCompositeOperation = mode;
      g.fillStyle = css(color, q / 20);
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    });
  }
}
