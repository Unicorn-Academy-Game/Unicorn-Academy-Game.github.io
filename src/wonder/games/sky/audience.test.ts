import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { UNICORN_IDS } from '../../../shared/ids';
import { Audience } from './audience';

const friends = UNICORN_IDS.slice(0, 4);

function standing(width: number, how: Parameters<Audience['stand']>[6]): Audience {
  const a = new Audience(null, new Rng(1), [120, 110, 180]);
  a.stand(friends, width, 86, 330, 92, 0, how);
  return a;
}

describe('where the friends stand', () => {
  it('puts them all to the right of the cannon, facing it, nearest first', () => {
    const a = standing(863, { side: 'right', maxScale: 0.62 });
    expect(a.members).toHaveLength(4);
    const xs = a.members.map((m) => m.x);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
    expect(xs[0]!).toBeGreaterThan(86 + 92);
    expect(a.members.every((m) => m.facing === 'west')).toBe(true);
  });

  it('stands them further apart when it is told how far, as long as the room allows', () => {
    const close = standing(863, { side: 'right', maxScale: 0.62 });
    const wide = standing(863, { side: 'right', maxScale: 0.62, step: 106 });
    const gap = (a: Audience): number => a.members[1]!.x - a.members[0]!.x;
    expect(gap(close)).toBeLessThan(gap(wide));
    expect(gap(wide)).toBeCloseTo(106, 6);
    // More room never makes them bigger than they were told they may be.
    expect(wide.members[0]!.scale).toBeLessThanOrEqual(0.62);
  });

  it('keeps them on a narrow screen, in two rows, whatever step it is told', () => {
    const a = standing(360, { side: 'right', maxScale: 0.62, step: 106 });
    const right = Math.max(...a.members.map((m) => m.x));
    expect(right).toBeLessThanOrEqual(360);
    expect(new Set(a.members.map((m) => m.y)).size).toBe(2);
  });
});

describe('a friend held up off the ground', () => {
  it('is not there to be touched, and is touched again when she is down', () => {
    const a = standing(863, { side: 'right', maxScale: 0.62 });
    const m = a.members[0]!;
    expect(a.at(m.x, m.y - 30)).toBe(m);
    m.lift = 40;
    expect(a.at(m.x, m.y - 30)).toBeNull();
    m.lift = 0;
    expect(a.at(m.x, m.y - 30)).toBe(m);
  });

  it('is left to whatever holds her: her own moves, a cheer and a celebration do not change what she is doing', () => {
    const a = standing(863, { side: 'right', maxScale: 0.62 });
    const m = a.members[0]!;
    m.lift = 60;
    m.clip = 'walk';
    m.since = 0;
    m.nextOwn = 0;
    a.update(100);
    a.cheer(m.x, 2, 100, 863);
    a.celebrate(100);
    expect(m.clip).toBe('walk');
    expect(m.since).toBe(0);
    // The others on the ground are celebrating.
    expect(a.members.slice(1).every((o) => o.clip === 'signature-idle')).toBe(true);
  });

  it('starts every friend on the ground', () => {
    const a = standing(863, { side: 'right', maxScale: 0.62 });
    expect(a.members.every((m) => m.lift === 0)).toBe(true);
    a.members[0]!.lift = 50;
    a.reset(0);
    expect(a.members[0]!.lift).toBe(0);
  });
});
