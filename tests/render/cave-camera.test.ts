import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODY_RISE } from '../../src/render/camera';
import { type Frame, MIN_ZOOM_SCALE, NO_FRAME, VistaLens } from '../../src/render/vista';
import { chooseView } from '../../src/render/zoom';
import { CompiledMap, type Vista } from '../../src/shared/compiled-map';
import { Manifest } from '../../src/shared/manifest';
import { TILE } from '../../src/shared/map';
import { HEART_CANVAS, renderHeartCrystals } from '../../tools/art/world/cave-grand';

type Pt = { x: number; y: number };

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const CAVE = CompiledMap.parse(
  JSON.parse(readFileSync(`public/assets/${manifest.maps['crystal-cave']!.file}`, 'utf8')),
);
const VISTA = CAVE.render.vista!;
const HEART_CRYSTAL = CAVE.logic.interactables.find((i) => i.definitionId === 'heart-crystal')!;
const HEART = HEART_CRYSTAL.pos;
/** Where the leader stands to touch the crystal. */
const APPROACH = HEART_CRYSTAL.approach[0]!.pos;
/**
 * How far up from the bottom edge the bubble for a way out reaches, in pixels: its middle is 44 up
 * and it is 52 across, and it has a ring round it.
 */
const BUBBLE_TOP = 44 + 26 + 6;
/**
 * How tall a unicorn is drawn at full size, in pixels, and the least the game lets the camera
 * shrink her to.
 */
const BODY = 114;
const SMALLEST_BODY = 80;

/**
 * The screens the game is made for: a phone held sideways, as the tests draw it, and a hi-dpi one.
 * A desktop window is tall enough not to need the camera's help.
 */
const PHONES = {
  'a phone held sideways, 915 by 412': { w: 915, h: 412, dpr: 1 },
  'the phone the tests draw, 863 by 360': { w: 863, h: 360, dpr: 1 },
  'a small phone, 844 by 390 at three to one': { w: 844, h: 390, dpr: 3 },
  'a hi-dpi phone, 863 by 360': { w: 863, h: 360, dpr: 2.625 },
};
const DESKTOP = { w: 1280, h: 720, dpr: 1 };

/** How far above the foot of its dais the top of the drawn crystal is. */
const TIP = ((): number => {
  const { data, width, height } = renderHeartCrystals();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]! > 8) return HEART_CANVAS.oy - y;
  throw new Error('the crystal is not drawn');
})();

interface Shown {
  top: number;
  bottom: number;
  frame: Frame;
}

/**
 * What the camera shows when it has settled on a herd whose leader stands at `herd`, as the game
 * asks the lens for it.
 */
function shownFrom(
  vista: Vista | undefined,
  herd: Pt,
  view: { w: number; h: number; dpr: number },
  { calm = false } = {},
): Shown {
  const { zoom } = chooseView(view.w, view.h, view.dpr);
  const extent = { w: view.w / zoom, h: view.h / zoom };
  const lens = new VistaLens();
  lens.reset(vista, herd);
  lens.setCalm(calm);
  lens.snap(herd);
  const centreY = herd.y - BODY_RISE;
  const frame = lens.frame(extent, centreY, herd.y);
  const tall = extent.h / frame.zoomScale;
  return { top: centreY - frame.lift - tall / 2, bottom: centreY - frame.lift + tall / 2, frame };
}

describe('the camera in the Heart Hall', () => {
  const tip = HEART.y - TIP;

  it('shows all of the crystal, and stands her clear of the bubble for the way out, for a leader who stands at its foot', () => {
    for (const [name, view] of Object.entries(PHONES)) {
      const without = shownFrom(undefined, APPROACH, view);
      expect(without.top, `${name}: without the vista the tip is cut off`).toBeGreaterThan(tip);
      const shown = shownFrom(VISTA, APPROACH, view);
      expect(shown.top, `${name}: the tip of the crystal is on the screen`).toBeLessThanOrEqual(tip);
      const clear = (shown.bottom - APPROACH.y) * chooseView(view.w, view.h, view.dpr).zoom * shown.frame.zoomScale;
      expect(clear, `${name}: and her feet are above the bubble that points the way out`).toBeGreaterThanOrEqual(
        BUBBLE_TOP,
      );
      expect(shown.frame.zoomScale, name).toBeGreaterThanOrEqual(MIN_ZOOM_SCALE);
      const body = BODY * chooseView(view.w, view.h, view.dpr).zoom * shown.frame.zoomScale;
      expect(body, `${name}: a unicorn is still drawn big enough to tap`).toBeGreaterThanOrEqual(SMALLEST_BODY);
    }
  });

  it('leaves a screen that is tall enough alone', () => {
    const shown = shownFrom(VISTA, APPROACH, DESKTOP);
    expect(shown.frame).toEqual({ zoomScale: 1, lift: 0 });
    expect(shown.top).toBeLessThanOrEqual(tip);
    expect(shown.bottom).toBeGreaterThanOrEqual(APPROACH.y + BUBBLE_TOP);
  });

  it('pulls back more the nearer the herd is to the crystal, and never the other way', () => {
    const phone = PHONES['the phone the tests draw, 863 by 360'];
    let last = 1;
    for (let away = VISTA.radius + 40; away >= 0; away -= 20) {
      const { frame } = shownFrom(VISTA, { x: APPROACH.x, y: APPROACH.y + away }, phone);
      expect(frame.zoomScale, `${away} away`).toBeLessThanOrEqual(last + 1e-9);
      last = frame.zoomScale;
    }
    expect(shownFrom(VISTA, { x: APPROACH.x, y: APPROACH.y + VISTA.radius + 40 }, phone).frame).toEqual(NO_FRAME);
  });

  it('keeps the leader in view all the way in', () => {
    for (const view of Object.values(PHONES)) {
      for (let away = 0; away <= VISTA.radius; away += 20) {
        const herd = { x: APPROACH.x, y: APPROACH.y + away };
        const shown = shownFrom(VISTA, herd, view);
        expect(shown.bottom, `${away} away`).toBeGreaterThanOrEqual(herd.y + 24);
        expect(shown.top, `${away} away`).toBeLessThanOrEqual(herd.y - BODY_RISE);
      }
    }
  });

  it("is its usual self in the grotto, the pool room, the witch's yard and the antechamber", () => {
    const places: Pt[] = [
      { x: 26 * TILE, y: 10.6 * TILE },
      { x: 8.2 * TILE, y: 26.2 * TILE },
      { x: 43.8 * TILE, y: 24.6 * TILE },
      { x: 26 * TILE, y: 38.2 * TILE },
    ];
    for (const place of places)
      for (const view of Object.values(PHONES))
        expect(shownFrom(VISTA, place, view).frame, `${place.x}, ${place.y}`).toEqual(NO_FRAME);
  });

  it('keeps the camera on the herd when reduced effects are on', () => {
    for (const view of Object.values(PHONES))
      expect(shownFrom(VISTA, APPROACH, view, { calm: true }).frame).toEqual(NO_FRAME);
  });
});
