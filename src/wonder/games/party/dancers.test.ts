import { describe, expect, it } from 'vitest';
import type { UnicornId } from '../../../shared/ids';
import { Dancers, facingOf } from './dancers';
import { planOf, slotsOf } from './layout';
import { MOVES } from './moves';

const IDS: readonly UnicornId[] = ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'];

const floor = (n = 6) => {
  const plan = planOf(863, 360);
  const dancers = new Dancers();
  dancers.stand(IDS.slice(0, n), slotsOf(n, plan));
  return { plan, dancers };
};

describe('the dancers', () => {
  it('stand in their places, the first friend in the middle of the front', () => {
    const { plan, dancers } = floor();
    expect(dancers.list).toHaveLength(6);
    const first = dancers.list[0]!;
    expect(first.id).toBe('wildstar');
    expect(Math.abs(first.x - plan.w / 2)).toBeLessThan(2);
    expect(dancers.list.every((d) => d.slot.depth <= first.slot.depth)).toBe(true);
    expect(dancers.dancing).toBe(0);
  });

  it('listen quietly until they are touched, and do not leave their places', () => {
    const { dancers } = floor();
    for (let b = 0; b < 8; b += 0.05) {
      dancers.update(0.05, b);
      for (const d of dancers.list) {
        expect(d.look.lift).toBe(0);
        expect(d.look.clip).toBe('idle');
        expect(Math.abs(d.x - d.slot.x)).toBeLessThan(0.001);
      }
    }
  });

  it('begin to dance on the next beat, and show at once that they have heard', () => {
    const { dancers } = floor();
    const d = dancers.list[1]!;
    dancers.update(0.016, 4.3);
    const tap = dancers.tap(d, 4.3);
    expect(tap.first).toBe(true);
    expect(tap.move).toBe('bounce');
    expect(d.began).toBe(5);
    // She is bending her knees before the beat.
    for (let i = 0; i < 12; i++) dancers.update(0.04, 4.3 + i * 0.04);
    expect(d.look.sy).toBeLessThan(1);
    // And on the beat she is going up.
    let high = 0;
    for (let b = 5; b < 6; b += 0.02) {
      dancers.update(0.02, b);
      high = Math.max(high, d.look.lift);
    }
    expect(high).toBeGreaterThan(8);
    expect(dancers.dancing).toBe(1);
  });

  it('start on the beat after when the touch is a hair before one', () => {
    const { dancers } = floor();
    const d = dancers.list[2]!;
    dancers.tap(d, 6.97);
    expect(d.began).toBe(8);
  });

  it('go through every move as they are touched, and round to the first', () => {
    const { dancers } = floor();
    const d = dancers.list[0]!;
    const seen = [];
    for (let i = 0; i < MOVES.length + 1; i++) {
      const tap = dancers.tap(d, i * 4);
      seen.push(tap.move);
      expect(tap.first).toBe(i === 0);
      expect(tap.again).toBe(i === MOVES.length);
    }
    expect(seen.slice(0, MOVES.length)).toEqual([...MOVES]);
    expect(seen[MOVES.length]).toBe(MOVES[0]);
    expect(d.taps).toBe(MOVES.length + 1);
  });

  it('dance together: friends on the same move are at the same height at the same beat', () => {
    const { dancers } = floor();
    for (const i of [0, 1, 3]) dancers.tap(dancers.list[i]!, 0.5);
    for (let b = 0.5; b < 3; b += 0.02) dancers.update(0.02, b);
    const lifts = [0, 1, 3].map((i) => dancers.list[i]!.look.lift);
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeLessThan(0.5);
  });

  it('keep every look in a sensible range through every move', () => {
    const { dancers } = floor();
    for (const d of dancers.list) {
      for (let i = 0; i < MOVES.length; i++) dancers.tap(d, 0);
    }
    for (const move of MOVES) {
      for (const d of dancers.list) {
        d.move = move;
        d.began = 0;
        d.into = 1;
      }
      for (let b = 0; b < 8; b += 0.03) {
        dancers.update(0.03, b);
        for (const d of dancers.list) {
          expect(d.look.lift, move).toBeGreaterThanOrEqual(-0.001);
          expect(d.look.lift).toBeLessThan(60);
          expect(d.look.sy).toBeGreaterThan(0.8);
          expect(d.look.sy).toBeLessThan(1.2);
          expect(d.look.sx).toBeGreaterThan(0.8);
          expect(d.look.sx).toBeLessThan(1.2);
          expect(Math.abs(d.look.tilt)).toBeLessThan(0.3);
          expect(Math.abs(d.x - d.slot.x)).toBeLessThan(16 * d.slot.scale);
        }
      }
    }
  });

  it('hop for joy on top of whatever they are doing, and come down again', () => {
    const { dancers } = floor();
    const d = dancers.list[2]!;
    dancers.update(0.02, 1);
    expect(d.look.lift).toBe(0);
    dancers.cheer(d, 1);
    let high = 0;
    for (let i = 0; i < 20; i++) {
      dancers.update(0.025, 1 + i * 0.025);
      high = Math.max(high, d.look.lift);
    }
    expect(high).toBeGreaterThan(20);
    for (let i = 0; i < 30; i++) dancers.update(0.025, 2 + i * 0.025);
    expect(d.look.lift).toBe(0);
    expect(d.look.sy).toBeCloseTo(1, 1);
  });

  it('are found by a touch on them, the nearer one when two overlap, and not on empty floor', () => {
    const { dancers } = floor();
    for (const d of dancers.list) expect(dancers.at(d.x, d.y - 95 * d.slot.scale), `${d.id} at her head`).toBe(d);
    expect(dancers.at(5, 5)).toBeNull();
    const a = dancers.list[0]!;
    const b = dancers.list[3]!;
    dancers.list[3] = Object.assign(b, { x: a.x, y: a.y - 20, slot: { ...b.slot, x: a.x, y: a.y - 20, depth: 0.2 } });
    expect(dancers.at(a.x, a.y - 30), 'a touch between them is for the one in front').toBe(a);
  });

  it('can each be touched on the middle of her body, however many are on the floor and whichever way the screen is held', () => {
    // A friend who stands behind another has her body in the other's room, and a finger that goes
    // for her must not land on the other.
    for (const [w, h] of [
      [863, 360],
      [360, 780],
      [1024, 768],
      [1280, 560],
    ] as const) {
      for (let n = 1; n <= 6; n++) {
        const dancers = new Dancers();
        dancers.stand(IDS.slice(0, n), slotsOf(n, planOf(w, h)));
        for (const d of dancers.list) {
          const s = d.slot.scale;
          expect(dancers.at(d.x, d.y - 52 * s), `${d.id} of ${n} at ${w} by ${h}, on her body`).toBe(d);
          expect(
            dancers.at(d.x + 20 * s, d.y - 70 * s),
            `${d.id} of ${n} at ${w} by ${h}, a little to the side and up`,
          ).toBe(d);
        }
      }
    }
  });

  it('keep what they were doing when the screen turns, and start over when asked', () => {
    const { dancers } = floor();
    const d = dancers.list[1]!;
    dancers.tap(d, 0);
    dancers.stand(IDS, slotsOf(6, planOf(360, 780)));
    expect(dancers.list[1]!.move).toBe('bounce');
    expect(dancers.list[1]!.slot.x).toBeLessThan(360);
    dancers.reset();
    expect(dancers.dancing).toBe(0);
    expect(dancers.list[1]!.x).toBe(dancers.list[1]!.slot.x);
  });

  it('does not have more dancers than there are places', () => {
    const plan = planOf(863, 360);
    const dancers = new Dancers();
    dancers.stand(IDS, slotsOf(3, plan));
    expect(dancers.list).toHaveLength(3);
  });

  it('turns through her four views in a twirl: her own, toward you, the other way, and away', () => {
    expect(facingOf(1, 0)).toBe('east');
    expect(facingOf(1, 1)).toBe('south');
    expect(facingOf(1, 2)).toBe('west');
    expect(facingOf(1, 3)).toBe('north');
    expect(facingOf(-1, 0)).toBe('west');
    expect(facingOf(-1, 2)).toBe('east');
  });
});
