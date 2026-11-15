import { describe, expect, it } from 'vitest';
import { footprint, GROUND_SQUASH, placeShadow } from '../../src/render/shadow';
import {
  angleOf,
  EAST,
  NORTH,
  NORTHEAST,
  SOUTH,
  SOUTHEAST,
  UNICORN_FACINGS,
  type UnicornFacing,
  WEST,
} from '../../src/shared/compass';
import type { ShadowSpec } from '../../src/shared/manifest';

/**
 * What every unicorn's manifest has: a shadow 104 long and 26 wide facing east, thrown a little to
 * the right.
 */
const SPEC: ShadowSpec = { rx: 52, ry: 13, dx: 8, dy: 2, a: 0.32 };

/**
 * How far across and how far down the shadow reaches from its middle: the half sizes of the box
 * round it.
 */
function reach(facing: UnicornFacing): { across: number; down: number } {
  const { rx, ry, angle } = footprint(SPEC, angleOf(facing));
  return {
    across: Math.hypot(rx * Math.cos(angle), ry * Math.sin(angle)),
    down: Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle)),
  };
}

describe('the shadow of a unicorn', () => {
  it('is the shadow in her manifest when she faces east or west', () => {
    for (const facing of [EAST, WEST]) {
      const { across, down } = reach(facing);
      expect(across).toBeCloseTo(SPEC.rx, 6);
      expect(down).toBeCloseTo(SPEC.ry, 6);
    }
  });

  it('is narrower and rounder when she faces the camera or turns her back on it, as a long shape on the ground is when it is turned toward the eye', () => {
    const side = reach(EAST);
    for (const facing of [SOUTH, NORTH]) {
      const end = reach(facing);
      expect(end.across).toBeLessThan(side.across * 0.65);
      expect(end.down).toBeGreaterThan(side.down * 1.6);
      // What is across the ground under her is as wide as it is long, flattened by the camera as
      // everything on the ground is.
      expect(end.across).toBeCloseTo(SPEC.ry / GROUND_SQUASH, 6);
      expect(end.down).toBeCloseTo(SPEC.rx * GROUND_SQUASH, 6);
    }
  });

  it('is the same shadow facing south as facing north, and a mirror of itself for the facings that mirror', () => {
    for (const facing of UNICORN_FACINGS) {
      const a = reach(facing);
      const mirror = reach(((32 - facing) % 32) as UnicornFacing);
      expect(mirror.across).toBeCloseTo(a.across, 6);
      expect(mirror.down).toBeCloseTo(a.down, 6);
      const behind = reach(((facing + 16) % 32) as UnicornFacing);
      expect(behind.across).toBeCloseTo(a.across, 6);
      expect(behind.down).toBeCloseTo(a.down, 6);
    }
  });

  it('turns smoothly from one facing to the next: no side of the box round it moves by more than 5 units a step', () => {
    for (const facing of UNICORN_FACINGS) {
      const a = reach(facing);
      const b = reach(((facing + 1) % 32) as UnicornFacing);
      expect(Math.abs(a.across - b.across), `across at ${facing}`).toBeLessThan(5);
      expect(Math.abs(a.down - b.down), `down at ${facing}`).toBeLessThan(5);
    }
  });

  it('is tilted between the way she faces and flat across the picture at the facings between the compass points', () => {
    const southeast = footprint(SPEC, angleOf(SOUTHEAST));
    expect(southeast.rx).toBeGreaterThan(southeast.ry);
    expect(southeast.angle).toBeGreaterThan(0);
    expect(southeast.angle).toBeLessThan(angleOf(SOUTHEAST));
    const northeast = footprint(SPEC, angleOf(NORTHEAST));
    expect(northeast.angle).toBeLessThan(0);
    expect(northeast.angle).toBeGreaterThan(angleOf(NORTHEAST));
  });
});

describe('placeShadow', () => {
  /** An image that remembers what it was told. */
  function fake() {
    const told: Record<string, unknown[]> = {};
    const image = new Proxy(
      {},
      {
        get: (_, name: string) => {
          return (...args: unknown[]) => {
            told[name] = args;
            return image;
          };
        },
      },
    );
    return { image: image as never, told };
  }

  it('draws what has no way it faces as the ellipse of its manifest, as it always was, and thrown by it', () => {
    const { image, told } = fake();
    placeShadow(image, SPEC, 100, 200);
    expect(told.setPosition).toEqual([108, 202]);
    expect(told.setRotation).toEqual([0]);
    expect(told.setScale).toEqual([(52 * 2) / 128, (13 * 2) / 64]);
    expect(told.setAlpha).toEqual([0.32]);
  });

  it('turns it for one that faces a way', () => {
    const { image, told } = fake();
    placeShadow(image, SPEC, 100, 200, angleOf(SOUTH));
    const [sx, sy] = told.setScale as [number, number];
    expect(sx * 128).toBeCloseTo((SPEC.ry / GROUND_SQUASH) * 2, 6);
    expect(sy * 64).toBeCloseTo(SPEC.rx * GROUND_SQUASH * 2, 6);
  });
});
