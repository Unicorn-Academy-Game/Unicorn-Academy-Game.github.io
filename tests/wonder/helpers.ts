import { Rng } from '../../src/domain/rng';
import type { UnicornId } from '../../src/shared/ids';
import { viewOf } from '../../src/wonder/engine/painter';
import type { Pointer } from '../../src/wonder/engine/stage';
import { recorder } from '../../src/wonder/sound';
import type { Wonder, WonderEnv } from '../../src/wonder/wonder';

/** A phone held sideways, which is the screen the games are laid out for first. */
export const PHONE = { width: 863, height: 360 };

interface Options {
  readonly calm?: boolean;
  readonly herd?: readonly UnicornId[];
  readonly screen?: { readonly width: number; readonly height: number };
  readonly seed?: number;
}

/** A game on a screen, with what it told its parent written down. */
export function openGame<G extends Wonder>(make: (env: WonderEnv) => G, o: Options = {}) {
  const sound = recorder();
  const stars: number[] = [];
  const events: string[] = [];
  const env: WonderEnv = {
    bank: null,
    rng: new Rng(o.seed ?? 3),
    calm: o.calm ?? false,
    look: '',
    herd: o.herd ?? [],
    sound,
    from: { x: 0.5, y: 0.5 },
    onStar: (n) => stars.push(n),
    onFinale: () => events.push('finale'),
    onAfter: () => events.push('after'),
  };
  const game = make(env);
  const screen = o.screen ?? PHONE;
  game.layout(viewOf(screen.width, screen.height));
  return { game, sound, stars, events };
}

let next = 1;
export const finger = (x: number, y: number): Pointer => ({
  id: next++,
  x,
  y,
  px: x,
  py: y,
  vx: 0,
  vy: 0,
  x0: x,
  y0: y,
  t0: 0,
  down: true,
});

/** Runs the game on, a frame at a time, as a screen does. */
export function run(game: Wonder, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60);
}

export const tap = (game: Wonder, x: number, y: number): void => {
  const p = finger(x, y);
  game.down(p);
  game.up({ ...p, down: false });
};

/** A finger put down on one place, drawn to another in steps, and lifted there. */
export function drag(game: Wonder, from: { x: number; y: number }, to: { x: number; y: number }): void {
  const p = finger(from.x, from.y);
  game.down(p);
  for (let i = 1; i <= 8; i++) {
    p.px = p.x;
    p.py = p.y;
    p.x = from.x + ((to.x - from.x) * i) / 8;
    p.y = from.y + ((to.y - from.y) * i) / 8;
    game.move(p);
    game.update(1 / 60);
  }
  game.up({ ...p, down: false });
}
