import type { Camera } from '../../engine/camera';
import { damp, lerp, smoother, unlerp } from '../../engine/ease';
import type { Journey } from './journey';

/**
 * Where the camera looks while the finale goes by. The finale is laid out in advance, so its camera
 * is too: a few shots, each where she is along the way, with a smooth change from one to the next.
 * The camera that is drawn goes where the shot goes, and is only eased out of wherever it was when
 * the shot began, so nothing ever jumps and nothing ever lags behind her.
 */

/** How the camera is told to look. */
export interface Shot {
  /**
   * The world point looked at, and where on the screen it is drawn (as shares of the width and
   * height).
   */
  x: number;
  y: number;
  ax: number;
  ay: number;
  zoom: number;
}

export const newShot = (): Shot => ({ x: 0, y: 0, ax: 0.5, ay: 0.5, zoom: 1 });

/** The screen: its size in units, and how big the world is drawn on it when nothing else says. */
export interface Screen {
  readonly w: number;
  readonly h: number;
  readonly base: number;
}

/** The water's surface is this far down the screen when the lagoon is shown. */
export const WATER_LINE = 0.76;
/** The rainbow's top is at least this far from the top of the screen, as a share of its height. */
const SKY_MARGIN = 0.05;

/**
 * How the lagoon is framed: how close the camera is, and how big a rainbow fits the screen at that.
 */
export interface Fit {
  readonly zoom: number;
  readonly rx: number;
  readonly ry: number;
}

/**
 * The biggest rainbow that the screen shows whole over a pool this wide, drawn as an arch that is
 * as wide as the pool allows and as tall as the screen allows: flat on a wide screen and round on a
 * tall one.
 */
export function fitLagoon(screen: Screen, poolWidth: number, margin: number): Fit {
  const rx = poolWidth * 0.34;
  const wide = screen.w / screen.h;
  const ry = rx * Math.min(1, Math.max(0.69, 1.3 - 0.25 * wide));
  const across = (screen.w * 0.95) / (2 * rx + margin);
  const up = (screen.h * (WATER_LINE - SKY_MARGIN)) / (ry + margin);
  return { zoom: Math.min(screen.base, across, up), rx, ry };
}

interface Key {
  /** How far along she is when the camera is exactly like this. */
  readonly s: number;
  readonly make: (lead: Point, out: Shot) => Shot;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export class Rig {
  readonly fit: Fit;
  private readonly keys: Key[];
  private readonly a = newShot();
  private readonly b = newShot();

  constructor(
    journey: Journey,
    screen: Screen,
    /** How much room the rainbow needs outside its outer edge, for its glow. */
    margin: number,
  ) {
    const j = journey;
    const m = j.marks;
    const { w, h, base } = screen;
    this.fit = fitLagoon(screen, j.pool.right - j.pool.left, margin);
    const zoomRun = base * 0.9;
    const zoomLoop = Math.min(
      base,
      (h * 0.9) / (2 * j.loop.radius + 90),
      (w * 0.92) / (2 * j.loop.radius + j.plan.loopShift + 300),
    );
    const zoomRamp = Math.min(base * 0.7, zoomRun);
    const zoomAir = Math.min(base * 0.62, (w * 0.95) / 900);
    const water = this.fit.zoom;

    const run = (lead: Point, o: Shot): Shot => set(o, lead.x + 60, lead.y - 24, 0.3, 0.62, zoomRun);
    const loop = (_: Point, o: Shot): Shot => set(o, j.loop.x + 40, j.loop.y - 10, 0.5, 0.52, zoomLoop);
    const ramp = (lead: Point, o: Shot): Shot => set(o, lead.x + 150, lead.y - 70, 0.36, 0.6, zoomRamp);
    const air = (lead: Point, o: Shot): Shot =>
      set(o, lead.x + 150, lead.y * 0.6 + (j.landing.y - 260) * 0.4, 0.4, 0.5, zoomAir);
    const lagoon = (_: Point, o: Shot): Shot =>
      set(o, j.pool.centre, j.pool.y - ((WATER_LINE - 0.62) * h) / water, 0.5, 0.62, water);

    const flight = m.land - m.launch;
    this.keys = [
      { s: 0, make: run },
      { s: m.loopIn - 340, make: run },
      { s: m.loopIn + 60, make: loop },
      { s: m.loopOut - 140, make: loop },
      { s: m.loopOut + 160, make: ramp },
      { s: m.launch + 40, make: air },
      { s: m.launch + flight * 0.5, make: air },
      { s: m.land + 220, make: lagoon },
    ];
  }

  /** How the camera should look when she is `s` along and her body is at `lead`. */
  shot(s: number, lead: Point, out: Shot = newShot()): Shot {
    const keys = this.keys;
    if (s <= keys[0]!.s) return keys[0]!.make(lead, out);
    const last = keys[keys.length - 1]!;
    if (s >= last.s) return last.make(lead, out);
    let i = 0;
    while (keys[i + 1]!.s < s) i++;
    const from = keys[i]!;
    const to = keys[i + 1]!;
    const u = smoother(unlerp(from.s, to.s, s));
    if (u <= 0) return from.make(lead, out);
    const a = from.make(lead, this.a);
    const b = to.make(lead, this.b);
    out.x = lerp(a.x, b.x, u);
    out.y = lerp(a.y, b.y, u);
    out.ax = lerp(a.ax, b.ax, u);
    out.ay = lerp(a.ay, b.ay, u);
    // Zoom is felt as a ratio, so it is mixed as one.
    out.zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), u));
    return out;
  }
}

function set(o: Shot, x: number, y: number, ax: number, ay: number, zoom: number): Shot {
  o.x = x;
  o.y = y;
  o.ax = ax;
  o.ay = ay;
  o.zoom = zoom;
  return o;
}

/**
 * The camera following a rig. It is where the shot is, plus how far from the shot it was when the
 * shot began, and that fades. So it comes smoothly out of wherever it was, and from then on it is
 * exactly where the shot says: a camera that only chased the shot would always be a little behind
 * her.
 */
export class Eye {
  private offX = 0;
  private offY = 0;
  private fresh = true;

  /** The next shot is a new one, and the camera is to be eased into it from where it is. */
  restart(): void {
    this.fresh = true;
  }

  follow(camera: Camera, shot: Shot, dt: number, rate = 3.4): void {
    if (this.fresh) {
      this.offX = camera.x - shot.x;
      this.offY = camera.y - shot.y;
      this.fresh = false;
    }
    const keep = Math.exp(-rate * dt);
    this.offX *= keep;
    this.offY *= keep;
    camera.x = shot.x + this.offX;
    camera.y = shot.y + this.offY;
    camera.ax = damp(camera.ax, shot.ax, rate, dt);
    camera.ay = damp(camera.ay, shot.ay, rate, dt);
    camera.zoom = damp(camera.zoom, shot.zoom, rate, dt);
  }
}
