import type { UnicornId } from '../../../shared/ids';
import type { SpriteBank } from '../../engine/bank';
import type { Cast } from '../../engine/cast';
import { COLORS, lighten, RAINBOW, type RGB } from '../../engine/color';
import { clamp, lerp } from '../../engine/ease';
import type { Painter, View } from '../../engine/painter';
import { scaleNote } from '../../music';
import type { Garden } from './garden';
import { glideAt, glideSeconds, glideSpeed } from './glide';
import { SCALE } from './scale';
import type { Craft, Show } from './show';

/**
 * Where the climb ends: a garden on the moon under a black sky with the world hanging in it. The
 * herd comes out of the door in an arc and floats down into it, softly, the way things fall on the
 * moon, and where the leader lands the flowers of light come up out of the ground in a wave. Stars
 * fall, a rainbow of moonlight is drawn across behind them, and each of them in turn leaps for joy,
 * slowly and high. After that it is hers to play in: a touch on a unicorn makes her leap, a touch
 * on the ground brings up a flower, and a touch on the sky makes a wish. Everything is in the units
 * of the screen, because there is no camera here.
 */

/**
 * How hard the moon pulls, in units a second a second. On the climb a leap is pulled at about ten
 * times this.
 */
const GRAVITY = 150;
/**
 * How far above where she leaves the door at least she goes, and how high above where she lands the
 * top of her arc is at least.
 */
const RISE_MIN = 70;
const ARC_MIN = 150;
/** How much later each friend leaves the door than the one before, in seconds. */
const LEAVE_EVERY = 0.12;
/**
 * How long one leap lasts on the moon, in seconds, and how high the leader's goes, in units. Her
 * friends go three quarters as high.
 */
const HOP_SECONDS = 1.35;
const HOP_HEIGHT = 92;
/** When the parts of the finale happen, in seconds after the leader has landed. */
const SHOWER_FROM = 0.9;
const SHOWER_TO = 4.3;
const ARCH_AT = 1.2;
const CHEER_FROM = 2.4;
const CHEER_EVERY = 0.5;
const FINALE_ENDS = 6.4;
/**
 * How long after the leader lands a friend who did not come up with her arrives, and how long after
 * the one before.
 */
const LATE_AT = 1.2;
const LATE_EVERY = 0.5;

/**
 * How one of them goes from the door to the ground: where from, where to, how long it takes, and
 * when she starts.
 */
interface Arc {
  readonly x: number;
  readonly y: number;
  readonly seconds: number;
  readonly delay: number;
}

export class Moon {
  private clock = 0;
  private landed = false;
  private arch = 0;
  private archWanted = false;
  private showerIn = 0;
  private cheerAt = CHEER_FROM;
  private trailDebt = 0;
  private cheers = 0;
  private wishIn = 4;
  private debt = 0;
  private view: View;
  /** When each began her leap, on this object's clock, or below 0 if she is not leaping. */
  private readonly leapt: number[];
  /**
   * When each is down, on this object's clock. Those who were already there did not come through
   * the door, and arrive when it says.
   */
  private readonly lands: number[];
  private readonly down: boolean[];
  /** The way down for each of those who came through the door. */
  private readonly arcs: Arc[] = [];
  private readonly came: number;

  constructor(
    private readonly garden: Garden,
    private readonly cast: Cast,
    /**
     * Who is there: those who came up with her, the leader first, and then those who were already
     * there.
     */
    private readonly ids: readonly UnicornId[],
    /** Where on the screen the hooves of each of those who came up with her are, at the door. */
    starts: readonly { readonly x: number; readonly y: number }[],
    view: View,
    private readonly craft: Craft,
    private readonly show: Show,
    private readonly calm: boolean,
  ) {
    this.view = view;
    this.came = starts.length;
    this.leapt = ids.map(() => -1);
    this.down = ids.map(() => false);
    this.lands = [];
    for (const [i, from] of starts.entries()) {
      const to = this.home(i);
      // She goes up a little, and over, and down, and the top of it is high enough over where she
      // lands for it to be a fall worth watching.
      const top = Math.min(from.y - RISE_MIN, to.y - ARC_MIN - (i % 3) * 14);
      const seconds = glideSeconds(from.y, to.y, top, GRAVITY);
      const arc = { x: from.x, y: from.y, seconds, delay: i * LEAVE_EVERY };
      this.arcs.push(arc);
      this.lands.push(arc.delay + seconds);
    }
    for (let i = this.came; i < ids.length; i++)
      this.lands.push(this.lands[0]! + LATE_AT + (i - this.came) * LATE_EVERY);
    garden.reset();
  }

  arrange(view: View): void {
    this.view = view;
  }

  /** Whether the one who is `i`th is on the moon, on her feet. */
  private there(i: number): boolean {
    return this.down[i]!;
  }

  /**
   * Where the one who is `i`th stands: the leader in the middle, and the friends to either side, a
   * little further back the further out they are.
   */
  home(i: number): { x: number; y: number } {
    const { w } = this.view;
    const rank = Math.ceil(i / 2);
    const ranks = Math.max(1, Math.ceil((this.ids.length - 1) / 2));
    const gap = clamp((w * 0.5 - 56) / ranks, 36, 108);
    const side = i % 2 === 1 ? -1 : 1;
    return { x: i === 0 ? w / 2 : w / 2 + side * gap * rank, y: this.garden.groundY - rank * 6 };
  }

  /**
   * The moon is one step older. Returns whether the finale is over, which is when she is free to
   * play.
   */
  step(dt: number, finale: boolean, idle: number): boolean {
    const { garden, craft } = this;
    const { rng } = craft;
    this.clock += dt;
    this.touchdowns();
    // The seconds since the leader landed, which is when the garden begins.
    const m = this.clock - this.lands[0]!;
    this.sparkle(dt);
    for (const f of garden.update(dt)) this.bloom(f.x, f.y, f.step, f.tone, finale);
    let over = false;
    if (finale) {
      if (m > SHOWER_FROM && m < SHOWER_TO) this.shower(dt);
      if (m > ARCH_AT && !this.archWanted) {
        this.archWanted = true;
        craft.sound.fx('twinkle', { size: 1, gain: 0.7 });
        for (const [i, n] of [0, 4, 7, 9, 12].entries())
          craft.sound.note('harp', scaleNote(55, n), { delay: i * 0.1, gain: 0.7 });
      }
      if (m > this.cheerAt) {
        this.cheerAt = m + CHEER_EVERY;
        this.leap(this.cheers++ % this.ids.length, true);
      }
      over = m > FINALE_ENDS;
    } else {
      this.archWanted = true;
      this.wishIn -= dt;
      if (this.wishIn <= 0 && idle > 3) {
        this.wishIn = rng.range(4, 8);
        this.shootingStar();
      }
    }
    if (this.archWanted) this.arch = Math.min(1, this.arch + dt * 0.42);
    this.lanterns(dt);
    for (let i = 0; i < this.ids.length; i++)
      if (this.leapt[i]! >= 0 && this.clock - this.leapt[i]! > HOP_SECONDS) this.leapt[i] = -1;
    return over;
  }

  /**
   * Whoever has come down this moment lands, with a puff of moon dust and a note. The leader's
   * landing is the garden's beginning.
   */
  private touchdowns(): void {
    const { fx, rng, sound, pan, feel } = this.craft;
    for (let i = 0; i < this.ids.length; i++) {
      if (this.down[i] || this.clock < this.lands[i]!) continue;
      this.down[i] = true;
      const at = this.home(i);
      const fell = i < this.came;
      this.cast.kick(i, fell ? -5 : 5);
      if (!fell) this.cast.cheer(i);
      sound.note(this.craft.palette.voice, scaleNote(55, [0, 2, 4, 5, 7, 9][i % 6]!), { gain: 0.8, pan: pan(at.x) });
      sound.fx(fell ? 'thud' : 'twinkle', { size: 0.4, gain: fell ? 0.3 : 0.6, pan: pan(at.x) });
      for (let k = 0; k < fx.count(fell ? 9 : 14); k++) {
        const side = k % 2 === 0 ? -1 : 1;
        if (fell)
          fx.emit({
            x: at.x + side * rng.range(2, 22),
            y: at.y - 2,
            vx: side * rng.range(14, 70),
            vy: -rng.range(4, 26),
            life: rng.range(0.7, 1.1),
            size: rng.range(12, 20),
            size1: 4,
            color: [226, 220, 250],
            alpha: 0.75,
            shape: 'dot',
            drag: 2.2,
            hold: 0.1,
          });
        else
          fx.emit({
            x: at.x,
            y: at.y - 40,
            vx: Math.cos((k / 14) * Math.PI * 2) * rng.range(60, 150),
            vy: Math.sin((k / 14) * Math.PI * 2) * rng.range(60, 150) - 30,
            life: rng.range(0.7, 1.2),
            size: rng.range(9, 14),
            size1: 1.5,
            color: lighten(COLORS.gold, 0.5),
            color1: COLORS.gold,
            shape: 'star4',
            drag: 2,
            twinkle: 9,
          });
      }
      for (let k = 0; k < fx.count(fell ? 3 : 6); k++) {
        fx.emit({
          x: at.x + rng.range(-20, 20),
          y: at.y - 50,
          vx: rng.range(-30, 30),
          vy: -rng.range(30, 80),
          life: rng.range(1, 1.6),
          size: rng.range(24, 34),
          size1: 16,
          color: k % 2 === 0 ? [255, 108, 160] : [255, 150, 196],
          alpha: 0.95,
          shape: 'heart',
          drag: 0.8,
          sway: 16,
          hold: 0.45,
        });
      }
      if (i === 0) {
        this.landed = true;
        this.garden.bloomFrom(at.x);
        sound.fx('swell', { size: 0.8, gain: 0.7 });
        feel.shake(1.6);
        feel.flash(0.08, COLORS.gold);
      }
    }
  }

  /** Light that follows each of them through the air. */
  private sparkle(dt: number): void {
    this.trailDebt += dt * (this.calm ? 18 : 34);
    while (this.trailDebt >= 1) {
      this.trailDebt -= 1;
      for (let i = 0; i < this.came; i++) {
        if (this.down[i] || this.clock < this.arcs[i]!.delay) continue;
        const at = this.cast.hooves(i);
        const c = RAINBOW[Math.floor(this.craft.rng.next() * 7)]!;
        this.show.trail(at.x + this.craft.rng.range(-10, 10), at.y - 36, c, 10);
      }
    }
  }

  /** A flower comes up: a note for it, and a few sparks. */
  private bloom(x: number, y: number, step: number, tone: RGB, finale: boolean): void {
    const { fx, rng, sound, pan } = this.craft;
    if (!finale || rng.next() < 0.45)
      sound.note('glass', scaleNote(60, step), { pan: pan(x), gain: 0.45, delay: rng.range(0, 0.04) });
    for (let i = 0; i < fx.count(5); i++) {
      const a = -Math.PI / 2 + rng.range(-1.2, 1.2);
      const sp = rng.range(30, 90);
      fx.emit({
        x,
        y: y - 14,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.5, 0.9),
        size: rng.range(7, 12),
        size1: 1.5,
        color: lighten(tone, 0.4),
        color1: tone,
        shape: i % 2 === 0 ? 'star4' : 'spark',
        drag: 2,
        twinkle: 8,
      });
    }
  }

  /** Stars that fall across the black sky, one after another. */
  private shower(dt: number): void {
    this.showerIn -= dt;
    if (this.showerIn > 0) return;
    this.showerIn = this.craft.rng.range(0.22, 0.4);
    this.shootingStar();
  }

  private shootingStar(): void {
    const { fx, rng, sound, palette, pan } = this.craft;
    const { w, h } = this.view;
    const x = rng.range(w * 0.25, w * 1.05);
    const y = rng.range(-10, h * 0.3);
    fx.emit({
      x,
      y,
      vx: -420,
      vy: 200,
      life: rng.range(0.9, 1.4),
      size: 10,
      size1: 3,
      color: [255, 255, 255],
      color1: palette.accents[rng.int(palette.accents.length)]!,
      shape: 'spark',
      tail: 0.3,
      halo: 3,
      twinkle: 6,
    });
    sound.fx('twinkle', { size: 0.3, gain: 0.3, pan: pan(x) });
  }

  /** Golden lights that rise slowly off the moon. */
  private lanterns(dt: number): void {
    const { fx, rng, palette } = this.craft;
    this.debt += dt * (this.calm ? 1.2 : 3);
    while (this.debt >= 1) {
      this.debt -= 1;
      fx.emit({
        x: rng.range(0, this.view.w),
        y: this.garden.groundY + rng.range(-10, 40),
        vy: -rng.range(10, 22),
        life: rng.range(4, 7),
        size: rng.range(6, 11),
        color: lighten(palette.accents[rng.int(palette.accents.length)]!, 0.4),
        shape: 'glow',
        alpha: 0.7,
        fadeIn: 0.8,
        twinkle: rng.range(0.6, 1.4),
        hold: 0.4,
        sway: 9,
      });
    }
  }

  /** A finger on the moon. */
  touch(x: number, y: number): void {
    const { craft, garden, show } = this;
    let nearest = -1;
    let best = 96 * 96;
    for (let i = 0; i < this.ids.length; i++) {
      if (!this.there(i)) continue;
      const home = this.home(i);
      const d = (home.x - x) ** 2 + (home.y - 50 - y) ** 2;
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    if (nearest >= 0) {
      this.leap(nearest, false);
      return;
    }
    if (this.landed && y > this.view.h * 0.66) {
      const f = garden.touch(x, y);
      if (f) {
        craft.sound.note('glass', scaleNote(60, f.step), { gain: 0.8, pan: craft.pan(f.x) });
        craft.sound.note('chime', scaleNote(72, f.step), { gain: 0.3, delay: 0.05 });
        this.bloom(f.x, f.y, f.step, f.tone, false);
        return;
      }
    }
    // The sky: a wish. A star falls from where the finger touched.
    const step = Math.min(9, Math.floor((x / this.view.w) * 10));
    craft.sound.note('bell', scaleNote(67, step), { gain: 0.75, pan: craft.pan(x) });
    show.answer(x, y, step);
    craft.fx.emit({
      x,
      y,
      vx: -260,
      vy: 130,
      life: 0.9,
      size: 10,
      size1: 3,
      color: [255, 255, 255],
      color1: COLORS.gold,
      shape: 'spark',
      tail: 0.3,
      halo: 3,
      twinkle: 6,
    });
  }

  /** One of them leaps, high and slow. */
  private leap(i: number, loud: boolean): void {
    if (!this.there(i)) return;
    if (this.leapt[i]! >= 0 && this.clock - this.leapt[i]! < HOP_SECONDS * 0.7) return;
    const { fx, rng, sound, palette, pan } = this.craft;
    this.leapt[i] = this.clock;
    this.cast.cheer(i);
    this.cast.kick(i, 4);
    const home = this.home(i);
    const step = Math.min(9, Math.floor((home.x / this.view.w) * 10));
    sound.fx('boing', { pitch: 4 + step * 0.4, size: 0.6, gain: 0.5, pan: pan(home.x) });
    sound.note(palette.voice, scaleNote(60, step), { gain: loud ? 0.8 : 0.9, pan: pan(home.x), delay: 0.05 });
    for (let k = 0; k < fx.count(6); k++) {
      const side = k % 2 === 0 ? -1 : 1;
      fx.emit({
        x: home.x + side * rng.range(2, 20),
        y: home.y,
        vx: side * rng.range(14, 50),
        vy: -rng.range(4, 24),
        life: rng.range(0.6, 1),
        size: rng.range(10, 16),
        size1: 3,
        color: [226, 220, 250],
        alpha: 0.7,
        shape: 'dot',
        drag: 2.2,
        hold: 0.1,
      });
    }
    for (let k = 0; k < fx.count(5); k++) {
      fx.emit({
        x: home.x + rng.range(-16, 16),
        y: home.y - 44,
        vx: rng.range(-24, 24),
        vy: -rng.range(30, 70),
        life: rng.range(1, 1.5),
        size: rng.range(24, 32),
        size1: 16,
        color: k % 2 === 0 ? [255, 108, 160] : [255, 150, 196],
        alpha: 0.95,
        shape: 'heart',
        drag: 0.8,
        sway: 16,
        hold: 0.45,
      });
    }
  }

  /** How everyone looks: coming down, standing, in the middle of a leap, or cheering. */
  dress(dt: number): void {
    const m = this.clock;
    for (let i = 0; i < this.ids.length; i++) {
      const home = this.home(i);
      // Those who were already here are nowhere until they are, and then they are.
      if (i >= this.came && !this.down[i]) continue;
      if (!this.down[i]) {
        // Out of the door, over, and down: the pull is so slight that it takes a long time. Her
        // nose is up on the way up and down on the way down.
        const arc = this.arcs[i]!;
        const t = clamp(m - arc.delay, 0, arc.seconds);
        const u = t / arc.seconds;
        const fall = glideSpeed(arc.y, home.y, arc.seconds, GRAVITY, t);
        this.cast.set(
          i,
          {
            x: lerp(arc.x, home.x, u),
            y: glideAt(arc.y, home.y, arc.seconds, GRAVITY, t),
            mode: 'air',
            face: 1,
            pitch: clamp(-fall / 420, -0.5, 0.55),
          },
          dt,
        );
        continue;
      }
      const since = this.leapt[i]! >= 0 ? m - this.leapt[i]! : -1;
      const height = i === 0 ? HOP_HEIGHT : HOP_HEIGHT * 0.78;
      let lift = 0;
      let squash = 0;
      let mode: 'air' | 'cheer' | 'idle' | 'sign' = 'idle';
      let clock = m + i * 0.7;
      if (since >= 0) {
        const u = since / HOP_SECONDS;
        lift = 4 * height * u * (1 - u);
        squash = 0.16 * Math.abs(1 - 2 * u) ** 1.6;
        mode = 'air';
      } else if (this.cast.sinceCheer(i) < 1.1) {
        mode = 'cheer';
        clock = this.cast.sinceCheer(i);
      } else if (i === 0 && m > this.lands[0]! + 9) {
        mode = 'sign';
      }
      this.cast.set(i, { x: home.x, y: home.y - lift, mode, face: 1, clock, stretch: squash }, dt);
    }
  }

  paintSky(p: Painter, beat: number): void {
    this.garden.paintSky(p.ctx, p.light, p.t, p.calm, this.arch, beat);
  }

  /** The ground and the flowers behind the herd. */
  paintGround(p: Painter, beat: number): void {
    this.garden.paintGround(p.ctx, p.t, beat);
  }

  /** The flowers in front of the herd. */
  paintFront(p: Painter, beat: number): void {
    this.garden.paintFront(p.ctx, p.t, beat);
  }

  /** The herd, standing in the flowers. */
  paintHerd(p: Painter, bank: SpriteBank | null): void {
    // The ones further back are drawn first, so that the ones in front hide their hooves. The
    // leader is always in front.
    const order = this.ids.map((_, i) => i).filter((i) => i < this.came || this.there(i));
    order.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : this.home(a).y - this.home(b).y));
    for (const i of order) this.cast.draw(p.ctx, bank, i, this.ids[i]!, i === 0 ? SCALE.moonLeader : SCALE.moonFriend);
  }
}
