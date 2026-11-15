import { UNICORN_DEFS } from '../../content/unicorns';
import { Rng } from '../../domain/rng';
import type { MagicKind, UnicornId } from '../../shared/ids';
import { Cinema } from '../cinema';
import { Cast } from '../engine/cast';
import { css, lighten, RAINBOW, type RGB } from '../engine/color';
import { clamp, damp, easeInOutCubic, easeOutCubic, lerp, Spring, TAU } from '../engine/ease';
import { glowAt, makeHills, prerender, Starfield, verticalGradient } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Quality } from '../engine/stage';
import { burstShell } from './sky/burst';
import { MAGIC } from './sky/looks';

/**
 * All the unicorns are together. When the last friend has been found, the picture opens on a meadow
 * at dusk with a rainbow drawing itself over the hills. The friends run in from the two sides and
 * stand in a row; then each one, from left to right, rears and casts, and her own magic goes up
 * into the sky as a firework of her own shape and colour, with a note higher than the last. When
 * all of them have, they cheer together, a great ring goes out from the middle, a volley of
 * fireworks fills the sky and confetti comes down, and then lanterns float up as it settles. There
 * is nothing to read in it and nothing to do: it is the party for a thing she has done, and it
 * plays with however many friends there are.
 */

const RUN_START = 0.35;
const RUN_STAGGER = 0.14;
const RUN_SECONDS = 1.5;
const CAST_START = 2.7;
const CAST_GAP = 0.62;
/** How long a shell takes to rise from a friend's horn to where it opens. */
const RISE = 0.42;
/** A rising run of notes, in semitones above C, that one friend after another climbs. */
const RUN_NOTES = [0, 2, 4, 7, 9, 12, 14, 16] as const;
const ROOT = 60;
/** The unicorns' height from hooves to horn at scale 1, in the pictures' own pixels. */
const HORN = 96;

interface Friend {
  readonly index: number;
  readonly id: UnicornId;
  /** Where her hooves stand and how big she is drawn. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** 1 faces right, which she is drawn as, and -1 turns her to face the middle. */
  readonly face: number;
  /** Which side she runs in from. */
  readonly from: -1 | 1;
  /** Her place in the line from the left, which is the order she casts in. */
  readonly rank: number;
  readonly enters: number;
  /** When she casts, on the scene's clock. */
  readonly casts: number;
}

/**
 * What a friend's own magic does at her horn, beside the firework: leaves, snow, bubbles, embers,
 * sparks of light.
 */
const SIGN: Readonly<
  Record<
    MagicKind,
    { shape: 'leaf' | 'flake' | 'bubble' | 'glow' | 'star4'; color: RGB; color1: RGB; rise: number; size: number }
  >
> = {
  light: { shape: 'star4', color: [255, 240, 170], color1: [255, 200, 90], rise: -60, size: 9 },
  nature: { shape: 'leaf', color: [150, 240, 140], color1: [70, 170, 90], rise: -36, size: 11 },
  ice: { shape: 'flake', color: [220, 250, 255], color1: [150, 220, 255], rise: -30, size: 10 },
  water: { shape: 'bubble', color: [170, 220, 255], color1: [110, 170, 255], rise: -70, size: 9 },
  fire: { shape: 'glow', color: [255, 190, 100], color1: [255, 90, 40], rise: -90, size: 8 },
  lightning: { shape: 'star4', color: [235, 220, 255], color1: [170, 140, 255], rise: -50, size: 10 },
};

export class FinderFinale extends Cinema {
  readonly id = 'finder-finale' as const;
  private readonly cast = new Cast();
  private friends: Friend[] = [];
  private sky: HTMLCanvasElement | null = null;
  private land: HTMLCanvasElement | null = null;
  private starry: Starfield | null = null;
  private artKey = '';
  private detail = true;
  /** How much of the rainbow is drawn, from 0 to 1, and how much of the dusk has turned to dawn. */
  private bow = 0;
  private bowFrom = -1;
  private dawn = 0;
  private together = false;
  private ring = new Spring(0, 0, 90, 8);
  private readonly hops: { y: number; v: number }[] = [];
  private castSeconds = 0.9;
  private lanternsUp = false;
  private confetti = 0;
  private burstY = 100;
  private radius = 90;

  override get bloom(): number {
    return this.env.calm ? 0.12 : 0.22;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.detail = level > 0;
    this.artKey = '';
  }

  /** What a measuring tool may look at, and never change. */
  inspect(): {
    readonly phase: string;
    readonly shown: number;
    readonly bow: number;
    readonly together: boolean;
    readonly friends: readonly {
      readonly id: UnicornId;
      readonly x: number;
      readonly y: number;
      readonly scale: number;
      readonly arrived: boolean;
      readonly cast: boolean;
    }[];
    readonly size: { readonly w: number; readonly h: number };
  } {
    const now = this.shown;
    return {
      phase: this.phase,
      shown: now,
      bow: this.bow,
      together: this.together,
      friends: this.friends.map((f) => ({
        id: f.id,
        x: this.at(f, now).x,
        y: f.y,
        scale: f.scale,
        arrived: now >= f.enters + RUN_SECONDS,
        cast: now >= f.casts,
      })),
      size: { w: this.view.w, h: this.view.h },
    };
  }

  private get allAt(): number {
    return CAST_START + Math.max(1, this.friends.length) * CAST_GAP + 0.5;
  }

  protected show(): void {
    const sound = this.env.sound;
    const bank = this.env.bank;
    const lead = this.friends[0];
    if (bank && lead) this.castSeconds = bank.clipSeconds(lead.id, 'cast', 'east');
    this.cue(0.05, () => sound.fx('swell', { gain: 0.55, size: 0.5 }));
    this.cue(RUN_START, () => {
      this.bowFrom = this.shown;
      for (const step of [0, 4, 7]) sound.note('pad', ROOT - 12 + step, { gain: 0.45, seconds: 3.2 });
    });
    // They run in, and each stamps her feet as she gets there.
    this.friends.forEach((first, i) => {
      this.cue(first.enters + RUN_SECONDS - 0.05, () => this.friends[i] && this.arrive(this.friends[i]!));
      const release = bank ? bank.releaseSeconds(first.id, 'cast', 'east') : 0.45;
      this.cue(first.casts, () => {
        const f = this.friends[i];
        if (!f) return;
        this.cast.cheer(f.index);
        this.cast.kick(f.index, 5);
        this.sign(f);
        const horn = this.horn(f);
        sound.fx('launch', { gain: 0.5, pan: this.pan(f.x) });
        this.comet(f, horn.x, horn.y, release);
      });
      this.cue(first.casts + release + RISE, () => this.friends[i] && this.open(this.friends[i]!));
    });
    const all = this.allAt;
    this.cue(all, () => this.allTogether());
    this.cue(all + 0.15, () => this.volley());
    this.cue(all + 1.2, () => (this.lanternsUp = true));
    this.cue(all + 4.4, () => this.endFinale());
  }

  private arrive(f: Friend): void {
    this.env.sound.fx('thud', { gain: 0.16, pan: this.pan(f.x) });
    this.cast.kick(f.index, -4);
    for (let i = 0; i < this.fx.count(5); i++) {
      this.fx.emit({
        x: f.x + (i % 2 ? 1 : -1) * 14 * f.scale,
        y: f.y - 3,
        vx: this.env.rng.range(-40, 40),
        vy: -this.env.rng.range(12, 40),
        life: 0.6,
        size: 12 * f.scale,
        size1: 3,
        color: [255, 214, 170],
        alpha: 0.4,
        drag: 3,
      });
    }
  }

  /** Where a friend's horn is now, on the screen. */
  private horn(f: Friend): { x: number; y: number } {
    const anchor = this.env.bank?.unicorn(f.id, 'cast', 'east', 0.3)?.anchors.horn;
    if (anchor) return { x: f.x + anchor[0] * f.scale * f.face, y: f.y + anchor[1] * f.scale };
    return { x: f.x + 26 * f.scale * f.face, y: f.y - HORN * f.scale };
  }

  /** The light of her magic going up from her horn to where it will open. */
  private comet(f: Friend, x: number, y: number, release: number): void {
    const magic = MAGIC[f.id];
    const rise = RISE;
    const to = this.skyY(f);
    const color = magic.scheme.flash;
    this.fx.emit({
      x,
      y,
      vx: (f.x - x) / rise,
      vy: (to - y) / rise,
      life: rise,
      delay: release,
      size: 9,
      size1: 5,
      color,
      color1: lighten(color, 0.4),
      shape: 'spark',
      tail: 0.22,
      halo: 3,
      trail: 0.03,
      hold: 1,
      drag: 0,
    });
  }

  private skyY(f: Friend): number {
    return this.burstY + (f.rank % 2 === 0 ? 0 : this.radius * 0.28);
  }

  /**
   * Her firework opens: her own shape and colours, with a note of the climbing run and the boom of
   * it.
   */
  private open(f: Friend): void {
    const magic = MAGIC[f.id];
    burstShell(this.fx, this.env.rng, {
      x: f.x,
      y: this.skyY(f),
      kind: magic.kind,
      scheme: magic.scheme,
      radius: this.radius,
      power: 1,
    });
    this.flash(0.32, magic.scheme.flash);
    this.shake(0.5);
    const sound = this.env.sound;
    const pan = this.pan(f.x);
    sound.fx('boom', { gain: 0.5, pan });
    sound.fx('crackle', { gain: 0.35, pan, delay: 0.1 });
    const step = RUN_NOTES[Math.min(f.rank, RUN_NOTES.length - 1)]!;
    sound.note('harp', ROOT + step, { gain: 0.5, pan, seconds: 1.2 });
    sound.note('bell', ROOT + 12 + step, { gain: 0.35, pan, seconds: 1.4 });
  }

  /** What her kind of magic does at her horn as she casts. */
  private sign(f: Friend): void {
    const kind = UNICORN_DEFS[f.id].magic;
    const s = SIGN[kind];
    const horn = this.horn(f);
    for (let i = 0; i < this.fx.count(16); i++) {
      this.fx.emit({
        x: horn.x + this.env.rng.range(-14, 14),
        y: horn.y + this.env.rng.range(-8, 8),
        vx: this.env.rng.range(-50, 50),
        vy: s.rise * this.env.rng.range(0.6, 1.4),
        life: this.env.rng.range(0.9, 1.6),
        size: s.size * this.env.rng.range(0.7, 1.3),
        size1: 2,
        color: s.color,
        color1: s.color1,
        shape: s.shape,
        drag: 1.4,
        gravity: kind === 'ice' || kind === 'nature' ? 24 : -8,
        sway: 40,
        twinkle: 6,
        spin: this.env.rng.range(-3, 3),
      });
    }
    this.fx.emit({
      x: horn.x,
      y: horn.y,
      life: 0.6,
      size: 24 * f.scale,
      size1: 110 * f.scale,
      color: MAGIC[f.id].scheme.flash,
      alpha: 0.6,
      alpha1: 0,
      shape: 'glow',
    });
  }

  /** Everyone cheers at once. */
  private allTogether(): void {
    this.together = true;
    const sound = this.env.sound;
    this.flash(0.55, [255, 244, 214]);
    this.shake(1.6);
    sound.fx('cheer', { gain: 0.9 });
    sound.fx('swell', { gain: 0.5, size: 0.5 });
    for (const step of [0, 4, 7, 12]) sound.note('bell', ROOT + step, { gain: 0.6, seconds: 2.2 });
    for (const step of [0, 4, 7]) sound.note('pad', ROOT - 12 + step, { gain: 0.55, seconds: 3 });
    this.ring.target = 1;
    this.ring.kick(3);
    const mid = this.view.w / 2;
    const base = this.view.h * 0.84;
    RAINBOW.forEach((c, i) => {
      this.fx.emit({
        x: mid,
        y: base,
        life: 1.4,
        delay: i * 0.07,
        size: 16,
        size1: Math.max(this.view.w, this.view.h) * 1.3,
        shape: 'ring',
        width: 5,
        color: c,
        alpha: 0.85,
        alpha1: 0,
      });
    });
    for (const f of this.friends) {
      this.cast.cheer(f.index);
      this.cast.kick(f.index, 6);
      this.hops[f.index] = { y: 0, v: 330 };
      for (let i = 0; i < this.fx.count(7); i++) {
        this.fx.emit({
          x: f.x + this.env.rng.range(-20, 20),
          y: f.y - HORN * f.scale * 0.8,
          vx: this.env.rng.range(-50, 50),
          vy: -this.env.rng.range(60, 130),
          life: this.env.rng.range(1.2, 2),
          size: this.env.rng.range(9, 15),
          size1: 4,
          color: [255, 120, 170],
          shape: 'heart',
          drag: 1.2,
          sway: 30,
          twinkle: 3,
        });
      }
    }
    this.confetti = 3.2;
  }

  /** The fireworks all at once: a shell of every kind across the whole sky, quick after quick. */
  private volley(): void {
    const w = this.view.w;
    const kinds = ['peony', 'heart', 'rainbow', 'star', 'ring', 'butterfly', 'flower', 'crackle'] as const;
    const schemes = this.friends.length > 0 ? this.friends.map((f) => MAGIC[f.id].scheme) : [MAGIC.wildstar.scheme];
    const count = this.env.calm ? 4 : 8;
    for (let i = 0; i < count; i++) {
      const at = i * 0.2;
      this.script.at(this.script.now + at, () => {
        const x = w * (0.1 + 0.8 * ((i * 0.618) % 1));
        const y = this.burstY * this.env.rng.range(0.5, 1.15);
        burstShell(this.fx, this.env.rng, {
          x,
          y,
          kind: kinds[i % kinds.length]!,
          scheme: schemes[i % schemes.length]!,
          radius: this.radius * this.env.rng.range(1, 1.35),
          power: 1.25,
        });
        this.flash(0.28, schemes[i % schemes.length]!.flash);
        this.env.sound.fx(i % 3 === 0 ? 'boom' : 'pop', { gain: 0.5, pan: this.pan(x) });
        this.env.sound.fx('crackle', { gain: 0.3, pan: this.pan(x), delay: 0.12 });
      });
    }
    this.script.at(this.script.now + count * 0.2 + 0.2, () => this.env.sound.fx('twinkle', { gain: 0.6 }));
  }

  protected touch(x: number, y: number): void {
    // A touch on a friend makes her cheer for it, and a touch on the sky or the meadow is a burst
    // of sparks and a note.
    const near = this.friends.find(
      (f) => Math.abs(x - this.at(f, this.shown).x) < 46 * f.scale && y > f.y - HORN * f.scale * 1.15 && y < f.y + 8,
    );
    if (near && this.shown > near.enters + RUN_SECONDS) {
      this.cast.cheer(near.index);
      this.cast.kick(near.index, 5);
      this.hops[near.index] = { y: 0, v: 280 };
      this.sign(near);
      this.env.sound.note('glass', ROOT + 12 + RUN_NOTES[Math.min(near.rank, RUN_NOTES.length - 1)]!, {
        gain: 0.5,
        pan: this.pan(near.x),
        seconds: 0.8,
      });
      return;
    }
    const rng = this.env.rng;
    for (let i = 0; i < this.fx.count(12); i++) {
      const a = (i / 12) * TAU;
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * 90,
        vy: Math.sin(a) * 90,
        life: 0.8,
        size: 8,
        size1: 1,
        color: rng.pick(RAINBOW),
        shape: 'star4',
        drag: 1.8,
        twinkle: 1.2,
      });
    }
    this.env.sound.note('bell', ROOT + 12 + rng.pick(RUN_NOTES), { gain: 0.4, pan: this.pan(x), seconds: 0.6 });
  }

  private pan(x: number): number {
    return clamp((x / Math.max(1, this.view.w) - 0.5) * 1.6, -0.8, 0.8);
  }

  protected arrange(view: View): void {
    const ids = [...this.env.herd].filter((id, i, all) => all.indexOf(id) === i);
    const n = Math.max(1, ids.length);
    const portrait = view.h > view.w * 0.9 && n > 2;
    const spread = (count: number, k: number, lo: number, hi: number): number =>
      count <= 1 ? 0.5 : lerp(lo, hi, k / (count - 1));
    // The places the friends stand in, from the left. A wide picture has one row, with every other
    // friend a step nearer so that those side by side overlap like a group standing close for a
    // picture. A tall one stands them in a pyramid, the fewest at the back.
    const spots: { x: number; y: number; depth: number }[] = [];
    if (portrait) {
      const rows = n >= 6 ? [1, 2, 3] : n === 5 ? [2, 3] : n === 4 ? [2, 2] : [1, 2];
      rows.forEach((count, r) => {
        const y = rows.length === 1 ? 0.86 : lerp(rows.length === 2 ? 0.76 : 0.7, 0.9, r / (rows.length - 1));
        const wide = count === rows[rows.length - 1] ? 0.17 : 0.3;
        for (let k = 0; k < count; k++)
          spots.push({
            x: spread(count, k, wide, 1 - wide) * view.w,
            y: view.h * y,
            depth: r / Math.max(1, rows.length - 1),
          });
      });
    } else {
      for (let k = 0; k < n; k++)
        spots.push({
          x: spread(n, k, n > 3 ? 0.12 : 0.3, n > 3 ? 0.88 : 0.7) * view.w,
          y: view.h * (k % 2 === 0 ? 0.86 : 0.915),
          depth: k % 2,
        });
    }
    const left = [...spots].sort((a, b) => a.x - b.x);
    // The herd comes in outward from the middle, so Wildstar stands near it and the friends fan out
    // on both sides.
    const order = [...Array(n).keys()].sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
    const scale = portrait
      ? Math.min(1, view.w * 0.0025)
      : Math.min(1.3, view.h * 0.0038, Math.max(0.5, (view.w * 0.76) / Math.max(1, n - 1) / 92));
    this.friends = ids.map((id, index) => {
      const rank = order[index]!;
      const spot = left[rank]!;
      const from = spot.x < view.w / 2 ? -1 : 1;
      const turn = from === -1 ? 1 : -1;
      // Those who run in from the left face right, which is how she is drawn, and the others are
      // turned.
      return {
        index,
        id,
        x: spot.x,
        y: spot.y,
        scale: scale * (portrait ? lerp(0.86, 1, spot.depth) : spot.depth === 0 ? 0.93 : 1),
        face: turn,
        from,
        rank,
        enters: RUN_START + RUN_STAGGER * (n - 1 - Math.abs(rank - (n - 1) / 2) * 2),
        casts: CAST_START + CAST_GAP * rank,
      };
    });
    this.radius = Math.min(view.h * 0.27, view.w * (portrait ? 0.22 : 0.17));
    this.burstY = view.h * (portrait ? 0.3 : 0.27);
    this.artKey = '';
    for (const f of this.friends) {
      this.cast.face(f.index, f.face);
      this.hops[f.index] = this.hops[f.index] ?? { y: 0, v: 0 };
    }
  }

  /** Where a friend's hooves are, as she runs in from her side to her place. */
  private at(f: Friend, now: number): { x: number; running: boolean; dist: number } {
    const u = clamp((now - f.enters) / RUN_SECONDS);
    const start = f.from === -1 ? -90 * f.scale : this.view.w + 90 * f.scale;
    const x = lerp(start, f.x, easeOutCubic(u));
    return { x, running: u < 1, dist: Math.abs(x - start) };
  }

  protected tick(dt: number): void {
    const now = this.shown;
    if (this.bowFrom >= 0) this.bow = clamp((now - this.bowFrom) / 2, 0, 1);
    this.dawn = damp(this.dawn, this.together ? 1 : clamp(now / 5, 0, 0.6), 1.4, dt);
    this.ring.step(dt);
    this.cast.tick(dt);
    for (const f of this.friends) {
      const there = this.at(f, now);
      const hop = this.hops[f.index]!;
      if (hop.v !== 0 || hop.y > 0) {
        hop.v -= 1400 * dt;
        hop.y += hop.v * dt;
        if (hop.y <= 0) {
          hop.y = 0;
          if (hop.v < -120) this.cast.kick(f.index, -5);
          hop.v = 0;
        }
      }
      const since = this.cast.sinceCheer(f.index);
      const cheering = since < this.castSeconds;
      this.cast.set(
        f.index,
        {
          x: there.x,
          y: f.y - hop.y * f.scale,
          mode: there.running ? 'run' : cheering ? 'cheer' : 'idle',
          face: f.face,
          clock: there.running ? 0 : cheering ? since : now + f.index * 0.7,
        },
        dt,
      );
      this.cast.looks[f.index]!.dist = there.dist;
    }
    // Confetti coming down from both top corners and the lanterns that rise at the end.
    if (this.confetti > 0) {
      this.confetti -= dt;
      const n = dt * 46 * this.fx.density;
      this.confettiDue += n;
      for (; this.confettiDue >= 1; this.confettiDue -= 1) {
        const side = this.env.rng.next() < 0.5 ? 0 : 1;
        this.fx.emit({
          x: this.env.rng.range(0, this.view.w),
          y: -10,
          vx: (side ? -1 : 1) * this.env.rng.range(0, 40),
          vy: this.env.rng.range(40, 110),
          life: 4,
          size: this.env.rng.range(7, 11),
          color: this.env.rng.pick(RAINBOW),
          shape: 'confetti',
          gravity: 30,
          sway: 70,
          spin: this.env.rng.range(-5, 5),
          drag: 0.5,
        });
      }
    }
    if (this.lanternsUp) {
      this.lanternDue += dt * (this.env.calm ? 1.2 : 2.6) * this.fx.density;
      for (; this.lanternDue >= 1; this.lanternDue -= 1) {
        const c = this.env.rng.pick([
          [255, 190, 100],
          [255, 150, 130],
          [255, 224, 140],
        ] as const);
        this.fx.emit({
          x: this.env.rng.range(this.view.w * 0.05, this.view.w * 0.95),
          y: this.view.h * 0.9,
          vx: this.env.rng.range(-8, 8),
          vy: -this.env.rng.range(26, 54),
          life: 5.5,
          size: this.env.rng.range(14, 22),
          size1: 8,
          color: c,
          alpha: 0.9,
          alpha1: 0,
          shape: 'glow',
          sway: 12,
          fadeIn: 0.6,
          twinkle: 0.8,
          halo: 2,
        });
      }
    }
    // Sparks that run along the end of the rainbow as it draws.
    if (this.bow > 0 && this.bow < 1 && !this.env.calm) {
      const end = this.bowPoint(this.bow);
      this.fx.emit({
        x: end.x,
        y: end.y,
        vx: this.env.rng.range(-20, 20),
        vy: this.env.rng.range(10, 50),
        life: 0.8,
        size: this.env.rng.range(5, 9),
        size1: 1,
        color: this.env.rng.pick(RAINBOW),
        shape: 'star4',
        drag: 1.2,
        twinkle: 8,
      });
    }
  }

  private confettiDue = 0;
  private lanternDue = 0;

  private bowGeometry(): { cx: number; cy: number; outer: number; band: number } {
    const { w, h } = this.view;
    const outer = Math.min(w * 0.5, h * 0.74);
    return { cx: w / 2, cy: h * (h > w * 0.9 ? 0.68 : 0.83), outer, band: outer * 0.07 };
  }

  private bowPoint(u: number): { x: number; y: number } {
    const g = this.bowGeometry();
    const a = Math.PI + Math.PI * u;
    const r = g.outer - g.band * 3;
    return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r };
  }

  private ensureArt(k: number): void {
    const { w, h } = this.view;
    const scale = this.detail ? Math.min(2, Math.max(1, k)) : 1;
    const key = `${Math.round(w)}x${Math.round(h)}:${scale}`;
    if (key === this.artKey && this.sky) return;
    this.artKey = key;
    const rng = new Rng(4217);
    this.starry = new Starfield(this.detail ? 70 : 34, rng, w, 0, h * 0.5);
    this.sky = prerender(
      w,
      h,
      (g) => {
        verticalGradient(g, 0, 0, w, h, [
          [0, [22, 14, 62]],
          [0.42, [92, 42, 120]],
          [0.7, [236, 112, 128]],
          [0.86, [255, 176, 110]],
          [1, [255, 214, 140]],
        ]);
      },
      scale,
    );
    this.land = prerender(
      w,
      h,
      (g) => {
        const far = makeHills(w, h * 0.34, new Rng(31), [88, 58, 128], [60, 38, 100], 0.55);
        g.drawImage(far, 0, h * 0.5, w, h * 0.34);
        const near = makeHills(w, h * 0.3, new Rng(57), [64, 132, 104], [30, 84, 86], 0.5);
        g.drawImage(near, 0, h * 0.62, w, h * 0.3);
        // The meadow the friends stand on, and its flowers.
        const grass = g.createLinearGradient(0, h * 0.74, 0, h);
        grass.addColorStop(0, css([66, 150, 104]));
        grass.addColorStop(1, css([30, 96, 82]));
        g.fillStyle = grass;
        g.fillRect(0, h * 0.78, w, h * 0.22);
        const edge = g.createLinearGradient(0, h * 0.74, 0, h * 0.82);
        edge.addColorStop(0, css([66, 150, 104], 0));
        edge.addColorStop(1, css([66, 150, 104], 1));
        g.fillStyle = edge;
        g.fillRect(0, h * 0.74, w, h * 0.08);
        const blooms: RGB[] = [
          [255, 190, 220],
          [255, 236, 150],
          [200, 180, 255],
          [255, 255, 255],
        ];
        for (let i = 0; i < 90; i++) {
          const x = rng.range(0, w);
          const y = rng.range(h * 0.8, h * 0.99);
          g.strokeStyle = css([40, 110, 80], 0.7);
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + rng.range(-2, 2), y - rng.range(4, 9));
          g.stroke();
          if (rng.next() < 0.35) {
            g.fillStyle = css(rng.pick(blooms));
            g.beginPath();
            g.arc(x, y - 9, rng.range(1.5, 2.6), 0, TAU);
            g.fill();
          }
        }
      },
      scale,
    );
  }

  protected paintBack(p: Painter): void {
    this.ensureArt(p.k);
    const g = p.ctx;
    g.drawImage(this.sky!, 0, 0, p.w, p.h);
    this.starry!.draw(g, p.t, p.calm, clamp(1 - this.dawn * 0.9));
    // The sun that is coming up behind the hills.
    const rise = 0.35 + 0.65 * this.dawn;
    glowAt(p.light, p.w / 2, p.h * 0.8, p.h * (0.9 + 0.5 * this.dawn), [255, 190, 120], 0.38 * rise);
    this.paintBow(p);
    g.drawImage(this.land!, 0, 0, p.w, p.h);
    this.paintFriends(p);
    if (this.ring.x > 0.01)
      glowAt(
        p.light,
        p.w / 2,
        p.h * 0.84,
        p.h * 1.6 * Math.min(1, this.ring.x),
        [255, 236, 190],
        0.18 * (1 - 0.5 * this.ring.x),
      );
  }

  /**
   * The rainbow is bright as it draws, steps back while the fireworks go off in front of it, and
   * comes back for the party.
   */
  private bowAlpha(): number {
    const casting = clamp((this.shown - CAST_START) / 0.8);
    return lerp(0.85, this.together ? 0.7 : 0.5, casting);
  }

  private paintBow(p: Painter): void {
    if (this.bow <= 0.001) return;
    const g = p.ctx;
    const { cx, cy, outer, band } = this.bowGeometry();
    const reach = easeInOutCubic(this.bow);
    g.save();
    g.lineCap = 'butt';
    if (this.detail) {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = css([255, 240, 220], 0.1);
      g.lineWidth = band * 9;
      g.beginPath();
      g.arc(cx, cy, outer - band * 3.5, Math.PI, Math.PI + Math.PI * reach);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    RAINBOW.forEach((c, i) => {
      g.strokeStyle = css(c, this.bowAlpha());
      g.lineWidth = band + 0.7;
      g.beginPath();
      g.arc(cx, cy, outer - band * (i + 0.5), Math.PI, Math.PI + Math.PI * reach);
      g.stroke();
    });
    g.restore();
    glowAt(p.light, cx, cy - outer * 0.5, outer * 1.3, [255, 230, 255], 0.12 * reach);
  }

  private paintFriends(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const order = [...this.friends].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const f of order) {
      const look = this.cast.looks[f.index]!;
      const hop = this.hops[f.index]!;
      const lift = hop.y * f.scale;
      const up = clamp(lift / (70 * f.scale));
      // A shadow on the grass that is smaller and fainter as she rises, and a pool of her colour
      // under her while she casts.
      g.fillStyle = css([8, 30, 40], 0.34 * (1 - up * 0.6));
      g.beginPath();
      g.ellipse(look.x, f.y + 1, 40 * f.scale * (1 - up * 0.3), 5.5 * f.scale * (1 - up * 0.3), 0, 0, TAU);
      g.fill();
      const since = this.cast.sinceCheer(f.index);
      if (since < this.castSeconds * 1.6) {
        g.save();
        g.translate(look.x, f.y);
        g.scale(1, 0.32);
        glowAt(p.light, 0, 0, 150 * f.scale, MAGIC[f.id].scheme.flash, 0.6 * (1 - since / (this.castSeconds * 1.6)));
        g.restore();
      }
      this.cast.draw(g, bank, f.index, f.id, f.scale);
    }
  }

  protected paintFront(): void {
    // The meadow's own front is the edge of the picture: nothing is drawn over the party.
  }

  protected reset(): void {
    this.cast.reset();
    this.bow = 0;
    this.bowFrom = -1;
    this.dawn = 0;
    this.together = false;
    this.ring.x = 0;
    this.ring.v = 0;
    this.ring.target = 0;
    this.lanternsUp = false;
    this.confetti = 0;
    this.confettiDue = 0;
    this.lanternDue = 0;
    for (const h of this.hops) {
      h.y = 0;
      h.v = 0;
    }
    for (const f of this.friends) this.cast.face(f.index, f.face);
  }
}
