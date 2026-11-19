import { describe, expect, it } from 'vitest';
import { viewOf } from '../../src/wonder/engine/painter';
import { TEAM_HEIGHT } from '../../src/wonder/games/sleigh/layout';
import { SleighRun } from '../../src/wonder/games/sleigh-run';
import { openGame, PHONE, run, tap } from './helpers';

const open = (o: Parameters<typeof openGame>[1] = {}) => openGame((env) => new SleighRun(env), o);
type Game = ReturnType<typeof open>['game'];

const village = (game: Game) => game.inspect().houses;
/** The houses on the screen, from the sleigh outward, with a chimney a finger can find. */
const inSight = (game: Game, width = PHONE.width) =>
  village(game)
    .filter((h) => h.chimney.x > 8 && h.chimney.x < width - 8)
    .sort((a, b) => a.x - b.x);
/** Where the sleigh is on the screen. */
const sleighAt = (game: Game) => ({
  x: game.inspect().plan.sleighAt * PHONE.width,
  y: game.inspect().plan.flyY - TEAM_HEIGHT * 0.4,
});
const presents = (game: Game): number => village(game).reduce((n, h) => n + h.presents + h.incoming, 0);

describe('flying the sleigh over the village', () => {
  it('begins with houses ahead of the sleigh, all dark, and no present sent', () => {
    const { game } = open();
    const s = game.inspect();
    expect(s.houses.length).toBeGreaterThanOrEqual(3);
    for (const h of s.houses) {
      expect(h.lit).toBe(false);
      expect(h.presents).toBe(0);
    }
    expect(inSight(game)[0]!.x, 'the first house is ahead of the sleigh').toBeGreaterThan(sleighAt(game).x);
    expect(s.gifts).toBe(0);
    expect(game.stars).toBe(0);
    expect(game.phase).toBe('play');
  });

  it('sends a present down the chimney nearest the finger, wherever the finger is, so no touch misses', () => {
    const { game } = open();
    const [first, second] = inSight(game);
    // On the chimney, in the sky over the second house, and on the snow below it.
    for (const [x, y] of [
      [first!.chimney.x, first!.chimney.y],
      [second!.chimney.x + 6, 30],
      [second!.chimney.x - 4, 340],
    ] as const) {
      const before = presents(game);
      tap(game, x, y);
      expect(presents(game), `a present is on its way after a touch at ${x | 0},${y | 0}`).toBe(before + 1);
    }
    run(game, 1.5);
    const after = village(game);
    expect(after.find((h) => h.id === first!.id)!.presents).toBe(1);
    expect(after.find((h) => h.id === second!.id)!.presents).toBe(2);
  });

  it('sends the present to the house nearest the finger, and not to one farther along', () => {
    const { game } = open();
    const houses = inSight(game);
    const last = houses.at(-1)!;
    tap(game, last.chimney.x, 200);
    run(game, 1.5);
    const after = village(game);
    expect(after.find((h) => h.id === last.id)!.presents).toBe(1);
    for (const h of after) if (h.id !== last.id) expect(h.presents).toBe(0);
  });

  it('lights the house and pays two points for the first of its kind', () => {
    const { game } = open();
    const house = inSight(game)[0]!;
    tap(game, house.chimney.x, house.chimney.y);
    expect(village(game).find((h) => h.id === house.id)!.lit, 'still dark while the present flies').toBe(false);
    run(game, 1.2);
    expect(village(game).find((h) => h.id === house.id)).toMatchObject({ lit: true, presents: 1, incoming: 0 });
    expect(game.inspect().seen).toEqual([house.shape]);
    // Two of the three points of the first star.
    expect(game.progress).toBeCloseTo(2 / 3, 5);
  });

  it('pays a quarter of a point, and no more, for another present to a house that has one', () => {
    const { game } = open();
    const house = inSight(game)[0]!;
    tap(game, house.chimney.x, house.chimney.y);
    run(game, 1.2);
    const before = game.progress;
    // The village has gone by a little since.
    const now = village(game).find((h) => h.id === house.id)!.chimney;
    expect(now.x).toBeLessThan(house.chimney.x);
    tap(game, now.x, now.y);
    run(game, 1.2);
    expect(village(game).find((h) => h.id === house.id)!.presents).toBe(2);
    expect(game.progress - before).toBeCloseTo(0.25 / 3, 5);
  });

  it('pays one point, not two, for a house of a kind it has already lit', () => {
    const { game } = open();
    const first = inSight(game)[0]!;
    tap(game, first.chimney.x, first.chimney.y);
    run(game, 1.2);
    expect(game.progress).toBeCloseTo(2 / 3, 5);
    // Fly on until a house like the first comes up, which it does within a few houses.
    let again: ReturnType<typeof village>[number] | undefined;
    for (let t = 0; t < 240 && !again; t++) {
      run(game, 0.5);
      again = inSight(game).find((h) => h.shape === first.shape && h.id !== first.id && h.presents === 0);
    }
    expect(again, 'a second house of that kind turned up').toBeDefined();
    tap(game, again!.chimney.x, again!.chimney.y);
    run(game, 1.2);
    // 2 and 1 are the 3 points of the first star, to the point. A new kind would have been 4.
    expect(game.stars).toBe(1);
    expect(game.progress).toBeCloseTo(0, 5);
  });

  it('rings the bells and sends no present when the sleigh is touched', () => {
    const { game, sound } = open();
    sound.clear();
    const at = sleighAt(game);
    tap(game, at.x, at.y);
    expect(presents(game)).toBe(0);
    expect(sound.log.some((l) => l.startsWith('note:bell'))).toBe(true);
    expect(game.progress, 'a little play, never a lot').toBeGreaterThan(0);
    expect(game.progress).toBeLessThan(0.1);
  });

  it('pays for the bells no more than once in a short while', () => {
    const { game } = open();
    const at = sleighAt(game);
    tap(game, at.x, at.y);
    const once = game.progress;
    tap(game, at.x, at.y);
    tap(game, at.x, at.y);
    expect(game.progress).toBe(once);
  });

  it('never has two houses of one kind side by side, and never runs out of houses', () => {
    const { game } = open();
    const seen = new Set<number>();
    for (let t = 0; t < 90; t++) {
      run(game, 1);
      const houses = [...village(game)].sort((a, b) => a.x - b.x);
      for (let i = 1; i < houses.length; i++)
        expect(houses[i]!.shape, `houses ${houses[i - 1]!.id} and ${houses[i]!.id}`).not.toBe(houses[i - 1]!.shape);
      for (const h of houses) seen.add(h.id);
      expect(houses.at(-1)!.x, 'a house always waits beyond the right edge').toBeGreaterThan(PHONE.width);
    }
    expect(seen.size, 'the village goes on and on').toBeGreaterThan(30);
  });

  it('lets go of the houses it has flown past, so a long flight stays small', () => {
    const { game } = open();
    run(game, 120);
    expect(village(game).length).toBeLessThan(14);
    expect(game.inspect().travel).toBeGreaterThan(1500);
  });

  it('keeps the same village for the same random numbers, and another for others', () => {
    const shapes = (seed: number) => {
      const { game } = open({ seed });
      run(game, 20);
      return village(game).map((h) => h.shape);
    };
    expect(shapes(5)).toEqual(shapes(5));
    expect(shapes(5)).not.toEqual(shapes(6));
  });

  it('pulls the sleigh with the friends in the herd, as many as the screen has room for', () => {
    const herd = ['wildstar', 'leaf', 'glacier', 'river'] as const;
    expect(open({ herd }).game.inspect().team).toBe(3);
    expect(open({ herd, screen: { width: 390, height: 844 } }).game.inspect().team).toBe(2);
    expect(open({ herd: ['leaf'] }).game.inspect().team).toBe(1);
    expect(open().game.inspect().team, 'a lone unicorn pulls when the herd is not known').toBe(1);
  });

  it('begins its finale on the fifth star: the village lights, the team loops, and then free play', () => {
    const { game, events, stars } = open();
    game.celebrate();
    expect(game.phase).toBe('finale');
    expect(events).toEqual(['finale']);
    expect(stars).toEqual([1, 2, 3, 4, 5]);
    let looped = false;
    for (let t = 0; t < 9; t += 1 / 60) {
      game.update(1 / 60);
      looped ||= game.inspect().looping;
    }
    expect(looped, 'the team looped the loop').toBe(true);
    expect(game.inspect().looping, 'and came out of it').toBe(false);
    for (const h of inSight(game)) expect(h.lit, `house ${h.id} is lit`).toBe(true);
    expect(game.phase).toBe('after');
    expect(events).toEqual(['finale', 'after']);
  });

  it('lights every house in sight when the finale ends, the ones that came into view as it went too', () => {
    const { game } = open();
    game.celebrate();
    for (let t = 0; t < 9 && game.phase === 'finale'; t += 1 / 60) game.update(1 / 60);
    const houses = inSight(game);
    expect(houses.length).toBeGreaterThan(2);
    for (const h of houses) expect(h.lit, `house ${h.id}`).toBe(true);
  });

  it('can still be played after its finale, and earns nothing more', () => {
    const { game, stars } = open();
    game.celebrate();
    run(game, 9);
    const house = inSight(game).find((h) => h.presents === 0) ?? inSight(game)[0]!;
    const before = presents(game);
    tap(game, house.chimney.x, house.chimney.y);
    run(game, 1.2);
    expect(presents(game)).toBe(before + 1);
    expect(stars).toEqual([1, 2, 3, 4, 5]);
  });

  it('earns the first star from a few houses', () => {
    const { game, stars } = open();
    for (const h of inSight(game).slice(0, 2)) tap(game, h.chimney.x, h.chimney.y);
    run(game, 1.5);
    expect(stars).toEqual([1]);
  });

  it('starts over when it is played again', () => {
    const { game } = open();
    const house = inSight(game)[0]!;
    tap(game, house.chimney.x, house.chimney.y);
    run(game, 30);
    game.restart();
    const s = game.inspect();
    expect(s.travel).toBe(0);
    expect(s.gifts).toBe(0);
    expect(s.seen).toHaveLength(0);
    for (const h of s.houses) expect(h.lit).toBe(false);
    expect(game.stars).toBe(0);
    expect(game.phase).toBe('play');
  });

  it('is laid out again on a screen of another size without losing the village', () => {
    const { game } = open();
    const house = inSight(game)[0]!;
    tap(game, house.chimney.x, house.chimney.y);
    run(game, 1.5);
    game.layout(viewOf(390, 844));
    const s = game.inspect();
    expect(s.houses.find((h) => h.id === house.id)).toMatchObject({ lit: true, presents: 1 });
    expect(s.plan.pullers).toBe(2);
    expect(s.plan.scale).toBeGreaterThan(1);
  });

  it('plays through in calm mode as well, with the same houses', () => {
    const { game } = open({ calm: true });
    const house = inSight(game)[0]!;
    tap(game, house.chimney.x, house.chimney.y);
    run(game, 1.5);
    expect(village(game).find((h) => h.id === house.id)!.lit).toBe(true);
    game.celebrate();
    run(game, 9);
    expect(game.phase).toBe('after');
  });
});
