import type { UnicornId } from '../../../shared/ids';
import { drawPic, type Pic, type SpriteBank } from '../../engine/bank';
import type { Bounds, Camera } from '../../engine/camera';
import { COLORS } from '../../engine/color';
import { clamp, Spring, smooth, TAU, unlerp } from '../../engine/ease';
import { starImage } from '../../engine/gems';
import { drawRider, FEET, newLook } from '../../engine/herd';
import { glowAt } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { type Climb, standAt } from './climb';
import { type CloudArt, type Face, paintArch, paintCap, paintFace, paintZs, STAND, stampCloud, W0 } from './clouds';
import { MUSHROOM } from './heavens';
import type { Palette } from './palette';
import { SCALE } from './scale';
import { paintCall, paintPickup, paintPortal } from './things';
import type { Cloud, World } from './world';

/**
 * What the clouds are doing, and how they are drawn: each is pushed down when she lands on it and
 * springs back, wears a face that grows happier when she has been there, and some are asleep until
 * she comes. Along with them live the things that hang in the sky (the door to the moon, the stars,
 * a friend who waits) and the mushroom she began on.
 */

/**
 * What a cloud's face is doing: how happy it is, how much it is laughing, and when it was woken if
 * it was asleep.
 */
export interface Mood {
  joy: number;
  giggle: number;
  /** On this object's clock, or below 0 if it has not been woken. */
  woke: number;
}

/** How long a woken sleeper's nightcap takes to fly off, in seconds. */
const CAP_SECONDS = 1.2;
/** How near the leader has to be before a friend who waits begins to call her, in units. */
const CALL_RANGE = 300;

export class Life {
  private readonly dips = new Map<number, Spring>();
  private readonly moods = new Map<number, Mood>();
  private readonly gem = starImage(COLORS.gold);
  private readonly mushroomName: string;
  private clock = 0;
  private bounced = -9;
  private restAy = 0;

  constructor(
    private readonly world: World,
    private readonly climb: Climb,
    private readonly art: CloudArt,
    private readonly palette: Palette,
    /** The moon as seen through the door at the top. */
    private readonly vista: HTMLCanvasElement,
    private readonly bank: SpriteBank | null,
    look: string,
    private readonly calm: boolean,
  ) {
    this.mushroomName = `pg-mushroom-${look}`;
  }

  /** The clock the clouds keep their own time by, which a game that draws on them reads. */
  get time(): number {
    return this.clock;
  }

  step(dt: number): void {
    this.clock += dt;
    for (const [id, s] of this.dips) {
      s.step(dt);
      if (Math.abs(s.x) < 0.02 && Math.abs(s.v) < 0.05) this.dips.delete(id);
    }
    for (const m of this.moods.values()) {
      m.giggle = Math.max(0, m.giggle - dt * 0.8);
      // A cloud she has been on keeps a happy face.
      m.joy = Math.max(m.joy > 0 ? 0.6 : 0, m.joy - dt * 0.5);
    }
  }

  /** Pushes a cloud down. The mushroom is a toy of its own and bounces. */
  press(cloud: Cloud, kick: number): void {
    if (cloud.kind === 'mushroom') {
      this.bounced = this.clock;
      return;
    }
    let s = this.dips.get(cloud.id);
    if (!s) {
      const jelly = cloud.kind === 'jelly';
      s = new Spring(0, 0, jelly ? 110 : 190, jelly ? 4.2 : 12);
      this.dips.set(cloud.id, s);
    }
    s.kick(cloud.kind === 'jelly' ? kick * 1.8 : kick);
  }

  private moodOf(cloud: Cloud): Mood {
    let m = this.moods.get(cloud.id);
    if (!m) {
      m = { joy: 0, giggle: 0, woke: -1 };
      this.moods.set(cloud.id, m);
    }
    return m;
  }

  /** The cloud is happy and laughs. Returns whether it was asleep, and so is awake now. */
  delight(cloud: Cloud): boolean {
    const mood = this.moodOf(cloud);
    mood.joy = 1;
    mood.giggle = 1;
    if (cloud.kind !== 'sleepy' || mood.woke >= 0) return false;
    mood.woke = this.clock;
    return true;
  }

  /**
   * How far the line she stands on is below where the cloud is, from its slow bob and from being
   * landed on.
   */
  drop(cloud: Cloud): number {
    if (cloud.kind === 'mushroom') return this.mushroomDrop();
    const bob = Math.sin(this.clock * 1.15 + cloud.phase * TAU) * (this.calm ? 0.8 : 2.2);
    return bob + (this.dips.get(cloud.id)?.x ?? 0);
  }

  /**
   * The mushroom's picture now, which squashes when she leaves it and when she comes back to it.
   */
  private mushroomPic(): Pic | null {
    return this.bank?.sprite('playground', this.mushroomName, this.clock - this.bounced) ?? null;
  }

  /** How far the top of the cap is below where it is at rest, in the world. */
  private mushroomDrop(): number {
    const pic = this.mushroomPic();
    if (!pic) return 0;
    // Its last picture is the one at rest.
    if (this.restAy === 0) this.restAy = this.bank?.sprite('playground', this.mushroomName, 99)?.ay ?? pic.ay;
    return (this.restAy - pic.ay) * MUSHROOM;
  }

  /**
   * Where the foot of the mushroom is below its cap, in the world, so that the cap is where she
   * stands.
   */
  private mushroomFoot(): number {
    return (this.restAy || this.bank?.sprite('playground', this.mushroomName, 99)?.ay || 70) * MUSHROOM - 3;
  }

  /** The mushroom she begins on, in the playground's own picture, with its foot on the meadow. */
  paintMushroom(g: CanvasRenderingContext2D): void {
    const pic = this.mushroomPic();
    if (!pic) return;
    const m = this.world.mushroom;
    drawPic(g, pic, m.x, m.y + this.mushroomFoot(), { scale: MUSHROOM });
  }

  /**
   * Every cloud that can be seen, the stars between them, and the friends who wait. `open` is how
   * wide the door at the top has opened, 0 to 1.
   */
  paint(p: Painter, cam: Camera, bounds: Bounds, beat: number, open: number): void {
    const g = p.ctx;
    const light = p.light;
    const [r0, r1] = this.world.rowsIn(bounds.top, bounds.bottom);
    const near = clamp(this.world.altitude(cam.y) * 3 - 2);
    // Wide enough, from where she is, to cover the whole screen.
    const reach = (Math.hypot(p.w, p.h) * 0.8) / cam.zoom;
    for (let r = r0; r <= r1; r++) {
      for (const c of this.world.row(r)) {
        if (c.kind === 'gate') this.paintGate(g, light, c, p.t, beat, near, open, reach);
        else if (c.kind !== 'mushroom') this.paintCloud(g, light, c, p.t, beat);
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (const s of this.world.starsOf(r)) {
        if (this.climb.taken.has(s.id) || s.x < bounds.left || s.x > bounds.right) continue;
        paintPickup(g, light, this.gem, s.x, s.y, p.t, s.id);
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (const c of this.world.row(r)) {
        if (c.kind === 'friend' && c.friend && !this.climb.joined.has(c.friend))
          this.paintWaiting(g, light, c, c.friend, p.t, beat);
      }
    }
  }

  private paintCloud(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    c: Cloud,
    t: number,
    beat: number,
  ): void {
    const image = this.art.of(c);
    if (!image) return;
    const s = c.width / W0;
    const line = c.y + this.drop(c);
    const dip = this.dips.get(c.id)?.x ?? 0;
    // A cloud that is landed on is pressed flatter and wider. The line she stands on is held, so
    // she does not sink into it.
    const squash = clamp(dip * 0.0062, -0.14, 0.2) * (c.kind === 'jelly' ? 1.4 : 1);
    const sx = 1 + squash * 0.5;
    const sy = 1 - squash;
    const mood = this.moods.get(c.id);
    if (c.kind === 'rainbow') {
      const happy = clamp((mood?.joy ?? 0) + (this.climb.visited.has(c.id) ? 0.4 : 0));
      paintArch(g, light, c.x, line - 6, c.width, t, 0.35 + 0.65 * happy);
    }
    stampCloud(g, image, c.x, line, c.width, sx, sy);
    const asleep = c.kind === 'sleepy' && (!mood || mood.woke < 0);
    const face: Face = { joy: mood?.joy ?? 0, asleep, giggle: mood?.giggle ?? 0, time: t };
    g.save();
    g.translate(c.x, line);
    g.scale(sx, sy);
    paintFace(g, 0, -STAND * s, s, face);
    if (asleep) {
      paintCap(g, -c.width * 0.29, 16 * s - STAND * s, s * 0.9, 0.5);
      paintZs(g, c.width * 0.2, -STAND * s + 6 * s, s, t + c.phase * 5);
    } else if (c.kind === 'sleepy' && mood && this.clock - mood.woke < CAP_SECONDS) {
      // The nightcap flies up into the air as the cloud wakes.
      const u = (this.clock - mood.woke) / CAP_SECONDS;
      g.globalAlpha = 1 - smooth(unlerp(0.6, 1, u));
      paintCap(g, -c.width * 0.29 - u * 36 * s, (16 - STAND) * s - (u * 160 - u * u * 200) * s, s * 0.9, 0.5 + u * 5);
      g.globalAlpha = 1;
    }
    g.restore();
    this.paintGlow(light, c, line, s, t, beat);
  }

  /** The light each special kind of cloud gives off, which pulses with the music. */
  private paintGlow(light: CanvasRenderingContext2D, c: Cloud, line: number, s: number, t: number, beat: number): void {
    const cy = line + 24 * s;
    switch (c.kind) {
      case 'heart':
        glowAt(light, c.x, cy, 150 * s, [255, 130, 180], 0.2 + 0.14 * beat);
        break;
      case 'star':
        glowAt(light, c.x, cy, 160 * s, COLORS.gold, 0.22 + 0.12 * beat);
        for (let i = 0; i < 3; i++) {
          const a = t * 0.8 + i * 2.1 + c.phase * 6;
          glowAt(
            light,
            c.x + Math.cos(a) * c.width * 0.42,
            line + 6 + Math.sin(a * 1.3) * 12,
            13,
            [255, 244, 190],
            0.7 * (0.5 + 0.5 * Math.sin(t * 5 + i)),
            'spark',
          );
        }
        break;
      case 'music':
        glowAt(light, c.x, cy, 150 * s, [255, 216, 120], 0.18 + 0.12 * beat);
        break;
      case 'jelly':
        glowAt(light, c.x, cy, 140 * s, [200, 160, 255], 0.14 + 0.08 * beat);
        break;
      case 'rainbow':
        glowAt(light, c.x, cy, 160 * s, [255, 244, 230], 0.12 + 0.08 * beat);
        break;
      default:
        break;
    }
  }

  /**
   * The door at the top, above a bank of cloud. `near` is how close the camera is to it, which
   * opens it a little wider, and `open` is how far it has opened wide.
   */
  private paintGate(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    c: Cloud,
    t: number,
    beat: number,
    near: number,
    open: number,
    reach: number,
  ): void {
    const image = this.art.of({ ...c, kind: 'plain', drawing: 0 });
    // The bank of cloud is in front of the door, so the door comes out from behind it. Once it is
    // wide open it is in front of everything.
    if (open <= 0) {
      paintPortal(g, light, this.vista, c.x, c.y, t, near, 0, reach, beat, this.palette.moon, this.calm);
      this.paintBank(g, c, image, t);
      return;
    }
    this.paintBank(g, c, image, t);
    paintPortal(g, light, this.vista, c.x, c.y, t, near, open, reach, beat, this.palette.moon, this.calm);
  }

  private paintBank(g: CanvasRenderingContext2D, c: Cloud, image: HTMLCanvasElement | null, t: number): void {
    if (!image) return;
    stampCloud(g, image, c.x - 70, c.y + 6, 200);
    stampCloud(g, image, c.x + 70, c.y + 6, 200);
    stampCloud(g, image, c.x, c.y, c.width);
    paintFace(g, c.x, c.y - STAND * (c.width / W0), c.width / W0, {
      joy: 1,
      asleep: false,
      giggle: this.moods.get(c.id)?.giggle ?? 0,
      time: t,
    });
  }

  /**
   * A friend who waits on a cloud, facing the way the leader will come from, with a heart over her.
   * Near, she does her own special move.
   */
  private paintWaiting(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    c: Cloud,
    id: UnicornId,
    t: number,
    beat: number,
  ): void {
    const lead = this.climb.leader;
    const look = newLook();
    // She stands where she will stand once she has joined, so that finding her is not a jump.
    look.x = standAt(this.climb.riders.length, c, 0);
    look.y = c.y + this.drop(c) - FEET;
    look.mode = Math.abs(lead.x - c.x) < CALL_RANGE && Math.abs(lead.y - c.y) < CALL_RANGE ? 'sign' : 'idle';
    look.clock = t + c.id * 0.37;
    look.sx = lead.x < look.x ? -1 : 1;
    drawRider(g, this.bank, id, look, SCALE.friend);
    paintCall(g, light, look.x, c.y - 98, t, beat);
  }
}
