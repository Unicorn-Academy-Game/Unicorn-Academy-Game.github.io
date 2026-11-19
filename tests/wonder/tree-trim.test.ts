import { describe, expect, it } from 'vitest';
import { viewOf } from '../../src/wonder/engine/painter';
import { HOOKS, LIGHTS } from '../../src/wonder/games/tree/shape';
import { TreeTrim } from '../../src/wonder/games/tree-trim';
import { drag, finger, openGame, run, tap } from './helpers';

/** How far above a finger an ornament rides, which a drop has to allow for. */
const LIFT = 46;

const open = (calm = false) => openGame((env) => new TreeTrim(env), { calm });

type Game = ReturnType<typeof open>['game'];

const plan = (game: Game) => game.inspect().plan;
const tray = (game: Game, slot: number) => plan(game).tray[slot]!;
/** Where a finger must be let go for the ornament it holds to hang on a hook. */
const over = (game: Game, hook: number) => ({
  x: plan(game).hooks[hook]!.x,
  y: plan(game).hooks[hook]!.y + LIFT,
});

describe('dressing the Christmas tree', () => {
  it('begins with a bare tree, six ornaments in the tray and a string of lights that is dark', () => {
    const { game } = open();
    const s = game.inspect();
    expect(s.hung).toHaveLength(0);
    expect(s.free).toHaveLength(HOOKS.length);
    expect(s.lit).toBe(0);
    expect(s.gifts).toBe(0);
    expect(game.stars).toBe(0);
    expect(game.phase).toBe('play');
  });

  it('hangs an ornament by itself when a place in the tray is touched, and it flies to the tree and lands', () => {
    const { game } = open();
    tap(game, tray(game, 0).x, tray(game, 0).y);
    expect(game.inspect().hung[0]!.landed, 'still on its way').toBe(false);
    run(game, 0.7);
    const s = game.inspect();
    expect(s.hung).toHaveLength(1);
    expect(s.hung[0]!.landed).toBe(true);
    expect(s.hung[0]!.kind).toBe('ball-red');
    expect(game.progress).toBeGreaterThan(0.4);
  });

  it('hangs the next ornament on the free hook nearest a touch on the tree', () => {
    const { game } = open();
    const hook = plan(game).hooks[11]!;
    tap(game, hook.x + 3, hook.y + 6);
    run(game, 0.7);
    expect(game.inspect().hung).toMatchObject([{ hook: 11, landed: true }]);
  });

  it('hangs an ornament that is dragged from the tray on the hook nearest where it is let go', () => {
    const { game } = open();
    drag(game, tray(game, 3), over(game, 5));
    run(game, 0.7);
    expect(game.inspect().hung).toMatchObject([{ hook: 5, kind: 'cane', landed: true }]);
  });

  it('puts an ornament that is let go far from the tree back in the tray, with nothing lost', () => {
    const { game, sound } = open();
    sound.clear();
    drag(game, tray(game, 1), { x: 24, y: 120 });
    run(game, 0.8);
    const s = game.inspect();
    expect(s.hung).toHaveLength(0);
    expect(s.held).toBeNull();
    expect(game.progress).toBe(0);
  });

  it('pays one point for an ornament and a second for the first of each kind, and a star for every few', () => {
    const { game, stars } = open();
    tap(game, tray(game, 0).x, tray(game, 0).y);
    run(game, 0.7);
    expect(game.stars).toBe(0);
    tap(game, tray(game, 0).x, tray(game, 0).y);
    run(game, 0.7);
    // Two of the same kind: two points, then one, which is the first star.
    expect(game.stars).toBe(1);
    expect(stars).toEqual([1]);
    expect(game.inspect().seen).toEqual(['ball-red']);
  });

  it('lights four of the lights for every star, one after the other', () => {
    const { game } = open();
    tap(game, tray(game, 0).x, tray(game, 0).y);
    tap(game, tray(game, 1).x, tray(game, 1).y);
    run(game, 0.7);
    expect(game.stars).toBe(1);
    run(game, 1);
    expect(game.inspect().lit).toBe(4);
    run(game, 1);
    expect(game.inspect().lit, 'no more light than the stars earned').toBe(4);
  });

  it('never hangs two ornaments on one hook, and does not run out of play when the tree is full', () => {
    const { game } = open();
    for (let i = 0; i < HOOKS.length + 6; i++) {
      tap(game, tray(game, i % 6).x, tray(game, i % 6).y);
      run(game, 0.45);
    }
    run(game, 1);
    const hooks = game.inspect().hung.map((h) => h.hook);
    expect(new Set(hooks).size, 'one ornament to a hook').toBe(hooks.length);
    expect(hooks.length).toBeLessThanOrEqual(HOOKS.length);
    expect(game.inspect().free.length + hooks.length).toBe(HOOKS.length);
  });

  it('swings and rings an ornament that is touched, and hangs nothing more', () => {
    const { game, sound } = open();
    tap(game, tray(game, 0).x, tray(game, 0).y);
    run(game, 2);
    sound.clear();
    const at = game.inspect().hung[0]!;
    tap(game, at.x, at.y);
    expect(game.inspect().hung).toHaveLength(1);
    expect(sound.log.some((l) => l.startsWith('note:'))).toBe(true);
  });

  it('moves an ornament that is dragged off the tree to another hook, and does not count it twice', () => {
    const { game } = open();
    drag(game, tray(game, 2), over(game, 3));
    run(game, 3);
    const before = game.progress;
    const at = game.inspect().hung[0]!;
    drag(game, { x: at.x, y: at.y }, over(game, 17));
    run(game, 1);
    const s = game.inspect();
    expect(s.hung).toMatchObject([{ hook: 17, landed: true }]);
    expect(s.free).toContain(3);
    // A touch may pay a little for the swing, but never the point of a new ornament.
    expect(game.progress - before).toBeLessThan(0.1);
  });

  it('puts an ornament lifted off the tree back on its hook when it is let go far away', () => {
    const { game } = open();
    drag(game, tray(game, 4), over(game, 9));
    run(game, 3);
    const at = game.inspect().hung[0]!;
    drag(game, { x: at.x, y: at.y }, { x: 20, y: 150 });
    run(game, 1);
    expect(game.inspect().hung).toMatchObject([{ hook: 9, landed: true }]);
  });

  it('rings higher notes from higher hooks', () => {
    const { game, sound } = open();
    const notes = (): number[] =>
      sound.played.flatMap((p) => ('voice' in p && p.voice !== 'bell' ? [p.midi] : [])).filter((m) => m > 0);
    const lowest = HOOKS.reduce((a, h, i) => (h.y > HOOKS[a]!.y ? i : a), 0);
    const highest = HOOKS.reduce((a, h, i) => (h.y < HOOKS[a]!.y ? i : a), 0);
    sound.clear();
    drag(game, tray(game, 3), over(game, lowest));
    run(game, 0.7);
    const low = Math.max(...notes());
    sound.clear();
    drag(game, tray(game, 3), over(game, highest));
    run(game, 0.7);
    const high = Math.max(...notes());
    expect(high).toBeGreaterThan(low);
  });

  it('ignores a second finger while the first holds an ornament, so none is left half lifted', () => {
    const { game } = open();
    const first = finger(tray(game, 0).x, tray(game, 0).y);
    game.down(first);
    expect(game.inspect().held).toBe('ball-red');
    tap(game, tray(game, 1).x, tray(game, 1).y);
    expect(game.inspect().held).toBe('ball-red');
    game.up({ ...first, down: false });
    run(game, 0.7);
    expect(game.inspect().hung).toHaveLength(1);
  });

  it('begins its finale on the fifth star: every light, the star on top, the presents, and then free play', () => {
    const { game, events, stars } = open();
    game.celebrate();
    expect(game.phase).toBe('finale');
    expect(events).toEqual(['finale']);
    expect(stars).toEqual([1, 2, 3, 4, 5]);
    run(game, 9);
    const s = game.inspect();
    expect(s.lit).toBe(LIGHTS.length);
    expect(s.gifts).toBe(4);
    expect(s.topper).toBeGreaterThan(0.9);
    expect(game.phase).toBe('after');
    expect(events).toEqual(['finale', 'after']);
  });

  it('can still be played after its finale, and earns nothing more', () => {
    const { game, stars } = open();
    game.celebrate();
    run(game, 9);
    tap(game, tray(game, 4).x, tray(game, 4).y);
    run(game, 0.7);
    expect(game.inspect().hung).toHaveLength(1);
    expect(stars).toEqual([1, 2, 3, 4, 5]);
  });

  it('rings every ornament that hangs, bottom to top, in the finale', () => {
    const { game, sound } = open();
    for (let i = 0; i < 6; i++) {
      tap(game, tray(game, i).x, tray(game, i).y);
      run(game, 0.5);
    }
    sound.clear();
    game.celebrate();
    run(game, 9);
    expect(sound.log.filter((l) => l.startsWith('note:')).length).toBeGreaterThan(6);
  });

  it('starts over when it is played again', () => {
    const { game } = open();
    tap(game, tray(game, 0).x, tray(game, 0).y);
    tap(game, tray(game, 1).x, tray(game, 1).y);
    run(game, 3);
    expect(game.stars).toBe(1);
    game.restart();
    const s = game.inspect();
    expect(s.hung).toHaveLength(0);
    expect(s.lit).toBe(0);
    expect(game.stars).toBe(0);
    expect(game.phase).toBe('play');
  });

  it('is laid out again on a screen of another size without losing what hangs', () => {
    const { game } = open();
    drag(game, tray(game, 0), over(game, 7));
    run(game, 0.7);
    game.layout(viewOf(390, 844));
    const s = game.inspect();
    expect(s.hung).toMatchObject([{ hook: 7, landed: true }]);
    expect(s.plan.tree.scale).toBeGreaterThan(2);
  });

  it('plays through in calm mode as well', () => {
    const { game } = open(true);
    tap(game, tray(game, 2).x, tray(game, 2).y);
    run(game, 1);
    game.celebrate();
    run(game, 9);
    expect(game.phase).toBe('after');
  });
});
