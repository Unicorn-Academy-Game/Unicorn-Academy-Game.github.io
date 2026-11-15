import { describe, expect, it } from 'vitest';
import { fitScale, MIN_SURVEY_SCALE, Survey } from './survey';

const palace = { x: 1000, y: 200, w: 1200, h: 800 };
const phone = { w: 860, h: 360 };

describe('fitScale', () => {
  it('brings all of a big place into a small screen, with room around it', () => {
    const s = fitScale(palace, phone);
    expect(s).toBeLessThan(0.45);
    expect(palace.w * s).toBeLessThan(phone.w);
    expect(palace.h * s).toBeLessThan(phone.h);
  });

  it('does not zoom in for a place that already fits', () => {
    expect(fitScale({ x: 0, y: 0, w: 100, h: 100 }, phone)).toBe(1);
  });

  it('never pulls back past the least the camera allows', () => {
    expect(fitScale({ x: 0, y: 0, w: 90_000, h: 90_000 }, phone)).toBe(MIN_SURVEY_SCALE);
  });
});

describe('Survey', () => {
  it('is at home until it is asked to look', () => {
    const s = new Survey();
    s.update(1, false);
    expect(s.blend).toBe(0);
    expect(s.wanted).toBe(false);
    expect(s.scale(0.9, phone)).toBe(0.9);
    expect(s.centre({ x: 5, y: 6 })).toEqual({ x: 5, y: 6 });
  });

  it('glides to the whole of the area and settles on it', () => {
    const s = new Survey();
    s.begin(palace);
    let last = 0;
    for (let i = 0; i < 12; i++) {
      s.update(0.05, false);
      expect(s.blend).toBeGreaterThanOrEqual(last);
      last = s.blend;
    }
    expect(s.blend).toBeGreaterThan(0.2);
    expect(s.blend).toBeLessThan(1);
    for (let i = 0; i < 40; i++) s.update(0.05, false);
    expect(s.blend).toBe(1);
    expect(s.scale(1, phone)).toBeCloseTo(fitScale(palace, phone), 6);
    expect(s.centre({ x: 0, y: 0 })).toEqual({ x: 1600, y: 600 });
  });

  it('goes home the same way, and lets the area go when it gets there', () => {
    const s = new Survey();
    s.begin(palace);
    for (let i = 0; i < 40; i++) s.update(0.05, false);
    s.end();
    expect(s.wanted).toBe(false);
    s.update(0.2, false);
    expect(s.blend).toBeGreaterThan(0);
    expect(s.blend).toBeLessThan(1);
    for (let i = 0; i < 40; i++) s.update(0.05, false);
    expect(s.blend).toBe(0);
    expect(s.centre({ x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
  });

  it('never zooms in past where the camera already is', () => {
    const s = new Survey();
    s.begin({ x: 0, y: 0, w: 100, h: 100 });
    for (let i = 0; i < 40; i++) s.update(0.05, false);
    expect(s.scale(0.8, phone)).toBeCloseTo(0.8, 9);
  });

  it('cuts from one view to the other when effects are calm', () => {
    const s = new Survey();
    s.begin(palace);
    s.update(0.016, true);
    expect(s.blend).toBe(1);
    s.end();
    s.update(0.016, true);
    expect(s.blend).toBe(0);
  });

  it('forgets everything for a new map', () => {
    const s = new Survey();
    s.begin(palace);
    s.update(0.4, false);
    s.reset();
    expect(s.blend).toBe(0);
    expect(s.wanted).toBe(false);
  });

  it('takes a long frame as no more than a short one, so a stall cannot jump the camera', () => {
    const s = new Survey();
    s.begin(palace);
    s.update(5, false);
    expect(s.blend).toBeLessThan(0.2);
  });
});
