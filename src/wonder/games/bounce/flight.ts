import type { Camera } from '../../engine/camera';
import type { Cast } from '../../engine/cast';
import { COLORS, css, lighten, RAINBOW } from '../../engine/color';
import { clamp, hump, lerp, smooth, TAU, unlerp } from '../../engine/ease';
import { glowAt } from '../../engine/paint';
import { scaleNote } from '../../music';
import { Ascent, newSpot, type Pass, type Spot } from './ascent';
import type { Rider } from './climb';
import type { Life } from './life';
import type { Craft, Show } from './show';
import type { World } from './world';

/**
 * The finale's flight. She crouches and light pours in from the whole sky, then she is gone up
 * through every row of clouds on a rainbow that she makes as she goes, with her friends in a line
 * behind her, and every cloud she passes rings a note, higher and higher, until the door to the
 * moon is all there is. It is the same flight at any height she began from.
 */

/** How long she gathers herself before she goes, in seconds. */
const WINDUP = 1;
/** How far apart the friends fly behind her, along the way, in units. */
const FORMATION = 62;
/** How far to either side of the one in front each friend spreads as the door opens, in units. */
const WEDGE = 26;
/** How long the rainbow behind her is, in units. */
const RIBBON = 900;
/** How long the friends take to join her line, in seconds. */
const GATHER = 1.1;
/** How long it takes her to leave her cloud once the flight begins, in seconds. */
const LEAVE = 0.14;
/** How long the camera takes to move over from the climb to the flight, in seconds. */
const SWING = 0.6;
/** How long the door takes to open wide, in seconds, if the flight is long enough for it. */
const OPENING = 1.6;

export class Flight {
  readonly ascent: Ascent;
  /** Seconds since it began, which is its gathering and then the flight. */
  clock = 0;
  /** How far along the way the leader is, in units. */
  s = 0;
  private launched = false;
  private near = false;
  /** Which way the leader faces. It changes only when the way goes clearly the other way. */
  private face = 1;
  private debt = 0;
  private readonly spot = newSpot();
  private readonly passing: Pass[] = [];
  private readonly camFrom: { x: number; y: number; zoom: number };

  constructor(
    world: World,
    from: { readonly x: number; readonly y: number; readonly row: number },
    /** Where everyone was standing, who was the leader first. */
    private readonly start: readonly { readonly x: number; readonly y: number }[],
    cam: Camera,
    private readonly craft: Craft,
    private readonly show: Show,
    private readonly life: Life,
    private readonly cast: Cast,
    private readonly calm: boolean,
  ) {
    this.ascent = new Ascent(world, from);
    this.camFrom = { x: cam.x, y: cam.y, zoom: cam.zoom };
    // She crouches, and her friends close up around her.
    cast.hold(0, 0.28);
  }

  /** Seconds into the flight itself, below 0 while she is still gathering herself. */
  get t(): number {
    return this.clock - WINDUP;
  }

  /** How far through the flight she is, 0 to 1. */
  get progress(): number {
    return clamp(this.t / this.ascent.seconds);
  }

  /** How fast the leader is going, in units a second. */
  get speed(): number {
    const u = this.progress;
    return this.t < 0 ? 0 : (this.ascent.length * 6 * u * (1 - u)) / this.ascent.seconds;
  }

  /** How much of her gathering is done, 0 to 1. It is 0 again once she has gone. */
  get charge(): number {
    return this.t < 0 ? clamp(this.clock / WINDUP) : 0;
  }

  /**
   * How wide the door has opened, 0 to 1. It opens in the last of the flight, for about a second
   * and a half whatever the length of it.
   */
  get open(): number {
    const from = clamp(1 - OPENING / this.ascent.seconds, 0.35, 0.85);
    return this.t < 0 ? 0 : smooth(unlerp(from, 1, this.progress));
  }

  /**
   * How much she has become the hero of the sky, 0 to 1: she grows as she leaves her cloud, and is
   * the size she will be on the moon.
   */
  get hero(): number {
    return smooth(this.t / 0.5);
  }

  /** She has reached the door. */
  get arrived(): boolean {
    return this.t >= this.ascent.seconds;
  }

  step(dt: number): void {
    this.clock += dt;
    if (this.t < 0) {
      const lead = this.cast.looks[0]!;
      this.gather(dt, lead.x, lead.y + 30);
      return;
    }
    if (!this.launched) this.launch();
    const before = this.s;
    this.s = this.ascent.distanceAt(this.t);
    this.ascent.crossed(before, this.s, this.passing);
    for (const pass of this.passing) this.pass(pass);
    this.sparkle(dt);
    if (!this.near && this.open > 0) {
      this.near = true;
      this.craft.sound.fx('whoosh', { gain: 0.9, size: 1 });
      this.craft.sound.fx('twinkle', { size: 1, gain: 0.8 });
    }
  }

  /**
   * Where the unicorn that is `i`th in the line is: the leader on the way, and each friend a little
   * way behind.
   */
  private place(i: number): Spot {
    // They close up round her as the door opens, and spread into a wedge with her at the point, so
    // that all of them are there and none is hidden behind another when it is all there is.
    const open = this.open;
    const s = this.s - i * FORMATION * (1 - 0.5 * open);
    if (s >= 0) {
      const spot = this.ascent.at(s, this.spot);
      const fan = (i % 2 === 1 ? -1 : 1) * Math.ceil(i / 2) * WEDGE * open;
      spot.x -= Math.sin(spot.angle) * fan;
      spot.y += Math.cos(spot.angle) * fan;
      return spot;
    }
    // Before the line has got going the friends are behind the start, along the way it begins in.
    this.ascent.at(0, this.spot);
    this.spot.x += Math.cos(this.spot.angle) * s;
    this.spot.y += Math.sin(this.spot.angle) * s;
    return this.spot;
  }

  /**
   * How everyone looks: the leader gathering and then flying, and the friends gathering to her and
   * then in her line.
   */
  dress(dt: number, riders: readonly Rider[]): void {
    const t = this.t;
    for (let i = 0; i < riders.length; i++) {
      const spot = this.place(i);
      // The leader leaves her cloud at the moment the flight begins, and the friends close up on
      // her while she gathers.
      const gone = i === 0 ? smooth(t / LEAVE) : smooth(this.clock / GATHER);
      const from = this.start[i] ?? spot;
      if (i === 0 && Math.abs(Math.cos(spot.angle)) > 0.3) this.face = Math.cos(spot.angle) > 0 ? 1 : -1;
      const gathering = i === 0 && t < 0;
      this.cast.set(
        i,
        {
          x: lerp(from.x, spot.x, gone),
          y: lerp(from.y, spot.y, gone),
          mode: gathering ? 'cheer' : 'air',
          face: this.face,
          pitch: t < 0 ? 0 : 0.3 + 0.45 * Math.abs(Math.sin(spot.angle)),
          clock: this.clock,
        },
        dt,
      );
    }
  }

  /**
   * Where the camera looks, which is at her, held a little low on the screen while she is fast so
   * that there is sky in front of her.
   */
  frame(cam: Camera, focusX: (x: number) => number): void {
    const lead = this.cast.looks[0]!;
    const k = smooth(this.clock / SWING);
    const u = this.progress;
    // She comes to the middle of the screen as she reaches the door, so the door opens round her.
    const arrive = smooth(unlerp(0.72, 1, u));
    const ahead = lerp(36, 8, hump(u)) * (1 - arrive);
    const zoom = 1 - (this.calm ? 0.04 : 0.08) * hump(u);
    cam.x = lerp(this.camFrom.x, focusX(lead.x), k);
    cam.y = lerp(this.camFrom.y, lead.y - ahead, k);
    cam.zoom = lerp(this.camFrom.zoom, zoom, k);
  }

  /** Light that spirals in to where she crouches, more and more of it. */
  private gather(dt: number, x: number, y: number): void {
    const { fx, rng } = this.craft;
    this.debt += dt * (30 + 110 * this.charge);
    while (this.debt >= 1) {
      this.debt -= 1;
      const a = rng.range(0, TAU);
      const d = rng.range(70, 160);
      const c = RAINBOW[rng.int(7)]!;
      fx.emit({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d * 0.7,
        vx: -Math.cos(a) * d * 1.3,
        vy: -Math.sin(a) * d * 0.9,
        life: 0.6,
        size: rng.range(8, 13),
        size1: 2,
        color: lighten(c, 0.4),
        color1: c,
        shape: 'spark',
        swirl: 1.6,
        twinkle: 9,
        hold: 0.3,
      });
    }
  }

  /** And away. */
  private launch(): void {
    this.launched = true;
    const { fx, rng, sound, feel } = this.craft;
    this.cast.hold(0, 0);
    this.cast.kick(0, 7);
    sound.fx('launch', { gain: 0.8 });
    sound.fx('boing', { pitch: 7, size: 1, gain: 0.7 });
    feel.flash(0.26, COLORS.gold);
    feel.shake(2.4);
    const at = this.ascent.at(0, this.spot);
    for (let i = 0; i < fx.count(40); i++) {
      const a = -Math.PI / 2 + rng.range(-1.2, 1.2);
      const c = RAINBOW[i % 7]!;
      const sp = rng.range(120, 340);
      fx.emit({
        x: at.x,
        y: at.y + 20,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.6, 1.1),
        size: rng.range(9, 16),
        size1: 2,
        color: lighten(c, 0.4),
        color1: c,
        shape: 'spark',
        drag: 2,
        twinkle: 9,
        halo: 3,
        tail: 0.04,
      });
    }
    fx.emit({
      x: at.x,
      y: at.y + 10,
      life: 0.7,
      size: 40,
      size1: 280,
      color: COLORS.white,
      shape: 'ring',
      width: 5,
      alpha: 0.9,
    });
  }

  /** She passes over a cloud: it rings, ducks, and laughs. */
  private pass(pass: Pass): void {
    const { fx, rng, sound, palette, pan } = this.craft;
    const cloud = pass.cloud;
    const total = this.ascent.passes.length;
    // Every cloud she passes is a note higher than the one before, so the climb is one long scale.
    const step = Math.round(unlerp(0, Math.max(1, total - 1), this.ascent.passes.indexOf(pass)) * 14);
    sound.note(palette.voice, scaleNote(52, step), { pan: pan(cloud.x), gain: 0.7 });
    this.life.press(cloud, 110);
    this.life.delight(cloud);
    for (let i = 0; i < fx.count(5); i++) {
      const a = rng.range(0, TAU);
      const c = palette.accents[i % palette.accents.length]!;
      fx.emit({
        x: cloud.x + rng.range(-cloud.width * 0.3, cloud.width * 0.3),
        y: cloud.y - 8,
        vx: Math.cos(a) * rng.range(30, 90),
        vy: Math.sin(a) * rng.range(20, 70) - 30,
        life: rng.range(0.4, 0.8),
        size: rng.range(8, 12),
        size1: 1.5,
        color: lighten(c, 0.4),
        color1: c,
        shape: i % 2 === 0 ? 'star4' : 'spark',
        drag: 2,
        twinkle: 9,
      });
    }
  }

  /** Light along the rainbow behind her. */
  private sparkle(dt: number): void {
    const { rng } = this.craft;
    this.debt += dt * 80;
    while (this.debt >= 1) {
      this.debt -= 1;
      const p = this.ascent.at(this.s - rng.range(0, 160), this.spot);
      this.show.trail(p.x + rng.range(-18, 18), p.y - 20, RAINBOW[rng.int(7)]!, 12);
    }
  }

  /** The glow around her as she gathers, which grows until she goes. */
  paintCharge(light: CanvasRenderingContext2D): void {
    const c = this.charge;
    if (c <= 0) return;
    const lead = this.cast.looks[0]!;
    glowAt(light, lead.x, lead.y + 20, 60 + 190 * c, lighten(COLORS.gold, 0.4), 0.55 * c);
    glowAt(light, lead.x, lead.y + 40, 30 + 80 * c, COLORS.white, 0.7 * c, 'spark');
  }

  /**
   * The rainbow behind her: seven bands that follow the way she has come, and fade away at the far
   * end.
   */
  paintRibbon(g: CanvasRenderingContext2D, light: CanvasRenderingContext2D, t: number): void {
    if (this.t < 0) return;
    const to = this.s;
    const from = Math.max(0, to - RIBBON);
    if (to - from < 4) return;
    const step = 9;
    const n = Math.ceil((to - from) / step) + 1;
    const spot = this.spot;
    const xs: number[] = [];
    const ys: number[] = [];
    const nx: number[] = [];
    const ny: number[] = [];
    for (let i = 0; i < n; i++) {
      this.ascent.at(Math.min(to, from + i * step), spot);
      xs.push(spot.x);
      // It comes from her hips, which are above her hooves.
      ys.push(spot.y - 26);
      nx.push(-Math.sin(spot.angle));
      ny.push(Math.cos(spot.angle));
    }
    const band = 5.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let k = 0; k < RAINBOW.length; k++) {
      const off = (k - 3) * band;
      g.lineWidth = band + 0.8;
      const grad = g.createLinearGradient(xs[0]!, ys[0]!, xs[n - 1]!, ys[n - 1]!);
      grad.addColorStop(0, css(RAINBOW[k]!, 0));
      grad.addColorStop(0.45, css(lighten(RAINBOW[k]!, 0.15), 0.85));
      grad.addColorStop(1, css(lighten(RAINBOW[k]!, 0.3), 0.95));
      g.strokeStyle = grad;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = xs[i]! + nx[i]! * off;
        const y = ys[i]! + ny[i]! * off;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // A bright head, and glints that run up it.
    glowAt(light, xs[n - 1]!, ys[n - 1]!, 80, COLORS.white, 0.26);
    for (let i = 0; i < 5; i++) {
      const u = (t * 0.9 + i / 5) % 1;
      const at = Math.min(n - 1, Math.floor(u * (n - 1)));
      glowAt(light, xs[at]!, ys[at]!, 22, [255, 255, 255], 0.75 * u, 'spark');
    }
  }
}
