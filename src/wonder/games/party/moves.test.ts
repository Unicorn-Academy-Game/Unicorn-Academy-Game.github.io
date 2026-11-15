import { describe, expect, it } from 'vitest';
import { BARS_BEATS, listen, lookOf, MOVES, type Move, newLook, nextMove } from './moves';

const each = (fn: (move: Move, beats: number, home: 1 | -1, parity: 1 | -1) => void): void => {
  for (const move of MOVES) {
    for (const home of [1, -1] as const) {
      for (const parity of [1, -1] as const) {
        for (let beats = -3; beats < 9; beats += 0.0625) fn(move, beats, home, parity);
      }
    }
  }
};

describe('a dance', () => {
  it('is always a picture that can be drawn: finite, never through the floor, never twisted out of shape', () => {
    each((move, beats, home, parity) => {
      const look = lookOf(move, beats, home, parity);
      const what = `${move} at ${beats} beats`;
      for (const v of [look.phase, look.lift, look.sx, look.sy, look.tilt, look.spin, look.shift])
        expect(Number.isFinite(v), what).toBe(true);
      expect(look.lift, what).toBeGreaterThanOrEqual(-1e-9);
      expect(look.lift, what).toBeLessThan(60);
      expect(look.sy, what).toBeGreaterThan(0.8);
      expect(look.sy, what).toBeLessThan(1.2);
      expect(look.sx, what).toBeGreaterThan(0.85);
      expect(look.sx, what).toBeLessThan(1.15);
      expect(look.phase, what).toBeGreaterThanOrEqual(0);
      expect(look.phase, what).toBeLessThan(1);
      expect([0, 1, 2, 3], what).toContain(look.turn);
    });
  });

  it('comes round again every four beats, so a dancer never jumps', () => {
    each((move, beats, home, parity) => {
      const a = lookOf(move, beats, home, parity, newLook());
      const b = lookOf(move, beats + BARS_BEATS, home, parity, newLook());
      expect(b.lift, `${move} at ${beats}`).toBeCloseTo(a.lift, 6);
      expect(b.tilt, `${move} at ${beats}`).toBeCloseTo(a.tilt, 6);
      expect(b.turn).toBe(a.turn);
      expect(b.phase).toBeCloseTo(a.phase, 6);
    });
  });

  it('has a hop that is on the floor at the beat and in the air between', () => {
    const at = (beats: number): number => lookOf('bounce', beats, 1, 1).lift;
    expect(at(1)).toBeCloseTo(0, 6);
    expect(at(2)).toBeCloseTo(0, 6);
    expect(at(1.5)).toBeGreaterThan(10);
    // Squashed as she lands, and tall as she goes up.
    expect(lookOf('bounce', 1.01, 1, 1).sy).toBeLessThan(1);
    expect(lookOf('bounce', 1.45, 1, 1).sy).toBeGreaterThan(1);
  });

  it('goes right round in a twirl, through all four of her views, and back to her own', () => {
    const seen = new Set<number>();
    for (let beats = 0; beats < 1; beats += 0.01) seen.add(lookOf('twirl', beats, 1, 1).turn);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(lookOf('twirl', 1.2, 1, 1).turn).toBe(0);
    expect(lookOf('twirl', 0.01, 1, 1).turn).toBe(0);
  });

  it('flips all the way over, backward for her, and lands on her feet', () => {
    let most = 0;
    for (let beats = 0; beats < 4; beats += 0.01) most = Math.max(most, Math.abs(lookOf('flip', beats, 1, 1).spin));
    expect(most).toBeGreaterThan(6.2);
    // Facing right, a backflip goes anticlockwise, and facing left it is the other way.
    expect(lookOf('flip', 1.6, 1, 1).spin).toBeLessThan(0);
    expect(lookOf('flip', 1.6, -1, 1).spin).toBeGreaterThan(0);
    // Upright before and after.
    expect(lookOf('flip', 0.5, 1, 1).spin).toBe(0);
    // All the way round as she comes down, which looks the same as upright, and is upright after.
    expect(Math.abs(lookOf('flip', 1.9999, 1, 1).spin)).toBeCloseTo(Math.PI * 2, 2);
    expect(lookOf('flip', 3.2, 1, 1).spin).toBe(0);
    expect(lookOf('flip', 2, 1, 1).lift).toBeCloseTo(0, 5);
  });

  it('lets neighbours sway opposite ways', () => {
    const a = lookOf('sway', 0.5, 1, 1);
    const b = lookOf('sway', 0.5, 1, -1);
    expect(a.shift).toBeCloseTo(-b.shift, 6);
    expect(Math.abs(a.shift)).toBeGreaterThan(5);
  });

  it('uses her walk to prance and her own move to shine, once through in two beats', () => {
    expect(lookOf('prance', 0.5, 1, 1).clip).toBe('walk');
    expect(lookOf('shine', 0.5, 1, 1).clip).toBe('signature-idle');
    expect(lookOf('shine', 1, 1, 1).phase).toBeCloseTo(0.5, 6);
    expect(lookOf('shine', 2, 1, 1).phase).toBeCloseTo(0, 6);
  });

  it('goes through the moves in order when she is touched again, and round', () => {
    expect(nextMove(null)).toBe(MOVES[0]);
    let move: Move = MOVES[0];
    const order: Move[] = [move];
    for (let i = 0; i < MOVES.length; i++) {
      move = nextMove(move);
      order.push(move);
    }
    expect(order.slice(0, MOVES.length)).toEqual([...MOVES]);
    expect(order[MOVES.length]).toBe(MOVES[0]);
  });

  it('stands and breathes while she listens, hardly moving', () => {
    for (let beats = 0; beats < 8; beats += 0.1) {
      const look = listen(beats);
      expect(look.lift).toBe(0);
      expect(look.clip).toBe('idle');
      expect(Math.abs(look.sy - 1)).toBeLessThan(0.02);
    }
  });
});
