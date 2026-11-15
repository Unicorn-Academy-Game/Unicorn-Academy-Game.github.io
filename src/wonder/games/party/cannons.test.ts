import { describe, expect, it } from 'vitest';
import { Cannons, HEIGHT, RELOAD } from './cannons';
import { planOf } from './layout';

const setUp = (w = 863, h = 360): { cannons: Cannons; plan: ReturnType<typeof planOf> } => {
  const plan = planOf(w, h);
  const cannons = new Cannons();
  cannons.place(plan.cannons);
  return { cannons, plan };
};

describe('the cannons', () => {
  it('stand one each side, and throw the warm colours from the left and the cool from the right', () => {
    const { cannons } = setUp();
    expect(cannons.list).toHaveLength(2);
    const [left, right] = cannons.list as [(typeof cannons.list)[number], (typeof cannons.list)[number]];
    expect(left.x).toBeLessThan(right.x);
    expect(left.colors).not.toEqual(right.colors);
  });

  it('point in toward the middle and a little up, so a shot crosses the floor', () => {
    const { cannons, plan } = setUp();
    for (const c of cannons.list) {
      const m = cannons.mouthOf(c);
      // Its mouth is above its foot, and nearer the middle of the screen than its foot.
      expect(m.y).toBeLessThan(c.y - HEIGHT * c.scale * 0.9);
      expect(Math.abs(m.x - plan.w / 2)).toBeLessThan(Math.abs(c.x - plan.w / 2));
      // A shot goes up, and toward the middle.
      expect(Math.sin(m.angle)).toBeLessThan(-0.9);
      expect(Math.sign(Math.cos(m.angle))).toBe(c.side < 0 ? 1 : -1);
    }
  });

  it('goes off when it is touched, and not again until it is loaded', () => {
    const { cannons } = setUp();
    const c = cannons.list[0]!;
    expect(cannons.fire(c)).not.toBeNull();
    expect(c.shots).toBe(1);
    expect(cannons.fire(c)).toBeNull();
    expect(c.shots).toBe(1);
    cannons.update(RELOAD - 0.05);
    expect(cannons.fire(c)).toBeNull();
    cannons.update(0.1);
    expect(cannons.fire(c)).not.toBeNull();
    expect(c.shots).toBe(2);
  });

  it('kicks back when it goes off and settles again', () => {
    const { cannons } = setUp();
    const c = cannons.list[1]!;
    cannons.fire(c);
    let most = 0;
    for (let i = 0; i < 20; i++) {
      cannons.update(1 / 60);
      most = Math.max(most, c.kick.x);
    }
    expect(most).toBeGreaterThan(0.05);
    for (let i = 0; i < 120; i++) cannons.update(1 / 60);
    expect(Math.abs(c.kick.x)).toBeLessThan(0.005);
    expect(c.flare).toBe(0);
  });

  it('is found by a touch on its barrel or its mouth, and not by one far from it', () => {
    const { cannons } = setUp();
    for (const c of cannons.list) {
      const m = cannons.mouthOf(c);
      expect(cannons.at(c.x, c.y - 20)).toBe(c);
      expect(cannons.at(m.x, m.y + 4)).toBe(c);
      expect(cannons.at((c.x + m.x) / 2, (c.y + m.y) / 2)).toBe(c);
      expect(cannons.at(c.x + c.side * 120, c.y - 50)).toBeNull();
      expect(cannons.at(c.x, c.y - HEIGHT * c.scale - 70)).toBeNull();
    }
  });

  it('keeps what it has done when the screen turns', () => {
    const { cannons } = setUp();
    const c = cannons.list[0]!;
    cannons.fire(c);
    cannons.place(planOf(360, 780).cannons);
    expect(cannons.list[0]!.shots).toBe(1);
    expect(cannons.list[0]!.wait).toBeGreaterThan(0);
    cannons.reset();
    expect(cannons.list[0]!.shots).toBe(0);
    expect(cannons.list[0]!.wait).toBe(0);
  });
});
