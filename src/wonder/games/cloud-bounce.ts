import { Rng } from '../../domain/rng';
import type { UnicornId } from '../../shared/ids';
import { type Bounds, Camera } from '../engine/camera';
import { Cast } from '../engine/cast';
import { RAINBOW } from '../engine/color';
import { clamp, damp, lerp, smooth, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import type { Painter, View } from '../engine/painter';
import type { Pointer } from '../engine/stage';
import { CANDY, MORNING, STARRY } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import { Climb, type Event } from './bounce/climb';
import { CloudArt } from './bounce/clouds';
import { Flight } from './bounce/flight';
import { Garden, makeVista } from './bounce/garden';
import { Heavens } from './bounce/heavens';
import { Life } from './bounce/life';
import { Moon } from './bounce/moon';
import { type Palette, paletteOf } from './bounce/palette';
import { HERO, SCALE } from './bounce/scale';
import { type Craft, Show } from './bounce/show';
import { paintCover, paintRipple } from './bounce/things';
import { buildWorld, WORLD_W, type World } from './bounce/world';

/**
 * What each star costs, in points of play. A child who heads for the top gets the fifth star in
 * about thirty seconds, and one who taps as they like in about a minute, so the finale comes while
 * they are still enjoying it.
 */
const CLOUD_STAR_COSTS = [14, 34, 58, 82, 108] as const;

export type Place = 'climb' | 'flight' | 'moon';

/**
 * How long the picture of the moon that the door has become takes to fade away, once she is through
 * it, in seconds.
 */
const COVER_SECONDS = 1.5;

const styleOf = (palette: Palette) =>
  palette.name === 'sunrise' ? MORNING : palette.name === 'candy' ? CANDY : STARRY;

/**
 * A climb into the sky. She stands on a mushroom in a meadow and every touch sends her up through a
 * ladder of clouds, each a note, each landing on a beat of the music. Some clouds have a surprise
 * in them. Friends wait on some, and join her. Stars hang along the leaps. The fifth star lifts her
 * up through the whole sky in a rainbow, through a door of light, and out onto the moon, where
 * flowers of light come up under her hooves.
 */
export class CloudBounce extends Wonder {
  readonly id = 'cloud-bounce' as const;
  protected readonly meter = new Meter(CLOUD_STAR_COSTS);

  private readonly palette: Palette;
  private readonly art: CloudArt;
  private readonly garden: Garden;
  /** The moon as it looks through the door. */
  private readonly vista: HTMLCanvasElement;
  private readonly cast = new Cast();
  private readonly craft: Craft;
  private readonly show: Show;
  private readonly cam = new Camera(0.5, 0.66);
  private readonly bounds: Bounds = { left: 0, right: 0, top: 0, bottom: 0 };
  private readonly herd: readonly UnicornId[];
  private readonly friends: readonly UnicornId[];
  private readonly ripples: { x: number; y: number; age: number }[] = [];
  private readonly lastVy: number[] = [0, 0, 0, 0, 0, 0];
  private world!: World;
  private climb!: Climb;
  private life!: Life;
  private heavens!: Heavens;
  private flight: Flight | null = null;
  private moon: Moon | null = null;
  private pointer: Pointer | null = null;
  private pendingFinale = false;
  /**
   * The door as it was when it had opened wide, on the screen, while it fades away to leave the
   * moon.
   */
  private cover: { readonly x: number; readonly y: number; readonly r: number } | null = null;
  private veil = 0;
  /** How many stars she has gathered one after another, which makes a row of them a scale. */
  private run = 0;
  private runLeft = 0;
  private answers = 0;
  private trailDebt = 0;
  private moteDebt = 0;

  constructor(env: WonderEnv) {
    super(env);
    this.camera = this.cam;
    this.palette = paletteOf(env.look);
    const herd = env.herd.length > 0 ? env.herd : (['wildstar'] as const);
    this.herd = herd;
    this.friends = herd.slice(1, 6);
    this.art = new CloudArt(this.palette, new Rng(env.rng.int(0x7fffffff)));
    this.garden = new Garden(this.palette, new Rng(env.rng.int(0x7fffffff)));
    this.vista = makeVista(this.palette);
    this.craft = {
      fx: this.fx,
      sound: env.sound,
      rng: env.rng,
      feel: { shake: (n) => this.shake(n), flash: (n, c) => this.flash(n, c) },
      palette: this.palette,
      pan: (x) => clamp(this.cam.screenX(x, this.view.w) / this.view.w - 0.5, -0.5, 0.5) * 1.2,
    };
    this.show = new Show(this.craft);
    this.startMusic(styleOf(this.palette));
    this.begin();
  }

  override get bloom(): number {
    return this.env.calm ? 0.1 : 0.26;
  }

  get place(): Place {
    return this.moon ? 'moon' : this.flight ? 'flight' : 'climb';
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly climb: Climb;
    readonly world: World;
    readonly place: Place;
    readonly flight: Flight | null;
    readonly camera: Camera;
    /** Which sky it is, from the colour of the mushroom. */
    readonly sky: Palette['name'];
    /** How many flowers have come up on the moon. */
    readonly flowers: number;
  } {
    return {
      climb: this.climb,
      world: this.world,
      place: this.place,
      flight: this.flight,
      camera: this.cam,
      sky: this.palette.name,
      flowers: this.garden.up,
    };
  }

  /** Builds a new sky and stands her on the mushroom. */
  private begin(): void {
    const { rng } = this.env;
    this.world = buildWorld(new Rng(rng.int(0x7fffffff)), this.friends, this.env.look);
    this.climb = new Climb(this.world, this.herd);
    this.life = new Life(
      this.world,
      this.climb,
      this.art,
      this.palette,
      this.vista,
      this.env.bank,
      this.env.look,
      this.env.calm,
    );
    this.heavens = new Heavens(this.palette, new Rng(rng.int(0x7fffffff)), this.world, this.env.bank, this.art);
    this.flight = null;
    this.moon = null;
    this.pendingFinale = false;
    this.pointer = null;
    this.cover = null;
    this.veil = 0;
    this.run = 0;
    this.runLeft = 0;
    this.answers = 0;
    this.trailDebt = 0;
    this.moteDebt = 0;
    this.ripples.length = 0;
    this.lastVy.fill(0);
    this.cast.reset();
    this.garden.reset();
    this.arrangeCamera();
    const lead = this.climb.leader;
    this.cam.x = this.focusX(lead.x);
    this.cam.y = this.focusY(lead.y);
    this.cam.zoom = 1;
    this.dressClimb(0);
  }

  protected reset(): void {
    this.begin();
  }

  protected arrange(view: View): void {
    this.arrangeCamera();
    this.garden.arrange(view.w, view.h);
    this.moon?.arrange(view);
    if (!this.moon && !this.flight) {
      const lead = this.climb.leader;
      this.cam.x = this.focusX(lead.x);
      this.cam.y = this.focusY(lead.y);
    }
  }

  /**
   * Where on the screen the camera's point is drawn. On the moon there is no camera, and the world
   * is the screen.
   */
  private arrangeCamera(): void {
    const view = this.view;
    if (this.moon) {
      this.cam.ax = 0;
      this.cam.ay = 0;
      return;
    }
    this.cam.ax = 0.5;
    this.cam.ay = view?.landscape === false ? 0.68 : 0.66;
  }

  /**
   * Where the camera looks across the sky for a unicorn at `x`: the middle of it if the screen
   * holds all of it, and otherwise her, held inside its edges.
   */
  private focusX(x: number): number {
    const w = this.view?.w ?? WORLD_W;
    return w >= WORLD_W ? WORLD_W / 2 : clamp(x, w / 2, WORLD_W - w / 2);
  }

  /**
   * How high the camera looks for a unicorn at a height: a little above her, and lower down at the
   * very start of a short screen, so that the meadow and the mushroom are in view.
   */
  private focusY(y: number): number {
    const h = this.view?.h ?? 360;
    const nearGround = clamp(1 + y / 260);
    const short = clamp((540 - h) / 180);
    return y - 36 + 74 * nearGround * short;
  }

  /** The place in the sky under a point on the screen. */
  private skyAt(x: number, y: number): { x: number; y: number } {
    return { x: this.cam.worldX(x, this.view.w), y: this.cam.worldY(y, this.view.h) };
  }

  protected hint(): { x: number; y: number } | null {
    if (this.place !== 'climb' || this.pendingFinale) return null;
    const lead = this.climb.leader;
    let best: { x: number; y: number } | null = null;
    for (const c of this.world.row(lead.to.row + 1))
      if (!best || Math.abs(c.x - lead.x) < Math.abs(best.x - lead.x)) best = c;
    if (!best) return null;
    return { x: this.cam.screenX(best.x, this.view.w), y: this.cam.screenY(best.y + 16, this.view.h) };
  }

  protected press(p: Pointer): void {
    this.ripples.push({ x: p.x, y: p.y, age: 0 });
    if (this.ripples.length > 6) this.ripples.shift();
    if (this.moon) {
      this.moon.touch(p.x, p.y);
      return;
    }
    if (this.flight) {
      // She is on her way and there is nowhere to send her, so it is a cheer: she bounces and the
      // note goes up a step.
      this.cast.kick(0, 2.2);
      this.env.sound.fx('boing', { pitch: 4 + (this.answers++ % 6), size: 0.4, gain: 0.5 });
      return;
    }
    if (this.pendingFinale) return;
    this.pointer = p;
    const at = this.skyAt(p.x, p.y);
    this.climb.touch(at.x, at.y);
  }

  protected override drag(p: Pointer): void {
    if (this.pointer) this.pointer = p;
  }

  protected override lift(): void {
    this.pointer = null;
    this.climb.release();
  }

  protected tick(dt: number): void {
    if (this.pendingFinale && !this.flight && this.climb.leader.mode === 'stand') this.openFlight();
    this.life.step(dt);
    this.cast.tick(dt);
    if (this.moon) this.linger(this.moon, dt);
    else if (this.flight) this.fly(this.flight, dt);
    else this.play(dt);
    if (this.cover) {
      this.veil = Math.max(0, this.veil - dt / COVER_SECONDS);
      if (this.veil <= 0) this.cover = null;
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.age += dt;
      if (r.age > 0.5) this.ripples.splice(i, 1);
    }
  }

  private beat(): number {
    return this.band?.pulse() ?? 0;
  }

  private play(dt: number): void {
    const climb = this.climb;
    const band = this.band!;
    if (this.pointer && !this.pendingFinale) {
      const at = this.skyAt(this.pointer.x, this.pointer.y);
      climb.send(at.x, at.y, true);
    }
    // A long frame is taken a slice at a time, so a leap is never longer than the screen can
    // follow.
    const steps = Math.max(1, Math.ceil(dt * 30 - 1e-6));
    const h = dt / steps;
    const beats = band.beats - dt / band.beatSeconds;
    for (let i = 0; i < steps; i++) {
      for (const r of climb.riders) this.lastVy[r.index] = r.mode === 'hop' ? r.vy : 0;
      climb.step(h, { beats: beats + ((i + 1) * h) / band.beatSeconds, seconds: band.beatSeconds });
      for (const e of climb.events) this.react(e);
      climb.events.length = 0;
    }
    if (this.runLeft > 0) {
      this.runLeft -= dt;
      if (this.runLeft <= 0) this.run = 0;
    }
    this.dressClimb(dt);
    this.followLeader(dt);
    this.leaveLight(dt);
    this.motes(dt);
  }

  /** What the climb said happened, shown and sounded. */
  private react(e: Event): void {
    const { climb, life, cast, show } = this;
    switch (e.type) {
      case 'launch': {
        const r = climb.riders[e.rider]!;
        life.press(e.from, 90);
        if (e.rider !== 0) {
          cast.kick(e.rider, 2.4);
          this.puff(r.x, r.y);
          return;
        }
        cast.kick(0, 3.4);
        this.idle = 0;
        show.takeoff(r.x, r.y, e.to.step, e.far);
        return;
      }
      case 'land': {
        const r = climb.riders[e.rider]!;
        const force = clamp(Math.abs(this.lastVy[e.rider]!) / 520, 0.25, 1);
        cast.kick(e.rider, -(2 + force * 5));
        life.press(e.cloud, e.rider === 0 ? 70 + 150 * force : 50);
        if (e.rider !== 0) {
          this.puff(r.x, r.y);
          return;
        }
        life.delight(e.cloud);
        show.landing(e.cloud.kind, e.cloud.step, r.x, r.y, e.fresh, e.combo, e.height, force);
        if (e.worth > 0) this.earn(e.worth);
        return;
      }
      case 'star':
        this.run++;
        this.runLeft = 1.3;
        show.star(e.pickup.x, e.pickup.y, this.run - 1);
        this.earn(e.worth);
        return;
      case 'join': {
        const r = climb.riders[e.rider]!;
        // She has been looking at the one who found her, and turns round to go with her.
        cast.face(e.rider, climb.leader.x < r.x ? -1 : 1);
        cast.cheer(e.rider);
        cast.kick(e.rider, 4);
        show.join(r.x, r.y, e.rider);
        this.earn(e.worth);
        return;
      }
      case 'top':
        this.earn(1e9);
        return;
      case 'stay': {
        // She was sent where there is nowhere to go, so the sky answers the touch.
        const aim = climb.aim;
        if (!aim) return;
        cast.kick(0, 3);
        show.answer(aim.x, aim.y, this.answers++ % 8);
        return;
      }
    }
  }

  /** A friend's leap or landing: a little puff of cloud under her. */
  private puff(x: number, y: number): void {
    const { rng } = this.env;
    for (let i = 0; i < this.fx.count(3); i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.fx.emit({
        x: x + side * rng.range(2, 18),
        y: y - 2,
        vx: side * rng.range(10, 40),
        vy: -rng.range(4, 24),
        life: rng.range(0.35, 0.6),
        size: rng.range(10, 16),
        size1: 3,
        color: [255, 250, 240],
        alpha: 0.8,
        shape: 'dot',
        drag: 2.4,
        hold: 0.1,
      });
    }
  }

  /** The sparkle she leaves in the air as she goes, richer for a long leap. */
  private leaveLight(dt: number): void {
    const r = this.climb.leader;
    if (r.mode !== 'hop') return;
    this.trailDebt += dt * (r.far ? 60 : 34);
    while (this.trailDebt >= 1) {
      this.trailDebt -= 1;
      const k = Math.floor(this.time * 16 + this.trailDebt * 5);
      const colors = r.far ? RAINBOW : this.palette.accents;
      this.show.trail(r.x, r.y - 40, colors[((k % colors.length) + colors.length) % colors.length]!, r.far ? 13 : 10);
    }
  }

  /** Dust of light drifting through the sky, so it is never quite still. */
  private motes(dt: number): void {
    const { rng } = this.env;
    this.moteDebt += dt * (this.env.calm ? 2 : 5);
    while (this.moteDebt >= 1) {
      this.moteDebt -= 1;
      const b = this.cam.window(this.view.w, this.view.h, 0, this.bounds);
      this.fx.emit({
        x: rng.range(b.left, b.right),
        y: rng.range(b.top, b.bottom),
        vy: rng.range(-9, -2),
        life: rng.range(2.4, 4),
        size: rng.range(5, 9),
        color: [255, 255, 255],
        shape: 'glow',
        alpha: 0.55,
        fadeIn: 0.8,
        twinkle: rng.range(0.6, 1.4),
        hold: 0.4,
        sway: 6,
      });
    }
  }

  /** How each of them looks, from where each is. */
  private dressClimb(dt: number): void {
    const { cast, life } = this;
    const riders = this.climb.riders;
    for (let i = 0; i < riders.length; i++) {
      const r = riders[i]!;
      if (r.mode === 'stand') {
        const cheering = cast.sinceCheer(i);
        const signing = i === 0 && r.since > 7;
        cast.set(
          i,
          {
            x: r.x,
            y: r.y + life.drop(r.to),
            mode: cheering < 0.9 ? 'cheer' : signing ? 'sign' : 'idle',
            face: r.facing,
            clock: cheering < 0.9 ? cheering : signing ? r.since : this.time + i * 0.7,
          },
          dt,
        );
        continue;
      }
      const arc = r.arc!;
      // Leaving a cloud she is where it was holding her, and arriving she is where it will be, so
      // there is no jump at either end.
      const away = life.drop(r.from) * (1 - smooth(r.t / 0.14));
      const home = life.drop(r.to) * smooth((r.t - (arc.seconds - 0.14)) / 0.14);
      cast.set(
        i,
        {
          x: r.x,
          y: r.y + away + home,
          mode: 'air',
          face: r.facing,
          // Nose up on the way up and down on the way down, or right over in a long leap.
          pitch: r.far ? 0 : clamp(-r.vy / 650, -0.4, 0.4),
          spin: r.far ? TAU * smooth(r.t / arc.seconds) : 0,
        },
        dt,
      );
    }
  }

  /**
   * The camera follows her, and looks where she is going as well as where she is, so what she leaps
   * to is in view before she is there.
   */
  private followLeader(dt: number): void {
    const lead = this.climb.leader;
    const hopping = lead.mode === 'hop';
    this.cam.x = damp(this.cam.x, this.focusX(hopping ? lerp(lead.x, lead.to.x, 0.4) : lead.x), 4.2, dt);
    this.cam.y = damp(this.cam.y, this.focusY(hopping ? lead.to.y : lead.y), 3.1, dt);
    this.cam.zoom = damp(this.cam.zoom, 1, 2, dt);
  }

  protected finale(): void {
    // It may be asked for in the middle of a leap. She finishes her leap, and then she goes.
    this.pendingFinale = true;
    this.climb.aim = null;
    this.climb.release();
    this.pointer = null;
    this.env.sound.fx('swell', { size: 1 });
  }

  /** She is standing: the flight up through the sky begins. */
  private openFlight(): void {
    this.pendingFinale = false;
    const lead = this.climb.leader;
    const start = this.climb.riders.map((r) => ({ x: r.x, y: r.y }));
    this.flight = new Flight(
      this.world,
      { x: lead.x, y: lead.y, row: lead.to.row },
      start,
      this.cam,
      this.craft,
      this.show,
      this.life,
      this.cast,
      this.env.calm,
    );
    this.env.sound.fx('whistle', { gain: 0.6 });
  }

  private fly(flight: Flight, dt: number): void {
    flight.step(dt);
    flight.dress(dt, this.climb.riders);
    flight.frame(this.cam, (x) => this.focusX(x));
    if (flight.arrived) this.enterMoon(flight);
  }

  /**
   * She has gone through the door. It has opened until it is all there is, and now it fades, and
   * under it is the moon, and they come out of it and float down.
   */
  private enterMoon(flight: Flight): void {
    const riders = this.climb.riders;
    const door = flight.ascent.portal;
    const { w, h } = this.view;
    const starts = riders.map((_, i) => {
      const at = this.cast.hooves(i);
      return { x: this.cam.screenX(at.x, w), y: this.cam.screenY(at.y, h) };
    });
    this.cover = {
      x: this.cam.screenX(door.x, w),
      y: this.cam.screenY(door.y, h),
      r: (Math.hypot(w, h) * 0.8) / this.cam.zoom,
    };
    this.veil = 1;
    // Those who came with her, and those who were already there.
    const ids = [...riders.map((r) => r.id), ...this.friends.filter((f) => !this.climb.joined.has(f))];
    this.flight = null;
    this.fx.clear();
    this.moon = new Moon(this.garden, this.cast, ids, starts, this.view, this.craft, this.show, this.env.calm);
    this.arrangeCamera();
    this.cam.x = 0;
    this.cam.y = 0;
    this.cam.zoom = 1;
    const lead = starts[0]!;
    this.show.arrive(lead.x, lead.y);
    this.moon.dress(0);
  }

  private linger(moon: Moon, dt: number): void {
    const over = moon.step(dt, this.phase === 'finale', this.idle);
    moon.dress(dt);
    if (over) this.endFinale();
  }

  protected paintBack(p: Painter): void {
    if (this.moon) this.moon.paintSky(p, this.beat());
    else this.heavens.paintSky(p, this.cam);
  }

  protected override paintWorld(p: Painter): void {
    if (this.moon) {
      this.moon.paintGround(p, this.beat());
      // What is left of the door lies over the moon, and the herd is in front of it.
      if (this.cover) paintCover(p.ctx, this.vista, this.cover.x, this.cover.y, this.cover.r, smooth(this.veil));
      this.moon.paintHerd(p, this.env.bank);
      this.moon.paintFront(p, this.beat());
      return;
    }
    const bounds = this.cam.window(this.view.w, this.view.h, 150, this.bounds);
    this.heavens.meadowBack(p, this.cam);
    this.life.paintMushroom(p.ctx);
    this.heavens.meadowFront(p, this.cam);
    this.life.paint(p, this.cam, bounds, this.beat(), this.flight?.open ?? 0);
    this.flight?.paintRibbon(p.ctx, p.light, p.t);
    this.paintHerd(p.ctx);
    this.flight?.paintCharge(p.light);
  }

  /**
   * The friends in a line, the one who joined last farthest back, and the one who leads in front of
   * them all. They are bigger in the flight, when it is theirs.
   */
  private paintHerd(g: CanvasRenderingContext2D): void {
    const riders = this.climb.riders;
    const grow = lerp(1, HERO, this.flight?.hero ?? 0);
    for (let i = riders.length - 1; i >= 1; i--)
      this.cast.draw(g, this.env.bank, i, riders[i]!.id, SCALE.friend * grow);
    this.cast.draw(g, this.env.bank, 0, riders[0]!.id, SCALE.leader * grow);
  }

  protected paintFront(p: Painter): void {
    const g = p.ctx;
    if (!this.moon) this.heavens.paintFront(p, this.flight ? this.flight.speed : Math.abs(this.climb.leader.vy) * 0.5);
    for (const r of this.ripples) paintRipple(g, r.x, r.y, r.age);
  }
}
