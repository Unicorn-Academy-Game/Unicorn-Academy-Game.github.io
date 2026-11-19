import { describe, expect, it } from 'vitest';
import { chromeOf } from '../../src/wonder/engine/chrome';
import { viewOf } from '../../src/wonder/engine/painter';
import { planOf, TEAM_APART, TEAM_FIRST, TEAM_HEIGHT } from '../../src/wonder/games/sleigh/layout';
import { chimneyMouth, EAVE_BULBS, eaveBulb, HOUSES, TALLEST, WIDEST } from '../../src/wonder/games/sleigh/shape';

/** The screens a child plays on, in CSS pixels, held both ways. */
const SCREENS: readonly (readonly [number, number])[] = [
  [390, 844],
  [360, 640],
  [320, 568],
  [412, 915],
  [768, 1024],
  [844, 390],
  [667, 375],
  [568, 320],
  [640, 360],
  [740, 360],
  [1024, 768],
  [1366, 1024],
  [1920, 1080],
];

describe('the houses of the village', () => {
  it('has four kinds, each with a chimney that stands out of its roof', () => {
    expect(HOUSES).toHaveLength(4);
    for (const h of HOUSES) {
      const mouth = chimneyMouth(h);
      expect(mouth.y, `${h.name}: the mouth is above the roof's peak`).toBeLessThan(h.roof.apex);
      expect(h.chimney.base, `${h.name}: the foot of the chimney is lower than its mouth`).toBeGreaterThan(mouth.y);
      expect(h.chimney.base, `${h.name}: it stands on the roof`).toBeGreaterThanOrEqual(h.roof.apex);
      expect(h.chimney.base, `${h.name}: it stands on the roof`).toBeLessThanOrEqual(h.roof.eave);
      expect(Math.abs(h.chimney.x) + h.chimney.w / 2, `${h.name}: it is not off the end of the roof`).toBeLessThan(
        h.roof.half,
      );
    }
  });

  it('keeps the windows and the door on the wall, and the roof wider than the wall', () => {
    for (const h of HOUSES) {
      const { wall } = h;
      for (const box of [h.door, ...h.windows]) {
        expect(box.x, `${h.name}: left`).toBeGreaterThanOrEqual(wall.x);
        expect(box.x + box.w, `${h.name}: right`).toBeLessThanOrEqual(wall.x + wall.w);
        expect(box.y, `${h.name}: top`).toBeGreaterThanOrEqual(wall.y);
        expect(box.y + box.h, `${h.name}: bottom`).toBeLessThanOrEqual(wall.y + wall.h);
      }
      expect(h.roof.half, `${h.name}: the eaves hang over the wall`).toBeGreaterThan(wall.w / 2);
    }
  });

  it('is never taller or wider than the sizes the layout plans for', () => {
    for (const h of HOUSES) {
      expect(-h.roof.apex).toBeLessThanOrEqual(TALLEST);
      expect(-h.chimney.top).toBeLessThanOrEqual(TALLEST);
      expect(h.roof.half * 2).toBeLessThanOrEqual(WIDEST);
    }
    expect(Math.max(...HOUSES.map((h) => Math.max(-h.chimney.top, -h.roof.apex)))).toBe(TALLEST);
    expect(Math.max(...HOUSES.map((h) => h.roof.half * 2))).toBe(WIDEST);
  });

  it('strings its bulbs along the eaves from one end to the other, all on the roof', () => {
    for (const h of HOUSES) {
      const lights = Array.from({ length: EAVE_BULBS }, (_, i) => eaveBulb(h, i));
      expect(lights[0]!.x).toBeLessThan(lights.at(-1)!.x);
      for (const at of lights) {
        expect(Math.abs(at.x), `${h.name}: inside the roof's width`).toBeLessThanOrEqual(h.roof.half);
        expect(at.y, `${h.name}: under the peak`).toBeGreaterThanOrEqual(h.roof.apex);
        expect(at.y, `${h.name}: above the eave line`).toBeLessThanOrEqual(h.roof.eave + 10);
      }
    }
  });
});

describe('where the sleigh, the unicorns and the village are on each screen', () => {
  for (const [width, height] of SCREENS) {
    const view = viewOf(width, height);
    const plan = planOf(view.w, view.h, view.unit);
    const over = chromeOf({ w: view.w, h: view.h, unit: view.unit });
    const where = `${width}x${height}`;

    it(`flies the team in the clear under the buttons and over the snow on ${where}`, () => {
      const buttons = Math.max(over.wayOut.y1, over.meter.y1, over.corner.y1);
      expect(plan.top, 'the sky starts under the buttons').toBeGreaterThan(buttons);
      expect(plan.flyY - TEAM_HEIGHT * plan.team, 'the top of the unicorns').toBeGreaterThanOrEqual(plan.top);
      expect(plan.flyY, 'in the sky, over the snow').toBeLessThan(plan.ground);
    });

    it(`has the whole team on the screen on ${where}`, () => {
      const left = view.w * plan.sleighAt - 54 * plan.team;
      const right = view.w * plan.sleighAt + (TEAM_FIRST + (plan.pullers - 1) * TEAM_APART + 36) * plan.team;
      expect(left, 'the back of the sleigh').toBeGreaterThanOrEqual(0);
      expect(right, 'the nose of the leader').toBeLessThanOrEqual(view.w);
    });

    it(`keeps the top of the loop on the screen on ${where}`, () => {
      const apex = plan.flyY - 2 * plan.loop;
      // The unicorns are upside down there, with their hooves in the air above their bodies.
      expect(apex - 48 * plan.team, 'the hooves of the leader').toBeGreaterThanOrEqual(0);
    });

    it(`stands the village on the snow, under the buttons, with a house in sight ahead on ${where}`, () => {
      expect(plan.ground - TALLEST * plan.scale, 'the tallest chimney').toBeGreaterThan(plan.top);
      expect(plan.scale).toBeGreaterThanOrEqual(0.8);
      expect(plan.spacing, 'room for a house and a little between').toBeGreaterThanOrEqual(WIDEST * plan.scale + 50);
      expect(plan.spacing, 'the next house is on the screen').toBeLessThan(view.w * (1 - plan.sleighAt));
      expect(plan.spacing / plan.speed, 'seconds from one house to the next').toBeCloseTo(2.6, 5);
    });

    it(`pulls with as many as the width allows on ${where}`, () => {
      expect(plan.pullers).toBe(view.w < 500 ? 2 : 3);
    });
  }
});
