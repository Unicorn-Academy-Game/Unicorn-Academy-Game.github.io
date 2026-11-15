import { z } from 'zod';
import { LogicMap } from './map';

/**
 * A compiled map: the logic the simulation reads, plus what the renderer draws. `tools/maps`
 * produces it from Tiled data, the game loads it, and neither side reads Tiled's format at runtime.
 */

/**
 * Draw layers, back to front. Objects on `object-bases` sort by their ground y among characters.
 */
export const DECOR_LAYERS = ['backdrop', 'ground-detail', 'object-bases', 'foreground'] as const;

export const Decor = z.object({
  layer: z.enum(DECOR_LAYERS),
  /** Sprite id in the map's bundle. */
  sprite: z.string().min(1),
  /** Ground anchor in world units. */
  x: z.number(),
  y: z.number(),
  /** Added to the ground y for sorting, to put a piece in front of or behind its neighbors. */
  depthBias: z.number().optional(),
});
export type Decor = z.infer<typeof Decor>;

/**
 * Something worth looking up at, like a banner high on a wall. While the herd is near `stand` the
 * camera pulls back and up, only as far as it takes to bring `show` into view with the herd's feet.
 * On a screen tall enough to hold both, nothing moves. A vista can also be something big enough to
 * want a look at all of it, and then a button near `stand` asks the camera to stand back until
 * `whole.area` is in view.
 */
export const Vista = z.object({
  id: z.string().min(1),
  /** Where the herd stands when the camera has made all the room it will, in world units. */
  stand: z.object({ x: z.number(), y: z.number() }),
  /** How far from `stand` the camera starts to make room. */
  radius: z.number().positive(),
  /** What must be in view. */
  show: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
  /**
   * How far below the leader's feet the camera keeps in view while it makes room, for a place where
   * friends stand behind her and are tapped. The usual margin when absent.
   */
  below: z.number().positive().optional(),
  whole: z
    .object({
      area: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
      /** What the button calls it: "See the whole palace". */
      word: z.string().min(1).max(24),
    })
    .optional(),
});
export type Vista = z.infer<typeof Vista>;

const RenderMap = z.object({
  tileset: z.string().min(1),
  bundle: z.string().min(1),
  /** Tile ids row by row, -1 for none. */
  ground: z.array(z.number().int().min(-1)),
  /** Animated water tiles, drawn over `ground`. */
  water: z.array(z.number().int().min(-1)),
  decor: z.array(Decor),
  /** At most one thing a map asks the camera to make room for. */
  vista: Vista.optional(),
});

export const CompiledMap = z.object({
  schemaVersion: z.literal(1),
  logic: LogicMap,
  render: RenderMap,
});
export type CompiledMap = z.infer<typeof CompiledMap>;
