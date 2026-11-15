import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { type Area, Field, R_HIGH, R_LOW, type Tie } from './field';

const AREA: Area = { w: 863, top: -90, floor: 320, edge: 34 };

const run = (f: Field, seconds: number, area: Area = AREA): void => {
  for (let t = 0; t < seconds; t += 1 / 60) f.update(1 / 60, area);
};

describe('letting balloons go', () => {
  it('lets them rise from behind the hills, below the line they come up from', () => {
    const f = new Field(new Rng(1));
    const b = f.launch(AREA);
    expect(b.y).toBeGreaterThan(AREA.floor);
    expect(b.grow.x).toBe(1);
  });

  it('keeps balloons let go together well apart, so a finger can tell them apart', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const f = new Field(new Rng(seed));
      for (let i = 0; i < 9; i++) f.launch(AREA, { high: false });
      let nearest = Infinity;
      for (const a of f.balloons)
        for (const b of f.balloons) if (a !== b) nearest = Math.min(nearest, Math.abs(a.x - b.x));
      expect(nearest).toBeGreaterThan(R_LOW * 0.9);
    }
  });

  it('makes a small balloon sing high, and a big one low', () => {
    const f = new Field(new Rng(3));
    const small = f.launch(AREA, { high: true });
    const big = f.launch(AREA, { high: false });
    expect(small.r).toBe(R_HIGH);
    expect(big.r).toBe(R_LOW);
    expect(small.high).toBe(true);
    expect(big.high).toBe(false);
  });

  it('lets the higher notes go faster, because they are lighter', () => {
    const rate = (high: boolean): number => {
      let sum = 0;
      for (let seed = 1; seed <= 40; seed++) sum += new Field(new Rng(seed)).launch(AREA, { high }).rise;
      return sum / 40;
    };
    expect(rate(true)).toBeGreaterThan(rate(false));
  });

  it('chooses every note about as often as every other, with no long runs of one', () => {
    const f = new Field(new Rng(9));
    const seen = [0, 0, 0, 0, 0];
    const degrees: number[] = [];
    for (let i = 0; i < 100; i++) {
      const d = f.launch(AREA).degree;
      seen[d]!++;
      degrees.push(d);
    }
    for (const n of seen) expect(n).toBe(20);
    let run1 = 1;
    let longest = 1;
    for (let i = 1; i < degrees.length; i++) {
      run1 = degrees[i] === degrees[i - 1] ? run1 + 1 : 1;
      longest = Math.max(longest, run1);
    }
    expect(longest).toBeLessThanOrEqual(2);
  });

  it('puts the balloons it was asked for where it was asked, and lets the note be chosen', () => {
    const f = new Field(new Rng(1));
    const b = f.launch(AREA, { x: 200, y: 100, degree: 3, high: false });
    expect(b).toMatchObject({ x: 200, y: 100, degree: 3 });
  });

  it('can start with balloons already in the sky, at every height, and all full size', () => {
    const f = new Field(new Rng(4));
    f.seed(AREA, 8);
    expect(f.balloons).toHaveLength(8);
    // The first of them is the highest, and each one after it is lower.
    const heights = f.balloons.map((b) => b.y);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(Math.min(...heights)).toBeGreaterThan(AREA.top);
    expect(Math.max(...heights)).toBeLessThan(AREA.floor);
    expect(f.balloons.every((b) => b.grow.x === 1)).toBe(true);
  });

  it('makes a wave of the five notes as a row the player can sweep across: low to high going right, or the other way', () => {
    const up = new Field(new Rng(1)).wave(AREA, true);
    expect(up.map((b) => b.degree)).toEqual([0, 1, 2, 3, 4]);
    expect(up.map((b) => b.x)).toEqual([...up.map((b) => b.x)].sort((a, b) => a - b));
    expect(up.every((b) => b.y > AREA.floor && !b.high)).toBe(true);
    // The one at the left comes up first, so a finger going right meets them in the order of the
    // scale.
    expect(up.map((b) => b.y)).toEqual([...up.map((b) => b.y)].sort((a, b) => a - b));
    const down = new Field(new Rng(1)).wave(AREA, false);
    expect(down.map((b) => b.degree)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe('floating', () => {
  it('rises, at about its own speed', () => {
    const f = new Field(new Rng(2));
    const b = f.launch(AREA, { x: 400, y: 300, rise: 30 });
    run(f, 2);
    expect(b.y).toBeLessThan(300 - 55);
    expect(b.y).toBeGreaterThan(300 - 65);
  });

  it('sways, but only a little way, and never off the sides', () => {
    const f = new Field(new Rng(5));
    const b = f.launch(AREA, { x: 40, y: 320, rise: 8 });
    let least = Infinity;
    for (let t = 0; t < 30; t += 1 / 60) {
      f.update(1 / 60, AREA);
      least = Math.min(least, b.x);
    }
    expect(least).toBeGreaterThan(AREA.edge - 14);
    // Pushed hard against the side, it still comes back.
    const g = new Field(new Rng(5));
    const c = g.launch(AREA, { x: 40, y: 320, rise: 4 });
    c.vx = -400;
    run(g, 3);
    expect(c.x).toBeGreaterThan(AREA.edge - 25);
  });

  it('is gone once it has gone off the top, and not before', () => {
    const f = new Field(new Rng(2));
    f.launch(AREA, { x: 400, y: -60, rise: 40 });
    run(f, 0.2);
    expect(f.balloons).toHaveLength(1);
    run(f, 2);
    expect(f.balloons).toHaveLength(0);
  });

  it('slides round a balloon it floats into, instead of through it', () => {
    const f = new Field(new Rng(2));
    const a = f.launch(AREA, { x: 400, y: 200, rise: 30, high: false });
    const b = f.launch(AREA, { x: 410, y: 205, rise: 30, high: false });
    run(f, 1.5);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((a.r + b.r) * 0.75);
  });

  it('floats away quickly when it is told to leave, and can no longer be touched', () => {
    const f = new Field(new Rng(2));
    const b = f.launch(AREA, { x: 400, y: 200, rise: 30 });
    b.leaving = true;
    run(f, 0.5);
    expect(b.y).toBeLessThan(200 - 30 * 4.5 * 0.45);
    expect(f.at(b.x, b.y, 20)).toBeNull();
    expect(f.free).toBe(0);
  });

  it('leans into the way it is going', () => {
    const f = new Field(new Rng(2));
    const b = f.launch(AREA, { x: 400, y: 200, rise: 30 });
    b.vx = 120;
    run(f, 0.3);
    expect(b.tilt).toBeGreaterThan(0.05);
  });
});

describe('finding the balloon a finger is on', () => {
  const arrange = (): { f: Field; a: ReturnType<Field['launch']>; b: ReturnType<Field['launch']> } => {
    const f = new Field(new Rng(1));
    const a = f.launch(AREA, { x: 300, y: 150, high: false });
    const b = f.launch(AREA, { x: 400, y: 150, high: false });
    return { f, a, b };
  };

  it('finds the one under the finger', () => {
    const { f, a, b } = arrange();
    expect(f.at(305, 150, 0)).toBe(a);
    expect(f.at(398, 140, 0)).toBe(b);
  });

  it('finds nothing in the empty sky', () => {
    const { f } = arrange();
    expect(f.at(350, 150, 0)).toBeNull();
    expect(f.at(300, 20, 14)).toBeNull();
  });

  it('forgives a touch that is a little outside the edge, as much as it is told to', () => {
    const { f, a } = arrange();
    expect(f.at(300 + R_LOW + 10, 150, 0)).toBeNull();
    expect(f.at(300 + R_LOW + 10, 150, 12)).toBe(a);
  });

  it('gives a touch between two balloons to the nearer one', () => {
    const { f, a, b } = arrange();
    expect(f.at(345, 150, 30)).toBe(a);
    expect(f.at(356, 150, 30)).toBe(b);
  });

  it('lets a small balloon in front of a big one be touched', () => {
    const f = new Field(new Rng(1));
    f.launch(AREA, { x: 300, y: 150, high: false });
    const small = f.launch(AREA, { x: 322, y: 150, high: true });
    expect(f.at(330, 150, 0)).toBe(small);
  });

  it('gives a touch on the body of balloons to the one that is drawn on top: the bouquet, then the special ones, then the rest', () => {
    const f = new Field(new Rng(1));
    const tie: Tie = { x: 300, y: 300, length: 100, angle: 0 };
    const bouquet = f.tie(tie, 0, true);
    const note = f.launch(AREA, { x: bouquet.x, y: bouquet.y, high: false });
    const star = f.launch(AREA, { x: bouquet.x, y: bouquet.y, kind: 'star' });
    expect(f.at(bouquet.x, bouquet.y, 0)).toBe(bouquet);
    f.remove(bouquet);
    expect(f.at(note.x, note.y, 0)).toBe(star);
    f.remove(star);
    expect(f.at(note.x, note.y, 0)).toBe(note);
  });

  it('can be asked for the bouquet alone or for the balloons floating free alone', () => {
    const f = new Field(new Rng(1));
    const bouquet = f.tie({ x: 300, y: 300, length: 100, angle: 0 }, 0, true);
    const free = f.launch(AREA, { x: bouquet.x, y: bouquet.y, high: false });
    expect(f.at(bouquet.x, bouquet.y, 0, 'tied')).toBe(bouquet);
    expect(f.at(bouquet.x, bouquet.y, 0, 'free')).toBe(free);
    expect(f.at(free.x + 500, 50, 0, 'free')).toBeNull();
  });

  it('cannot find a balloon that is not blown up yet', () => {
    const f = new Field(new Rng(1));
    const b = f.launch(AREA, { x: 300, y: 150, grown: false });
    expect(f.at(300, 150, 20)).toBeNull();
    b.grow.x = 1;
    expect(f.at(300, 150, 20)).toBe(b);
  });

  it('finds the balloons a swipe goes through, in the order it meets them, from either direction', () => {
    const f = new Field(new Rng(1));
    const a = f.launch(AREA, { x: 200, y: 150, high: false });
    const b = f.launch(AREA, { x: 300, y: 150, high: false });
    const c = f.launch(AREA, { x: 400, y: 150, high: false });
    f.launch(AREA, { x: 300, y: 40, high: false });
    expect(f.along(150, 150, 450, 150, 0)).toEqual([a, b, c]);
    expect(f.along(450, 150, 150, 150, 0)).toEqual([c, b, a]);
    expect(f.along(150, 170, 450, 170, 0)).toEqual([a, b, c]);
    expect(f.along(150, 100, 450, 100, 0)).toEqual([]);
    expect(f.along(250, 150, 350, 150, 0)).toEqual([b]);
  });

  it('counts a swipe that is only a touch, with no length, as a touch', () => {
    const { f, a } = arrange();
    expect(f.along(300, 150, 300, 150, 0)).toEqual([a]);
  });
});

describe('pushing', () => {
  it('moves balloons away from the push, the nearer the more', () => {
    const f = new Field(new Rng(1));
    const near = f.launch(AREA, { x: 330, y: 150 });
    const far = f.launch(AREA, { x: 460, y: 150 });
    const left = f.launch(AREA, { x: 270, y: 150 });
    f.push(300, 150, 200, 100);
    expect(near.vx).toBeGreaterThan(far.vx);
    expect(far.vx).toBeGreaterThan(0);
    expect(left.vx).toBeLessThan(0);
  });

  it('leaves balloons out of reach alone', () => {
    const f = new Field(new Rng(1));
    const b = f.launch(AREA, { x: 700, y: 150 });
    f.push(100, 150, 200, 100);
    expect(b.vx).toBe(0);
  });
});

describe('a bouquet on strings', () => {
  const on = { x: 400, y: 300, length: 130, angle: 0.4 };

  it('hangs the balloon at the end of its string', () => {
    const f = new Field(new Rng(1));
    const b = f.tie(on, 2);
    run(f, 2);
    // Within the small sway and bob, it is a string's length from where it is tied.
    expect(Math.hypot(b.x - on.x, b.y - on.y)).toBeGreaterThan(125);
    expect(Math.hypot(b.x - on.x, b.y - on.y)).toBeLessThan(136);
    expect(b.x).toBeGreaterThan(on.x);
  });

  it('is not carried off, however long it is left', () => {
    const f = new Field(new Rng(1));
    const b = f.tie(on, 0);
    run(f, 60);
    expect(f.balloons).toContain(b);
    expect(b.y).toBeLessThan(on.y);
    expect(f.free).toBe(0);
  });

  it('swings when it is pushed, and comes to rest again', () => {
    const f = new Field(new Rng(1));
    const b = f.tie({ ...on, angle: 0 }, 1);
    run(f, 1);
    f.push(b.x - 40, b.y, 120, 160);
    let widest = 0;
    for (let t = 0; t < 1.2; t += 1 / 60) {
      f.update(1 / 60, AREA);
      widest = Math.max(widest, Math.abs(b.swing.x));
    }
    expect(widest).toBeGreaterThan(0.03);
    run(f, 8);
    expect(Math.abs(b.swing.x)).toBeLessThan(0.01);
  });

  it('is blown up from nothing, and cannot be touched until it is mostly there', () => {
    const f = new Field(new Rng(1));
    const b = f.tie(on, 3);
    expect(b.grow.x).toBe(0);
    expect(f.at(b.x, b.y, 10)).toBeNull();
    run(f, 1);
    expect(b.grow.x).toBeGreaterThan(0.9);
    expect(f.at(b.x, b.y, 0)).toBe(b);
  });
});

describe('what is in the sky', () => {
  it('counts the big balloons of a note that can be seen, which is what the song needs one of', () => {
    const f = new Field(new Rng(1));
    f.launch(AREA, { x: 200, y: 100, degree: 2, high: false });
    f.launch(AREA, { x: 300, y: 100, degree: 2, high: true });
    f.launch(AREA, { x: 400, y: 100, degree: 3, high: false });
    f.launch(AREA, { x: 500, y: 100, degree: 2, high: false, grown: false });
    const gone = f.launch(AREA, { x: 600, y: 100, degree: 2, high: false });
    gone.leaving = true;
    expect(f.visible(2, AREA)).toBe(1);
    expect(f.visible(3, AREA)).toBe(1);
    expect(f.visible(0, AREA)).toBe(0);
  });

  it('can leave the bouquet out when it counts, because the bouquet is always there and a free balloon is what the sky is short of', () => {
    const f = new Field(new Rng(1));
    f.tie({ x: 400, y: 300, length: 100, angle: 0 }, 2, true);
    expect(f.visible(2, AREA)).toBe(1);
    expect(f.visible(2, AREA, true)).toBe(0);
    f.launch(AREA, { x: 200, y: 100, degree: 2, high: false });
    expect(f.visible(2, AREA, true)).toBe(1);
  });

  it('counts only balloons that float free', () => {
    const f = new Field(new Rng(1));
    f.launch(AREA);
    f.launch(AREA);
    f.tie({ x: 400, y: 300, length: 100, angle: 0 }, 1);
    expect(f.free).toBe(2);
  });

  it('never holds more than a screen can bear, and keeps the bouquet when it lets the oldest go', () => {
    const f = new Field(new Rng(1));
    const tied = f.tie({ x: 400, y: 300, length: 100, angle: 0 }, 1);
    for (let i = 0; i < 120; i++) f.launch(AREA);
    expect(f.balloons.length).toBeLessThanOrEqual(44);
    expect(f.balloons).toContain(tied);
  });

  it('forgets a balloon that has been taken out', () => {
    const f = new Field(new Rng(1));
    const b = f.launch(AREA);
    f.remove(b);
    f.remove(b);
    expect(f.balloons).toHaveLength(0);
  });

  it('can be made empty', () => {
    const f = new Field(new Rng(1));
    f.seed(AREA, 6);
    f.clear();
    expect(f.balloons).toHaveLength(0);
  });
});
