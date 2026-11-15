import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET } from '../audio/synth/synth';
import { chooseProfile, looksLowEnd, PROFILES } from './profile';
import { backingSize, chooseView } from './zoom';

/**
 * What browsers send. The Fire tablet strings are written from memory of what Silk sends and are
 * not checked against a real tablet; the rest are what the browsers on the family's other devices
 * send.
 */
const FIRE = {
  'Silk on a Fire HD 10, phone view':
    'Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/116.6.1 like Chrome/116.0.0.0 Safari/537.36',
  'Silk on a Fire HD 10, desktop view':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Silk/116.6.1 like Chrome/116.0.0.0 Safari/537.36',
  'Silk on an older Fire':
    'Mozilla/5.0 (Linux; Android 5.1.1; KFFOWI Build/LVY48F) AppleWebKit/537.36 (KHTML, like Gecko) Silk/80.3.1 like Chrome/80.0.3987.162 Safari/537.36',
  'a Fire that hides Silk and keeps its model':
    'Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
};

const ELSEWHERE = {
  'Safari on an iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Chrome on an iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  'Chrome on a Pixel':
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Samsung Internet':
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  'Chrome on a Mac':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Safari on a Mac':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Chrome on Linux':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'no user agent at all': '',
};

describe('telling a Fire tablet from other devices', () => {
  it.each(Object.entries(FIRE))('knows %s', (_name, agent) => {
    expect(looksLowEnd(agent)).toBe(true);
  });

  it.each(Object.entries(ELSEWHERE))('leaves %s alone', (_name, agent) => {
    expect(looksLowEnd(agent)).toBe(false);
  });
});

describe("the parent's choice", () => {
  const fire = FIRE['Silk on a Fire HD 10, phone view'];
  const iphone = ELSEWHERE['Safari on an iPhone'];

  it('is settled by the device when it is automatic', () => {
    expect(chooseProfile('auto', fire).id).toBe('low');
    expect(chooseProfile('auto', iphone).id).toBe('standard');
  });

  it('is low-end wherever it is turned on', () => {
    expect(chooseProfile('on', iphone).id).toBe('low');
    expect(chooseProfile('on', fire).id).toBe('low');
  });

  it('is the full picture wherever it is turned off, even on a Fire tablet', () => {
    expect(chooseProfile('off', fire).id).toBe('standard');
    expect(chooseProfile('off', iphone).id).toBe('standard');
  });
});

describe('the fine facings and the memory a device says it has', () => {
  const pixel = ELSEWHERE['Chrome on a Pixel'];
  const iphone = ELSEWHERE['Safari on an iPhone'];
  const fire = FIRE['Silk on a Fire HD 10, phone view'];

  it('are taken by a device that does not say how much memory it has, as Safari and Firefox do not', () => {
    expect(chooseProfile('auto', iphone).fineFacings).toBe(true);
    expect(chooseProfile('auto', iphone, undefined)).toBe(PROFILES.standard);
  });

  it.each([4, 8])('are taken by a device with %s GB', (gigabytes) => {
    expect(chooseProfile('auto', pixel, gigabytes)).toBe(PROFILES.standard);
  });

  it.each([0.25, 0.5, 1, 2])(
    'are not taken by a device with %s GB, which is otherwise drawn the standard way',
    (gigabytes) => {
      const chosen = chooseProfile('auto', pixel, gigabytes);
      expect(chosen.fineFacings).toBe(false);
      expect(chosen).toEqual({ ...PROFILES.standard, fineFacings: false });
      expect(chosen.id).toBe('standard');
    },
  );

  it('are taken wherever the parent has turned low-end mode off, whatever the device says', () => {
    expect(chooseProfile('off', pixel, 1)).toBe(PROFILES.standard);
  });

  it('are not taken in low-end mode, with memory or without', () => {
    expect(chooseProfile('on', pixel, 8)).toBe(PROFILES.low);
    expect(chooseProfile('auto', fire, 8)).toBe(PROFILES.low);
    expect(chooseProfile('auto', fire, 1)).toBe(PROFILES.low);
  });
});

describe('the two profiles', () => {
  it('leave the standard one asking for everything, so a phone draws what it always did', () => {
    expect(PROFILES.standard).toEqual({
      id: 'standard',
      maxDpr: Infinity,
      multisample: true,
      smoothing: true,
      cull: false,
      sparkles: 1,
      glowsLast: false,
      wonderQuality: 2,
      soundBudget: DEFAULT_BUDGET,
      fineFacings: true,
    });
  });

  it('make the low-end one ask for less in every way that costs a frame', () => {
    const { low, standard } = PROFILES;
    expect(low.maxDpr).toBeLessThan(standard.maxDpr);
    expect(low.multisample).toBe(false);
    expect(low.smoothing).toBe(false);
    expect(low.cull).toBe(true);
    expect(low.sparkles).toBeLessThan(standard.sparkles);
    expect(low.sparkles).toBeGreaterThan(0);
    expect(low.glowsLast).toBe(true);
    // The playground games draw on a canvas of their own. The lowest quality is no light sheet, no
    // bloom and one pixel per CSS pixel.
    expect(low.wonderQuality).toBe(0);
    expect(low.wonderQuality).toBeLessThan(standard.wonderQuality);
    // The games keep fewer sounds going at once, which is what the audio thread of a slow tablet
    // can render.
    expect(low.soundBudget).toBeLessThan(standard.soundBudget);
    expect(low.soundBudget).toBeGreaterThan(0);
    // The fine facings take about 18 MiB of graphics memory for each unicorn who is out, which a
    // tablet that is already short of frames is not asked for.
    expect(standard.fineFacings).toBe(true);
    expect(low.fineFacings).toBe(false);
  });

  it('give each profile the id it is filed under', () => {
    for (const [id, profile] of Object.entries(PROFILES)) expect(profile.id).toBe(id);
  });
});

describe('how a 1280 by 800 screen at 1.5 pixels per CSS pixel is drawn', () => {
  const css = { w: 1280, h: 800, ratio: 1.5 };
  const drawn = (maxDpr: number) => {
    const view = chooseView(css.w, css.h, Math.min(css.ratio, maxDpr));
    return { view, backing: backingSize(css.w, css.h, view.dpr) };
  };

  it("is a canvas of the screen's own size in low-end mode, and a half as large again as that in standard", () => {
    expect(drawn(PROFILES.low.maxDpr).backing).toEqual({ w: 1280, h: 800 });
    expect(drawn(PROFILES.standard.maxDpr).backing).toEqual({ w: 1920, h: 1200 });
  });

  it('is fewer than half the pixels to fill in low-end mode', () => {
    const area = (maxDpr: number) => drawn(maxDpr).backing.w * drawn(maxDpr).backing.h;
    expect(area(PROFILES.standard.maxDpr) / area(PROFILES.low.maxDpr)).toBeCloseTo(2.25, 9);
  });

  it('draws one framebuffer pixel per source pixel in low-end mode, so the picture is crisp inside the canvas', () => {
    const { view } = drawn(PROFILES.low.maxDpr);
    expect(view.zoom * view.dpr).toBe(1);
  });

  it('shows 11 percent less of the world each way in low-end mode, which the profile says', () => {
    const standard = drawn(PROFILES.standard.maxDpr).view;
    const low = drawn(PROFILES.low.maxDpr).view;
    expect(standard.zoom).toBeCloseTo(0.9, 9);
    expect(low.zoom).toBe(1);
    expect(low.zoom / standard.zoom - 1).toBeCloseTo(0.11, 2);
  });
});
