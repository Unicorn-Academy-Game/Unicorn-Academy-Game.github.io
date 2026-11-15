import { z } from 'zod';

/**
 * The subset of Tiled's JSON map format (`.tmj`) that this project writes and reads: one orthogonal
 * finite map, one embedded tileset, tile layers with plain data arrays, and object layers with
 * points, rectangles, ellipses, polygons and polylines. Anything else in a file is ignored, so a
 * map saved from Tiled with extra editor state still compiles.
 */

export const TiledProperty = z.object({
  name: z.string(),
  type: z.enum(['string', 'int', 'float', 'bool']).optional(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type TiledProperty = z.infer<typeof TiledProperty>;

const Pt = z.object({ x: z.number(), y: z.number() });

export const TiledObject = z.object({
  id: z.number().int(),
  name: z.string().default(''),
  type: z.string().default(''),
  x: z.number(),
  y: z.number(),
  width: z.number().default(0),
  height: z.number().default(0),
  point: z.boolean().optional(),
  ellipse: z.boolean().optional(),
  polygon: z.array(Pt).optional(),
  polyline: z.array(Pt).optional(),
  properties: z.array(TiledProperty).optional(),
});
export type TiledObject = z.infer<typeof TiledObject>;

const TiledTileLayer = z.object({
  type: z.literal('tilelayer'),
  name: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  data: z.array(z.number().int().nonnegative()),
});

const TiledObjectLayer = z.object({
  type: z.literal('objectgroup'),
  name: z.string(),
  objects: z.array(TiledObject),
});

export const TiledMap = z.object({
  type: z.literal('map'),
  orientation: z.literal('orthogonal'),
  infinite: z.boolean().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.literal(64),
  tileheight: z.literal(64),
  properties: z.array(TiledProperty).optional(),
  tilesets: z.array(z.object({ firstgid: z.number().int().positive(), name: z.string() }).passthrough()).min(1),
  layers: z.array(
    z.discriminatedUnion('type', [
      TiledTileLayer,
      TiledObjectLayer,
      z.object({ type: z.literal('group') }).passthrough(),
      z.object({ type: z.literal('imagelayer') }).passthrough(),
    ]),
  ),
});
export type TiledMap = z.infer<typeof TiledMap>;

export type PropValue = string | number | boolean;

export function prop(obj: { properties?: readonly TiledProperty[] | undefined }, name: string): PropValue | undefined {
  return obj.properties?.find((p) => p.name === name)?.value;
}

export function propString(
  obj: { properties?: readonly TiledProperty[] | undefined; name?: string },
  name: string,
  where: string,
): string {
  const v = prop(obj, name);
  if (typeof v !== 'string') throw new Error(`${where}: property ${name} must be text`);
  return v;
}

export function propNumber(
  obj: { properties?: readonly TiledProperty[] | undefined },
  name: string,
  where: string,
  fallback?: number,
): number {
  const v = prop(obj, name);
  if (typeof v === 'number') return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new Error(`${where}: property ${name} must be a number`);
}

export const toProperties = (o: Record<string, PropValue | undefined>): TiledProperty[] =>
  Object.entries(o)
    .filter((e): e is [string, PropValue] => e[1] !== undefined)
    .map(([name, value]) => ({
      name,
      type:
        typeof value === 'number'
          ? Number.isInteger(value)
            ? 'int'
            : 'float'
          : typeof value === 'boolean'
            ? 'bool'
            : 'string',
      value,
    }));
