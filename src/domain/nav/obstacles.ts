import type { Obstacle } from '../../shared/map';

interface Compiled {
  /** Signed distance from (x, y) to the shape. Negative inside. */
  sd: (x: number, y: number) => number;
}

const rectSd =
  (cx: number, cy: number, hw: number, hh: number) =>
  (x: number, y: number): number => {
    const qx = Math.abs(x - cx) - hw;
    const qy = Math.abs(y - cy) - hh;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  };

const circleSd =
  (cx: number, cy: number, r: number) =>
  (x: number, y: number): number =>
    Math.hypot(x - cx, y - cy) - r;

function polySd(pts: readonly (readonly [number, number])[]) {
  return (x: number, y: number): number => {
    let d2 = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j]!;
      const [bx, by] = pts[i]!;
      const ex = bx - ax,
        ey = by - ay;
      const l2 = ex * ex + ey * ey;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2));
      const dx = x - (ax + ex * t),
        dy = y - (ay + ey * t);
      d2 = Math.min(d2, dx * dx + dy * dy);
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    const d = Math.sqrt(d2);
    return inside ? -d : d;
  };
}

function compile(o: Obstacle): { sd: Compiled['sd']; box: [number, number, number, number] } {
  switch (o.kind) {
    case 'rect':
      return { sd: rectSd(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2), box: [o.x, o.y, o.x + o.w, o.y + o.h] };
    case 'circle':
      return { sd: circleSd(o.x, o.y, o.r), box: [o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r] };
    case 'poly': {
      const xs = o.pts.map((p) => p[0]),
        ys = o.pts.map((p) => p[1]);
      return { sd: polySd(o.pts), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    }
  }
}

/**
 * Obstacles of one map with a bucketed lookup for the distance from a point to the nearest obstacle
 * or map edge. The map edge counts as an obstacle, so actors keep their feet inside the map.
 */
export class ObstacleIndex {
  private readonly shapes: Compiled[];
  private readonly buckets: number[][];
  private readonly cols: number;
  private readonly rows: number;

  constructor(
    readonly width: number,
    readonly height: number,
    obstacles: readonly Obstacle[],
    /** Distances beyond this are reported as this. */
    readonly reach = 96,
    private readonly bucket = 128,
  ) {
    this.cols = Math.ceil(width / bucket);
    this.rows = Math.ceil(height / bucket);
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
    this.shapes = obstacles.map((o, i) => {
      const c = compile(o);
      const [x0, y0, x1, y1] = c.box;
      const bx0 = Math.max(0, Math.floor((x0 - reach) / bucket)),
        bx1 = Math.min(this.cols - 1, Math.floor((x1 + reach) / bucket));
      const by0 = Math.max(0, Math.floor((y0 - reach) / bucket)),
        by1 = Math.min(this.rows - 1, Math.floor((y1 + reach) / bucket));
      for (let by = by0; by <= by1; by++)
        for (let bx = bx0; bx <= bx1; bx++) this.buckets[by * this.cols + bx]!.push(i);
      return { sd: c.sd };
    });
  }

  /**
   * Distance to the nearest obstacle or map edge, negative inside an obstacle or outside the map,
   * capped at `reach`. A point that is not a place at all has no room anywhere, where a search for
   * its bucket would throw.
   */
  clearanceAt(x: number, y: number): number {
    if (Number.isNaN(x) || Number.isNaN(y)) return -Infinity;
    let d = Math.min(x, y, this.width - x, this.height - y, this.reach);
    const bx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.bucket)));
    const by = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.bucket)));
    for (const i of this.buckets[by * this.cols + bx]!) d = Math.min(d, this.shapes[i]!.sd(x, y));
    return d;
  }
}
