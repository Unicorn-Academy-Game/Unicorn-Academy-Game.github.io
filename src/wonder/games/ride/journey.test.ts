import { describe, expect, it } from 'vitest';
import { FEET } from '../../engine/herd';
import { History, newPose, type Pose } from './history';
import { Journey, newSpot, PLAN, RESTING_EASE, RESTING_GAP, SPACING, SPREAD, STEP, settle } from './journey';
import { type Beat, Pilot } from './pilot';
import { RIDE_HEIGHT } from './runner';

const journey = (x = 4000, y = 120): Journey => new Journey({ x, y });
const TAU = Math.PI * 2;

describe('the way she goes in the finale', () => {
  it('begins level at the end of the rainbow, a body above it', () => {
    const j = journey(4000, 120);
    const start = j.at(0);
    expect(start.x).toBeCloseTo(4000, 3);
    expect(start.y).toBeCloseTo(120 - RIDE_HEIGHT, 3);
    expect(start.turn).toBeCloseTo(0, 3);
    expect(start.air).toBe(false);
  });

  it('has no gaps or jumps: every point is a few units from the next, and she never turns sharply between two', () => {
    const j = journey();
    const a = newSpot();
    const b = newSpot();
    for (let s = 0; s < j.length - STEP; s += STEP / 2) {
      j.at(s, a);
      j.at(s + STEP / 2, b);
      const gap = Math.hypot(b.x - a.x, b.y - a.y);
      expect(gap).toBeLessThan(STEP);
      // Turning by more than a quarter of a turn in a few units would be a kink, not a bend.
      expect(Math.abs(b.turn - a.turn)).toBeLessThan(0.3);
    }
  });

  it('goes through a loop that comes back level, farther along, having turned all the way round', () => {
    const j = journey();
    const before = j.at(j.marks.loopIn);
    const top = j.at(j.marks.loopTop);
    const after = j.at(j.marks.loopOut);
    // She rides the inside of the loop, so the way she goes is a body's height smaller than the
    // rainbow on each side.
    expect(top.y).toBeCloseTo(before.y - 2 * PLAN.loopRadius + 2 * RIDE_HEIGHT, 0);
    // Upside down at the top, which is half a turn one way or the other.
    expect(Math.abs(Math.abs(top.turn) - Math.PI)).toBeLessThan(0.15);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.x - before.x).toBeCloseTo(PLAN.loopShift, 0);
    expect(Math.abs(after.turn)).toBeCloseTo(TAU, 1);
  });

  it('keeps a line of friends apart: riders up to five places back are never on top of each other, even where the loop is tightest', () => {
    const j = journey();
    const a = newSpot();
    const b = newSpot();
    let tightest = Infinity;
    for (let s = 0; s < j.length - 5 * SPACING; s += 6) {
      j.at(s, a);
      for (let place = 1; place <= 5; place++) {
        j.at(s + place * SPACING, b);
        tightest = Math.min(tightest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    // A unicorn is about a hundred units long. Nearer than half of that and two would be one in
    // front of the other.
    expect(tightest).toBeGreaterThan(45);
  });

  it('leaves the rainbow turned up, flies, and comes down in the water below', () => {
    const j = journey();
    const launch = j.at(j.marks.launch - 1);
    const air = j.at(j.marks.launch + 40);
    const down = j.at(j.marks.land);
    expect(launch.air).toBe(false);
    expect(air.air).toBe(true);
    expect(down.y - launch.y).toBeGreaterThan(PLAN.drop - 5);
    expect(j.flightSeconds).toBeGreaterThan(1.8);
    expect(j.flightSeconds).toBeLessThan(3.4);
  });

  it('turns once all the way round in the air and lands the way up she was', () => {
    const j = journey();
    const first = j.at(j.marks.launch + 1);
    const last = j.at(j.marks.land);
    // A whole somersault is a turn of one revolution between the two, on top of the lean of the
    // leap.
    expect(Math.abs(last.turn - first.turn)).toBeGreaterThan(TAU - 1.2);
    expect(Math.abs(last.turn)).toBeLessThan(1);
  });

  it('puts the water where her hooves are when she has landed, a little under', () => {
    const j = journey();
    const down = j.at(j.marks.land);
    expect(Math.abs(j.pool.y - (down.y + FEET - PLAN.wade))).toBeLessThan(2);
    expect(j.pool.left).toBeLessThan(down.x);
    expect(j.pool.right).toBeGreaterThan(j.at(j.length).x);
    expect(j.pool.centre).toBeGreaterThan(down.x);
  });

  it('has the marks in the order she meets them, and the hoops on the straight', () => {
    const m = journey().marks;
    for (const hoop of m.hoops) expect(hoop).toBeLessThan(m.loopIn);
    expect([...m.hoops].sort((a, b) => a - b)).toEqual([...m.hoops]);
    expect(m.loopIn).toBeLessThan(m.loopTop);
    expect(m.loopTop).toBeLessThan(m.loopOut);
    expect(m.loopOut).toBeLessThan(m.launch);
    expect(m.launch).toBeLessThan(m.land);
    for (const star of m.stars) {
      expect(star).toBeGreaterThan(m.launch);
      expect(star).toBeLessThan(m.land);
    }
  });

  it('moves at the pace the leap sets while she is in the air, and slowest at the top', () => {
    const j = journey();
    expect(j.paceAt(j.marks.launch + 20)).toBeGreaterThan(700);
    const mid = j.paceAt((j.marks.launch + j.marks.land) / 2);
    expect(mid).toBeLessThan(j.paceAt(j.marks.launch + 20) * 0.75);
    expect(j.paceAt(5)).toBe(0);
    // Going along at that pace takes about as long as the leap does.
    let s = j.marks.launch + 1;
    let t = 0;
    while (s < j.marks.land && t < 10) {
      s += j.paceAt(s) * (1 / 120);
      t += 1 / 120;
    }
    expect(t).toBeCloseTo(j.flightSeconds, 0);
  });

  it('draws a rail that follows the way, one thin line of points with its up side to the rider', () => {
    const j = journey();
    expect(j.rail.length).toBeGreaterThan(100);
    for (const b of j.rail) expect(Math.hypot(b.nx, b.ny)).toBeCloseTo(1, 3);
    // Level at the start: up is up.
    expect(j.rail[0]!.ny).toBeCloseTo(-1, 2);
    // At the top of the loop, the rider's side is down.
    const top = j.rail.reduce((best, b) => (b.y < best.y ? b : best));
    expect(top.ny).toBeGreaterThan(0.9);
  });
});

describe('where friends stop', () => {
  it('slows like something in water and never goes past', () => {
    const rest = 1000;
    let last = settle(0, rest);
    expect(last).toBe(0);
    for (let s = 10; s < 3000; s += 10) {
      const here = settle(s, rest);
      expect(here).toBeGreaterThanOrEqual(last);
      expect(here).toBeLessThan(rest);
      last = here;
    }
    expect(rest - last).toBeLessThan(0.001);
    // It is the same pace as it was up to where it starts to slow, with no step.
    expect(settle(rest - RESTING_EASE, rest)).toBe(rest - RESTING_EASE);
    expect(settle(rest - RESTING_EASE + 1, rest) - settle(rest - RESTING_EASE, rest)).toBeCloseTo(1, 1);
  });

  it('stands them in a row, the leader at the front, and the row centred under the rainbow', () => {
    const j = journey();
    for (const friends of [0, 1, 3, 5]) {
      const spots = Array.from({ length: friends + 1 }, (_, i) => j.rest(i, friends));
      for (let i = 1; i < spots.length; i++) expect(spots[i - 1]! - spots[i]!).toBeCloseTo(RESTING_GAP, 6);
      const middle = (spots[0]! + spots[spots.length - 1]!) / 2;
      expect(middle).toBeCloseTo(j.marks.land + PLAN.glide / 2, 6);
      // Every one of them stops in the water, past where she lands and before the end of the way.
      for (const rest of spots) {
        expect(rest).toBeGreaterThan(j.marks.land);
        expect(rest).toBeLessThanOrEqual(j.length);
      }
    }
  });
});

describe('the line of friends', () => {
  const pose = (s: number, x: number): Pose => ({ ...newPose(), s, x, y: x * 0.5, dist: s });

  it('finds how she looked a given way back, between the two moments around it', () => {
    const h = new History(64);
    for (let i = 0; i < 40; i++) h.push(pose(i * 10, i * 10));
    const found = h.at(255);
    expect(found.x).toBeCloseTo(255, 6);
    expect(found.y).toBeCloseTo(127.5, 6);
    expect(found.s).toBeCloseTo(255, 6);
  });

  it('is the first before it starts and the last after it ends', () => {
    const h = new History(16);
    for (let i = 0; i < 10; i++) h.push(pose(i * 10, i * 10));
    expect(h.at(-50).x).toBe(0);
    expect(h.at(1e9).x).toBe(90);
    expect(new History().at(5).x).toBe(0);
  });

  it('forgets the oldest when it is full, and still answers for what it holds', () => {
    const h = new History(10);
    for (let i = 0; i < 100; i++) h.push(pose(i * 10, i * 10));
    expect(h.length).toBe(10);
    expect(h.at(955).x).toBeCloseTo(955, 6);
    // A way back that is no longer written down is as far back as it goes.
    expect(h.at(0).x).toBe(900);
  });

  it('keeps what she was doing from the moment before, and does not blend a leap into the ground', () => {
    const h = new History(16);
    h.push({ ...pose(0, 0), air: false });
    h.push({ ...pose(10, 10), air: true });
    expect(h.at(5).air).toBe(false);
    expect(h.at(10).air).toBe(true);
  });

  it('stays the same distance behind her however fast she goes', () => {
    const h = new History(480);
    let x = 0;
    for (let i = 0; i < 300; i++) {
      // She goes slowly, then fast, then slowly.
      x += i < 100 ? 2 : i < 200 ? 9 : 3;
      h.push(pose(x, x));
    }
    const friend = h.at(x - 120);
    expect(x - friend.x).toBeCloseTo(120, 6);
  });
});

describe('going along it', () => {
  const run = (
    friends: number,
    tapEvery = 0,
  ): { beats: { t: number; kind: string; index?: number }[]; time: number; pilot: Pilot } => {
    const j = journey();
    const pilot = new Pilot(j, friends, 300, 20);
    const beats: { t: number; kind: string; index?: number }[] = [];
    const out: Beat[] = [];
    let t = 0;
    for (; t < 40 && !pilot.settled; t += 1 / 60) {
      if (tapEvery > 0 && Math.floor(t / tapEvery) !== Math.floor((t - 1 / 60) / tapEvery)) pilot.tap();
      out.length = 0;
      pilot.step(1 / 60, out);
      for (const b of out) beats.push({ t, kind: b.kind, ...('index' in b ? { index: b.index } : {}) });
    }
    return { beats, time: t, pilot };
  };

  it('gets to every place on the way, once, in order', () => {
    const { beats } = run(3);
    const kinds = beats.map((b) => b.kind);
    expect(kinds.filter((k) => k === 'hoop')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'star')).toHaveLength(15);
    expect(kinds.filter((k) => k === 'splash')).toHaveLength(4);
    const order = ['hoop', 'loop-in', 'loop-top', 'loop-out', 'launch', 'star', 'splash'];
    const first = order.map((k) => beats.findIndex((b) => b.kind === k));
    expect([...first].sort((a, b) => a - b)).toEqual(first);
    // The splashes are her first and then each friend, in the order they are in the line.
    expect(beats.filter((b) => b.kind === 'splash').map((b) => b.index)).toEqual([0, 1, 2, 3]);
  });

  it('takes about ten seconds from the start to everyone being in the water, with five friends, and fewer with none', () => {
    const five = run(5);
    const none = run(0);
    expect(five.time).toBeGreaterThan(6);
    expect(five.time).toBeLessThan(13);
    expect(none.time).toBeLessThan(five.time);
    expect(five.pilot.settled).toBe(true);
  });

  it('is in the air for as long as the leap lasts, however she was going when she left', () => {
    const { beats } = run(2);
    const launch = beats.find((b) => b.kind === 'launch')!.t;
    const land = beats.find((b) => b.kind === 'splash' && b.index === 0)!.t;
    const j = journey();
    expect(land - launch).toBeGreaterThan(j.flightSeconds - 0.15);
    expect(land - launch).toBeLessThan(j.flightSeconds + 0.15);
  });

  it('does not sit in the loop: she is round it in a couple of seconds, taps or none', () => {
    for (const taps of [0, 0.4]) {
      const { beats } = run(2, taps);
      const inn = beats.find((b) => b.kind === 'loop-in')!.t;
      const out = beats.find((b) => b.kind === 'loop-out')!.t;
      expect(out - inn).toBeGreaterThan(0.9);
      expect(out - inn).toBeLessThan(2.4);
    }
  });

  it('gives a child who taps all the way a faster ride, but never a wild one', () => {
    const idle = run(2);
    const tapping = run(2, 0.25);
    expect(tapping.time).toBeLessThan(idle.time);
    expect(tapping.time).toBeGreaterThan(idle.time * 0.7);
  });

  it('keeps friends a gap behind her on the way to the leap, and spreads them out as they fly, never going backward', () => {
    const j = journey();
    for (let i = 1; i <= 5; i++) {
      expect(j.place(j.marks.launch - 1, i)).toBeCloseTo(j.marks.launch - 1 - SPACING * i, 6);
      expect(j.place(j.marks.land + 400, i)).toBeCloseTo(j.marks.land + 400 - SPACING * SPREAD * i, 6);
      let last = -Infinity;
      for (let s = 0; s < j.length + 800; s += 5) {
        const here = j.place(s, i);
        expect(here).toBeGreaterThanOrEqual(last);
        last = here;
      }
    }
  });

  it('brings the friends down into the water one after another, a third of a second or so apart', () => {
    const { beats } = run(5);
    const splashes = beats.filter((b) => b.kind === 'splash').map((b) => b.t);
    expect(splashes).toHaveLength(6);
    for (let i = 1; i < splashes.length; i++) {
      const gap = splashes[i]! - splashes[i - 1]!;
      expect(gap).toBeGreaterThan(0.22);
      expect(gap).toBeLessThan(0.5);
    }
  });
});
