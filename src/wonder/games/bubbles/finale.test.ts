import { describe, expect, it } from 'vitest';
import {
  type Cue,
  Finale,
  GATHER_AT,
  GATHER_LEAST,
  GATHER_MOST,
  LAND_AFTER,
  LIFT_EVERY,
  LIFT_FIRST,
  OPEN_AT,
  POP_EVERY,
  POP_FIRST,
  SHIVER_AFTER,
  SWELL_SECONDS,
} from './finale';

const STEP = 1 / 60;

/**
 * Runs the finale with `left` bubbles on their way (a number, or a function of the time), and tells
 * every cue with the time it came.
 */
function play(
  friends: number,
  left: number | ((t: number) => number),
  max = 40,
): { readonly cues: { readonly cue: Cue; readonly at: number }[]; readonly f: Finale } {
  const f = new Finale(friends);
  const cues: { cue: Cue; at: number }[] = [];
  for (let t = 0; t < max; t += STEP) {
    for (const cue of f.step(STEP, typeof left === 'number' ? left : left(t))) cues.push({ cue, at: f.seconds });
  }
  return { cues, f };
}

const names = (cues: readonly { readonly cue: Cue }[]): string[] =>
  cues.map((c) => (c.cue.is === 'lift' || c.cue.is === 'pop' ? `${c.cue.is}${c.cue.friend}` : c.cue.is));
const when = (cues: readonly { readonly cue: Cue; readonly at: number }[], name: string): number =>
  cues.find((c) => names([c])[0] === name)!.at;

describe('the finale', () => {
  it('goes in its order, every cue once: sing, open, gather, swell, shiver, burst, the friends lifted and burst, done', () => {
    const { cues, f } = play(3, 0);
    expect(names(cues)).toEqual([
      'sing',
      'open',
      'gather',
      'swell',
      'shiver',
      'burst',
      'lift0',
      'lift1',
      'lift2',
      'pop0',
      'pop1',
      'pop2',
      'done',
    ]);
    expect(f.stage).toBe('done');
  });

  it('begins by singing, opens the great bubble soon after, and calls the bubbles to it a moment after that', () => {
    const { cues } = play(2, 0);
    expect(when(cues, 'sing')).toBeLessThan(0.05);
    expect(when(cues, 'open')).toBeGreaterThanOrEqual(OPEN_AT);
    expect(when(cues, 'open')).toBeLessThan(OPEN_AT + 0.05);
    expect(when(cues, 'gather')).toBeGreaterThanOrEqual(GATHER_AT);
    expect(when(cues, 'gather')).toBeLessThan(GATHER_AT + 0.05);
  });

  it('waits for the bubbles to arrive, but not for ever: it is blown up when none are left, or when time is up', () => {
    const none = play(0, 0).cues;
    expect(when(none, 'swell') - when(none, 'gather')).toBeGreaterThanOrEqual(GATHER_LEAST - 0.03);
    expect(when(none, 'swell') - when(none, 'gather')).toBeLessThan(GATHER_LEAST + 0.05);
    const stuck = play(0, 5).cues;
    expect(when(stuck, 'swell') - when(stuck, 'gather')).toBeGreaterThanOrEqual(GATHER_MOST - 0.03);
    expect(when(stuck, 'swell') - when(stuck, 'gather')).toBeLessThan(GATHER_MOST + 0.05);
    const arrive = play(0, (t) => (t < 2.5 ? 4 : 0)).cues;
    expect(when(arrive, 'swell')).toBeGreaterThanOrEqual(2.5);
    expect(when(arrive, 'swell')).toBeLessThan(2.6);
  });

  it('shivers, then bursts, at the times it says', () => {
    const { cues } = play(0, 0);
    expect(when(cues, 'shiver') - when(cues, 'swell')).toBeCloseTo(SHIVER_AFTER, 1);
    expect(when(cues, 'burst') - when(cues, 'swell')).toBeCloseTo(SWELL_SECONDS, 1);
  });

  it('lifts the friends one after another after the burst, and bursts their bubbles one after another a good while later', () => {
    const { cues } = play(5, 0);
    const burst = when(cues, 'burst');
    for (let i = 0; i < 5; i++) {
      expect(when(cues, `lift${i}`) - burst).toBeCloseTo(LIFT_FIRST + i * LIFT_EVERY, 1);
      expect(when(cues, `pop${i}`) - burst).toBeCloseTo(POP_FIRST + i * POP_EVERY, 1);
    }
    // Every friend is up before the first is burst, so she has time in the air.
    expect(when(cues, 'lift4')).toBeLessThan(when(cues, 'pop0'));
    expect(when(cues, 'done') - when(cues, 'pop4')).toBeGreaterThanOrEqual(LAND_AFTER - 0.05);
  });

  it('is over a few seconds after the burst with no friends at all', () => {
    const { cues } = play(0, 0);
    expect(when(cues, 'done') - when(cues, 'burst')).toBeGreaterThan(POP_FIRST);
    expect(when(cues, 'done') - when(cues, 'burst')).toBeLessThan(POP_FIRST + LAND_AFTER + 0.1);
  });

  it('always ends, whatever the bubbles do, and is not over for a long time', () => {
    const { cues } = play(5, 99);
    expect(names(cues).at(-1)).toBe('done');
    expect(when(cues, 'done')).toBeLessThan(14);
    expect(when(cues, 'done')).toBeGreaterThan(8);
  });

  it('tells the same things in the same order if time goes by in long steps, and says nothing after it is done', () => {
    const f = new Finale(4);
    const told: string[] = [];
    for (let i = 0; i < 40; i++) told.push(...names(f.step(0.9, 0).map((cue) => ({ cue }))));
    expect(told).toEqual([
      'sing',
      'open',
      'gather',
      'swell',
      'shiver',
      'burst',
      'lift0',
      'lift1',
      'lift2',
      'lift3',
      'pop0',
      'pop1',
      'pop2',
      'pop3',
      'done',
    ]);
    expect(f.step(1, 0)).toEqual([]);
  });
});
