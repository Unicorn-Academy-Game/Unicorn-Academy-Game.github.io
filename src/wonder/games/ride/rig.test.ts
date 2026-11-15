import { describe, expect, it } from 'vitest';
import { Camera } from '../../engine/camera';
import { Journey, newSpot, settle } from './journey';
import { type Beat, Pilot } from './pilot';
import { Eye, fitLagoon, newShot, Rig, type Screen, WATER_LINE } from './rig';

/** How much room the rainbow's glow needs outside it. */
const MARGIN = 18;

const SCREENS: { name: string; screen: Screen }[] = [
  { name: 'a phone on its side', screen: { w: 863, h: 360, base: 1 } },
  { name: 'a small phone on its side', screen: { w: 667, h: 375, base: 1 } },
  { name: 'a tablet', screen: { w: 1024, h: 768, base: 1 } },
  { name: 'a wide laptop', screen: { w: 1600, h: 800, base: 1 } },
  { name: 'a phone upright', screen: { w: 360, h: 780, base: 0.62 } },
];

interface Run {
  /**
   * The leader's place on the screen, as shares of its width and height, at every step until she
   * has landed.
   */
  readonly leader: { x: number; y: number; part: string }[];
  /** For each splash, how far across the screen it was, as a share of its width. */
  readonly splashes: number[];
  readonly camera: Camera;
  readonly rig: Rig;
  readonly journey: Journey;
}

/**
 * Plays the whole finale with the camera the game uses, and notes where everything was on the
 * screen.
 */
function play(screen: Screen, friends: number): Run {
  const journey = new Journey({ x: 5000, y: 160 });
  const rig = new Rig(journey, screen, MARGIN);
  const camera = new Camera(0.3, 0.62);
  // The way the camera was on the rainbow before the finale: a little ahead of her, a little above.
  const start = journey.at(0);
  camera.x = start.x + 70;
  camera.y = start.y - 14;
  camera.zoom = screen.base;
  const pilot = new Pilot(journey, friends, 340, 16);
  const eye = new Eye();
  const shot = newShot();
  const spot = newSpot();
  const beats: Beat[] = [];
  const leader: Run['leader'] = [];
  const splashes: number[] = [];
  const dt = 1 / 30;
  for (let t = 0; t < 60 && !pilot.settled; t += dt) {
    beats.length = 0;
    pilot.step(dt, beats);
    const lead = journey.at(settle(pilot.placeOf(0), journey.rest(0, friends)), spot);
    rig.shot(pilot.s, lead, shot);
    eye.follow(camera, shot, dt);
    if (pilot.part !== 'water')
      leader.push({
        x: camera.screenX(lead.x, screen.w) / screen.w,
        y: camera.screenY(lead.y, screen.h) / screen.h,
        part: pilot.part,
      });
    for (const b of beats) {
      if (b.kind !== 'splash') continue;
      // A friend splashes in where the leader did.
      splashes.push(camera.screenX(journey.landing.x, screen.w) / screen.w);
    }
  }
  return { leader, splashes, camera, rig, journey };
}

describe('the finale camera', () => {
  for (const { name, screen } of SCREENS) {
    describe(`on ${name}`, () => {
      it('keeps the leader on the screen the whole way, with room around her', () => {
        const run = play(screen, 4);
        for (const p of run.leader) {
          expect(p.x, `across, ${p.part}`).toBeGreaterThan(0.08);
          expect(p.x, `across, ${p.part}`).toBeLessThan(0.92);
          expect(p.y, `down, ${p.part}`).toBeGreaterThan(0.1);
          expect(p.y, `down, ${p.part}`).toBeLessThan(0.9);
        }
      });

      it('shows every splash', () => {
        const run = play(screen, 4);
        expect(run.splashes.length).toBe(5);
        for (const x of run.splashes) {
          expect(x).toBeGreaterThan(0.04);
          expect(x).toBeLessThan(0.96);
        }
      });

      it('ends with the whole rainbow and the water in view', () => {
        const run = play(screen, 4);
        const { camera, journey, rig } = run;
        const { zoom, rx, ry } = rig.fit;
        const left = camera.screenX(journey.pool.centre - rx - 8, screen.w);
        const right = camera.screenX(journey.pool.centre + rx + 8, screen.w);
        const top = camera.screenY(journey.pool.y - ry - 8, screen.h);
        const water = camera.screenY(journey.pool.y, screen.h);
        expect(camera.zoom).toBeCloseTo(zoom, 1);
        expect(left).toBeGreaterThan(0);
        expect(right).toBeLessThan(screen.w);
        expect(top).toBeGreaterThan(0);
        expect(water / screen.h).toBeGreaterThan(WATER_LINE - 0.04);
        expect(water / screen.h).toBeLessThan(WATER_LINE + 0.04);
      });

      it('never moves the camera by more than a fraction of the screen in one step', () => {
        const journey = new Journey({ x: 5000, y: 160 });
        const rig = new Rig(journey, screen, MARGIN);
        const camera = new Camera(0.3, 0.62);
        const start = journey.at(0);
        camera.x = start.x + 70;
        camera.y = start.y - 14;
        camera.zoom = screen.base;
        const pilot = new Pilot(journey, 4, 340, 16);
        const eye = new Eye();
        const shot = newShot();
        const spot = newSpot();
        let last = { x: camera.x, y: camera.y, zoom: camera.zoom };
        const dt = 1 / 30;
        let worst = 0;
        for (let t = 0; t < 60 && !pilot.settled; t += dt) {
          pilot.step(dt, []);
          const lead = journey.at(settle(pilot.placeOf(0), journey.rest(0, 4)), spot);
          rig.shot(pilot.s, lead, shot);
          eye.follow(camera, shot, dt);
          // How far the middle of the picture moved, on the screen.
          const moved = Math.hypot((camera.x - last.x) * camera.zoom, (camera.y - last.y) * camera.zoom) / screen.w;
          worst = Math.max(worst, moved);
          // And how much the picture was enlarged: a tenth of its size in a step is a lurch.
          expect(Math.abs(Math.log(camera.zoom / last.zoom))).toBeLessThan(0.05);
          last = { x: camera.x, y: camera.y, zoom: camera.zoom };
        }
        expect(worst).toBeLessThan(0.07);
      });
    });
  }

  it('shows a flatter rainbow on a wide screen and a rounder one on a tall one, and always fits', () => {
    const wide = fitLagoon({ w: 863, h: 360, base: 1 }, 1070, MARGIN);
    const tall = fitLagoon({ w: 360, h: 780, base: 0.62 }, 1070, MARGIN);
    expect(wide.ry / wide.rx).toBeLessThan(0.75);
    expect(tall.ry / tall.rx).toBeGreaterThan(0.95);
    expect(wide.rx).toBeCloseTo(tall.rx, 3);
  });
});
