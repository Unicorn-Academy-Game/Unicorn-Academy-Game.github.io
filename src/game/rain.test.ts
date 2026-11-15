import { describe, expect, it } from 'vitest';
import { RAIN_KIND, RAIN_KINDS, RAIN_PIECE_IDS, RAIN_PIECES, RAIN_SECONDS } from '../content/rain';
import { distanceToSegment, type Piece, RainGame, totalOf } from './rain';

/** A fixed, repeatable run of numbers in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const game = (o: { seed?: number; calm?: boolean; seconds?: number; w?: number; h?: number } = {}): RainGame =>
  new RainGame({
    width: o.w ?? 800,
    height: o.h ?? 360,
    random: seeded(o.seed ?? 1),
    ...(o.calm ? { calm: true } : {}),
    ...(o.seconds ? { seconds: o.seconds } : {}),
  });

const falling = (g: RainGame): Piece[] => g.pieces.filter((p) => p.state === 'falling');

/**
 * Sweeps a finger across the whole play area, along three rows, which touches every piece in the
 * air.
 */
function sweepEverything(g: RainGame): void {
  for (const y of [60, 180, 300]) g.touch({ x: 0, y }, { x: 800, y });
  for (const y of [0, 120, 240, 360]) g.touch({ x: 0, y }, { x: 800, y });
}

describe('the content of the game', () => {
  it('gives every piece a kind, a word and an id of its own', () => {
    const ids = new Set<string>();
    for (const id of RAIN_PIECE_IDS) {
      const def = RAIN_PIECES[id];
      expect(RAIN_KINDS, id).toContain(def.kind);
      expect(def.word.length, id).toBeGreaterThan(2);
      expect(ids.has(def.id), `${id} repeats an id`).toBe(false);
      ids.add(def.id);
    }
  });

  it('has gems, gold and money, each with a picture that is one of its own pieces', () => {
    for (const kind of RAIN_KINDS) expect(RAIN_PIECES[RAIN_KIND[kind].icon].kind).toBe(kind);
  });

  it('lasts sixty seconds', () => {
    expect(RAIN_SECONDS).toBe(60);
  });
});

describe('a round', () => {
  it('ends at sixty seconds, and not before', () => {
    const g = game();
    g.step(59.9);
    expect(g.over).toBe(false);
    expect(g.remaining).toBeCloseTo(0.1, 3);
    const events = g.step(0.3);
    expect(g.over).toBe(true);
    expect(g.remaining).toBe(0);
    expect(events.filter((e) => e.type === 'over')).toHaveLength(1);
    // Nothing more happens once it is over.
    expect(g.step(5)).toEqual([]);
    expect(g.touch(null, { x: 10, y: 10 })).toEqual([]);
  });

  it('cannot be lost: leaving it alone scores nothing and costs nothing', () => {
    const g = game();
    const events = g.step(RAIN_SECONDS);
    expect(g.total).toBe(0);
    expect(events.some((e) => e.type === 'missed')).toBe(true);
    // The only things that ever happen are pieces starting, pieces going, showers and the end.
    expect(new Set(events.map((e) => e.type))).toEqual(new Set(['started', 'missed', 'shower', 'over']));
  });

  it('only ever counts up', () => {
    const g = game({ seed: 4 });
    let last = 0;
    for (let i = 0; i < 600; i++) {
      g.step(0.1);
      g.touch({ x: (i * 37) % 800, y: 40 + ((i * 53) % 280) }, { x: (i * 91) % 800, y: 40 + ((i * 17) % 280) });
      expect(g.total).toBeGreaterThanOrEqual(last);
      last = g.total;
    }
    expect(last).toBeGreaterThan(0);
  });

  it('starts dropping pieces from above the top of the screen', () => {
    const g = game();
    const started = g.step(1).filter((e) => e.type === 'started');
    expect(started.length).toBeGreaterThan(0);
    for (const e of started) if (e.type === 'started') expect(e.piece.y).toBeLessThan(e.piece.size);
  });

  it('keeps every piece on the screen sideways and never has more than sixteen in the air', () => {
    const g = game({ seed: 9 });
    for (let i = 0; i < 700; i++) {
      g.step(0.1);
      expect(falling(g).length).toBeLessThanOrEqual(16);
      for (const p of falling(g)) {
        expect(p.x).toBeGreaterThan(-p.size * 0.3);
        expect(p.x).toBeLessThan(800 + p.size * 0.3);
      }
    }
  });

  it('has a golden shower three times, and none in calm mode', () => {
    const noisy = game()
      .step(RAIN_SECONDS)
      .filter((e) => e.type === 'shower');
    expect(noisy).toHaveLength(3);
    const calm = game({ calm: true })
      .step(RAIN_SECONDS)
      .filter((e) => e.type === 'shower');
    expect(calm).toHaveLength(0);
  });

  it('pours more in a shower than in the quiet before it', () => {
    const g = game({ seed: 3 });
    const count = (from: number, to: number): number => {
      let n = 0;
      for (let t = from; t < to; t += 0.1) n += g.step(0.1).filter((e) => e.type === 'started').length;
      return n;
    };
    count(0, 15);
    const quiet = count(15, 17.9);
    const shower = count(17.9, 20.9);
    expect(shower).toBeGreaterThan(quiet);
  });

  it('is the same every time for the same numbers', () => {
    const a = game({ seed: 7 });
    const b = game({ seed: 7 });
    for (let i = 0; i < 300; i++) {
      a.step(0.1);
      b.step(0.1);
    }
    expect(a.pieces.map((p) => [p.piece, Math.round(p.x), Math.round(p.y)])).toEqual(
      b.pieces.map((p) => [p.piece, Math.round(p.x), Math.round(p.y)]),
    );
  });

  it('does not drop a pile of pieces after one very slow frame', () => {
    const g = game();
    g.step(0.5);
    const before = g.pieces.length;
    g.step(30);
    expect(g.pieces.length - before).toBeLessThanOrEqual(16);
    expect(falling(g).length).toBeLessThanOrEqual(16);
  });
});

describe('catching', () => {
  it('catches a piece that is touched, once, and counts it by its kind', () => {
    const g = game({ seed: 2 });
    g.step(2.5);
    const piece = falling(g)[0]!;
    const caught = g.touch(null, { x: piece.x, y: piece.y });
    expect(caught.some((e) => e.type === 'caught' && e.piece === piece)).toBe(true);
    expect(piece.state).toBe('caught');
    expect(g.counts[piece.kind]).toBe(1);
    // Touching the same place again catches nothing more.
    const again = g.touch(null, { x: piece.x, y: piece.y });
    expect(again.filter((e) => e.type === 'caught' && e.piece === piece)).toHaveLength(0);
    expect(g.counts[piece.kind]).toBe(1);
  });

  it('catches with a finger that is near and not only on it', () => {
    const g = game({ seed: 2 });
    g.step(2.5);
    const piece = falling(g)[0]!;
    g.touch(null, { x: piece.x + piece.size * 0.5, y: piece.y });
    expect(piece.state).toBe('caught');
  });

  it('does not catch a piece that is far from the finger', () => {
    const g = game({ seed: 2 });
    g.step(2.5);
    const piece = falling(g)[0]!;
    g.touch(null, { x: piece.x + 400, y: piece.y + 200 });
    expect(piece.state).toBe('falling');
  });

  it('catches everything along a fast swipe, even when neither end is near', () => {
    const g = game({ seed: 5 });
    g.step(8);
    const before = falling(g).length;
    expect(before).toBeGreaterThan(1);
    // From far left to far right at the height of the first piece: nothing at its row can be
    // skipped.
    const row = falling(g)[0]!.y;
    g.touch({ x: -200, y: row }, { x: 1000, y: row });
    const nearRow = g.pieces.filter((p) => Math.abs(p.y - row) < g.reach(p));
    expect(nearRow.length).toBeGreaterThan(0);
    for (const p of nearRow) expect(p.state).toBe('caught');
  });

  it('counts each kind on its own and adds them up', () => {
    const g = game({ seed: 11 });
    for (let i = 0; i < 400; i++) {
      g.step(0.1);
      sweepEverything(g);
    }
    const c = g.counts;
    expect(totalOf(c)).toBe(g.total);
    expect(c.gem).toBeGreaterThan(0);
    expect(c.gold).toBeGreaterThan(0);
    expect(c.money).toBeGreaterThan(0);
    // Gems come most often.
    expect(c.gem).toBeGreaterThan(c.money);
  });

  it('lets a caught piece linger for its picture, then removes it', () => {
    const g = game({ seed: 2 });
    g.step(2.5);
    const piece = falling(g)[0]!;
    g.touch(null, piece);
    g.step(0.3);
    expect(g.pieces).toContain(piece);
    g.step(0.5);
    expect(g.pieces).not.toContain(piece);
  });

  it('has more time to catch in calm mode: it falls slower and does not spin', () => {
    const calm = game({ calm: true, seed: 6 });
    const lively = game({ seed: 6 });
    calm.step(3);
    lively.step(3);
    const c = falling(calm)[0]!;
    const l = falling(lively)[0]!;
    expect(c.spin).toBe(0);
    expect(c.sway).toBe(0);
    expect(c.speed).toBeLessThan(l.speed);
  });
});

describe('the size of the screen', () => {
  it('keeps pieces at the same share of the width when the screen turns', () => {
    const g = game({ seed: 8 });
    g.step(5);
    const shares = falling(g).map((p) => p.x / 800);
    g.resize(400, 800);
    falling(g).forEach((p, i) => {
      expect(p.x / 400).toBeCloseTo(shares[i]!, 6);
    });
  });

  it('makes pieces a size a thumb can hit on a small phone and not huge on a big screen', () => {
    for (const h of [320, 360, 800, 1600]) {
      const g = game({ h, seed: 1 });
      g.step(2);
      for (const p of g.pieces) {
        expect(p.size).toBeGreaterThanOrEqual(41);
        expect(p.size).toBeLessThanOrEqual(98);
        expect(g.reach(p)).toBeGreaterThanOrEqual(38);
      }
    }
  });
});

describe('distanceToSegment', () => {
  it('measures to the nearest point on the segment, including its ends', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});
