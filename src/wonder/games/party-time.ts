import type { Facing } from '../../shared/ids';
import { drawPic } from '../engine/bank';
import { Camera } from '../engine/camera';
import { COLORS, lighten, type RGB } from '../engine/color';
import { clamp, damp, TAU } from '../engine/ease';
import { FEET, STRIDE } from '../engine/herd';
import { Meter } from '../engine/meter';
import { glowAt } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import { Relight } from '../engine/relight';
import type { Pointer, Quality } from '../engine/stage';
import { scaleNote } from '../music';
import { Wonder, type WonderEnv } from '../wonder';
import { PARTY_COLORS, ringAt } from './balloons/pops';
import { BallArt } from './party/ball-art';
import { type Cannon, Cannons } from './party/cannons';
import { type Dancer, Dancers, facingOf } from './party/dancers';
import { cannonShot, confettiOver, dancerPop, danceSparkle, lanternPop, paperBits, pinataBang } from './party/effects';
import { flourishOf, Groove, partsOf, sounds } from './party/groove';
import { Guests, guestsFor } from './party/guests';
import { type Plan, planOf, slotsOf } from './party/layout';
import { Lights } from './party/lights';
import { DURATION, LINEUP, loopOf, middleOf, startOf, stepOf } from './party/parade';
import { Pinata } from './party/pinata';
import { paintCannons, paintPinata, sweetsBurst } from './party/props-art';
import { StageArt, type StageState } from './party/stage-art';
import { Tiles } from './party/tiles';
import { starCosts, Vibe } from './party/vibe';
import { World } from './party/world-art';
import { burstShell } from './sky/burst';
import { type Lit, newLit } from './sky/light';
import { MAGIC } from './sky/looks';

/**
 * The points each star is earned at. A friend who joins in is worth a few, a new move or a cannon
 * or a pinata a couple, and the same thing again is worth less, so a party of different things is
 * the quickest way to the top.
 */
const PARTY_STAR_COSTS = [10, 30, 56, 88, 128] as const;

/**
 * The root of the party's tunes, middle C. Every note the player plays is of its major pentatonic
 * scale.
 */
const ROOT = 60;

/**
 * What a friend's colours are multiplied by to put her in the dark of the party before the lights
 * fall on her.
 */
const DARK: RGB = [150, 146, 190];

/**
 * The most light that is put back on her. With the dark she is put in, this is the most she can
 * come to: her own colours and a little over, in the colour of the party, and never so much that
 * she goes white.
 */
const RELIT = 0.5;

/** The most friends that dance: Wildstar and five. */
const MOST = 6;

/** How the parade is going while it plays. */
interface Parade {
  /** Seconds since it began. */
  t: number;
  /** Where the leader was the last frame, to know which lanterns she has passed. */
  lastLeader: number;
  /** How far the guests have come along the road with the friends. */
  along: number;
  /** The last beat the guests hopped on. */
  hopped: number;
}

export class PartyTime extends Wonder {
  readonly id = 'party-time' as const;
  protected readonly meter = new Meter(starCosts(PARTY_STAR_COSTS, this.env.herd.length));
  private readonly dancers = new Dancers();
  private readonly guests: Guests;
  private readonly cannons = new Cannons();
  private readonly pinata: Pinata;
  private tiles: Tiles | null = null;
  private readonly lights = new Lights();
  private readonly groove = new Groove();
  private readonly vibe = new Vibe();
  private readonly world: World;
  private readonly art: StageArt;
  private readonly ball = new BallArt();
  private readonly relight = new Relight();
  /**
   * Whether the guests get the party's light too. On the lowest quality only the friends do: each
   * one lit is three more passes of its picture.
   */
  private lightGuests = true;
  private readonly lit: Lit = newLit();
  private plan!: Plan;
  private loop = 1;
  /** Which parts of the song each friend brings. */
  private parts: number[][] = [];
  /** The speakers' push on the beat, falling away between beats. */
  private pump = 0;
  /**
   * How far the mirror ball has turned, in columns of mirrors, and how much faster than usual it is
   * going for the moment.
   */
  private spin = 0;
  private spinBoost = 0;
  /** How lively the party is, from 0 to 1. */
  private lively = 0;
  private beatIndex = 0;
  private parade: Parade | null = null;
  private artFor = 0;
  private artDirty = true;
  private dragTile = -1;
  private dragging = false;
  /** What the player has done, which the hand uses to show them what else there is. */
  private fired = 0;
  private knocked = 0;
  private spun = 0;

  constructor(env: WonderEnv) {
    super(env);
    this.guests = new Guests(env.rng);
    this.pinata = new Pinata(env.rng);
    this.world = new World(env.bank, env.rng);
    this.art = new StageArt(env.bank);
    this.camera = new Camera(0.5, 0.5);
    const band = this.startMusic(this.groove.style);
    band.onStep = (step, bar) => this.onStep(step, bar);
  }

  override get bloom(): number {
    return this.env.calm ? 0.2 : 0.38;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.lightGuests = level > 0;
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly dancers: readonly {
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly head: number;
      readonly move: string | null;
      readonly taps: number;
    }[];
    readonly cannons: readonly {
      readonly x: number;
      readonly y: number;
      readonly mouth: { readonly x: number; readonly y: number };
      readonly ready: boolean;
      readonly side: number;
    }[];
    readonly pinata: {
      readonly x: number;
      readonly y: number;
      readonly state: string;
      readonly hits: number;
      readonly needs: number;
    };
    readonly ball: { readonly x: number; readonly y: number; readonly r: number };
    readonly speakers: readonly { readonly x: number; readonly y: number }[];
    readonly floor: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
    readonly guests: number;
    readonly parts: number;
    readonly lively: number;
    readonly marching: boolean;
  } {
    const plan = this.plan;
    const m = this.pinata.middle();
    return {
      dancers: this.dancers.list.map((d) => ({
        id: d.id,
        x: d.x,
        y: d.y,
        head: d.y - 96 * d.slot.scale,
        move: d.move,
        taps: d.taps,
      })),
      cannons: this.cannons.list.map((c) => {
        const mouth = this.cannons.mouthOf(c);
        return { x: c.x, y: c.y, mouth: { x: mouth.x, y: mouth.y }, ready: c.wait <= 0, side: c.side };
      }),
      pinata: { x: m.x, y: m.y, state: this.pinata.state, hits: this.pinata.hits, needs: this.pinata.needs },
      ball: { x: plan.ball.x, y: plan.ball.y, r: plan.ball.r },
      speakers: plan.speakers.map((s) => ({ x: s.x, y: s.y - s.h / 2 })),
      floor: {
        top: plan.floor.top,
        bottom: plan.floor.bottom,
        left: plan.floor.bottomLeft,
        right: plan.floor.bottomRight,
      },
      guests: this.guests.list.length,
      parts: this.groove.playing,
      lively: this.lively,
      marching: this.parade !== null,
    };
  }

  protected arrange(view: View): void {
    const plan = planOf(view.w, view.h, view.unit);
    this.plan = plan;
    this.loop = loopOf(view.w);
    if (this.tiles) this.tiles.place(plan);
    else this.tiles = new Tiles(plan, this.env.rng);
    this.lights.place(plan, this.tiles);
    const ids = this.env.herd.slice(0, MOST);
    this.dancers.stand(ids, slotsOf(ids.length, plan));
    this.parts = partsOf(ids.length);
    this.cannons.place(plan.cannons);
    this.pinata.place(plan.pinata);
    this.guests.place(plan);
    this.artDirty = true;
    const cam = this.camera!;
    cam.x = this.parade ? cam.x : view.w / 2;
    cam.y = view.h / 2;
    cam.zoom = 1;
  }

  /**
   * The pictures that never change are drawn once for the size of the screen and how sharp it is.
   */
  private ensureArt(k: number): void {
    if (!this.artDirty && this.artFor === k) return;
    this.artDirty = false;
    this.artFor = k;
    this.world.place(this.plan, this.loop, k);
    this.art.place(this.plan, this.tiles!, k);
    this.ball.place(this.plan, k);
  }

  protected reset(): void {
    this.dancers.reset();
    this.guests.reset();
    this.cannons.reset();
    this.pinata.reset();
    this.tiles!.reset();
    this.groove.reset();
    this.vibe.reset();
    this.lights.surge = 0;
    this.lively = 0;
    this.pump = 0;
    this.spin = 0;
    this.spinBoost = 0;
    this.beatIndex = 0;
    this.fired = 0;
    this.knocked = 0;
    this.spun = 0;
    this.dragging = false;
    this.endParade();
  }

  /** Where the music is, in beats. Nothing dances to a song that has not begun. */
  private get beats(): number {
    return this.band ? this.band.beats : 0;
  }

  /** Told as each sixteenth of the bar is reached. */
  private onStep(step: number, bar: number): void {
    if (step % 4 === 0) this.onBeat(bar * 4 + step / 4);
    for (const d of this.dancers.list) {
      if (!d.move || d.walk) continue;
      const mine = this.parts[d.index] ?? [];
      for (const part of mine) {
        if (!this.groove.on[part] || !sounds(part, step)) continue;
        // A note of her part sounds: a glint above her head.
        const s = d.slot.scale;
        const c = MAGIC[d.id].scheme.colors;
        this.fx.emit({
          x: d.x + this.env.rng.range(-12, 12) * s,
          y: d.y - (96 + d.look.lift) * s,
          vy: -34,
          life: 0.6,
          size: 11,
          size1: 2,
          color: lighten(c[0]!, 0.5),
          shape: 'star4',
          twinkle: 10,
          drag: 1.2,
          hold: 0.3,
        });
        break;
      }
    }
  }

  private onBeat(index: number): void {
    this.beatIndex = index;
    this.pump = this.env.calm ? 0.5 : 1;
    this.tiles!.beat(index, this.env.calm ? Math.min(0.5, this.lively) : this.lively);
    this.guests.onBeat(index, this.time);
    const power = this.phase === 'finale' ? 1 : 0.7;
    for (const d of this.dancers.list) {
      if (!d.move || d.walk) continue;
      danceSparkle(this.fx, this.env.rng, d.x, d.y - 2, MAGIC[d.id].scheme.colors, d.slot.scale, power);
    }
  }

  protected tick(dt: number): void {
    const beats = this.beats;
    this.pump = damp(this.pump, 0, 7, dt);
    this.spinBoost = damp(this.spinBoost, 0, 1.4, dt);
    this.spin += dt * (0.05 + 0.1 * this.lively + 0.5 * this.spinBoost);
    this.cannons.update(dt);
    this.pinata.update(dt);
    this.tiles!.update(dt);
    if (this.parade) this.tickParade(dt);
    this.dancers.update(dt, beats);
    const dancing = this.dancers.dancing;
    const count = Math.max(1, this.dancers.list.length);
    const want = clamp(0.12 + 0.55 * (dancing / count) + 0.33 * (this.meter.stars / 5));
    this.lively = damp(this.lively, this.phase === 'finale' ? 1 : this.env.calm ? Math.min(0.55, want) : want, 1.4, dt);
    this.lights.lively = this.lively;
    this.lights.update(this.time, beats, this.plan, dt);
    // New guests come as the party gets going.
    for (const g of this.guests.ensure(guestsFor(this.meter.score), this.time)) {
      this.env.sound.fx('whoosh', { gain: 0.22, pan: this.pan(g.home.x), pitch: 4 });
    }
    if (this.phase === 'play' && dancing > 0) this.earn(Vibe.byThemselves(dancing, dt));
    // The world's own light, a little brighter as the party gets lively, is the mirror ball's glow
    // on the speakers.
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  protected press(p: Pointer): void {
    if (this.parade) {
      this.paradeTouch(p);
      return;
    }
    const { x, y } = p;
    this.dragging = false;
    const cannon = this.cannons.at(x, y);
    if (cannon) {
      this.fire(cannon);
      return;
    }
    if (this.pinata.at(x, y)) {
      this.knock(x);
      return;
    }
    const dancer = this.dancers.at(x, y);
    if (dancer) {
      this.touchDancer(dancer);
      return;
    }
    const guest = this.guests.at(x, y, this.time);
    if (guest) {
      this.touchGuest(guest);
      return;
    }
    const ball = this.plan.ball;
    if (Math.hypot(x - ball.x, y - ball.y) <= ball.r + 16) {
      this.touchBall();
      return;
    }
    const speaker = this.plan.speakers.findIndex(
      (s) => Math.abs(x - s.x) < s.w / 2 + 10 && y > s.y - s.h - 10 && y < s.y + 10,
    );
    if (speaker >= 0) {
      this.touchSpeaker(speaker);
      return;
    }
    if (this.tiles!.find(x, y)) {
      this.dragging = true;
      this.dragTile = -1;
      this.touchFloor(x, y, false);
      return;
    }
    this.touchSky(x, y);
  }

  protected override drag(p: Pointer): void {
    if (!this.dragging || this.parade) return;
    // A finger that is drawn across the floor lights each tile it comes to.
    const at = this.tiles!.find(p.x, p.y);
    if (!at) return;
    const id = at.row * this.tiles!.cols + at.col;
    if (id === this.dragTile) return;
    this.touchFloor(p.x, p.y, true);
  }

  protected override lift(): void {
    this.dragging = false;
  }

  /**
   * A friend is touched: she begins to dance, or does her next move, and her part of the song comes
   * in.
   */
  private touchDancer(d: Dancer): void {
    const tap = this.dancers.tap(d, this.beats);
    const pan = this.pan(d.x);
    const s = d.slot.scale;
    const magic = MAGIC[d.id].scheme;
    const part = (this.parts[d.index] ?? [])[d.taps - 1];
    if (part !== undefined && !this.groove.on[part]) {
      this.groove.join(part);
      for (const f of flourishOf(part, this.band!.chord))
        this.env.sound.note(f.voice, f.midi, { gain: f.gain * 0.85, pan, delay: f.after, seconds: 0.5 });
    } else {
      // Nothing new to bring, so a bright note of her own and a change of step.
      this.env.sound.note('bell', scaleNote(ROOT + 12, 2 + d.index + d.taps), { gain: 0.5, pan, seconds: 0.6 });
    }
    this.env.sound.fx(tap.first ? 'star' : 'tap', { pan, gain: 0.5, step: d.index });
    dancerPop(this.fx, this.env.rng, d.x, d.y - 54 * s, magic.colors, magic.flash, s, tap.first);
    this.tiles!.tread(d.x, d.y - 4, d.index);
    this.lights.surge = Math.max(this.lights.surge, 0.22);
    this.guests.cheer(d.x, 0.7, this.time);
    this.earn(this.vibe.worth(tap.first ? 'join' : 'move', d.id, this.time));
  }

  /** A cannon is touched and goes off, if it is loaded. */
  private fire(c: Cannon): void {
    const mouth = this.cannons.fire(c);
    const pan = this.pan(c.x);
    if (!mouth) {
      this.env.sound.fx('tap', { gain: 0.25, pan, pitch: -6 });
      return;
    }
    this.fired++;
    cannonShot(this.fx, this.env.rng, mouth, c.colors);
    this.env.sound.fx('pop', { gain: 0.8, pan, size: 0.9 });
    this.env.sound.fx('whoosh', { gain: 0.35, pan, delay: 0.03 });
    // The two cannons strum the chord that is playing in turn, the left going up and the right
    // coming down.
    const notes = this.chordNotes();
    const run = c.side < 0 ? notes : [...notes].reverse();
    run.forEach((midi, i) => {
      this.env.sound.note(c.side < 0 ? 'marimba' : 'bell', midi, {
        gain: 0.55,
        pan,
        delay: 0.05 + i * 0.055,
        seconds: 0.7,
      });
    });
    this.tiles!.tread(
      c.side < 0 ? this.plan.floor.bottomLeft + 30 : this.plan.floor.bottomRight - 30,
      this.plan.floor.bottom - 6,
      c.side < 0 ? 5 : 1,
    );
    this.lights.surge = Math.max(this.lights.surge, 0.3);
    this.pump = 1;
    this.shake(0.9);
    this.flash(0.1, c.colors[0]!);
    this.guests.cheer(mouth.x, 1, this.time);
    this.earn(this.vibe.worth('cannon', c.side, this.time));
  }

  /** The notes of the chord that is playing, over two octaves from middle C. */
  private chordNotes(): number[] {
    const chord = this.band!.chord;
    const base = chord.pcs.map((pc) => ROOT + (((pc % 12) + 12 - (ROOT % 12)) % 12));
    return [...base, base[0]! + 12, base[1]! + 12];
  }

  /** The pinata is knocked. A few knocks and it bursts. */
  private knock(x: number): void {
    const hit = this.pinata.knock(x);
    if (!hit) return;
    this.knocked++;
    const m = this.pinata.middle();
    const pan = this.pan(m.x);
    paperBits(this.fx, this.env.rng, m.x, m.y, hit.push, PARTY_COLORS);
    this.env.sound.fx('thud', { gain: 0.7, pan, pitch: 4 });
    this.env.sound.note('pluck', scaleNote(ROOT + 12, hit.hits * 2), { gain: 0.6, pan, seconds: 0.5 });
    this.shake(0.7);
    const worth = this.vibe.worth(hit.burst ? 'burst' : 'knock', 'pinata', this.time);
    if (hit.burst) this.pinataBursts(m.x, m.y);
    this.earn(worth);
  }

  private pinataBursts(x: number, y: number): void {
    const pan = this.pan(x);
    pinataBang(this.fx, this.env.rng, x, y, PARTY_COLORS);
    sweetsBurst(this.fx, this.env.rng, x, y - 8, this.plan.floor.bottom - 14, 36);
    this.env.sound.fx('poof', { gain: 0.8, pan });
    this.env.sound.fx('cheer', { gain: 0.6, pan, delay: 0.08 });
    [0, 2, 4, 5, 7, 9].forEach((n, i) => {
      this.env.sound.note('glass', scaleNote(ROOT + 12, n), { gain: 0.5, pan, delay: 0.1 + i * 0.06, seconds: 0.6 });
    });
    this.flash(0.3, COLORS.gold);
    this.shake(2.4);
    this.lights.surge = 1;
    this.guests.cheer(x, 1.5, this.time);
    for (const d of this.dancers.list) this.dancers.cheer(d, 1);
    this.tiles!.show = 'sparkle';
    this.tiles!.beat(this.beatIndex, 1);
    this.script.at(this.script.now + 3.2, () => {
      if (this.tiles!.show === 'sparkle') this.tiles!.show = 'rainbow';
    });
  }

  /** The mirror ball is touched: the lights change, and it spins up for a moment. */
  private touchBall(): void {
    this.spun++;
    const ball = this.plan.ball;
    this.tiles!.next();
    this.spinBoost = 1;
    this.lights.surge = Math.max(this.lights.surge, 0.35);
    this.tiles!.beat(this.beatIndex, 1);
    ringAt(this.fx, this.env.rng, ball.x, ball.y, COLORS.white, ball.r * 1.6);
    for (let i = 0; i < 5; i++) {
      this.fx.emit({
        x: ball.x + this.env.rng.range(-ball.r, ball.r),
        y: ball.y + this.env.rng.range(-ball.r, ball.r),
        life: 0.7,
        size: 14,
        size1: 3,
        color: COLORS.white,
        shape: 'star4',
        twinkle: 12,
        delay: i * 0.05,
        hold: 0.3,
      });
    }
    this.env.sound.fx('twinkle', { gain: 0.6, pan: 0, step: 3 });
    ['glass', 'glass', 'bell'].forEach((voice, i) => {
      this.env.sound.note(voice as 'glass' | 'bell', scaleNote(ROOT + 24, 4 - i * 2), {
        gain: 0.4,
        delay: i * 0.08,
        seconds: 0.7,
      });
    });
    this.flash(0.08);
    this.earn(this.vibe.worth('ball', 'ball', this.time));
  }

  /** A speaker is touched: a drop of bass that the whole floor feels. */
  private touchSpeaker(i: number): void {
    const sp = this.plan.speakers[i]!;
    const pan = this.pan(sp.x);
    this.pump = 1;
    this.env.sound.fx('thud', { gain: 0.85, pan, pitch: -5 });
    this.env.sound.note('kick', 48, { gain: 0.95, pan });
    this.env.sound.note('bass', this.chordNotes()[0]! - 24, { gain: 0.8, pan, delay: 0.02, seconds: 0.5 });
    this.shake(1.2);
    this.flash(0.12, COLORS.pink);
    this.lights.surge = Math.max(this.lights.surge, 0.55);
    const t = this.tiles!;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) t.light(c, r, 0.8, c + r);
    for (const d of this.dancers.list) this.dancers.cheer(d, 0.8);
    this.guests.cheer(sp.x, 1, this.time);
    ringAt(this.fx, this.env.rng, sp.x, sp.y - sp.h * 0.3, COLORS.pink, sp.w * 0.7);
    this.earn(this.vibe.worth('speaker', i, this.time));
  }

  /** A tile of the floor is touched: it lights, a ring of light goes out, and it sings. */
  private touchFloor(x: number, y: number, trail: boolean): void {
    const tiles = this.tiles!;
    const at = tiles.find(x, y);
    if (!at) return;
    this.dragTile = at.row * tiles.cols + at.col;
    const color = at.col + at.row;
    tiles.tread(x, y, color);
    const pan = this.pan(x);
    this.env.sound.note(at.row % 2 === 0 ? 'glass' : 'bell', scaleNote(ROOT, at.col), {
      gain: trail ? 0.38 : 0.5,
      pan,
      seconds: 0.5,
    });
    ringAt(this.fx, this.env.rng, x, y, lighten([255, 160, 214], 0.2), trail ? 12 : 18);
    this.guests.cheer(x, 0.4, this.time);
    this.earn(this.vibe.worth(trail ? 'trail' : 'floor', at.col, this.time));
  }

  /**
   * A guest is touched. A frog and a bunny hop and answer; a bird sings; a fairy leaves a sparkle.
   */
  private touchGuest(g: ReturnType<Guests['at']> & object): void {
    const pose = this.guests.pose(g, this.time);
    const pan = this.pan(pose.x);
    this.guests.poke(g, this.time);
    switch (g.kind) {
      case 'frog':
        this.env.sound.fx('boing', { gain: 0.6, pan, pitch: -3 + g.id });
        break;
      case 'bunny':
        this.env.sound.fx('pop', { gain: 0.5, pan, pitch: 5 });
        break;
      case 'bird':
        [0, 2, 4].forEach((n, i) => {
          this.env.sound.note('bell', scaleNote(ROOT + 24, n + (g.id % 3)), {
            gain: 0.4,
            pan,
            delay: i * 0.07,
            seconds: 0.4,
          });
        });
        break;
      default:
        this.env.sound.fx('twinkle', { gain: 0.5, pan, step: g.id });
    }
    ringAt(this.fx, this.env.rng, pose.x, pose.y - pose.lift - 12, COLORS.white, 14);
    this.earn(this.vibe.worth('guest', g.kind, this.time));
  }

  /** A touch on the sky: a twinkle where it landed. It is not worth anything, and it answers. */
  private touchSky(x: number, y: number): void {
    ringAt(this.fx, this.env.rng, x, y, PARTY_COLORS[Math.floor(x / 30) % PARTY_COLORS.length]!, 18);
    this.env.sound.note('glass', scaleNote(ROOT + 12, Math.floor((x / this.view.w) * 9)), {
      gain: 0.35,
      pan: this.pan(x),
      seconds: 0.5,
    });
  }

  /**
   * A touch in the parade: a ring of light and a note where it landed, in the world where it was
   * made.
   */
  private paradeTouch(p: Pointer): void {
    const cam = this.camera!;
    const x = cam.worldX(p.x, this.view.w);
    ringAt(this.fx, this.env.rng, x, p.y, PARTY_COLORS[Math.floor(p.x / 40) % PARTY_COLORS.length]!, 20);
    this.env.sound.note('glass', scaleNote(ROOT + 12, Math.floor((p.x / this.view.w) * 9)), {
      gain: 0.4,
      pan: this.pan(p.x),
      seconds: 0.5,
    });
  }

  protected hint(): { x: number; y: number } | null {
    if (this.phase !== 'play' || this.parade) return null;
    const dancing = this.dancers.dancing;
    const lead = this.dancers.list[0];
    if (dancing === 0 && lead) return { x: lead.x, y: lead.y - 70 * lead.slot.scale };
    const asleep = this.dancers.list.find((d) => !d.move);
    if (dancing < 2 && asleep) return { x: asleep.x, y: asleep.y - 70 * asleep.slot.scale };
    if (this.fired === 0) {
      const c = this.cannons.list[0];
      if (c) {
        const m = this.cannons.mouthOf(c);
        return { x: (c.x + m.x) / 2, y: (c.y + m.y) / 2 };
      }
    }
    if (this.knocked === 0) {
      const m = this.pinata.middle();
      return { x: m.x, y: m.y };
    }
    if (this.spun === 0) return { x: this.plan.ball.x, y: this.plan.ball.y };
    if (asleep) return { x: asleep.x, y: asleep.y - 70 * asleep.slot.scale };
    const t = this.plan.floor;
    return { x: this.view.w / 2, y: (t.top + t.bottom) / 2 };
  }

  protected finale(): void {
    const sound = this.env.sound;
    this.groove.on.fill(true);
    this.groove.march = true;
    this.parade = { t: 0, lastLeader: this.dancers.list[0]?.slot.x ?? 0, along: 0, hopped: -1 };
    this.endDragging();
    const s0 = this.script.now;
    const count = this.dancers.list.length;
    // Everyone cheers where they stand.
    sound.fx('swell', { gain: 0.7 });
    sound.fx('cheer', { gain: 0.6, delay: 0.1 });
    this.lights.surge = 1;
    this.flash(0.3, COLORS.white);
    this.shake(1.5);
    this.tiles!.show = 'rainbow';
    for (const d of this.dancers.list) this.dancers.cheer(d, 1.2);
    this.guests.hopAll(this.time, 1.1);
    confettiOver(this.fx, this.env.rng, 0, this.view.w, -10, 120, PARTY_COLORS);
    // Each friend sends her own firework into the sky as she sets off, and the sky keeps going
    // after.
    this.dancers.list.forEach((d, rank) => {
      this.script.at(s0 + startOf(rank) + 0.05, () => this.skyShell(rank));
      this.script.at(s0 + startOf(rank), () => {
        sound.fx('whoosh', { gain: 0.35, pan: this.pan(d.x) });
        sound.fx('cheer', { gain: 0.25, pan: this.pan(d.x), delay: 0.05 });
      });
    });
    const sky = Math.max(4, Math.round((DURATION - LINEUP - 3) / 1.3));
    this.script.spread(s0 + LINEUP + 2.2, s0 + DURATION - 1.2, sky, (i) => this.skyShell(i + count));
    this.script.at(s0 + DURATION + 0.15, () => this.arrive());
    this.script.at(s0 + DURATION + 4.2, () => this.endFinale());
  }

  private endDragging(): void {
    this.dragging = false;
    this.dragTile = -1;
  }

  /** A friend's own firework, in her shape and colours, over the middle of the parade. */
  private skyShell(n: number): void {
    const list = this.dancers.list;
    if (list.length === 0) return;
    const d = list[n % list.length]!;
    const magic = MAGIC[d.id];
    const cam = this.camera!;
    const x = cam.x + (((n * 0.37) % 1) - 0.5) * this.view.w * 0.7;
    const y = this.view.h * (0.22 + 0.12 * ((n * 0.61) % 1));
    burstShell(this.fx, this.env.rng, {
      x,
      y,
      kind: magic.kind,
      scheme: magic.scheme,
      radius: Math.min(86, this.view.h * 0.26),
      power: 1,
      fine: 0.9,
    });
    this.env.sound.fx('launch', { gain: 0.3, pan: this.pan(x - cam.x + this.view.w / 2) });
    this.env.sound.fx('crackle', { gain: 0.35, pan: this.pan(x - cam.x + this.view.w / 2), delay: 0.28 });
    this.lights.surge = Math.max(this.lights.surge, 0.18);
  }

  /** The parade clock goes on and the friends are put on the road. */
  private tickParade(dt: number): void {
    const par = this.parade!;
    par.t += dt;
    const t = par.t;
    const bank = this.env.bank;
    const slots = this.dancers.list.map((d) => d.slot);
    const arrived = t >= DURATION;
    const cam = this.camera!;
    this.dancers.list.forEach((d, rank) => {
      const s = d.slot.scale;
      const step = stepOf(d.slot, rank, Math.min(t, DURATION), this.loop);
      let facing: Facing = 'south';
      let clip: 'walk' | 'cast' | 'idle' = 'cast';
      let seconds = 0;
      let lift = 0;
      if (step.on) {
        facing = 'east';
        clip = 'walk';
        const span = bank ? bank.clipSeconds(d.id, 'walk', 'east') : 0.66;
        seconds = (step.dist / (STRIDE * s)) * span;
      } else if (t < startOf(rank)) {
        const span = bank ? bank.clipSeconds(d.id, 'cast', 'south') : 0.6;
        // She cheers where she stands, over and over, a little off from the next one.
        seconds = (t + rank * 0.23) % (span + 0.35);
        lift = Math.max(0, Math.sin(((t * 2.1 + rank * 0.7) % 1) * Math.PI)) * 5;
      } else {
        clip = 'idle';
        seconds = t;
      }
      d.walk = { x: step.x, y: step.y, facing, clip, seconds, lift };
    });
    par.along = middleOf(slots, Math.min(t, DURATION), this.loop, this.view.w) - this.view.w / 2;
    cam.x = this.view.w / 2 + par.along;
    // The guests hop along with them on every beat.
    const beat = Math.floor(this.beats);
    if (beat !== par.hopped) {
      par.hopped = beat;
      this.guests.hopAll(this.time, 0.75);
    }
    // A lantern pops as the first of the friends goes by.
    const lead = this.dancers.list[0];
    if (lead?.walk) {
      const x = lead.walk.x;
      for (const l of this.world.lanterns()) {
        for (let lap = 0; lap < 2; lap++) {
          const lx = l.x + lap * this.loop;
          if (par.lastLeader < lx && x >= lx) {
            lanternPop(this.fx, this.env.rng, lx, l.y);
            this.env.sound.fx('pop', { gain: 0.4, pan: this.pan(lx - cam.x + this.view.w / 2), pitch: 7 });
            this.env.sound.note('glass', scaleNote(ROOT + 12, 3 + ((lap + Math.floor(lx / 100)) % 6)), {
              gain: 0.4,
              seconds: 0.5,
            });
            this.lights.surge = Math.max(this.lights.surge, 0.12);
          }
        }
      }
      par.lastLeader = x;
    }
    // Something falling from the sky as they go, a little all the time.
    if (!arrived && Math.floor(t * 4) !== Math.floor((t - dt) * 4))
      confettiOver(this.fx, this.env.rng, cam.x - this.view.w * 0.55, this.view.w * 1.1, -6, 9, PARTY_COLORS);
  }

  /**
   * They have come all the way round to the floor: the world is put back as it began, and the party
   * ends with a bang.
   */
  private arrive(): void {
    this.endParade();
    this.groove.march = false;
    const mid = this.view.w / 2;
    const sound = this.env.sound;
    // Home, and every friend is dancing, even one who was never touched: she has caught the beat by
    // now.
    for (const d of this.dancers.list) {
      if (!d.move) this.dancers.tap(d, this.beats);
      this.dancers.cheer(d, 1.3);
    }
    // The two cannons and the pinata go together.
    for (const c of this.cannons.list) {
      c.wait = 0;
      const mouth = this.cannons.fire(c);
      if (mouth) cannonShot(this.fx, this.env.rng, mouth, c.colors, 1.3);
    }
    const m = this.pinata.middle();
    if (this.pinata.burstNow()) {
      pinataBang(this.fx, this.env.rng, m.x, m.y, PARTY_COLORS);
      sweetsBurst(this.fx, this.env.rng, m.x, m.y - 8, this.plan.floor.bottom - 14, 40);
    }
    confettiOver(this.fx, this.env.rng, 0, this.view.w, -10, 150, PARTY_COLORS);
    this.skyShell(0);
    this.script.at(this.script.now + 0.3, () => this.skyShell(2));
    this.script.at(this.script.now + 0.6, () => this.skyShell(4));
    this.lights.surge = 1;
    this.spinBoost = 1;
    this.pump = 1;
    this.flash(0.35, COLORS.white);
    this.shake(3);
    this.guests.hopAll(this.time, 1.4);
    this.guests.cheer(mid, 1.5, this.time);
    sound.fx('boom', { gain: 0.8 });
    sound.fx('cheer', { gain: 0.8, delay: 0.1 });
    [0, 2, 4, 5, 7, 9, 12].forEach((n, i) => {
      sound.note('bell', scaleNote(ROOT + 12, n), { gain: 0.55, delay: 0.1 + i * 0.07, seconds: 0.9 });
    });
    const t = this.tiles!;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) t.light(c, r, 1, c + r);
  }

  /** Puts the world back where it was before the parade, so that it can go straight on. */
  private endParade(): void {
    const par = this.parade;
    this.parade = null;
    const cam = this.camera!;
    if (par) this.fx.shift(-this.loop);
    cam.x = this.view.w / 2;
    cam.y = this.view.h / 2;
    for (const d of this.dancers.list) {
      d.walk = null;
      d.x = d.slot.x;
      d.y = d.slot.y;
    }
  }

  protected paintBack(p: Painter): void {
    this.ensureArt(p.k);
    this.world.paintSky(p, this.camera!.x);
  }

  protected override paintWorld(p: Painter): void {
    const cam = this.camera!;
    const { w } = this.view;
    this.world.paintMeadow(p, cam.x, p.t);
    const left = cam.x - w / 2 - 40;
    const right = cam.x + w / 2 + 40;
    const state: StageState = {
      tiles: this.tiles!,
      beats: this.beats,
      pump: this.pump * (this.env.calm ? 0.6 : 1),
      lively: this.lively,
      t: p.t,
    };
    const copies = [0, this.loop].filter((ox) => ox + w > left && ox < right);
    for (const ox of copies) this.paintStageBack(p, ox, state);
    this.paintGuests(p, true);
    this.paintDancers(p);
    this.paintGuests(p, false);
    for (const ox of copies) {
      this.art.paintEdge(p, ox, state);
      paintCannons(p, this.env.bank, this.cannons, ox, p.t);
    }
  }

  private paintStageBack(p: Painter, ox: number, s: StageState): void {
    this.art.paintBack(p, ox);
    this.art.paintTiles(p, ox, s);
    this.art.paintSpeakers(p, ox, s);
    this.art.paintBalloons(p, ox, p.t);
    this.art.paintWire(p, ox, s);
    this.ball.paintBeams(p, ox, this.lights.spots, this.lively);
    paintPinata(p, this.pinata, ox, p.t);
    this.ball.paint(p, ox, this.spin, p.t, this.lively);
  }

  private paintDancers(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const order = [...this.dancers.list].sort((a, b) => a.y - b.y || a.index - b.index);
    for (const d of order) {
      const s = d.slot.scale;
      const look = d.look;
      const walk = d.walk;
      const clip = walk ? walk.clip : look.clip;
      const facing = walk ? walk.facing : facingOf(d.slot.home, look.turn);
      const span = bank.clipSeconds(d.id, clip, facing);
      const seconds = walk ? walk.seconds : clip === 'idle' ? this.time + d.index * 0.83 : look.phase * span;
      const lift = (walk ? walk.lift : look.lift) * s;
      const rot = walk ? 0 : look.tilt + look.spin;
      const sx = walk ? 1 : look.sx;
      const sy = walk ? 1 : look.sy;
      const frame = bank.unicorn(d.id, clip, facing, seconds);
      if (!frame) continue;
      // A shadow on the floor, smaller and fainter as she goes up.
      const up = Math.min(1, lift / (60 * s));
      g.fillStyle = `rgba(0,4,20,${(0.34 * (1 - up * 0.6)).toFixed(3)})`;
      g.beginPath();
      g.ellipse(d.x, d.y + 1, 40 * s * (1 - up * 0.3), 5.5 * s * (1 - up * 0.3), 0, 0, TAU);
      g.fill();
      const ax = d.x - Math.sin(rot) * FEET * s;
      const ay = d.y - lift - FEET * s * (1 - Math.cos(rot));
      this.lightUnder(g, d, s);
      drawPic(g, bank.shaded(frame.pic, DARK), ax, ay, { scale: s, sx, sy, rot });
      const lit = this.lights.at(d.x, d.y - 8, this.tiles!, this.lit);
      if (lit.level > 0.03)
        this.relight.draw(g, frame.pic, ax, ay, [lit.r, lit.g, lit.b], lit.level * RELIT, { scale: s, sx, sy, rot });
    }
  }

  /**
   * The light that is on the picture under a friend, so that it lights what is behind her and not
   * her: a pool of her own colour on the floor while she dances, and a spotlight coming down on her
   * for a moment after she is touched.
   */
  private lightUnder(g: CanvasRenderingContext2D, d: Dancer, s: number): void {
    const before = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    if (d.into > 0.05) {
      g.save();
      g.translate(d.x, d.y);
      g.scale(1, 0.34);
      glowAt(g, 0, 0, 150 * s, MAGIC[d.id].scheme.flash, 0.5 * d.into);
      g.restore();
    }
    if (d.touched < 1.3) {
      const k = 1 - d.touched / 1.3;
      const top = d.y - 150 * s;
      const grad = g.createLinearGradient(0, top, 0, d.y);
      grad.addColorStop(0, `rgba(255,244,214,${(0.2 * k).toFixed(3)})`);
      grad.addColorStop(1, `rgba(255,244,214,${(0.05 * k).toFixed(3)})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(d.x - 6 * s, top);
      g.lineTo(d.x + 6 * s, top);
      g.lineTo(d.x + 48 * s, d.y + 2);
      g.lineTo(d.x - 48 * s, d.y + 2);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = before;
  }

  /**
   * The guests, those that are in the air (`high`) before the friends and those that stand after
   * them.
   */
  private paintGuests(p: Painter, high: boolean): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const march = this.parade !== null;
    const shift = this.parade ? this.parade.along : 0;
    for (const guest of this.guests.list) {
      const up = guest.kind === 'fairy' || guest.kind === 'butterfly' || guest.kind === 'bird';
      if (up !== high) continue;
      const pose = this.guests.pose(guest, this.time, march);
      const pic = bank.sprite('life', pose.sprite, pose.seconds);
      if (!pic) continue;
      const x = pose.x + shift;
      const y = pose.y - pose.lift;
      if (!up) {
        g.fillStyle = `rgba(0,4,20,${(0.3 * (1 - Math.min(1, pose.lift / 40) * 0.5)).toFixed(3)})`;
        g.beginPath();
        g.ellipse(x, pose.y + 1, 15 * pose.scale, 3 * pose.scale, 0, 0, TAU);
        g.fill();
      }
      drawPic(g, bank.shaded(pic, DARK), x, y, { scale: pose.scale, flip: pose.flip });
      if (this.lightGuests) {
        const lit = this.lights.at(x, pose.y - 8, this.tiles!, this.lit);
        if (lit.level > 0.03)
          this.relight.draw(g, pic, x, y, [lit.r, lit.g, lit.b], lit.level * RELIT, {
            scale: pose.scale,
            flip: pose.flip,
          });
      }
      if (guest.kind === 'fairy') glowAt(p.light, x, y - 10, 46, [255, 190, 235], 0.3);
    }
  }

  /** Nothing is held in front of the party, which is lit from inside the picture. */
  protected paintFront(_p: Painter): void {}
}
