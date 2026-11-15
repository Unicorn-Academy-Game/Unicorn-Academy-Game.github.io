import type { Rng } from '../../../domain/rng';
import { COLORS, lighten, type RGB } from '../../engine/color';
import { clamp } from '../../engine/ease';
import type { Particles } from '../../engine/particles';
import { scaleNote } from '../../music';
import type { VoiceName, WonderSound } from '../../sound';
import { ringAt } from '../balloons/pops';
import { PRIZE } from './kinds';
import { glintsAt, heartsRise, notesRise, petalsFall, splashAt } from './pops';
import type { Heard } from './residents';

/**
 * What the garden's residents do to the picture and the sound. They only say what happened. Here
 * each thing said becomes a splash, a ring of glints, a note of the music's key, and so on, so the
 * way the garden looks and sounds is in one place and the way it behaves is in another.
 */

/** What the reactions need of the game they are in. */
export interface Scene {
  readonly fx: Particles;
  readonly rng: Rng;
  readonly sound: WonderSound;
  /** The width of the screen in units, for panning a sound to where it comes from. */
  width(): number;
  /** A ring spreads over the pond from a point. */
  ripple(x: number, y: number, size: number): void;
}

/**
 * The root of every tune of the garden, middle C. Every note is of its major pentatonic scale, so
 * none of them is wrong.
 */
const ROOT = 60;

/** The four colours of bird sing in four voices, so a robin and a canary are not the same bird. */
const BIRD_VOICES: readonly VoiceName[] = ['flute', 'glass', 'bell', 'chime'];

const EARTH: RGB = [196, 226, 150];
const POLLEN: RGB = [255, 226, 96];

const panOf = (s: Scene, x: number): number => clamp((x / s.width() - 0.5) * 1.6, -0.8, 0.8);

/** A little cloud of dust that lifts off the ground where something has landed or gone. */
function puff(s: Scene, x: number, y: number, count: number): void {
  for (let i = s.fx.count(count); i > 0; i--) {
    s.fx.emit({
      x: x + s.rng.range(-7, 7),
      y: y - 1,
      vx: s.rng.range(-32, 32),
      vy: s.rng.range(-36, -10),
      life: s.rng.range(0.4, 0.7),
      size: s.rng.range(3, 5.5),
      size1: 1,
      color: EARTH,
      shape: 'dot',
      add: false,
      gravity: 120,
      drag: 1.2,
      alpha: 0.8,
      hold: 0.3,
    });
  }
}

export function react(e: Heard, s: Scene): void {
  const { fx, rng, sound } = s;
  const pan = panOf(s, e.x);
  switch (e.is) {
    case 'land': {
      const color = PRIZE[e.prize].color;
      if (e.wet) {
        splashAt(fx, rng, e.x, e.y, 1.3);
        s.ripple(e.x, e.y, 1.3);
        sound.fx('splash', { pan, gain: 0.5, size: 0.5 });
      } else {
        puff(s, e.x, e.y, e.prize === 'flower' ? 4 : 6);
        sound.fx('thud', { pan, gain: 0.16, pitch: 10 });
      }
      glintsAt(fx, rng, e.x, e.y - 8, color, 5, 0.5);
      return;
    }
    case 'bloom': {
      const color = PRIZE.flower.color;
      ringAt(fx, rng, e.x, e.y, color, 16);
      glintsAt(fx, rng, e.x, e.y, color, 6, 0.6);
      sound.note('marimba', scaleNote(ROOT, 5 + (e.look % 6)), { pan, gain: 0.5, seconds: 0.5 });
      return;
    }
    case 'poke': {
      const color = PRIZE[e.prize].color;
      glintsAt(fx, rng, e.x, e.y, color, 8, 0.8);
      switch (e.prize) {
        case 'flower':
          petalsFall(fx, rng, e.x, e.y, 10, 4);
          sound.note('marimba', scaleNote(ROOT, 7 + (e.look % 6)), { pan, gain: 0.6, seconds: 0.6 });
          break;
        case 'butterfly':
          [0, 2, 4].forEach((n, i) => {
            sound.note('glass', scaleNote(ROOT + 12, n + rng.int(2)), {
              pan,
              gain: 0.5,
              delay: i * 0.07,
              seconds: 0.5,
            });
          });
          break;
        case 'bee':
          heartsRise(fx, rng, e.x, e.y, color, 3);
          [0, 1, 0, 1].forEach((n, i) => {
            sound.note('pluck', scaleNote(ROOT + 7, n), { pan, gain: 0.5, delay: i * 0.06, seconds: 0.3 });
          });
          break;
        case 'ladybug':
          sound.fx('ding', { pan, gain: 0.55, step: rng.int(5) });
          break;
        case 'snail':
          sound.fx('boing', { pan, gain: 0.45, pitch: 7 + rng.int(5) });
          break;
        case 'fairy':
          ringAt(fx, rng, e.x, e.y, color, 30);
          [0, 1, 2, 3, 4].forEach((n, i) => {
            sound.note('bell', scaleNote(ROOT + 24, n), { pan, gain: 0.6, delay: i * 0.07, seconds: 0.9 });
          });
          break;
        case 'fish':
          sound.note('pluck', scaleNote(ROOT + 12, 3), { pan, gain: 0.5, seconds: 0.4 });
          break;
        default:
          break;
      }
      return;
    }
    case 'sing': {
      const voice = BIRD_VOICES[e.look % BIRD_VOICES.length]!;
      const first = 9 + rng.int(5);
      sound.note(voice, scaleNote(ROOT, first), { pan, gain: 0.6, seconds: 0.7 });
      if (rng.next() < 0.5)
        sound.note(voice, scaleNote(ROOT, first + (rng.next() < 0.5 ? 2 : -2)), {
          pan,
          gain: 0.5,
          delay: 0.13,
          seconds: 0.6,
        });
      notesRise(fx, rng, e.x, e.y, PRIZE.bird.color, 1);
      return;
    }
    case 'leap': {
      splashAt(fx, rng, e.x, e.y, e.up ? 0.8 : 1);
      s.ripple(e.x, e.y, e.up ? 0.8 : 1);
      sound.fx('splash', { pan, gain: e.up ? 0.3 : 0.45, size: e.up ? 0.3 : 0.45 });
      return;
    }
    case 'dust': {
      const color = lighten(PRIZE[e.prize].color, 0.35);
      for (let i = fx.count(e.n); i > 0; i--) {
        fx.emit({
          x: e.x + rng.range(-3, 3),
          y: e.y + rng.range(-3, 3),
          vx: rng.range(-18, 18) * (e.n > 3 ? 3 : 1),
          vy: rng.range(-20, e.n > 3 ? -50 : 4),
          life: rng.range(0.6, 1.1),
          size: rng.range(3.5, 6),
          size1: 1,
          color,
          shape: rng.next() < 0.5 ? 'spark' : 'star4',
          drag: 1.4,
          gravity: 18,
          twinkle: 10,
          hold: 0.3,
        });
      }
      return;
    }
    case 'sip': {
      for (let i = fx.count(3); i > 0; i--) {
        fx.emit({
          x: e.x + rng.range(-5, 5),
          y: e.y + rng.range(-4, 2),
          vx: rng.range(-14, 14),
          vy: rng.range(-30, -8),
          life: 0.6,
          size: rng.range(2, 3.4),
          size1: 0.6,
          color: POLLEN,
          shape: 'dot',
          gravity: 40,
          drag: 1.2,
          hold: 0.4,
        });
      }
      if (rng.next() < 0.4) sound.fx('tap', { pan, gain: 0.1, pitch: 19 });
      return;
    }
    case 'bless': {
      ringAt(fx, rng, e.x, e.y, PRIZE.fairy.color, 24);
      glintsAt(fx, rng, e.x, e.y, COLORS.white, 8, 0.8);
      sound.note('bell', scaleNote(ROOT + 12, 4 + rng.int(6)), { pan, gain: 0.55, seconds: 1 });
      return;
    }
    case 'leave': {
      if (PRIZE[e.prize].home === 'meadow') puff(s, e.x, e.y, 6);
      if (PRIZE[e.prize].home === 'pond') s.ripple(e.x, e.y, 1);
      return;
    }
  }
}
