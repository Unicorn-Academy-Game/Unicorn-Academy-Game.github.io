import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { archOf } from './arch';
import { Rainbow } from './rainbow';

const arch = archOf(863, 309, 84);
const gift = { x: 431, y: 280 };

const built = (): Rainbow => {
  const r = new Rainbow();
  r.build(arch, gift, 10, new Rng(3));
  return r;
};

describe('the rainbow of the finale', () => {
  it('has no rainbow until it is built, and one balloon for every place when it is', () => {
    const r = new Rainbow();
    expect(r.standing).toBe(false);
    expect(r.left).toBe(0);
    expect(r.hit(400, 100, 10, 0)).toBeNull();
    r.build(arch, gift, 10, new Rng(3));
    expect(r.standing).toBe(true);
    expect(r.left).toBe(arch.slots.length);
  });

  it('puts every balloon in place by the time the build is done, and not before', () => {
    const r = built();
    const last = r.done;
    expect(last).toBeGreaterThan(3);
    for (const p of r.pieces) expect(r.place(p, 10 + last + 0.01).flying).toBe(false);
    expect(r.pieces.some((p) => r.place(p, 10 + last * 0.5).flying)).toBe(true);
  });

  it('puts the outside ring up first and the inside last', () => {
    const r = built();
    for (let ring = 1; ring < arch.rings; ring++) expect(r.arrival(ring)).toBeGreaterThan(r.arrival(ring - 1));
  });

  it('only lets a balloon be popped once it is in place', () => {
    const r = built();
    const p = r.pieces[0]!;
    expect(r.hit(p.slot.x, p.slot.y, 4, 10)).toBeNull();
    expect(r.hit(p.slot.x, p.slot.y, 4, 10 + p.trip.arrives + 0.05)).toBe(p);
  });

  it('finds the balloon a touch is on, even with room to spare, and nothing in the sky away from the rainbow', () => {
    const r = built();
    const late = 10 + r.done + 1;
    for (const p of r.pieces.filter((_, i) => i % 9 === 0)) expect(r.hit(p.slot.x, p.slot.y, 6, late)).toBe(p);
    expect(r.hit(arch.cx, arch.baseY - arch.openRy * 0.3, 0, late)).toBeNull();
    expect(r.hit(5, 5, 6, late)).toBeNull();
  });

  it('forgets a balloon that is popped, and counts those that are left', () => {
    const r = built();
    const p = r.pieces[7]!;
    const late = 10 + r.done + 1;
    p.popped = true;
    expect(r.hit(p.slot.x, p.slot.y, 0, late)).not.toBe(p);
    expect(r.left).toBe(arch.slots.length - 1);
  });

  it('cuts into columns that between them hold every balloon exactly once', () => {
    const r = built();
    const columns = 9;
    let total = 0;
    const seen = new Set<unknown>();
    for (let c = 0; c < columns; c++) {
      for (const p of r.column(c, columns)) {
        expect(seen.has(p)).toBe(false);
        seen.add(p);
        total++;
      }
    }
    expect(total).toBe(arch.slots.length);
    r.pieces[0]!.popped = true;
    expect(r.column(0, columns).length + r.column(1, columns).length).toBeGreaterThan(0);
  });

  it('is gone when it is cleared', () => {
    const r = built();
    r.clear();
    expect(r.standing).toBe(false);
    expect(r.pieces).toHaveLength(0);
  });
});
