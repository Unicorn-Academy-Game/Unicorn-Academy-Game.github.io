import type { UnicornId } from '../../shared/ids';
import { drawPic } from '../engine/bank';
import { COLORS, lighten, type RGB } from '../engine/color';
import { clamp, damp, easeOutCubic, hump, lerp, Spring, smooth, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import { glowAt } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Pointer } from '../engine/stage';
import { noteAt } from '../music';
import { Wonder, type WonderEnv } from '../wonder';
import { archOf, BUILD_SECONDS } from './balloons/arch';
import {
  blinkOf,
  bodyOf,
  type Face,
  foilColor,
  foilOf,
  knotOf,
  newFace,
  paintBalloon,
  paintBow,
  paintFace,
  paintString,
  paintTrail,
  paintTwinkle,
} from './balloons/art';
import { type Dress, dressOf } from './balloons/dress';
import { type Balloon, Field, R_BOUQUET } from './balloons/field';
import { type GarlandNote, paintGarland, slotOf } from './balloons/garland';
import { type Plan, planOf } from './balloons/layout';
import { Meadow } from './balloons/meadow';
import { DEGREES, type Degree, midiOf, PITCHES } from './balloons/notes';
import { confettiShower, noteDrift, PARTY_COLORS, popBurst, ringAt } from './balloons/pops';
import { type Piece, Rainbow } from './balloons/rainbow';
import { type Outcome, Progress, type Song, type Step } from './balloons/songbook';
import { Audience, type Member } from './sky/audience';
import { burstShell } from './sky/burst';
import { BurstLight } from './sky/light';
import { MAGIC, scheme } from './sky/looks';

/**
 * The points each star is earned at. A balloon is a point, the balloon the song asks for is two,
 * and a phrase and a whole song are worth more. With these the stand-in expert in the lab (always
 * the balloon the song asks for, 0.7 s apart) filled the meter in 40, 41 and 41 s on three seeds,
 * and the stand-in child (half of the player's pops are the one asked for, 1.05 s apart) in 76, 88
 * and 79 s.
 */
const BALLOON_STAR_COSTS = [14, 36, 66, 104, 152] as const;

const POINTS: Readonly<Record<Outcome, number>> = { free: 1, hit: 2, phrase: 4, song: 8 };
/** What a special balloon is worth, a foil star or heart, or a friend's gift. */
const SPECIAL_POINTS = 3;
/**
 * How far past the edge of a balloon a touch still counts, at first and at most. A miss widens it,
 * and a hit puts it back.
 */
const SLACK = 12;
const SLACK_MOST = 28;
/**
 * Seconds before a friend can make another balloon, and before the gift can send up another row.
 */
const GIFT_EVERY = 7;
const BOX_EVERY = 2.4;
/** The golden of the great heart at the end. */
const HEART_SCHEME = scheme([255, 224, 140], COLORS.gold, COLORS.cream, COLORS.white);
const STAR_SCHEME = scheme([255, 230, 150], COLORS.gold, COLORS.amber, COLORS.cream);
const LOVE_SCHEME = scheme([255, 150, 190], COLORS.rose, COLORS.pink, COLORS.cream);

/** A glow that flies from a balloon that sang the right note to its place in the garland. */
interface Orb {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly color: RGB;
  t: number;
  readonly dur: number;
}

/** The great golden heart of the finale. */
interface Heart {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly start: number;
  readonly rise: number;
}

/**
 * The balloon song. Balloons float up from behind the hills, and every one is a note: red, orange,
 * yellow, blue and purple are C D E G and A, and a small balloon sings the same note higher. A pop
 * is the note and a burst of colour. A garland under the star meter shows the song the player is
 * on, a few notes at a time, and the balloons that sing the next note glow and open their mouths,
 * so they can play an old tune by popping the colours in order, and when they have played it the
 * bouquet plays it back to them. A bouquet of the five colours is always tied to the gift, so there
 * is always a note to play. The friends hand the player their own balloons, which burst into their
 * magic. On the fifth star a rainbow of balloons is let out of the gift, and they pop it, column by
 * column, as the song, and a golden heart rises.
 */
export class BalloonSong extends Wonder {
  readonly id = 'balloon-song' as const;
  protected readonly meter = new Meter(BALLOON_STAR_COSTS);
  private readonly dress: Dress;
  private readonly field: Field;
  private readonly songs = new Progress();
  private readonly audience: Audience;
  private readonly light = new BurstLight();
  private readonly rainbow = new Rainbow();
  private readonly seed: number;
  private meadow!: Meadow;
  private plan!: Plan;
  /** How many balloons float free at once, which depends on how much sky there is. */
  private want = 10;
  private spawnWait = 0;
  private nextSpecial = 24;
  private specialKind: 'star' | 'heart' = 'star';
  private nextWave = 38;
  private slack = SLACK;
  /** How much the player has been playing lately, 0 to 1, which brings the band in. */
  private activity = 0;
  /**
   * Where the faces look: at the player's finger, and then, when it has been still for a while, the
   * middle of the screen.
   */
  private readonly gaze = { x: 0, y: 0, still: 0 };
  private orbs: Orb[] = [];
  /** The phrase that has just been finished, held in the garland for a moment while it bounces. */
  private finished: { readonly notes: readonly GarlandNote[]; readonly until: number } | null = null;
  /** When the phrase in the garland appeared, for it to drop in. */
  private garlandSince = 0;
  private garlandBounce = 0;
  private readonly box = new Spring(1, 1, 230, 11);
  private lastBox = -10;
  private readonly giftReady = new Map<UnicornId, number>();
  /**
   * The moment on the script's clock at which the bouquet has finished playing the player's song
   * back, or -1.
   */
  private replayEnds = -1;
  /**
   * Which note of which phrase of the song being played back is sounding, for the garland to show.
   */
  private karaoke: { readonly song: Song; readonly phrase: number; readonly note: number } | null = null;
  private heart: Heart | null = null;
  /** How much the sky is lit by what has just burst, which fades. */
  private glow = 0;
  private moteWait = 0;
  private giftWait = 1;
  private first = true;
  private lastSong: Song | null = null;
  private readonly face: Face = newFace();

  constructor(env: WonderEnv) {
    super(env);
    this.dress = dressOf(env.look);
    this.field = new Field(env.rng);
    this.audience = new Audience(env.bank, env.rng, this.dress.tint);
    this.seed = env.rng.int(0x7fffffff);
    this.startMusic(this.dress.style);
  }

  override get bloom(): number {
    return this.env.calm ? 0.2 : 0.4;
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly balloons: readonly {
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly degree: Degree;
      readonly high: boolean;
      readonly kind: string;
      readonly tied: boolean;
      readonly ready: boolean;
    }[];
    readonly target: Degree;
    readonly done: number;
    readonly phrase: number;
    readonly song: string;
    readonly completed: number;
    readonly gift: { readonly x: number; readonly y: number; readonly half: number; readonly height: number };
    readonly rainbow: { readonly standing: boolean; readonly left: number; readonly total: number };
    readonly replaying: boolean;
    readonly want: number;
    readonly slack: number;
    readonly friends: readonly { readonly id: UnicornId; readonly x: number; readonly y: number }[];
  } {
    const g = this.plan.gift;
    return {
      balloons: this.field.balloons.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        r: b.r,
        degree: b.degree,
        high: b.high,
        kind: b.kind,
        tied: b.tie !== null,
        ready: b.grow.x > 0.5 && !b.leaving,
      })),
      target: this.songs.target,
      done: this.songs.done,
      phrase: this.songs.phrase.length,
      song: this.songs.song.id,
      completed: this.songs.completed,
      gift: { x: g.x, y: g.y, half: g.half, height: g.height },
      rainbow: { standing: this.rainbow.standing, left: this.rainbow.left, total: this.rainbow.pieces.length },
      replaying: this.script.now < this.replayEnds,
      want: this.want,
      slack: this.slack,
      friends: this.audience.members.map((m) => ({ id: m.id, x: m.x, y: m.y - 50 * m.scale })),
    };
  }

  protected arrange(view: View): void {
    this.plan = planOf({ w: view.w, h: view.h, unit: view.unit });
    this.meadow = new Meadow(this.dress, this.seed, view, this.plan);
    this.want = Math.round(clamp((view.w * view.h) / 22000, 7, 14) * (this.env.calm ? 0.8 : 1));
    const fan = this.plan.ties.reduce((far, t) => Math.max(far, Math.abs(Math.sin(t.angle) * t.length)), 0) + R_BOUQUET;
    this.audience.stand(this.env.herd, view.w, this.plan.gift.x, this.plan.feet + 6, fan + 16, this.time, {
      maxScale: 0.8,
      step: 112,
    });
    this.gaze.x = view.w / 2;
    this.gaze.y = view.h * 0.4;
    this.rainbow.clear();
    this.heart = null;
    this.setUp(this.first);
    this.first = false;
  }

  /**
   * Fills the sky and ties the bouquet to the gift. On the first showing the balloons of the
   * bouquet are blown up one by one.
   */
  private setUp(blowUp: boolean): void {
    this.field.clear();
    this.plan.ties.forEach((tie, i) => {
      const b = this.field.tie(tie, DEGREES[i]!, !blowUp);
      if (!blowUp) return;
      b.grow.target = 0;
      this.script.at(this.script.now + 0.45 + i * 0.16, () => {
        b.grow.target = 1;
        this.env.sound.fx('tap', { pan: this.pan(b.x), gain: 0.35, pitch: 4 + i * 2 });
      });
    });
    this.field.seed(this.plan.area, Math.round(this.want * 0.6));
  }

  protected reset(): void {
    this.songs.reset();
    this.rainbow.clear();
    this.heart = null;
    this.orbs = [];
    this.finished = null;
    this.light.clear();
    this.audience.reset(this.time);
    this.giftReady.clear();
    this.activity = 0;
    this.slack = SLACK;
    this.spawnWait = 0;
    this.nextSpecial = this.time + 24;
    this.nextWave = this.time + 38;
    this.specialKind = 'star';
    this.replayEnds = -1;
    this.karaoke = null;
    this.garlandSince = this.time;
    this.garlandBounce = 0;
    this.glow = 0;
    this.lastSong = null;
    this.setUp(true);
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  private colorOf(b: Balloon): RGB {
    if (b.kind === 'gift' && b.gift) return MAGIC[b.gift].scheme.colors[0]!;
    if (b.kind === 'star') return foilColor('star');
    if (b.kind === 'heart') return foilColor('heart');
    return PITCHES[b.degree].color;
  }

  protected hint(): { x: number; y: number } | null {
    if (this.phase !== 'play') return null;
    // The balloon that sings the next note which the player can reach best: nearest the middle of
    // the screen, from the sky before the bouquet.
    const want = this.songs.target;
    let best: Balloon | null = null;
    let score = Infinity;
    for (const b of this.field.balloons) {
      if (b.kind !== 'note' || b.degree !== want || b.leaving || b.grow.x < 0.9 || b.y < 100) continue;
      const s = Math.abs(b.y - this.view.h * 0.5) + (b.tie ? 60 : 0);
      if (s < score) {
        score = s;
        best = b;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  protected press(p: Pointer): void {
    this.look(p.x, p.y);
    if (this.phase === 'finale') {
      this.touchRainbow(p.x, p.y);
      return;
    }
    // What is drawn on top is what the player touched: the bouquet, then a friend, then the
    // balloons floating behind.
    const bouquet = this.field.at(p.x, p.y, this.slack, 'tied');
    if (bouquet) {
      this.slack = SLACK;
      this.pop(bouquet, 0);
      return;
    }
    const friend = this.audience.at(p.x, p.y);
    if (friend) {
      this.give(friend);
      return;
    }
    const free = this.field.at(p.x, p.y, this.slack, 'free');
    if (free) {
      this.slack = SLACK;
      this.pop(free, 0);
      return;
    }
    if (this.onGift(p.x, p.y)) {
      this.openGift();
      return;
    }
    this.emptySky(p.x, p.y);
  }

  protected override drag(p: Pointer): void {
    this.look(p.x, p.y);
    if (this.phase === 'finale') {
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - p.px, p.y - p.py) / 8));
      for (let i = 1; i <= steps; i++) this.touchRainbow(lerp(p.px, p.x, i / steps), lerp(p.py, p.y, i / steps), true);
      return;
    }
    // A finger dragged through balloons pops them one after another, so the notes run like a
    // glissando.
    const met = this.field.along(p.px, p.py, p.x, p.y, 4);
    met.slice(0, 6).forEach((b, i) => {
      this.pop(b, i);
    });
  }

  private look(x: number, y: number): void {
    this.gaze.x = x;
    this.gaze.y = y;
    this.gaze.still = 0;
  }

  /**
   * A touch on nothing: a small ring where the player touched, a puff that sets the balloons near
   * it swaying, and a quiet note by where it was.
   */
  private emptySky(x: number, y: number): void {
    this.slack = Math.min(SLACK_MOST, this.slack + 5);
    this.field.push(x, y, 80, 90);
    ringAt(this.fx, this.env.rng, x, y, [255, 255, 255], 26);
    this.env.sound.fx('tap', { pan: this.pan(x), gain: 0.6 });
  }

  private onGift(x: number, y: number): boolean {
    const g = this.plan.gift;
    return Math.abs(x - g.x) < g.half + 8 && y > g.y - g.height - 8 && y < g.y + 14;
  }

  /**
   * The gift opens: it wobbles, a run of the five notes plays, and a row of the five balloons comes
   * up from behind the hills.
   */
  private openGift(): void {
    const g = this.plan.gift;
    this.box.kick(-9);
    this.env.sound.fx('boing', { pan: this.pan(g.x), gain: 0.5, pitch: 3 });
    if (this.time - this.lastBox < BOX_EVERY) return;
    this.lastBox = this.time;
    const up = this.env.rng.next() < 0.5;
    this.field.wave(this.plan.area, up);
    DEGREES.forEach((d, i) => {
      const degree = (up ? d : 4 - d) as Degree;
      this.env.sound.note(this.dress.voice, midiOf(degree, false), {
        gain: 0.55 * this.dress.voiceGain,
        delay: 0.1 + i * 0.075,
        seconds: 0.6,
      });
    });
    for (let i = this.fx.count(14); i > 0; i--) {
      const a = this.env.rng.range(-Math.PI * 0.9, -Math.PI * 0.1);
      const v = this.env.rng.range(60, 190);
      this.fx.emit({
        x: g.x + this.env.rng.range(-12, 12),
        y: g.y - g.height,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: this.env.rng.range(0.6, 1.1),
        size: this.env.rng.range(5, 9),
        size1: 1,
        color: lighten(PARTY_COLORS[i % PARTY_COLORS.length]!, 0.3),
        shape: i % 3 === 0 ? 'star4' : 'spark',
        drag: 1.8,
        gravity: 80,
        twinkle: 12,
        hold: 0.3,
      });
    }
  }

  /**
   * A balloon goes off. `order` is its place in a swipe, so the notes of a glissando come one after
   * another.
   */
  private pop(b: Balloon, order: number): void {
    const rng = this.env.rng;
    const color = this.colorOf(b);
    this.field.remove(b);
    const power = b.kind === 'note' ? 1 : 1.5;
    popBurst(this.fx, rng, b.x, b.y, color, b.r, power);
    this.field.push(b.x, b.y, 95, 130);
    this.light.add(b.x, b.y, color, 150, b.kind === 'note' ? 0.22 : 0.5);
    this.glow = Math.min(1, this.glow + 0.25);
    this.activity = Math.min(1, this.activity + 0.2);
    const delay = order * 0.05;
    if (b.tie) this.bringBack(this.plan.ties.indexOf(b.tie));
    if (b.kind === 'note') this.sing(b, delay);
    else if (b.kind === 'gift') this.unwrap(b);
    else this.shine(b);
  }

  /** The bouquet is one balloon short, and a new one is blown up in its place. */
  private bringBack(slot: number): void {
    if (slot < 0) return;
    this.script.at(this.script.now + 0.7, () => {
      const tie = this.plan.ties[slot];
      if (!tie || this.phase === 'finale' || this.field.balloons.some((b) => b.tie === tie)) return;
      const b = this.field.tie(tie, DEGREES[slot]!);
      this.env.sound.fx('tap', { pan: this.pan(b.x), gain: 0.3, pitch: 6 });
    });
  }

  /** A balloon of a note is popped: its note sounds, and the song hears about it. */
  private sing(b: Balloon, delay: number): void {
    const before = this.songs.phrase;
    const index = this.songs.done;
    const song = this.songs.song;
    const outcome = this.songs.pop(b.degree);
    const pan = this.pan(b.x);
    const right = outcome !== 'free';
    this.env.sound.fx('snap', { pan, size: clamp((b.r - 20) / 16), gain: 0.85, delay });
    this.env.sound.note(this.dress.voice, midiOf(b.degree, b.high), {
      pan,
      gain: (right ? 1.1 : 0.95) * this.dress.voiceGain,
      seconds: right ? 1.1 : 0.8,
      delay,
    });
    if (right) {
      this.audience.cheer(b.x, 0.9, this.time, this.view.w);
      this.env.sound.fx('twinkle', { pan, gain: 0.35, delay: delay + 0.03 });
      noteDrift(this.fx, this.env.rng, b.x, b.y, this.colorOf(b), 2);
      this.collect(b, index, before.length);
    }
    if (outcome === 'phrase' || outcome === 'song') this.phraseDone(before, outcome === 'song' ? song : null);
    // Last, because the fifth star may begin the finale, which takes over everything.
    this.earn(POINTS[outcome]);
  }

  /** A glow flies from the balloon to its place in the garland. */
  private collect(b: Balloon, index: number, count: number): void {
    const g = this.plan.garland;
    this.orbs.push({ x0: b.x, y0: b.y, x1: slotOf(g, index, count), y1: g.y, color: this.colorOf(b), t: 0, dur: 0.5 });
  }

  /**
   * A phrase is played: the garland bounces and rings, and if it was the last, the bouquet plays
   * the whole song back.
   */
  private phraseDone(phrase: readonly Step[], song: Song | null): void {
    const g = this.plan.garland;
    this.finished = {
      notes: phrase.map((s) => ({ color: PITCHES[s.degree].color, state: 'done' as const })),
      until: this.time + 0.7,
    };
    this.garlandBounce = 1;
    this.garlandSince = this.time + 0.7;
    const rng = this.env.rng;
    for (let i = 0; i < phrase.length; i++)
      ringAt(this.fx, rng, slotOf(g, i, phrase.length), g.y, PITCHES[phrase[i]!.degree].color, 22);
    this.env.sound.fx('ding', { step: this.songs.completed + this.songs.done, delay: 0.1 });
    [0, 1, 2].forEach((i) => {
      this.env.sound.note('bell', 79 + [0, 4, 7][i]!, { gain: 0.6, delay: 0.14 + i * 0.07, seconds: 0.9 });
    });
    this.audience.cheer(this.plan.gift.x, 0.9, this.time, this.view.w);
    if (!song) return;
    this.lastSong = song;
    this.flash(0.3, [255, 240, 200]);
    confettiShower(this.fx, rng, this.view.w, 70, PARTY_COLORS);
    this.env.sound.fx('star', { step: 2, delay: 0.2 });
    this.replay(song);
  }

  /**
   * The first moment at or after `after` seconds from now that falls on a beat of the band, so a
   * tune begun then is in time with it.
   */
  private onBeat(after: number): number {
    const band = this.band;
    if (!band?.playing) return after;
    const beat = band.beatSeconds;
    const first = (1 - (band.beats % 1)) * beat;
    return first + Math.ceil(Math.max(0, after - first) / beat) * beat;
  }

  /**
   * The bouquet plays a song back on the beat of the band, every balloon singing as its note comes
   * and the garland showing where it is.
   */
  private replay(song: Song): void {
    const beat = this.band?.beatSeconds ?? 0.6;
    let at = this.script.now + this.onBeat(beat * 0.6);
    song.phrases.forEach((phrase, pi) => {
      phrase.forEach((step, si) => {
        const seconds = step.beats * beat;
        this.script.at(at, () => {
          if (si === 0) this.garlandSince = this.time;
          this.karaoke = { song, phrase: pi, note: si };
          this.bouquetSings(step.degree, seconds);
        });
        at += seconds;
      });
    });
    this.replayEnds = at + 0.4;
    // When it is over the garland comes back with the next song.
    this.script.at(this.replayEnds, () => {
      this.karaoke = null;
      this.garlandSince = this.time;
    });
  }

  private bouquetSings(degree: Degree, seconds: number): void {
    const slot = this.plan.ties[degree]!;
    const color = PITCHES[degree].color;
    const b = this.field.balloons.find((x) => x.tie === slot);
    const x = b ? b.x : slot.x + Math.sin(slot.angle) * slot.length;
    const y = b ? b.y : slot.y - Math.cos(slot.angle) * slot.length;
    if (b) {
      b.call = 1;
      b.bump.kick(7);
    }
    this.env.sound.note(this.dress.voice, midiOf(degree, false), {
      pan: this.pan(x),
      gain: 1.05 * this.dress.voiceGain,
      seconds: Math.min(1.4, seconds),
    });
    noteDrift(this.fx, this.env.rng, x, y - 20, color, 2);
    ringAt(this.fx, this.env.rng, x, y, color, 30);
    this.light.add(x, y, color, 170, 0.3);
  }

  /**
   * A star or a heart of foil goes off: a great shape of sparks in the sky, and the five notes run
   * up.
   */
  private shine(b: Balloon): void {
    const rng = this.env.rng;
    const kind = b.kind === 'star' ? 'star' : 'heart';
    burstShell(this.fx, rng, {
      x: b.x,
      y: b.y,
      kind,
      scheme: kind === 'star' ? STAR_SCHEME : LOVE_SCHEME,
      radius: 92,
      power: 1.1,
      fine: 0.9,
    });
    this.light.add(b.x, b.y, kind === 'star' ? STAR_SCHEME.flash : LOVE_SCHEME.flash, 330, 0.8);
    this.flash(0.3, kind === 'star' ? STAR_SCHEME.flash : LOVE_SCHEME.flash);
    this.shake(0.7);
    const pan = this.pan(b.x);
    this.env.sound.fx('snap', { pan, size: 1, gain: 0.9 });
    this.env.sound.fx('coin', { pan, delay: 0.05 });
    DEGREES.forEach((d, i) => {
      this.env.sound.note('glass', midiOf(d, true), { pan, gain: 0.8, delay: 0.08 + i * 0.065, seconds: 0.9 });
    });
    this.audience.cheer(b.x, 1.1, this.time, this.view.w);
    this.earn(SPECIAL_POINTS);
  }

  /** A friend's balloon goes off in her own magic. */
  private unwrap(b: Balloon): void {
    const rng = this.env.rng;
    const magic = MAGIC[b.gift ?? 'wildstar'];
    burstShell(this.fx, rng, {
      x: b.x,
      y: b.y,
      kind: magic.kind,
      scheme: magic.scheme,
      radius: 78,
      power: 1,
      fine: 0.85,
    });
    this.light.add(b.x, b.y, magic.scheme.flash, 280, 0.7);
    this.flash(0.22, magic.scheme.flash);
    const pan = this.pan(b.x);
    this.env.sound.fx('snap', { pan, size: 0.8, gain: 0.85 });
    this.env.sound.fx('twinkle', { pan, delay: 0.05 });
    [76, 79, 83].forEach((m, i) => {
      this.env.sound.note('bell', m, { pan, gain: 0.75, delay: 0.06 + i * 0.07, seconds: 1 });
    });
    this.audience.cheer(b.x, 1, this.time, this.view.w);
    this.earn(SPECIAL_POINTS);
  }

  /**
   * A friend is touched. She casts, and a balloon of her own colour grows at her horn and floats
   * up.
   */
  private give(friend: Member): void {
    const horn = this.audience.cast(friend, this.time);
    this.env.sound.fx('tap', { pan: this.pan(friend.x) });
    const ready = this.giftReady.get(friend.id) ?? 0;
    const alive = this.field.balloons.some((b) => b.kind === 'gift' && b.gift === friend.id);
    if (alive || this.time < ready) return;
    this.giftReady.set(friend.id, this.time + GIFT_EVERY);
    this.script.at(this.script.now + horn.after, () => {
      const b = this.field.launch(this.plan.area, {
        kind: 'gift',
        gift: friend.id,
        x: horn.x,
        y: horn.y - 28,
        rise: 22,
        grown: false,
      });
      this.fx.emit({
        x: b.x,
        y: b.y,
        life: 0.5,
        size: 20,
        size1: 90,
        color: MAGIC[friend.id].scheme.flash,
        shape: 'glow',
        alpha: 0.7,
      });
      this.env.sound.fx('whoosh', { pan: this.pan(b.x), gain: 0.4 });
    });
  }

  protected finale(): void {
    this.script.clear();
    this.replayEnds = -1;
    this.karaoke = null;
    this.finished = null;
    this.orbs = [];
    this.env.sound.fx('swell');
    this.flash(0.35, [255, 240, 210]);
    this.audience.celebrate(this.time);
    this.release();
    const arch = archOf(this.view.w, this.plan.rainbow.baseY, this.plan.rainbow.top);
    const gift = this.plan.gift;
    const from = { x: gift.x, y: gift.y - gift.height };
    const beat = this.band?.beatSeconds ?? 0.6;
    this.script.at(0.9, () => {
      this.rainbow.build(arch, from, this.time, this.env.rng);
      // Each ring of the rainbow rings its note as its first balloon arrives, climbing the scale.
      const ring = [72, 74, 76, 79, 81, 84];
      for (let r = 0; r < arch.rings; r++) {
        this.script.at(this.script.now + this.rainbow.arrival(r), () => {
          this.env.sound.note(this.dress.voice, ring[r]!, { gain: 0.95 * this.dress.voiceGain, seconds: 1.2 });
          this.env.sound.fx('ding', { step: r, gain: 0.5 });
          this.flash(0.12, PITCHES[Math.min(4, r) as Degree].color);
        });
      }
    });
    const built = 0.9 + BUILD_SECONDS;
    this.script.at(built, () => {
      this.env.sound.fx('cheer');
      this.audience.cheer(gift.x, 1.4, this.time, this.view.w);
      confettiShower(this.fx, this.env.rng, this.view.w, 50, PARTY_COLORS);
    });
    // Then the song is played across the rainbow, a column to a note, and every column goes off as
    // its note comes.
    const song = this.lastSong ?? this.songs.played ?? this.songs.song;
    const steps = song.phrases.flat();
    let at = this.onBeat(built + 1.5);
    steps.forEach((step, i) => {
      this.script.at(at, () => this.popColumn(i, steps.length, step));
      at += step.beats * beat;
    });
    at += 0.7;
    this.script.at(at, () => this.liftHeart(from, arch));
    this.script.at(at + 3.3, () => this.burstHeart());
    this.script.at(at + 8, () => {
      this.endFinale();
      this.resume();
    });
  }

  /**
   * Every balloon still in the sky floats away and the bouquet lets go of the gift, so the sky is
   * clear for the rainbow.
   */
  private release(): void {
    for (const b of [...this.field.balloons]) {
      if (b.tie) {
        this.field.remove(b);
        const free = this.field.launch(this.plan.area, { x: b.x, y: b.y, degree: b.degree, high: false, rise: 22 });
        free.leaving = true;
      } else {
        b.leaving = true;
      }
    }
  }

  /**
   * The finale is over and the player plays on: the bouquet is blown up again and the sky refills.
   */
  private resume(): void {
    this.rainbow.clear();
    this.heart = null;
    this.field.clear();
    this.plan.ties.forEach((tie, i) => {
      const b = this.field.tie(tie, DEGREES[i]!);
      b.grow.target = 0;
      this.script.at(this.script.now + 0.3 + i * 0.14, () => {
        b.grow.target = 1;
      });
    });
    this.garlandSince = this.time;
    this.nextSpecial = this.time + 14;
    this.nextWave = this.time + 20;
  }

  /** One column of the rainbow goes off, to the note of one step of the song. */
  private popColumn(column: number, columns: number, step: Step): void {
    const pieces = this.rainbow.column(column, columns);
    const beat = this.band?.beatSeconds ?? 0.6;
    let sx = 0;
    let sy = 0;
    for (const p of pieces) {
      const at = this.rainbow.place(p, this.time);
      sx += at.x;
      sy += at.y;
      this.burstPiece(p, at.x, at.y, 0.45);
    }
    if (pieces.length === 0) return;
    const x = sx / pieces.length;
    const y = sy / pieces.length;
    const pan = this.pan(x);
    this.env.sound.fx('snap', { pan, size: 0.7, gain: 0.8 });
    this.env.sound.note(this.dress.voice, midiOf(step.degree, false) + 12, {
      pan,
      gain: 1.05 * this.dress.voiceGain,
      seconds: Math.min(1.4, step.beats * beat),
    });
    this.light.add(x, y, PITCHES[step.degree].color, 240, 0.5);
    this.audience.cheer(x, 0.8, this.time, this.view.w);
    this.glow = Math.min(1, this.glow + 0.3);
    noteDrift(this.fx, this.env.rng, x, y, PITCHES[step.degree].color, 2);
  }

  private burstPiece(p: Piece, x: number, y: number, power: number): void {
    p.popped = true;
    popBurst(this.fx, this.env.rng, x, y, p.color, this.rainbow.arch?.r ?? 12, power);
  }

  /**
   * A touch during the finale pops the balloon of the rainbow under it, or rings a note of the sky.
   */
  private touchRainbow(x: number, y: number, sweeping = false): void {
    const arch = this.rainbow.arch;
    const p = arch ? this.rainbow.hit(x, y, sweeping ? 2 : 8, this.time) : null;
    if (p) {
      const at = this.rainbow.place(p, this.time);
      this.burstPiece(p, at.x, at.y, 0.6);
      const pan = this.pan(at.x);
      this.env.sound.fx('snap', { pan, size: 0.4, gain: 0.7 });
      this.env.sound.note(this.dress.voice, [72, 74, 76, 79, 81, 84][p.slot.ring]! + (p.slot.u > 0.5 ? 0 : 0), {
        pan,
        gain: 0.7 * this.dress.voiceGain,
        seconds: 0.7,
      });
      return;
    }
    if (sweeping) return;
    ringAt(this.fx, this.env.rng, x, y, [255, 255, 255], 28);
    this.env.sound.note(this.dress.voice, noteAt(x / this.view.w, 72, 10), {
      pan: this.pan(x),
      gain: 0.7 * this.dress.voiceGain,
      seconds: 0.8,
    });
  }

  /** The golden heart is let out of the gift and rises into the opening of the rainbow. */
  private liftHeart(from: { x: number; y: number }, arch: ReturnType<typeof archOf>): void {
    this.heart = { from, to: { x: arch.cx, y: arch.baseY - arch.openRy * 0.6 }, start: this.time, rise: 2.6 };
    this.env.sound.fx('swell', { gain: 0.9 });
    this.env.sound.fx('whoosh', { gain: 0.5, pitch: 5 });
  }

  /** The heart bursts, and the rainbow with it. */
  private burstHeart(): void {
    const h = this.heart;
    if (!h) return;
    const rng = this.env.rng;
    const x = h.to.x;
    const y = h.to.y;
    this.heart = null;
    // Whatever is left of the rainbow goes with it.
    for (const p of this.rainbow.pieces) {
      if (p.popped) continue;
      const at = this.rainbow.place(p, this.time);
      this.burstPiece(p, at.x, at.y, 0.35);
    }
    burstShell(this.fx, rng, {
      x,
      y,
      kind: 'heart',
      scheme: HEART_SCHEME,
      radius: Math.min(150, this.view.h * 0.42),
      power: 1.6,
      fine: 1,
    });
    [-1, 1].forEach((side, k) => {
      this.script.at(this.script.now + 0.3 + k * 0.2, () => {
        burstShell(this.fx, rng, {
          x: x + side * this.view.w * 0.26,
          y: y - 20 - k * 26,
          kind: k === 0 ? 'star' : 'rainbow',
          scheme: k === 0 ? STAR_SCHEME : LOVE_SCHEME,
          radius: 84,
          power: 1.2,
          fine: 0.9,
        });
        this.env.sound.fx('boom', { pan: side * 0.5, size: 0.7 });
      });
    });
    this.light.add(x, y, HEART_SCHEME.flash, 520, 1);
    this.flash(0.8, HEART_SCHEME.flash);
    this.shake(2);
    this.glow = 1;
    this.env.sound.fx('boom', { size: 1 });
    this.env.sound.fx('cheer', { delay: 0.2 });
    [72, 76, 79, 84].forEach((m, i) => {
      this.env.sound.note('bell', m, { gain: 0.9, delay: 0.05 + i * 0.09, seconds: 1.6 });
    });
    this.audience.celebrate(this.time);
    confettiShower(this.fx, rng, this.view.w, 120, PARTY_COLORS);
  }

  protected override musicEnergy(): number {
    if (this.phase === 'finale') return 1;
    const stars = this.meter.stars + this.meter.fraction * (this.meter.full ? 0 : 1);
    const base = this.phase === 'after' ? 0.5 : 0.12 + 0.46 * (stars / 5);
    return clamp(base + this.activity * 0.38);
  }

  protected tick(dt: number): void {
    this.light.update(dt);
    this.meadow.update(dt);
    this.audience.update(this.time);
    this.field.update(dt, this.plan.area);
    this.box.step(dt);
    this.glow = damp(this.glow, 0, 2.6, dt);
    this.activity = damp(this.activity, 0, 0.35, dt);
    this.garlandBounce = damp(this.garlandBounce, 0, 4, dt);
    this.gaze.still += dt;
    if (this.gaze.still > 4) {
      this.gaze.x = damp(this.gaze.x, this.view.w / 2, 1.5, dt);
      this.gaze.y = damp(this.gaze.y, this.view.h * 0.4, 1.5, dt);
    }
    this.callTarget(dt);
    this.sparkleGift(dt);
    this.spawn(dt);
    this.flyOrbs(dt);
    this.drift(dt);
    this.heartJets();
  }

  /**
   * The balloons that sing the next note of the song glow and open their mouths, and the rest do
   * not.
   */
  private callTarget(dt: number): void {
    const guiding = this.phase !== 'finale' && this.script.now >= this.replayEnds;
    const want = this.songs.target;
    for (const b of this.field.balloons) {
      const wanted = guiding && b.kind === 'note' && b.degree === want && !b.leaving ? 1 : 0;
      // A balloon that has been rung by the replay keeps what it was given and lets it go.
      b.call = wanted > b.call ? damp(b.call, wanted, 7, dt) : damp(b.call, wanted, b.tie && !guiding ? 3 : 6, dt);
    }
  }

  private spawn(dt: number): void {
    if (this.phase === 'finale') return;
    this.spawnWait -= dt;
    const area = this.plan.area;
    const rng = this.env.rng;
    if (this.time >= this.nextSpecial && !this.field.balloons.some((b) => b.kind === 'star' || b.kind === 'heart')) {
      this.field.launch(area, { kind: this.specialKind });
      this.specialKind = this.specialKind === 'star' ? 'heart' : 'star';
      this.nextSpecial = this.time + rng.range(24, 34) * (this.phase === 'after' ? 0.6 : 1);
    }
    const sparse = this.field.free < 3 && this.time - this.lastBox > 8;
    if (this.time >= this.nextWave || sparse) {
      this.field.wave(area, rng.next() < 0.5);
      this.nextWave = this.time + rng.range(34, 46);
      this.lastBox = this.time - BOX_EVERY / 2;
    }
    if (this.spawnWait > 0) return;
    const hungry = this.field.free < this.want * 0.5;
    // The song is never left waiting for a balloon: the sky always has a big one of the note it
    // wants and of the note after it.
    for (const degree of this.songs.next(2)) {
      if (this.field.visible(degree, area, true) > 0) continue;
      this.field.launch(area, { degree, high: false });
      this.spawnWait = hungry ? 0.2 : 0.45;
      return;
    }
    if (this.field.free < this.want) {
      this.field.launch(area);
      this.spawnWait = (hungry ? 0.2 : 0.5) + rng.range(0, 0.3);
    }
  }

  private flyOrbs(dt: number): void {
    const rng = this.env.rng;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]!;
      o.t += dt;
      if (o.t >= o.dur) {
        this.orbs.splice(i, 1);
        this.garlandBounce = Math.max(this.garlandBounce, 0.45);
        ringAt(this.fx, rng, o.x1, o.y1, o.color, 18);
        continue;
      }
      if (rng.next() < 0.6 * this.fx.density) {
        const at = this.orbAt(o);
        this.fx.emit({
          x: at.x,
          y: at.y,
          vx: rng.range(-16, 16),
          vy: rng.range(-6, 22),
          life: 0.4,
          size: 6,
          size1: 1,
          color: lighten(o.color, 0.5),
          shape: 'spark',
          drag: 2,
        });
      }
    }
  }

  /** Now and then a glint on the gift, so it looks like something that can be touched. */
  private sparkleGift(dt: number): void {
    this.giftWait -= dt;
    if (this.giftWait > 0 || this.phase === 'finale') return;
    const rng = this.env.rng;
    this.giftWait = rng.range(0.7, 1.7);
    if (rng.next() > this.fx.density) return;
    const g = this.plan.gift;
    this.fx.emit({
      x: g.x + rng.range(-g.half, g.half) * 0.9,
      y: g.y - rng.range(0.25, 1) * g.height,
      life: 0.85,
      size: rng.range(8, 13),
      size1: 2,
      color: lighten(COLORS.gold, 0.55),
      shape: 'star4',
      twinkle: 5,
      rot: rng.range(0, 1),
      spin: rng.range(-2, 2),
      hold: 0.3,
    });
  }

  /** Whatever drifts in the air of this sky: confetti, golden glints or fireflies. */
  private drift(dt: number): void {
    const m = this.dress.motes;
    const rng = this.env.rng;
    this.moteWait -= dt;
    if (this.moteWait > 0) return;
    this.moteWait = (1 / m.rate) * rng.range(0.6, 1.4) * (this.env.calm ? 2.2 : 1);
    if (rng.next() > this.fx.density) return;
    const { w, h } = this.view;
    const c = m.colors[rng.int(m.colors.length)]!;
    if (m.kind === 'confetti') {
      this.fx.emit({
        x: rng.range(0, w),
        y: -8,
        vx: rng.range(-8, 8),
        vy: rng.range(16, 30),
        life: 14,
        size: rng.range(5, 8),
        color: c,
        shape: 'confetti',
        sway: 22,
        spin: rng.range(-3, 3),
        rot: rng.range(0, TAU),
        alpha: 0.85,
        hold: 0.85,
      });
    } else if (m.kind === 'glints') {
      this.fx.emit({
        x: rng.range(0, w),
        y: this.plan.feet - rng.range(0, 40),
        vy: rng.range(-20, -9),
        vx: rng.range(-6, 6),
        life: rng.range(4, 6.5),
        size: rng.range(5, 8),
        size1: 2,
        color: c,
        shape: 'spark',
        sway: 14,
        twinkle: 3,
        hold: 0.3,
      });
    } else {
      this.fx.emit({
        x: rng.range(0, w),
        y: rng.range(h * 0.45, this.plan.feet - 20),
        vx: rng.range(-6, 6),
        vy: rng.range(-7, 3),
        life: rng.range(6, 9),
        size: rng.range(8, 12),
        color: c,
        shape: 'glow',
        sway: 26,
        twinkle: 1.4,
        fadeIn: 1,
        alpha: 0.85,
        hold: 0.4,
      });
    }
  }

  /** While the golden heart rises it leaves a trail of sparks. */
  private heartJets(): void {
    const h = this.heart;
    if (!h) return;
    const at = this.heartAt(h);
    if (this.env.rng.next() < 0.7 * this.fx.density) {
      this.fx.emit({
        x: at.x + this.env.rng.range(-10, 10),
        y: at.y + 20,
        vx: this.env.rng.range(-14, 14),
        vy: this.env.rng.range(8, 40),
        life: this.env.rng.range(0.6, 1.1),
        size: this.env.rng.range(4, 8),
        size1: 1,
        color: lighten(COLORS.gold, 0.5),
        color1: COLORS.amber,
        shape: this.env.rng.next() < 0.4 ? 'star4' : 'spark',
        drag: 1.5,
        twinkle: 12,
        hold: 0.3,
      });
    }
  }

  private heartAt(h: Heart): { x: number; y: number; scale: number } {
    const u = clamp((this.time - h.start) / h.rise);
    const e = easeOutCubic(u);
    const hover = u >= 1 ? Math.sin((this.time - h.start - h.rise) * 3) * 2.4 : 0;
    return {
      x: lerp(h.from.x, h.to.x, e) + Math.sin(u * 7) * 6 * (1 - u),
      y: lerp(h.from.y, h.to.y, e) + hover,
      scale: 0.2 + 0.8 * smooth(u * 1.6),
    };
  }

  protected paintBack(p: Painter): void {
    this.meadow.paintSky(p, Math.max(this.glow, this.light.ambient * 0.8));
    const free = this.field.balloons.filter((b) => !b.tie);
    for (const b of free) if (b.kind === 'note') this.paintOne(p, b);
    for (const b of free) if (b.kind !== 'note') this.paintOne(p, b);
    this.meadow.paintNear(p);
  }

  protected paintFront(p: Painter): void {
    this.audience.paint(p, this.light, this.time);
    this.paintBouquet(p);
    this.rainbow.paint(p.ctx, this.time, p.k);
    this.paintHeart(p);
    this.paintOrbs(p);
    this.paintSong(p);
  }

  /** One balloon, free or tied: its string, its body, its face, and what makes it special. */
  private paintOne(p: Painter, b: Balloon): void {
    const g = p.ctx;
    const grow = b.grow.x;
    if (grow <= 0.02) return;
    const color = this.colorOf(b);
    const pulse = this.band ? this.band.pulse(4) : 0;
    if (b.call > 0.03) glowAt(p.light, b.x, b.y, b.r * (3.6 + 0.6 * pulse), color, 0.55 * b.call * (0.8 + 0.2 * pulse));
    const knot = knotOf(b, grow);
    if (b.tie) {
      const gift = this.plan.gift;
      paintString(g, knot.x, knot.y, gift.x, gift.tieY, this.dress.string);
    } else {
      paintTrail(g, knot.x, knot.y, b.r, b.tail, b.age, this.dress.string);
    }
    const foil = b.kind === 'star' || b.kind === 'heart';
    const body = foil ? foilOf(b.kind === 'star' ? 'star' : 'heart', b.r, p.k) : bodyOf(color, b.r, p.k);
    const face = this.face;
    face.lookX = clamp((this.gaze.x - b.x) / 170, -1, 1);
    face.lookY = clamp((this.gaze.y - b.y) / 130, -1, 1);
    face.blink = blinkOf(b.age, b.phase);
    face.sing = b.call * (0.4 + 0.45 * pulse + 0.15 * Math.sin(b.age * 9));
    face.wide = clamp(Math.abs(b.bump.x) * 3.2);
    const eyes = foil ? b.r * 0.82 : b.r;
    const squash = b.bump.x + (b.call > 0.03 ? 0.04 * b.call * pulse : 0);
    paintBalloon(g, body, { x: b.x, y: b.y, r: b.r, tilt: b.tilt, grow, bump: squash, alpha: 1 }, (c) =>
      paintFace(c, eyes, face, !foil),
    );
    if (b.kind === 'gift') {
      paintBow(g, knot.x, knot.y + 1, b.r * 0.3, [255, 214, 90]);
      const t = b.age * 2.2;
      for (let i = 0; i < 3; i++)
        paintTwinkle(
          g,
          b.x + Math.cos(t + i * 2.1) * b.r * 1.15,
          b.y + Math.sin(t * 0.8 + i * 2.1) * b.r * 1.05,
          5 + (i % 2) * 2,
          0.55 + 0.4 * Math.sin(t * 1.7 + i),
        );
    } else if (foil) {
      const t = b.age * 1.9;
      paintTwinkle(g, b.x - b.r * 0.35, b.y - b.r * 0.5, 7 * (0.6 + 0.4 * Math.sin(t)), 0.5 + 0.5 * Math.sin(t));
      paintTwinkle(
        g,
        b.x + b.r * 0.45,
        b.y + b.r * 0.2,
        5 * (0.6 + 0.4 * Math.sin(t + 2)),
        0.5 + 0.5 * Math.sin(t + 2),
      );
    }
  }

  /** The gift on the hill, and the bouquet tied to it. */
  private paintBouquet(p: Painter): void {
    const g = p.ctx;
    const gift = this.plan.gift;
    const tied = this.field.balloons.filter((b) => b.tie);
    // The strings first, so they go behind the lid of the gift.
    for (const b of tied) {
      const knot = knotOf(b, b.grow.x);
      if (b.grow.x > 0.02) paintString(g, knot.x, knot.y, gift.x, gift.tieY, this.dress.string);
    }
    this.paintGift(p);
    for (const b of tied) this.paintOne(p, b);
  }

  private paintGift(p: Painter): void {
    const g = p.ctx;
    const gift = this.plan.gift;
    const pic = this.env.bank?.sprite('playground', 'pg-balloon-weight', 0) ?? null;
    // A soft shadow on the grass under it.
    g.fillStyle = 'rgba(20,10,40,0.26)';
    g.beginPath();
    g.ellipse(gift.x, gift.y + 1, gift.half * 1.1, 5, 0, 0, TAU);
    g.fill();
    if (pic) {
      const beat = this.band ? this.band.pulse(6) * 0.03 : 0;
      drawPic(g, pic, gift.x, gift.y, {
        scale: gift.scale,
        sx: 1 + (1 - this.box.x) * 0.5 + beat,
        sy: this.box.x - beat,
      });
      return;
    }
    // Without its picture, a box with a ribbon.
    g.fillStyle = '#7a5ad0';
    g.fillRect(gift.x - gift.half, gift.y - gift.height, gift.half * 2, gift.height);
    g.fillStyle = '#ffd24a';
    g.fillRect(gift.x - 4, gift.y - gift.height, 8, gift.height);
  }

  /**
   * What the garland shows now: the phrase the player has just finished, then the phrase they are
   * on, and while a song is played back each phrase of it as it is sung.
   */
  private garlandNotes(): { readonly notes: readonly GarlandNote[]; readonly fade: number } | null {
    if (this.finished && this.time < this.finished.until) return { notes: this.finished.notes, fade: 1 };
    if (this.phase === 'finale') return null;
    const asShown = (phrase: readonly Step[], at: number): GarlandNote[] =>
      phrase.map(
        (s, i): GarlandNote => ({ color: PITCHES[s.degree].color, state: i < at ? 'done' : i === at ? 'now' : 'next' }),
      );
    if (this.script.now < this.replayEnds) {
      const k = this.karaoke;
      return k
        ? { notes: asShown(k.song.phrases[k.phrase]!, k.note), fade: smooth((this.time - this.garlandSince) / 0.3) }
        : null;
    }
    return { notes: asShown(this.songs.phrase, this.songs.done), fade: smooth((this.time - this.garlandSince) / 0.4) };
  }

  /** The garland under the star meter. */
  private paintSong(p: Painter): void {
    const shown = this.garlandNotes();
    if (!shown) return;
    const g = this.plan.garland;
    const drop = (1 - shown.fade) * -14 - this.garlandBounce * 5 * hump(clamp(this.garlandBounce));
    const moved = { ...g, y: g.y + drop, ribbon: g.ribbon + drop };
    paintGarland(p.ctx, moved, shown.notes, p.t, this.band ? this.band.pulse(4) : 0, p.k, shown.fade);
  }

  private orbAt(o: Orb): { x: number; y: number } {
    const u = easeOutCubic(clamp(o.t / o.dur));
    return { x: lerp(o.x0, o.x1, u), y: lerp(o.y0, o.y1, u) - Math.sin(u * Math.PI) * 46 };
  }

  private paintOrbs(p: Painter): void {
    for (const o of this.orbs) {
      const at = this.orbAt(o);
      glowAt(p.light, at.x, at.y, 30, o.color, 0.9);
      glowAt(p.light, at.x, at.y, 14, [255, 255, 255], 0.95, 'spark');
    }
  }

  private paintHeart(p: Painter): void {
    const h = this.heart;
    if (!h) return;
    const at = this.heartAt(h);
    const r = 46 * at.scale;
    glowAt(p.light, at.x, at.y, r * 4.4, COLORS.gold, 0.55 + 0.15 * Math.sin(p.t * 6));
    const face = this.face;
    face.lookX = 0;
    face.lookY = 0;
    face.blink = blinkOf(p.t, 1.3);
    face.sing = 0.35;
    face.wide = 0;
    paintBalloon(
      p.ctx,
      foilOf('heart', 46, p.k),
      { x: at.x, y: at.y, r: 46, tilt: Math.sin(p.t * 2) * 0.05, grow: at.scale, bump: 0, alpha: 1 },
      (c) => paintFace(c, 46 * 0.82, face, false),
    );
    for (let i = 0; i < 4; i++)
      paintTwinkle(
        p.ctx,
        at.x + Math.cos(p.t * 1.7 + i * 1.6) * r * 0.9,
        at.y + Math.sin(p.t * 1.3 + i * 1.6) * r * 0.8,
        8,
        0.6 + 0.4 * Math.sin(p.t * 3 + i),
      );
  }
}
