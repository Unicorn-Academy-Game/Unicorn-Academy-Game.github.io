import { describe, expect, it } from 'vitest';
import { SteerKeys } from './steer-keys';

describe('SteerKeys', () => {
  it('points where the key points, with W up and S down on the screen', () => {
    const k = new SteerKeys();
    expect(k.down('KeyW')).toBe(true);
    expect(k.heading()).toEqual({ x: 0, y: -1 });
    k.up('KeyW');
    k.down('KeyS');
    expect(k.heading()).toEqual({ x: 0, y: 1 });
    k.clear();
    k.down('ArrowLeft');
    expect(k.heading()).toEqual({ x: -1, y: 0 });
    k.clear();
    k.down('ArrowRight');
    expect(k.heading()).toEqual({ x: 1, y: 0 });
  });

  it('points between two keys at a right angle, at length one', () => {
    const k = new SteerKeys();
    k.down('KeyD');
    k.down('KeyW');
    const h = k.heading()!;
    expect(h.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(h.y).toBeCloseTo(-Math.SQRT1_2, 9);
  });

  it('cancels opposite keys, and a key and its arrow are one direction', () => {
    const k = new SteerKeys();
    k.down('KeyA');
    k.down('KeyD');
    expect(k.heading()).toBeNull();
    k.up('KeyA');
    expect(k.heading()).toEqual({ x: 1, y: 0 });
    k.down('ArrowRight');
    expect(k.heading()).toEqual({ x: 1, y: 0 });
  });

  it('says whether a key is one of its own, and holds nothing for any other', () => {
    const k = new SteerKeys();
    expect(k.down('KeyQ')).toBe(false);
    expect(k.up('Space')).toBe(false);
    expect(k.heading()).toBeNull();
  });

  it('lets go of everything on a clear, so a key lifted while the window was away is not left held', () => {
    const k = new SteerKeys();
    k.down('KeyW');
    k.down('KeyD');
    k.clear();
    expect(k.heading()).toBeNull();
  });
});
