import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCH, ARCH_TOP, HORN_TIPS } from '../../src/content/fountain-horns';
import { RAINBOW } from '../../src/content/fountain-rainbow';
import { REACTIONS } from '../../src/content/magic';
import { CONFIG, dispatch, type World } from '../../src/domain';
import { BODY_RISE } from '../../src/render/camera';
import { rainbowGlance, roomAsked } from '../../src/render/rainbow-glance';
import { type Frame, MIN_ZOOM_SCALE, NO_FRAME, VistaLens } from '../../src/render/vista';
import { chooseView } from '../../src/render/zoom';
import { CompiledMap } from '../../src/shared/compiled-map';
import { Manifest } from '../../src/shared/manifest';
import { makeWorld, run, teleport } from '../domain/fixtures';

type Pt = { x: number; y: number };

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const GARDEN = CompiledMap.parse(
  JSON.parse(readFileSync(`public/assets/${manifest.maps['palace-garden']!.file}`, 'utf8')),
).logic;
const HOST = 'palace-garden/rainbow-outer-0';

/** The five places the court is played from, as the brief for the rainbow names them. */
const STAND_SPOTS: Pt[] = [
  { x: 2110, y: 1680 },
  { x: 2690, y: 1680 },
  { x: 2400, y: 1670 },
  { x: 2250, y: 1670 },
  { x: 2550, y: 1670 },
];

/**
 * The screens the rainbow is made to be seen on. The first two are held to the margin above the
 * arch, the third is the smallest it is still seen whole on.
 */
const VIEWS = {
  'a phone held sideways, 915 by 412': { w: 915, h: 412, dpr: 1 },
  'a desktop, 1280 by 720': { w: 1280, h: 720, dpr: 1 },
  'a hi-dpi phone, 863 by 360': { w: 863, h: 360, dpr: 2.625 },
};
/**
 * A window as short as this, with one pixel to the CSS pixel, has no room for the whole arch and
 * the leader's feet, since the camera pulls back by no more than 0.7.
 */
const SHORTEST = { w: 863, h: 360, dpr: 1 };

const MARGIN = 24;
/** How thick the arch is across its bands, at its apex. */
const THICKNESS = ARCH.bands * ARCH.band;
/** What the camera shows, in world units. */
interface Shown {
  left: number;
  right: number;
  top: number;
  bottom: number;
  frame: Frame;
}

/**
 * Brings up the rainbow the way Wildstar does, by casting her light from `at`, and runs on to `age`
 * seconds into its life.
 */
function standingFrom(at: Pt, age: number): World {
  const world = makeWorld({ map: GARDEN, seed: 5, arrival: { kind: 'spawn', spawnId: 'from-forest' } });
  teleport(world, 'wildstar', at);
  // The cups are not places to stand, and a herd put at one is pushed out, so she is given a moment
  // to settle where she can be.
  run(world, 1);
  dispatch(world, { type: 'cast', commandId: 'cast-1', unicornId: 'wildstar' });
  for (let i = 0; i < 3 * CONFIG.stepHz && !world.transient.has(HOST); i++) run(world, 1 / CONFIG.stepHz);
  if (!world.transient.has(HOST)) throw new Error(`no rainbow came up from ${at.x}, ${at.y}`);
  const up = world.transient.get(HOST)!;
  run(world, Math.max(0, age - (world.time - up.since)));
  return world;
}

/**
 * What the camera shows when it has settled on the herd, as the game's controller asks the lens for
 * it. `off` is how far the camera sits above her body, as its dead zone can leave it.
 */
function seenFrom(
  world: World,
  view: { w: number; h: number; dpr: number },
  { glance = true, calm = false, off = 0 } = {},
): Shown {
  const { zoom } = chooseView(view.w, view.h, view.dpr);
  const extent = { w: view.w / zoom, h: view.h / zoom };
  const herd = world.unicorns.wildstar!.pos;
  const lens = new VistaLens();
  lens.reset(undefined, herd);
  lens.setCalm(calm);
  lens.snap(herd);
  const centreY = herd.y - BODY_RISE - off;
  const frame = lens.frame(extent, centreY, herd.y, glance ? rainbowGlance(world, world.time) : undefined);
  const wide = extent.w / frame.zoomScale;
  const tall = extent.h / frame.zoomScale;
  return {
    left: herd.x - wide / 2,
    right: herd.x + wide / 2,
    top: centreY - frame.lift - tall / 2,
    bottom: centreY - frame.lift + tall / 2,
    frame,
  };
}

describe('the camera, for the rainbow over the fountain', () => {
  const host = standingFrom(STAND_SPOTS[2]!, 2).interactables.get(HOST)!.pos;
  const apex = { x: host.x, y: host.y - ARCH_TOP };
  const horns = [
    { x: host.x + HORN_TIPS.left.x, y: host.y + HORN_TIPS.left.y },
    { x: host.x + HORN_TIPS.right.x, y: host.y + HORN_TIPS.right.y },
  ];

  describe('what it is asked for, and when', () => {
    it("is asked for the rainbow that Wildstar's light brings up and for nothing else", () => {
      const world = makeWorld({ map: GARDEN, seed: 5, arrival: { kind: 'spawn', spawnId: 'from-forest' } });
      expect(rainbowGlance(world, world.time)).toBeUndefined();
      world.transient.set('palace-garden/pad-east', {
        kind: 'glow-ornament',
        since: world.time,
        until: world.time + 3,
      });
      expect(rainbowGlance(world, world.time + 1)).toBeUndefined();
      const reaction = REACTIONS.find((r) => r.host === 'fountain-rainbow');
      expect(reaction?.id, 'the reaction that has the rainbow for its host').toBe('light-rainbow');
      expect(rainbowGlance(standingFrom(STAND_SPOTS[2]!, 2), 2 + 1)).toBeDefined();
    });

    it('is asked for the top of the arch, over the middle of the line between the horns', () => {
      const glance = rainbowGlance(standingFrom(STAND_SPOTS[2]!, 3), 3)!;
      expect(glance.top).toBe(apex.y);
    });

    it('grows over the first second and goes with the fade, and in between is all of it', () => {
      const total = RAINBOW.life;
      expect(roomAsked(0, total)).toBe(0);
      expect(roomAsked(total, total)).toBe(0);
      expect(roomAsked(1, total)).toBe(1);
      for (let age = 1; age <= total - RAINBOW.fade; age += 0.05)
        expect(roomAsked(age, total), `${age.toFixed(2)}`).toBe(1);
      let last = 0;
      for (let age = 0; age <= 1; age += 0.02) {
        expect(roomAsked(age, total)).toBeGreaterThanOrEqual(last);
        last = roomAsked(age, total);
      }
      last = 1;
      for (let age = total - RAINBOW.fade; age <= total; age += 0.02) {
        expect(roomAsked(age, total)).toBeLessThanOrEqual(last + 1e-12);
        last = roomAsked(age, total);
      }
    });

    it('does not start or stop all at once: no more than a sixth of it is asked for in a tenth of a second', () => {
      let worst = 0;
      for (let age = 0; age < RAINBOW.life; age += 0.01)
        worst = Math.max(worst, Math.abs(roomAsked(age + 0.1, RAINBOW.life) - roomAsked(age, RAINBOW.life)));
      expect(worst).toBeLessThanOrEqual(1 / 6);
    });

    it('is the same up to the fade for a rainbow that is given more time, and goes with its own fade', () => {
      for (const total of [7.2, RAINBOW.cap]) {
        for (let age = 0; age <= RAINBOW.life - RAINBOW.fade; age += 0.05)
          expect(roomAsked(age, total)).toBeCloseTo(roomAsked(age, RAINBOW.life), 12);
        expect(roomAsked(total - RAINBOW.fade, total)).toBe(1);
        expect(roomAsked(total, total)).toBe(0);
      }
    });

    it('is asked for from every place the herd can cast from, and not of a herd that has gone far off', () => {
      const world = standingFrom(STAND_SPOTS[2]!, 3);
      const wildstar = world.unicorns.wildstar!;
      const weightAt = (p: Pt): number => {
        wildstar.pos = { ...p };
        return rainbowGlance(world, world.time)!.weight;
      };
      for (const p of [...STAND_SPOTS, { x: 2010, y: 1760 }, { x: 2790, y: 1760 }])
        expect(weightAt(p), `${p.x}, ${p.y}`).toBe(1);
      expect(weightAt({ x: host.x, y: host.y + 760 })).toBe(0);
      expect(weightAt({ x: host.x - 1500, y: host.y })).toBe(0);
      let last = 1;
      for (let d = 540; d <= 740; d += 10) {
        const w = weightAt({ x: host.x, y: host.y + d });
        expect(w).toBeLessThanOrEqual(last);
        last = w;
      }
    });
  });

  describe('what it brings into view, from the five places the court is played from', () => {
    for (const [name, view] of Object.entries(VIEWS)) {
      describe(`on ${name}`, () => {
        for (const spot of STAND_SPOTS) {
          for (const age of [1, 3.5, RAINBOW.life - RAINBOW.fade]) {
            it(`has both horns, the top of the arch with ${MARGIN} units over it, and the leader's feet in view, from ${spot.x}, ${spot.y} at ${age} s`, () => {
              const world = standingFrom(spot, age);
              const feet = world.unicorns.wildstar!.pos;
              const shown = seenFrom(world, view);
              expect(shown.frame.zoomScale).toBeGreaterThanOrEqual(MIN_ZOOM_SCALE);
              expect(apex.y - shown.top, 'above the arch').toBeGreaterThanOrEqual(MARGIN - 1e-6);
              expect(shown.bottom - feet.y, 'below her feet').toBeGreaterThanOrEqual(24 - 1e-6);
              for (const horn of horns) {
                expect(horn.x - shown.left, `beside the horn at ${horn.x}`).toBeGreaterThanOrEqual(MARGIN);
                expect(shown.right - horn.x, `beside the horn at ${horn.x}`).toBeGreaterThanOrEqual(MARGIN);
                expect(shown.bottom - horn.y).toBeGreaterThan(0);
              }
              expect(shown.left).toBeLessThan(apex.x);
              expect(shown.right).toBeGreaterThan(apex.x);
            });
          }
        }

        it('has the same room above the arch when the camera sits above or below the herd by as much as its dead zone leaves it', () => {
          const world = standingFrom(STAND_SPOTS[0]!, 3.5);
          const { zoom } = chooseView(view.w, view.h, view.dpr);
          for (const off of [-0.1, -0.05, 0, 0.05, 0.1].map((share) => (share * view.h) / zoom)) {
            const shown = seenFrom(world, view, { off });
            expect(apex.y - shown.top, `${off.toFixed(0)}`).toBeGreaterThanOrEqual(MARGIN - 1e-6);
          }
        });
      });
    }

    it('lifts a tall screen and pulls back only where the screen is too short to hold the arch and her feet', () => {
      const world = standingFrom(STAND_SPOTS[2]!, 3.5);
      const tall = seenFrom(world, VIEWS['a desktop, 1280 by 720']).frame;
      expect(tall.zoomScale).toBe(1);
      expect(tall.lift).toBeGreaterThan(40);
      expect(tall.lift).toBeLessThan(100);
      const short = seenFrom(world, VIEWS['a phone held sideways, 915 by 412']).frame;
      expect(short.zoomScale).toBeLessThan(1);
      expect(short.zoomScale).toBeGreaterThan(0.75);
    });

    it('gives up the top of the arch and keeps the leader on the shortest window with one pixel to the CSS pixel, where the pull is at its floor', () => {
      for (const spot of STAND_SPOTS) {
        const world = standingFrom(spot, 3.5);
        const shown = seenFrom(world, SHORTEST);
        expect(shown.frame.zoomScale).toBe(MIN_ZOOM_SCALE);
        expect(shown.bottom - world.unicorns.wildstar!.pos.y, `${spot.x}`).toBeGreaterThanOrEqual(24 - 1e-6);
        // The top gives way, but by less than the arch is thick, so its apex is still on the
        // screen.
        expect(apex.y - shown.top, `${spot.x}`).toBeGreaterThan(-THICKNESS);
      }
    });

    it('is nothing at the moment of the cast and nothing once the rainbow is over', () => {
      const world = standingFrom(STAND_SPOTS[2]!, 0);
      expect(seenFrom(world, VIEWS['a desktop, 1280 by 720']).frame.lift).toBeLessThan(1);
      run(world, RAINBOW.life + 0.5);
      expect(rainbowGlance(world, world.time)).toBeUndefined();
      expect(seenFrom(world, VIEWS['a desktop, 1280 by 720']).frame).toEqual(NO_FRAME);
    });

    it('is not made while reduced effects are on', () => {
      for (const view of Object.values(VIEWS)) {
        const world = standingFrom(STAND_SPOTS[0]!, 3.5);
        expect(seenFrom(world, view, { calm: true }).frame).toEqual(NO_FRAME);
      }
    });

    it('is the camera of the glance that does it: with no glance the arch is cut off at the top on a 720-tall screen and on a 412-tall one', () => {
      for (const view of [VIEWS['a desktop, 1280 by 720'], VIEWS['a phone held sideways, 915 by 412']]) {
        const world = standingFrom(STAND_SPOTS[0]!, 3.5);
        expect(apex.y - seenFrom(world, view, { glance: false }).top).toBeLessThan(MARGIN);
        expect(apex.y - seenFrom(world, view).top).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      }
    });
  });
});
