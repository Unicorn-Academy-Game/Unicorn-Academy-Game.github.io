import { describe, expect, it } from 'vitest';
import { CameraRig } from './camera';

const VIEW = { w: 1000, h: 500 };
const BIG = { w: 4000, h: 3000 };

function settle(
  rig: CameraRig,
  target: { x: number; y: number },
  heading: { x: number; y: number } | null,
  seconds: number,
  bounds = BIG,
): void {
  for (let t = 0; t < seconds; t += 1 / 60) rig.update(1 / 60, target, heading, VIEW, bounds);
}

describe('CameraRig', () => {
  it('holds still while the target stays inside the dead zone', () => {
    const rig = new CameraRig();
    rig.snap({ x: 2000, y: 1500 }, VIEW, BIG);
    settle(rig, { x: 2040, y: 1520 }, null, 3);
    expect(rig.x).toBeCloseTo(2000, 5);
    expect(rig.y).toBeCloseTo(1500, 5);
  });

  it('follows a target that leaves the dead zone and stops with it at the zone edge', () => {
    const rig = new CameraRig();
    rig.snap({ x: 2000, y: 1500 }, VIEW, BIG);
    settle(rig, { x: 2400, y: 1500 }, null, 6);
    expect(rig.x).toBeCloseTo(2400 - 1000 * 0.07, 0);
  });

  it('leaves room ahead of a walker and gives it back when she stops', () => {
    const rig = new CameraRig();
    rig.snap({ x: 2000, y: 1500 }, VIEW, BIG);
    settle(rig, { x: 2000, y: 1500 }, { x: 1, y: 0 }, 8);
    expect(rig.x).toBeGreaterThan(2000 + 1000 * 0.1);
    const ahead = rig.x;
    settle(rig, { x: 2000, y: 1500 }, null, 12);
    expect(rig.x).toBeLessThanOrEqual(ahead);
    expect(rig.x - 2000).toBeLessThan(1000 * 0.08 + 1);
  });

  it('never shows beyond the map', () => {
    const rig = new CameraRig();
    rig.snap({ x: 50, y: 50 }, VIEW, BIG);
    expect(rig.x).toBe(500);
    expect(rig.y).toBe(250);
    settle(rig, { x: 9000, y: 9000 }, { x: 1, y: 1 }, 20);
    expect(rig.x).toBe(4000 - 500);
    expect(rig.y).toBe(3000 - 250);
  });

  it('centres a map that is smaller than the view', () => {
    const rig = new CameraRig();
    const small = { w: 800, h: 300 };
    rig.snap({ x: 100, y: 100 }, VIEW, small);
    expect(rig.x).toBe(400);
    expect(rig.y).toBe(150);
  });

  it('moves by the same amount per second at any frame rate', () => {
    const run = (fps: number): number => {
      const rig = new CameraRig();
      rig.snap({ x: 2000, y: 1500 }, VIEW, BIG);
      for (let i = 0; i < fps; i++) rig.update(1 / fps, { x: 2600, y: 1500 }, null, VIEW, BIG);
      return rig.x;
    };
    expect(Math.abs(run(30) - run(120))).toBeLessThan(2);
  });

  it('does not lurch after a long stall in the frame loop', () => {
    const rig = new CameraRig();
    rig.snap({ x: 2000, y: 1500 }, VIEW, BIG);
    rig.update(5, { x: 3000, y: 1500 }, null, VIEW, BIG);
    expect(rig.x).toBeLessThan(2500);
  });
});
