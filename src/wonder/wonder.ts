import type { ScreenId } from '../content/wonders';
import { Rng } from '../domain/rng';
import type { UnicornId } from '../shared/ids';
import { Band, type Style } from './engine/band';
import type { SpriteBank } from './engine/bank';
import type { Camera } from './engine/camera';
import { COLORS, css, type RGB } from './engine/color';
import { damp } from './engine/ease';
import { FLASH_CAP, FlashBudget } from './engine/flash';
import { forgetGems } from './engine/gems';
import type { Meter } from './engine/meter';
import { paintHand } from './engine/paint';
import type { Painter, View } from './engine/painter';
import { forgetShapes, Particles } from './engine/particles';
import { Script } from './engine/script';
import type { Pointer, Quality, Scene } from './engine/stage';
import type { WonderSound } from './sound';

/** Where a game is in its life: playing, in its finale, or free to play on after it. */
export type WonderPhase = 'play' | 'finale' | 'after';

/** Everything the screen around a game gives it. */
export interface WonderEnv {
  readonly bank: SpriteBank | null;
  readonly rng: Rng;
  /** The parent asked for fewer effects. */
  readonly calm: boolean;
  /** Which of the toy's looks the player tapped. */
  readonly look: string;
  /** The friends the player has found, Wildstar first. */
  readonly herd: readonly UnicornId[];
  readonly sound: WonderSound;
  /**
   * Where the toy stood on the screen as fractions of its width and height, which is where the game
   * opens from.
   */
  readonly from: { readonly x: number; readonly y: number };
  /** A star was earned. The argument is how many the player has now. */
  readonly onStar: (stars: number) => void;
  /** The finale began. */
  readonly onFinale: () => void;
  /** The finale is over and the player can play on. */
  readonly onAfter: () => void;
}

/** What the screen around a game needs of it. */
export interface WonderHandle extends Scene {
  readonly id: ScreenId;
  readonly stars: number;
  /** How far the player is toward the next star, 0 to 1. */
  readonly progress: number;
  readonly phase: WonderPhase;
  /** Starts the finale now. For tests and for filming. */
  celebrate(): void;
  /** Starts the game over from the beginning. */
  restart(): void;
  dispose(): void;
}

/**
 * Makes the game for a toy. Every game is made the same way, so the screen around it never needs to
 * know which it is.
 */
export type WonderMaker = (env: WonderEnv) => WonderHandle;

/** How much of the particle pool a game gets at each quality, before calm mode takes its share. */
const DENSITY: readonly number[] = [0.45, 0.75, 1];

/**
 * What every game shares: a clock, particles, a script for finales, a star meter, shake and flash
 * that are held to safe limits, a pointing hand that teaches the first touch, and a finale that
 * begins by itself on the fifth star. A game fills in what it looks like, what a touch does, and
 * what its finale is.
 */
export abstract class Wonder implements WonderHandle {
  abstract readonly id: ScreenId;
  protected abstract readonly meter: Meter;
  protected view!: View;
  protected readonly fx: Particles;
  protected readonly script = new Script();
  protected readonly flashes = new FlashBudget();
  /** The music under the game, once the game has chosen it with `startMusic`. */
  protected band: Band | null = null;
  /**
   * For a game that scrolls: where it looks. With one, `paintWorld` and every particle are drawn in
   * the world's units, moved by it.
   */
  protected camera: Camera | null = null;
  protected time = 0;
  /** Seconds since a finger last went down. */
  protected idle = 0;
  protected touched = false;
  private phaseNow: WonderPhase = 'play';
  private shakeAmp = 0;
  private flashLevel = 0;
  private flashColor: RGB = COLORS.white;
  private shakeX = 0;
  private shakeY = 0;

  constructor(protected readonly env: WonderEnv) {
    this.fx = new Particles(2600, () => env.rng.next());
    this.fx.calm = env.calm;
    this.fx.density = env.calm ? 0.45 : 1;
  }

  get stars(): number {
    return this.meter.stars;
  }

  get progress(): number {
    return this.meter.fraction;
  }

  get phase(): WonderPhase {
    return this.phaseNow;
  }

  /** How long light stays on the light sheet, in seconds. */
  get trail(): number {
    return 0;
  }

  get bloom(): number {
    return 0;
  }

  /** The view changed size, or this is the first layout. Work out where everything is. */
  protected abstract arrange(view: View): void;
  /** Moves the game on by `dt` seconds. */
  protected abstract tick(dt: number): void;
  /**
   * Draws the game behind its particles. For a game with a camera this is the part that does not
   * scroll with it: the sky.
   */
  protected abstract paintBack(p: Painter): void;
  /**
   * Draws what lives in the world, under the camera, behind the particles. Only called for a game
   * that has a camera.
   */
  protected paintWorld(_p: Painter): void {}
  /** Draws the game over its light: whatever should stay crisp and in front. */
  protected abstract paintFront(p: Painter): void;
  /** The finale. Schedule it on `script` and call `endFinale` when it is over. */
  protected abstract finale(): void;
  /** Puts the game back to its first moment. */
  protected abstract reset(): void;
  /** A finger went down. */
  protected abstract press(p: Pointer): void;
  protected drag(_p: Pointer): void {}
  protected lift(_p: Pointer): void {}
  /** Where the pointing hand shows a first touch, or nothing if there is nowhere to point. */
  protected abstract hint(): { x: number; y: number } | null;

  layout(view: View): void {
    this.view = view;
    this.arrange(view);
  }

  quality(level: Quality): void {
    this.fx.density = DENSITY[level]! * (this.env.calm ? 0.45 : 1);
  }

  update(dt: number): void {
    this.time += dt;
    this.idle += dt;
    this.fx.update(dt);
    this.script.update(dt);
    if (this.band) {
      this.band.energy = this.musicEnergy();
      this.band.update(dt);
    }
    this.shakeAmp = damp(this.shakeAmp, 0, 9, dt);
    this.flashLevel = damp(this.flashLevel, 0, 7, dt);
    this.tick(dt);
  }

  draw(p: Painter): void {
    const g = p.ctx;
    const shaking = this.shakeAmp > 0.15;
    // On the lowest quality there is no light sheet and the light goes straight onto the picture,
    // which must shift only once.
    const shared = p.light === g;
    if (shaking) {
      this.shakeX = (this.env.rng.next() - 0.5) * 2 * this.shakeAmp;
      this.shakeY = (this.env.rng.next() - 0.5) * 2 * this.shakeAmp;
      g.save();
      g.translate(this.shakeX, this.shakeY);
      if (!shared) {
        p.light.save();
        p.light.translate(this.shakeX, this.shakeY);
      }
    }
    this.paintBack(p);
    // A game that scrolls draws its world, and the particles that live in it, through its camera.
    const cam = this.camera;
    if (cam) {
      cam.begin(g, p.w, p.h);
      if (!shared) cam.begin(p.light, p.w, p.h);
    }
    this.paintWorld(p);
    this.fx.drawSolid(p);
    this.fx.drawGlow(p);
    if (cam) {
      cam.end(g);
      if (!shared) cam.end(p.light);
    }
    if (shaking) {
      g.restore();
      if (!shared) p.light.restore();
    }
  }

  drawAbove(p: Painter): void {
    const g = p.ctx;
    this.paintFront(p);
    if (this.flashLevel > 0.004) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = css(this.flashColor, this.flashLevel);
      g.fillRect(0, 0, p.w, p.h);
      g.globalCompositeOperation = 'source-over';
    }
    const at = this.hint();
    const wanted =
      this.phaseNow === 'play' && at && ((!this.touched && this.time > 2.2) || (this.touched && this.idle > 8));
    if (wanted && at) paintHand(g, at.x, at.y, this.time);
  }

  down(p: Pointer): void {
    this.touched = true;
    this.idle = 0;
    this.press(p);
  }

  move(p: Pointer): void {
    if (p.down) {
      this.idle = 0;
      this.drag(p);
    }
  }

  up(p: Pointer): void {
    this.lift(p);
  }

  celebrate(): void {
    if (this.phaseNow !== 'play') return;
    this.earn(1e9);
  }

  restart(): void {
    this.script.clear();
    this.fx.clear();
    this.meter.reset();
    this.phaseNow = 'play';
    this.flashLevel = 0;
    this.shakeAmp = 0;
    this.flashes.reset();
    this.touched = false;
    this.idle = 0;
    this.time = 0;
    this.band?.start();
    if (this.band) this.band.tempoScale = 1;
    this.reset();
  }

  dispose(): void {
    this.fx.clear();
    this.script.clear();
    this.band?.stop();
    // The pictures a game made for its particles are its own, and are made again by the next one
    // that needs them.
    forgetShapes();
    forgetGems();
  }

  /**
   * Starts the music under the game. It has its own random numbers, taken from the game's once, so
   * it never changes what the game does with its own.
   */
  protected startMusic(style: Style): Band {
    this.band?.stop();
    const band = new Band(this.env.sound, new Rng(this.env.rng.int(0x7fffffff)), style);
    band.start();
    this.band = band;
    return band;
  }

  /**
   * How much music the game wants now, 0 to 1: more as the stars fill, all of it in the finale, and
   * a little less after it.
   */
  protected musicEnergy(): number {
    if (this.phaseNow === 'finale') return 1;
    if (this.phaseNow === 'after') return 0.6;
    return 0.1 + 0.9 * Math.min(1, (this.meter.stars + this.meter.fraction * (this.meter.full ? 0 : 1)) / 5);
  }

  /**
   * Adds play to the meter. A new star is announced, and the fifth begins the finale. Play after
   * the finale earns nothing more.
   */
  protected earn(points: number): void {
    if (this.phaseNow !== 'play') return;
    const before = this.meter.stars;
    if (this.meter.add(points) === 0) return;
    for (let s = before + 1; s <= this.meter.stars; s++) {
      this.env.sound.fx('star', { step: s - 1 });
      this.env.onStar(s);
    }
    if (this.meter.full) this.beginFinale();
  }

  protected beginFinale(): void {
    this.phaseNow = 'finale';
    if (this.band) this.band.tempoScale = 1.06;
    this.env.onFinale();
    this.finale();
  }

  /** The game calls this when the last of its finale has played. */
  protected endFinale(): void {
    if (this.phaseNow !== 'finale') return;
    this.phaseNow = 'after';
    if (this.band) this.band.tempoScale = 1;
    this.env.onAfter();
  }

  /** Shakes the picture. Calm mode does not shake. */
  protected shake(amount: number): void {
    if (this.env.calm) return;
    this.shakeAmp = Math.min(7, this.shakeAmp + amount);
  }

  /**
   * Washes the screen with light for a moment, held to what the flash budget allows. `wanted` is
   * from 0 to 1.
   */
  protected flash(wanted: number, color: RGB = COLORS.white): void {
    const allowed = this.flashes.allow(wanted * (this.env.calm ? 0.35 : 1), this.time);
    if (allowed <= this.flashLevel) return;
    this.flashLevel = Math.min(FLASH_CAP, allowed);
    this.flashColor = color;
  }
}
