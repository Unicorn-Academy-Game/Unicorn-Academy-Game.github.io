import { describe, expect, it } from 'vitest';
import type { Vista } from '../shared/compiled-map';
import { BODY_RISE } from './camera';
import { type Frame, fullFrame, type Glance, MIN_ZOOM_SCALE, NO_FRAME, partway, reach, VistaLens } from './vista';

/**
 * The palace banner as the map authors it: hung high above the door, with the door's approach as
 * the place to stand.
 */
const banner: Vista = {
  id: 'palace-banner',
  stand: { x: 1536, y: 1032 },
  radius: 480,
  show: { x: 1360, y: 567, w: 352, h: 176 },
};
const extent = (h: number, w = 844) => ({ w, h });

/** The band of the world on screen, for the leader standing at the vista's stand point. */
function bandOf(frame: Frame, h: number): { top: number; bottom: number } {
  const visible = h / frame.zoomScale;
  const centre = banner.stand.y - BODY_RISE - frame.lift;
  return { top: centre - visible / 2, bottom: centre + visible / 2 };
}

describe('reach', () => {
  it('is nothing beyond the radius and everything at the heart', () => {
    expect(reach(banner, { x: banner.stand.x, y: banner.stand.y + banner.radius })).toBe(0);
    expect(reach(banner, { x: banner.stand.x + 900, y: banner.stand.y })).toBe(0);
    expect(reach(banner, banner.stand)).toBe(1);
  });

  it('grows steadily as the herd comes closer', () => {
    let last = -1;
    for (let d = banner.radius; d >= 0; d -= 12) {
      const r = reach(banner, { x: banner.stand.x, y: banner.stand.y + d });
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it('depends on how far away the herd is, not which way', () => {
    const d = 260;
    const a = reach(banner, { x: banner.stand.x + d, y: banner.stand.y });
    const b = reach(banner, { x: banner.stand.x, y: banner.stand.y + d });
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('fullFrame', () => {
  it('leaves a screen tall enough for both the banner and the herd exactly as it is', () => {
    for (const h of [900, 1400]) expect(fullFrame(banner, extent(h))).toEqual(NO_FRAME);
  });

  it('only lifts the view when the screen holds both with room to spare', () => {
    const frame = fullFrame(banner, extent(530));
    expect(frame.zoomScale).toBe(1);
    expect(frame.lift).toBeGreaterThan(0);
    const { top, bottom } = bandOf(frame, 530);
    expect(top).toBeLessThanOrEqual(banner.show.y);
    expect(bottom).toBeGreaterThanOrEqual(banner.stand.y + 24);
  });

  it('pulls back on a phone held sideways, to show the whole banner above the leader', () => {
    const frame = fullFrame(banner, extent(390));
    expect(frame.zoomScale).toBeLessThan(1);
    expect(frame.zoomScale).toBeGreaterThanOrEqual(MIN_ZOOM_SCALE);
    const { top, bottom } = bandOf(frame, 390);
    expect(top).toBeLessThanOrEqual(banner.show.y);
    expect(bottom).toBeGreaterThanOrEqual(banner.stand.y + 24);
  });

  it('never loses the leader, however short the screen, and gives up the top of the banner first', () => {
    for (let h = 240; h <= 1000; h += 10) {
      const frame = fullFrame(banner, extent(h));
      const { top, bottom } = bandOf(frame, h);
      expect(frame.zoomScale).toBeGreaterThanOrEqual(MIN_ZOOM_SCALE);
      expect(frame.zoomScale).toBeLessThanOrEqual(1);
      expect(frame.lift).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeGreaterThanOrEqual(banner.stand.y + 24 - 1e-6);
      if (frame.zoomScale > MIN_ZOOM_SCALE) expect(top).toBeLessThanOrEqual(banner.show.y + 1e-6);
    }
  });

  it('keeps as much under the leader as a vista asks for, and pulls back farther to do it', () => {
    const roomy: Vista = { ...banner, below: 120 };
    const usual = fullFrame(banner, extent(390));
    const more = fullFrame(roomy, extent(390));
    expect(more.zoomScale).toBeLessThan(usual.zoomScale);
    expect(bandOf(more, 390).bottom).toBeGreaterThanOrEqual(banner.stand.y + 120 - 1e-6);
    expect(fullFrame(roomy, extent(1400))).toEqual(NO_FRAME);
  });

  it('keeps the usual margin under the leader when a vista does not ask for another', () => {
    for (const h of [330, 390, 530])
      expect(fullFrame({ ...banner, below: 40 }, extent(h))).toEqual(fullFrame(banner, extent(h)));
  });

  it('pulls back by no more than a unicorn needs to stay about 80 px tall', () => {
    expect(114 * MIN_ZOOM_SCALE).toBeGreaterThanOrEqual(79);
  });
});

describe('partway', () => {
  const full = fullFrame(banner, extent(390));

  it('is no pull at no weight, and the full pull at full weight', () => {
    expect(partway(full, 0, extent(390), 980, 1032)).toEqual(NO_FRAME);
    const all = partway(full, 1, extent(390), 980, 1032);
    expect(all.zoomScale).toBeCloseTo(full.zoomScale, 10);
    expect(all.lift).toBeCloseTo(full.lift, 10);
  });

  it('pulls back and lifts together, in proportion', () => {
    const half = partway(full, 0.5, extent(390), 980, 1032);
    expect(half.zoomScale).toBeCloseTo(1 + (full.zoomScale - 1) / 2, 10);
    expect(half.lift).toBeCloseTo(full.lift / 2, 10);
  });

  it('keeps the leader on screen when the camera is already looking well ahead of her', () => {
    // Walking north, the camera leads: its centre is higher than her body.
    const feet = 1250;
    const centre = feet - BODY_RISE - 90;
    const frame = partway(full, 1, extent(390), centre, feet);
    const bottom = centre - frame.lift + 390 / frame.zoomScale / 2;
    expect(bottom).toBeGreaterThanOrEqual(feet + 24 - 1e-6);
    expect(frame.lift).toBeLessThan(full.lift);
  });
});

describe('VistaLens', () => {
  const away = { x: banner.stand.x, y: banner.stand.y + banner.radius + 300 };

  it('does nothing on a map with no vista', () => {
    const lens = new VistaLens();
    lens.reset(undefined, banner.stand);
    lens.update(1, banner.stand);
    expect(lens.frame(extent(390), 980, 1032)).toEqual(NO_FRAME);
  });

  it('starts fully in place when the herd is already at the door', () => {
    const lens = new VistaLens();
    lens.reset(banner, banner.stand);
    const frame = lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y);
    expect(frame.zoomScale).toBeCloseTo(fullFrame(banner, extent(390)).zoomScale, 10);
  });

  it('starts at rest when the herd is far from the vista', () => {
    const lens = new VistaLens();
    lens.reset(banner, away);
    expect(lens.frame(extent(390), away.y - BODY_RISE, away.y)).toEqual(NO_FRAME);
  });

  it('eases in over a couple of seconds once the herd arrives, never reversing', () => {
    const lens = new VistaLens();
    lens.reset(banner, away);
    let last = 1;
    for (let t = 0; t < 8; t += 1 / 60) {
      lens.update(1 / 60, banner.stand);
      const f = lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y);
      expect(f.zoomScale).toBeLessThanOrEqual(last + 1e-12);
      last = f.zoomScale;
      if (t < 0.05) expect(f.zoomScale).toBeGreaterThan(0.98);
    }
    expect(last).toBeCloseTo(fullFrame(banner, extent(390)).zoomScale, 2);
  });

  it('moves at the same pace at any frame rate', () => {
    const run = (fps: number): number => {
      const lens = new VistaLens();
      lens.reset(banner, away);
      for (let i = 0; i < fps * 2; i++) lens.update(1 / fps, banner.stand);
      return lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y).zoomScale;
    };
    expect(Math.abs(run(30) - run(120))).toBeLessThan(0.01);
  });

  it('does not lurch after a long stall in the frame loop', () => {
    const lens = new VistaLens();
    lens.reset(banner, away);
    lens.update(5, banner.stand);
    expect(lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y).zoomScale).toBeGreaterThan(0.9);
  });

  it('jumps straight to the place when told to, as after a jump across the map', () => {
    const lens = new VistaLens();
    lens.reset(banner, away);
    lens.snap(banner.stand);
    expect(lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y).zoomScale).toBeCloseTo(
      fullFrame(banner, extent(390)).zoomScale,
      10,
    );
  });

  it('lets go smoothly when reduced effects are turned on, and stays off', () => {
    const lens = new VistaLens();
    lens.reset(banner, banner.stand);
    lens.setCalm(true);
    const first = lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y).zoomScale;
    expect(first).toBeLessThan(1);
    for (let t = 0; t < 12; t += 1 / 60) lens.update(1 / 60, banner.stand);
    expect(lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y)).toEqual(NO_FRAME);
    lens.snap(banner.stand);
    expect(lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y)).toEqual(NO_FRAME);
  });
});

describe('a glance at something that stands for a while', () => {
  const feet = 1680;
  const body = feet - BODY_RISE;
  /** Something that reaches up to 1212 over a leader whose feet are 468 below its top. */
  const arch: Glance = { top: 1212, weight: 1 };
  const margin = 24;
  const rest = (): VistaLens => {
    const lens = new VistaLens();
    lens.reset(undefined, { x: 0, y: 0 });
    return lens;
  };
  /**
   * The band of the world on screen when the camera, which would be centred on `centreY`, takes
   * `frame`.
   */
  const seen = (frame: Frame, h: number, centreY = body): { top: number; bottom: number } => {
    const visible = h / frame.zoomScale;
    const middle = centreY - frame.lift;
    return { top: middle - visible / 2, bottom: middle + visible / 2 };
  };

  it('asks nothing of the camera while there is none, or while it asks for none of the room', () => {
    expect(rest().frame(extent(720), body, feet)).toEqual(NO_FRAME);
    expect(rest().frame(extent(720), body, feet, { ...arch, weight: 0 })).toEqual(NO_FRAME);
  });

  it('lifts a screen that is tall enough until there are 24 units above the top, and does not pull back', () => {
    const frame = rest().frame(extent(720), body, feet, arch);
    expect(frame.zoomScale).toBe(1);
    expect(seen(frame, 720).top).toBeCloseTo(arch.top - margin, 9);
  });

  it("pulls back, by no more than it takes, on a screen that is too short to hold the top and the leader's feet", () => {
    const frame = rest().frame(extent(412), body, feet, arch);
    expect(frame.zoomScale).toBeCloseTo(412 / (feet + 40 - (arch.top - margin)), 9);
    const { top, bottom } = seen(frame, 412);
    expect(top).toBeCloseTo(arch.top - margin, 9);
    expect(bottom).toBeCloseTo(feet + 40, 9);
  });

  it('gives up the top and not the leader on a screen that is shorter still, and never pulls back past the floor', () => {
    const frame = rest().frame(extent(300), body, feet, arch);
    expect(frame.zoomScale).toBe(MIN_ZOOM_SCALE);
    expect(seen(frame, 300).bottom).toBeGreaterThanOrEqual(feet + 24 - 1e-6);
  });

  it('makes the same room wherever the camera sits about the herd, as it is made from the camera and not from her', () => {
    for (const off of [-80, -40, 0, 40, 80]) {
      const frame = rest().frame(extent(720), body + off, feet, arch);
      expect(seen(frame, 720, body + off).top, `${off}`).toBeCloseTo(arch.top - margin, 9);
    }
  });

  it('never lowers a camera that is already looking higher than it needs to', () => {
    const frame = rest().frame(extent(720), 1400, feet, arch);
    expect(frame.lift).toBe(0);
  });

  it('asks for more of the room as its weight grows, a smooth way in', () => {
    const at = (weight: number): Frame => rest().frame(extent(412), body, feet, { ...arch, weight });
    let last = at(0);
    expect(last).toEqual(NO_FRAME);
    for (let w = 0.05; w <= 1.0001; w += 0.05) {
      const frame = at(w);
      expect(frame.zoomScale).toBeLessThanOrEqual(last.zoomScale + 1e-12);
      expect(frame.lift).toBeGreaterThanOrEqual(last.lift - 1e-12);
      last = frame;
    }
    expect(last.zoomScale).toBeCloseTo(rest().frame(extent(412), body, feet, arch).zoomScale, 12);
  });

  it('keeps the leader in view at every weight, on every screen and with the camera anywhere about her, and never loses her where the camera had not', () => {
    for (const h of [300, 360, 412, 720]) {
      for (const off of [-120, -40, 0, 60]) {
        for (let w = 0.1; w <= 1.0001; w += 0.1) {
          const frame = rest().frame(extent(h), body + off, feet, { ...arch, weight: w });
          const before = body + off + h / frame.zoomScale / 2;
          expect(seen(frame, h, body + off).bottom, `${h} ${off} ${w.toFixed(1)}`).toBeGreaterThanOrEqual(
            Math.min(feet + 24, before) - 1e-6,
          );
        }
      }
    }
  });

  it("takes the larger pull on each side when the map's own vista is asking too", () => {
    const at = (look: Glance | undefined, vista = true): Frame => {
      const lens = new VistaLens();
      lens.reset(vista ? banner : undefined, banner.stand);
      return lens.frame(extent(390), banner.stand.y - BODY_RISE, banner.stand.y, look);
    };
    for (const top of [400, 560, 900]) {
      const look: Glance = { top, weight: 1 };
      const both = at(look);
      const banners = at(undefined);
      const alone = at(look, false);
      expect(both.zoomScale, `${top}`).toBeCloseTo(Math.min(banners.zoomScale, alone.zoomScale), 12);
      expect(both.lift, `${top}`).toBeCloseTo(Math.max(banners.lift, alone.lift), 12);
    }
  });

  it('is not made room for while reduced effects are on', () => {
    const lens = rest();
    lens.setCalm(true);
    lens.snap({ x: 0, y: 0 });
    expect(lens.frame(extent(412), body, feet, arch)).toEqual(NO_FRAME);
  });

  it('lets go smoothly when reduced effects are turned on while it is asked for, and takes it up again when they are turned off', () => {
    const lens = rest();
    const asked = lens.frame(extent(412), body, feet, arch);
    expect(asked.zoomScale).toBeLessThan(1);
    lens.setCalm(true);
    let last = asked;
    for (let t = 0; t < 12; t += 1 / 60) {
      lens.update(1 / 60, { x: 0, y: 0 });
      const frame = lens.frame(extent(412), body, feet, arch);
      expect(frame.zoomScale).toBeGreaterThanOrEqual(last.zoomScale - 1e-12);
      expect(Math.abs(frame.lift - last.lift), 'no lurch').toBeLessThan(6);
      last = frame;
    }
    expect(last).toEqual(NO_FRAME);
    lens.setCalm(false);
    for (let t = 0; t < 12; t += 1 / 60) lens.update(1 / 60, { x: 0, y: 0 });
    expect(lens.frame(extent(412), body, feet, arch).zoomScale).toBeCloseTo(asked.zoomScale, 3);
  });
});
