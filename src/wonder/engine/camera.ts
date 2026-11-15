import { damp } from './ease';

/** The part of the world the screen shows, in world units. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Where a game that scrolls is looking. It looks at one world point, which is drawn at a fixed
 * place on the screen (a share of the screen's width and height), and the world around it is drawn
 * `zoom` times its size. Zooming therefore opens and closes about the point being followed, which
 * is where a child is looking.
 */
export class Camera {
  /** The world point being looked at. */
  x = 0;
  y = 0;
  zoom = 1;

  constructor(
    /**
     * Where on the screen the looked-at point is drawn, as shares of the screen's width and height.
     */
    public ax = 0.5,
    public ay = 0.5,
  ) {}

  /** Where a world point lands on a screen `w` units wide. */
  screenX(worldX: number, w: number): number {
    return this.ax * w + (worldX - this.x) * this.zoom;
  }

  screenY(worldY: number, h: number): number {
    return this.ay * h + (worldY - this.y) * this.zoom;
  }

  /** The world point under a point on the screen, so a touch can be answered in the world. */
  worldX(screenX: number, w: number): number {
    return this.x + (screenX - this.ax * w) / this.zoom;
  }

  worldY(screenY: number, h: number): number {
    return this.y + (screenY - this.ay * h) / this.zoom;
  }

  /** The world the screen shows, widened by `margin` world units on every side. */
  window(w: number, h: number, margin = 0, out: Bounds = { left: 0, right: 0, top: 0, bottom: 0 }): Bounds {
    out.left = this.worldX(0, w) - margin;
    out.right = this.worldX(w, w) + margin;
    out.top = this.worldY(0, h) - margin;
    out.bottom = this.worldY(h, h) + margin;
    return out;
  }

  /**
   * Puts the camera's view of the world on a canvas. Everything drawn until `end` is in the world's
   * units.
   */
  begin(g: CanvasRenderingContext2D, w: number, h: number): void {
    g.save();
    g.translate(this.ax * w, this.ay * h);
    g.scale(this.zoom, this.zoom);
    g.translate(-this.x, -this.y);
  }

  end(g: CanvasRenderingContext2D): void {
    g.restore();
  }

  /**
   * Eases toward a world point, the same way at any frame rate. `rate` is per second; a slower
   * vertical rate keeps hills readable.
   */
  follow(x: number, y: number, dt: number, rateX = 9, rateY = 3): void {
    this.x = damp(this.x, x, rateX, dt);
    this.y = damp(this.y, y, rateY, dt);
  }
}
