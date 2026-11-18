import { z } from 'zod';

/**
 * How deep the water is under a place, for a map where the herd can go into the sea. The map is
 * cut into the 32 unit cells of the navigation grid and each cell is dry (0), shallow enough to
 * wade (1), deep enough to swim (2), or a stone standing in the water that she can walk over (3).
 * Cells are stored a row at a time as runs of one depth, so a
 * sea is a few hundred numbers and not a few thousand.
 */
export const CELL = 32;

export type Depth = 0 | 1 | 2 | 3;

export const Waters = z
  .object({
    cols: z.number().int().positive().max(512),
    rows: z.number().int().positive().max(512),
    /** `[depth, how many cells]`, row by row from the top left. */
    runs: z.array(z.tuple([z.number().int().min(0).max(3), z.number().int().positive()])).max(8192),
  })
  .refine((w) => w.runs.reduce((n, [, count]) => n + count, 0) === w.cols * w.rows, {
    message: 'the runs must cover every cell',
  });
export type Waters = z.infer<typeof Waters>;

/** Packs a grid of depths, a row at a time, into runs. */
export function packWaters(cols: number, rows: number, cells: ArrayLike<number>): Waters {
  const runs: [Depth, number][] = [];
  for (let i = 0; i < cols * rows; i++) {
    const d = cells[i] as Depth;
    const last = runs[runs.length - 1];
    if (last && last[0] === d) last[1] += 1;
    else runs.push([d, 1]);
  }
  return { cols, rows, runs };
}

/** What a place is like underfoot: how deep the water is at a point of the map, in world units. */
export interface DepthField {
  at(x: number, y: number): Depth;
}

const DRY: DepthField = { at: () => 0 };

const fields = new WeakMap<Waters, DepthField>();

/** The depth of the water at any point of a map, which is everywhere dry when it has none. */
export function depthField(waters: Waters | undefined): DepthField {
  if (!waters) return DRY;
  let field = fields.get(waters);
  if (!field) {
    const cells = new Uint8Array(waters.cols * waters.rows);
    let at = 0;
    for (const [depth, count] of waters.runs) {
      cells.fill(depth, at, at + count);
      at += count;
    }
    const { cols, rows } = waters;
    field = {
      at(x, y) {
        const c = Math.min(cols - 1, Math.max(0, Math.floor(x / CELL)));
        const r = Math.min(rows - 1, Math.max(0, Math.floor(y / CELL)));
        return cells[r * cols + c] as Depth;
      },
    };
    fields.set(waters, field);
  }
  return field;
}
