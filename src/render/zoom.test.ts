import { describe, expect, it } from 'vitest';
import { ZOOM_STEPS } from '../shared/save';
import { backingSize, chooseView, MAX_BACKING_PIXELS } from './zoom';

const bodyCssHeight = (zoom: number): number => 114 * zoom;

describe('chooseView', () => {
  const devices = [
    { name: 'phone landscape, 3x', w: 844, h: 390, dpr: 3 },
    { name: 'phone portrait, 3x', w: 390, h: 844, dpr: 3 },
    { name: 'small android, 2.625x', w: 800, h: 360, dpr: 2.625 },
    { name: 'tablet landscape, 2x', w: 1180, h: 820, dpr: 2 },
    { name: 'laptop, 2x', w: 1440, h: 900, dpr: 2 },
    { name: 'desktop, 1x', w: 1920, h: 1080, dpr: 1 },
  ];

  it.each(devices)('keeps a unicorn body comfortably sized on $name', ({ w, h, dpr }) => {
    const { zoom } = chooseView(w, h, dpr);
    expect(bodyCssHeight(zoom)).toBeGreaterThanOrEqual(80);
    expect(bodyCssHeight(zoom)).toBeLessThanOrEqual(135);
  });

  it.each(devices)(
    'draws whole framebuffer pixels per source pixel where the size allows on $name',
    ({ w, h, dpr }) => {
      const view = chooseView(w, h, dpr);
      const perSource = view.zoom * view.dpr;
      expect(Math.abs(perSource - Math.round(perSource))).toBeLessThan(1e-9);
    },
  );

  it('falls back to a fractional zoom when no whole number is close to the ideal size', () => {
    const view = chooseView(1000, 700, 1.5);
    expect(view.zoom * view.dpr).not.toBeCloseTo(Math.round(view.zoom * view.dpr), 3);
  });

  it('lowers the backing ratio on a large high-density screen to stay inside the budget', () => {
    const view = chooseView(2560, 1440, 2);
    const { w, h } = backingSize(2560, 1440, view.dpr);
    expect(view.dpr).toBeLessThan(2);
    expect(view.dpr).toBeGreaterThanOrEqual(1);
    expect(w * h).toBeLessThanOrEqual(MAX_BACKING_PIXELS * 1.01);
  });

  it('never drops below one backing pixel per CSS pixel', () => {
    expect(chooseView(3840, 2160, 1).dpr).toBe(1);
  });

  it('shows more world on a large screen, not just bigger characters', () => {
    const phone = chooseView(844, 390, 3);
    const desktop = chooseView(2560, 1440, 1);
    expect(2560 / desktop.zoom).toBeGreaterThan(844 / phone.zoom);
  });

  it('survives a degenerate viewport', () => {
    const view = chooseView(0, 0, 0);
    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(view.dpr).toBeGreaterThanOrEqual(1);
  });
});

describe("the parent's zoom", () => {
  const screens = [
    { name: 'phone landscape', w: 844, h: 390, dpr: 3 },
    { name: 'laptop', w: 1440, h: 900, dpr: 2 },
    { name: 'desktop', w: 1920, h: 1080, dpr: 1 },
    { name: 'odd density', w: 1000, h: 700, dpr: 1.5 },
  ];

  it.each(screens)("is the game's own choice when left at 1 on $name", ({ w, h, dpr }) => {
    expect(chooseView(w, h, dpr, 1)).toEqual(chooseView(w, h, dpr));
  });

  it.each(screens)('draws everything that many times larger on $name, for every step', ({ w, h, dpr }) => {
    const usual = chooseView(w, h, dpr);
    for (const step of ZOOM_STEPS) {
      const view = chooseView(w, h, dpr, step);
      expect(view.zoom / usual.zoom).toBeCloseTo(step, 9);
    }
  });

  it.each(screens)(
    'shows less of the world as it gets closer, with a step that is really different on $name',
    ({ w, h, dpr }) => {
      const zooms = ZOOM_STEPS.map((step) => chooseView(w, h, dpr, step).zoom);
      for (let i = 1; i < zooms.length; i++) expect(zooms[i]! / zooms[i - 1]!).toBeGreaterThan(1.15);
    },
  );

  it('leaves the backing size to the screen, so a closer look costs no more to draw', () => {
    const usual = chooseView(2560, 1440, 2);
    const close = chooseView(2560, 1440, 2, 2);
    expect(close.dpr).toBe(usual.dpr);
    expect(backingSize(2560, 1440, close.dpr)).toEqual(backingSize(2560, 1440, usual.dpr));
  });
});
