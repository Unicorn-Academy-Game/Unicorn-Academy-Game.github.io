import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { BREW, FALL, FLY, MOST_AT_ONCE, newHappened, OUT, phaseOf, Works, within } from './works';

const works = (seed = 3): Works => new Works(new Rng(seed));
const from = { x: 10, y: 20 };

/** Steps the machine on by `seconds` in small steps and keeps every event. */
function run(w: Works, seconds: number, dt = 1 / 60) {
  const out = newHappened();
  const all = { dropped: [] as number[], finished: [] as number[], landed: [] as number[] };
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    w.step(dt, out);
    all.dropped.push(...out.dropped.map((p) => p.id));
    all.finished.push(...out.finished.map((p) => p.id));
    all.landed.push(...out.landed.map((p) => p.id));
  }
  return all;
}

describe("the machine's story", () => {
  it('takes a fruit through the hopper, the glass and the chute, in that order, and lets it go', () => {
    const w = works();
    const pod = w.feed('apple', from, -1, 1, () => 0)!;
    expect(pod.phase).toBe('fly');
    const seen: string[] = [];
    const out = newHappened();
    for (let t = 0; t < 4; t += 1 / 60) {
      w.step(1 / 60, out);
      if (seen.at(-1) !== pod.phase) seen.push(pod.phase);
    }
    expect(seen).toEqual(['fly', 'fall', 'brew', 'out']);
    expect(w.pods).toHaveLength(0);
  });

  it('says once, and only once, when a fruit drops in, is changed, and lands', () => {
    const w = works();
    w.feed('carrot', from, -1, 1, () => 3);
    const all = run(w, 4);
    expect(all.dropped).toHaveLength(1);
    expect(all.finished).toHaveLength(1);
    expect(all.landed).toHaveLength(1);
  });

  it('takes as long as it is written to for a calm machine', () => {
    const w = works();
    w.energy = 0;
    const pod = w.feed('apple', from, -1, 1, () => 0)!;
    w.energy = 0;
    let seconds = 0;
    const out = newHappened();
    // The machine was kicked by the feeding, so set it calm to measure the base time.
    while (w.pods.includes(pod) && seconds < 10) {
      w.energy = 0;
      w.step(1 / 120, out);
      seconds += 1 / 120;
    }
    expect(seconds).toBeCloseTo(FLY + FALL + BREW + OUT, 1);
  });

  it('works faster the busier it is, and slows again when it is left alone', () => {
    const calm = works();
    const busy = works();
    busy.energy = 1;
    expect(busy.rate).toBeGreaterThan(calm.rate);
    for (let i = 0; i < 5; i++) busy.feed('apple', from, -1, 1, () => i);
    const before = busy.energy;
    run(busy, 8);
    expect(busy.energy).toBeLessThan(before);
    expect(busy.energy).toBeLessThan(0.05);
  });

  it('raises the energy by each feeding, and by more for a friend who throws a double', () => {
    const a = works();
    a.feed('apple', from, -1, 1, () => 0);
    const b = works();
    b.feed('apple', from, 2, 2, () => 0);
    expect(b.energy).toBeGreaterThan(a.energy);
    expect(a.energy).toBeGreaterThan(0);
    expect(a.energy).toBeLessThanOrEqual(1);
    for (let i = 0; i < 20; i++) a.feed('apple', from, -1, 1, () => i % 16);
    expect(a.energy).toBeLessThanOrEqual(1);
  });

  it('takes a good many fruit at once, and says when it is full so the next one can wait', () => {
    const w = works();
    for (let i = 0; i < MOST_AT_ONCE; i++) expect(w.feed('tomato', from, -1, 1, () => i)).not.toBeNull();
    expect(w.full).toBe(true);
    expect(w.feed('tomato', from, -1, 1, () => 9)).toBeNull();
    run(w, 5);
    expect(w.full).toBe(false);
    expect(w.feed('tomato', from, -1, 1, () => 9)).not.toBeNull();
  });

  it('counts the glass as brewing only while a fruit is in it', () => {
    const w = works();
    w.feed('apple', from, -1, 1, () => 0);
    expect(w.brewing).toBe(0);
    const out = newHappened();
    for (let t = 0; t < (FLY + FALL + 0.2) / w.rate; t += 1 / 120) w.step(1 / 120, out);
    expect(w.brewing).toBe(1);
  });

  it('makes a creature by surprise every few fruit, which does not take a cell of the shelf', () => {
    const w = works(11);
    const pods = Array.from({ length: 24 }, (_, i) => {
      const p = w.feed('apple', from, -1, 1, () => i % 16);
      run(w, 4);
      return p!;
    });
    const surprises = pods.filter((p) => p.surprise);
    expect(surprises.length).toBeGreaterThanOrEqual(3);
    expect(surprises.length).toBeLessThanOrEqual(8);
    for (const p of surprises) expect(p.cell).toBe(-1);
    for (const p of pods.filter((q) => !q.surprise)) expect(p.cell).toBeGreaterThanOrEqual(0);
    // Never two in a row, so it is a surprise each time.
    for (let i = 1; i < pods.length; i++) expect(pods[i]!.surprise && pods[i - 1]!.surprise).toBe(false);
  });

  it('asks for a cell of the shelf only for what goes on the shelf, so a creature never keeps one', () => {
    const w = works(5);
    let asked = 0;
    let made = 0;
    for (let i = 0; i < 20; i++) {
      const p = w.feed('apple', from, -1, 1, () => {
        asked++;
        return i;
      });
      if (p && !p.surprise) made++;
      run(w, 4);
    }
    expect(asked).toBe(made);
    expect(asked).toBeLessThan(20);
  });

  it('starts over when it is reset, and its first fruit is never a surprise', () => {
    const w = works();
    for (let i = 0; i < 6; i++) {
      w.feed('apple', from, -1, 1, () => i);
      run(w, 4);
    }
    w.reset();
    expect(w.fed).toBe(0);
    expect(w.energy).toBe(0);
    expect(w.pods).toHaveLength(0);
    expect(w.feed('apple', from, -1, 1, () => 0)!.surprise).toBe(false);
  });

  it('reports every step of a pod even when a slow frame skips past several of them', () => {
    const w = works();
    w.feed('apple', from, -1, 1, () => 0);
    const out = newHappened();
    w.step(5, out);
    expect(out.dropped).toHaveLength(1);
    expect(out.finished).toHaveLength(1);
    expect(out.landed).toHaveLength(1);
  });

  it('tells where in the story a time is, and how far through its part', () => {
    expect(phaseOf(0)).toBe('fly');
    expect(phaseOf(FLY + 0.01)).toBe('fall');
    expect(phaseOf(FLY + FALL + 0.01)).toBe('brew');
    expect(phaseOf(FLY + FALL + BREW + 0.01)).toBe('out');
    expect(within({ age: FLY / 2 })).toBeCloseTo(0.5, 6);
    expect(within({ age: FLY + FALL + BREW / 4 })).toBeCloseTo(0.25, 6);
    expect(within({ age: 99 })).toBe(1);
  });
});
