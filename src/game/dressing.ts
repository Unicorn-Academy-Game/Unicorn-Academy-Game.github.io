import type Phaser from 'phaser';
import { type Cell, dressCells, dressTiles, type Pixels } from '../render/season';
import type { SeasonId } from '../shared/seasons';

/** A picture on its way to being painted for a season, as the painter is given it. */
export interface Painting {
  /** The picture as it was drawn, which every season is made from. */
  readonly pristine: HTMLImageElement;
  /** The pictures on a page of scenery, or null for a sheet of ground. */
  readonly cells: readonly Cell[] | null;
  /** The canvas that a season was painted on before, to paint on again. */
  readonly canvas: HTMLCanvasElement | undefined;
}

/**
 * Paints a picture for a season on a canvas. It asks `still` between slices of work and gives up
 * with null when that says the season has moved on, so a switch made while one is under way does
 * not wait for the old one to finish.
 */
export type Paint = (picture: Painting, season: SeasonId, still: () => boolean) => Promise<HTMLCanvasElement | null>;

/**
 * The most pixels worked on before the browser gets a turn, so a change of season while the player
 * plays is a few small hitches and not one long one.
 */
const SLICE_PIXELS = 400_000;

/**
 * Groups the pictures on a page so that each group is about `budget` pixels, the last perhaps
 * fewer. A picture is never split.
 */
export function inSlices(cells: readonly Cell[], budget: number): Cell[][] {
  const slices: Cell[][] = [];
  let slice: Cell[] = [];
  let pixels = 0;
  for (const cell of cells) {
    slice.push(cell);
    pixels += cell.w * cell.h;
    if (pixels < budget) continue;
    slices.push(slice);
    slice = [];
    pixels = 0;
  }
  if (slice.length > 0) slices.push(slice);
  return slices;
}

const turn = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/**
 * The painter that the game uses: the picture is drawn on a canvas, recoloured in place and left
 * there.
 */
const paintOnCanvas: Paint = async ({ pristine, cells, canvas }, season, still) => {
  const { naturalWidth: width, naturalHeight: height } = pristine;
  const surface = canvas ?? document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const context = surface.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('a canvas could not be drawn on');
  context.drawImage(pristine, 0, 0);
  const image = context.getImageData(0, 0, width, height);
  const pixels: Pixels = { width, height, data: image.data };
  if (cells === null) dressTiles(pixels, season);
  else {
    for (const slice of inSlices(cells, SLICE_PIXELS)) {
      dressCells(pixels, slice, season);
      await turn();
      if (!still()) return null;
    }
  }
  context.putImageData(image, 0, 0);
  return surface;
};

/** One texture that is kept dressed. */
interface Piece {
  readonly pristine: HTMLImageElement;
  readonly cells: readonly Cell[] | null;
  /** The season the texture shows now. */
  shown: SeasonId;
  canvas: HTMLCanvasElement | undefined;
  /** The work that is queued on this texture, so two never paint on one canvas at once. */
  work: Promise<void>;
}

/**
 * The textures of the places that are out of doors, kept in the season that is showing. A texture
 * is kept from the moment its picture comes in. The picture as it was drawn is held, and a season
 * is painted from it onto a canvas that takes its place in the engine, so another season is painted
 * from the same picture and summer is the picture itself, with no canvas at all.
 */
export class Dressing {
  private season: SeasonId = 'summer';
  private readonly pieces = new Map<string, Piece>();

  constructor(
    private readonly textures: Pick<Phaser.Textures.TextureManager, 'exists' | 'get'>,
    private readonly paint: Paint = paintOnCanvas,
  ) {}

  /**
   * Starts keeping a texture that has just come in, from its picture as it is. A texture that is
   * kept already is left as it is.
   */
  keep(key: string, cells: readonly Cell[] | null): void {
    if (this.pieces.has(key)) return;
    const pristine = this.textures.get(key).source[0]?.image;
    if (!pristine) return;
    this.pieces.set(key, {
      pristine: pristine as HTMLImageElement,
      cells,
      shown: 'summer',
      canvas: undefined,
      work: Promise.resolve(),
    });
  }

  /**
   * Stops keeping a texture, which is going to be taken out of the engine. Whatever was being
   * painted for it is dropped.
   */
  forget(key: string): void {
    this.pieces.delete(key);
  }

  /**
   * Dresses the textures that were just kept, for the season that is showing. Resolves when they
   * are, and never fails.
   */
  dress(keys: readonly string[]): Promise<void> {
    return Promise.all(keys.map((key) => this.bring(key))).then(() => undefined);
  }

  /** From now on the season is this one, and every texture that is kept is painted for it. */
  setSeason(season: SeasonId): Promise<void> {
    this.season = season;
    return this.dress([...this.pieces.keys()]);
  }

  private bring(key: string): Promise<void> {
    const piece = this.pieces.get(key);
    if (!piece) return Promise.resolve();
    piece.work = piece.work.then(() => this.match(key, piece));
    return piece.work;
  }

  /**
   * Paints the piece for the season that is showing, and again for the next if it changes on the
   * way.
   */
  private async match(key: string, piece: Piece): Promise<void> {
    try {
      while (this.pieces.get(key) === piece && piece.shown !== this.season) {
        const season = this.season;
        if (season === 'summer') {
          this.sourceOf(key)?.updateSource(piece.pristine);
          piece.canvas = undefined;
          piece.shown = season;
          continue;
        }
        const painted = await this.paint(piece, season, () => this.season === season && this.pieces.get(key) === piece);
        if (!painted) continue;
        piece.canvas = painted;
        // The engine may have let the texture go while it was being painted.
        if (this.pieces.get(key) !== piece) return;
        this.sourceOf(key)?.updateSource(painted);
        piece.shown = season;
      }
    } catch (error) {
      // The picture stays as it was, which is the season before. A place without its snow is better
      // than one that does not open.
      console.error('a season could not be painted', key, error);
      piece.shown = this.season;
    }
  }

  private sourceOf(key: string): Phaser.Textures.TextureSource | undefined {
    return this.textures.exists(key) ? this.textures.get(key).source[0] : undefined;
  }
}
