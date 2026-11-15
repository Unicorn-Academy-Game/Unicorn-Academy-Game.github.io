import type { Rgba } from '../core/image';
import { v3 } from '../core/vec';
import { type Canvas, drawTiny, tone } from './critter-kit';
import { Painter } from './paint';
import type { Ramp } from './palette';
import { blob, blobAlong, ribbon, tube } from './prims';
import { SceneBuilder } from './scene';

/**
 * A songbird, plump and round, drawn facing east. Its sprites share one anchor: the ground under
 * its middle.
 */
export const BIRD: { canvas: Canvas; idleFrames: number; peckFrames: number; flyFrames: number } = {
  canvas: { w: 72, h: 72, ox: 36, oy: 54 },
  idleFrames: 2,
  peckFrames: 3,
  flyFrames: 4,
};

export interface BirdLook {
  back: Ramp;
  belly: Ramp;
  /** The wing tips and tail, usually a deeper shade of the back. */
  wing: Ramp;
  /** A patch on the cheek or the breast. */
  blush?: Ramp;
}

const BEAK = tone('#ffa83a', 330, 80);
const LEG = tone('#e8823a', 330, 80);
const EYE: Ramp = [
  [20, 14, 34],
  [38, 28, 58],
  [60, 46, 90],
];

export const BIRD_LOOKS = {
  blue: {
    back: tone('#4f9bff', 265, 120),
    belly: tone('#fff1e0', 300, 70),
    wing: tone('#2f62d0', 260, 150),
    blush: tone('#ffb89a', 330, 70),
  },
  robin: {
    back: tone('#9a6a4c', 310, 70),
    belly: tone('#ff8a4c', 330, 60),
    wing: tone('#6b4634', 300, 60),
    blush: tone('#ffb38a', 330, 70),
  },
  canary: {
    back: tone('#ffd83e', 30, 95),
    belly: tone('#fff1a0', 40, 100),
    wing: tone('#e8a82a', 20, 90),
    blush: tone('#ffa14a', 340, 80),
  },
  rosy: {
    back: tone('#f27aa8', 315, 60),
    belly: tone('#ffd9e6', 320, 70),
    wing: tone('#b8487a', 310, 50),
    blush: tone('#ff6a8a', 330, 60),
  },
} as const satisfies Record<string, BirdLook>;
export type BirdName = keyof typeof BIRD_LOOKS;

interface Pose {
  /** How far the head is thrust forward and down, for pecking. */
  peck: number;
  /** Wing lift in flight: 1 is up, 0 is level, -1 is down. Null folds the wings. */
  flap: number | null;
  /** How puffed the chest is. */
  breath: number;
  /** How wide the beak is open, 0 to 1, for a chirp. */
  chirp: number;
}

/**
 * Builds one pose. The body is a pear tipped a little tail-down while perched, and level in flight.
 */
function songbird(look: BirdLook, pose: Pose): SceneBuilder {
  const b = new SceneBuilder();
  const flying = pose.flap !== null;
  const back = b.variant('back', look.back);
  const belly = b.variant('belly', look.belly);
  const wingV = b.variant('wing', look.wing);
  const beakV = b.variant('beak', BEAK, { noLines: true });
  const legV = b.variant('leg', LEG, { noLines: true });
  const eyeV = b.variant('eye', EYE, { noLines: true, protect: true, priority: 3 });
  const blushV = b.variant('blush', look.blush ?? look.belly, { noLines: true, priority: 2 });
  const bodyMat = b.material({ name: 'body', shade: (s) => (s.n[2] < 0.15 || s.rest[2] < 9.5 ? belly : back) });
  const headMat = b.material({ name: 'head', shade: (s) => (s.rest[2] < 18.5 && s.n[2] < 0.2 ? belly : back) });
  const wingMat = b.solid('wing', wingV);
  const beakMat = b.solid('beak', beakV);
  const legMat = b.solid('leg', legV);
  const eyeMat = b.solid('eye', eyeV);
  const blushMat = b.solid('blush', blushV);

  const lift = flying ? 4 : 0;
  const tip = flying ? 0 : -0.32;
  const body = b.mesh(bodyMat);
  blobAlong(body, v3(0, 0, 12 + lift), v3(13.5, 9.6, 10.8 + pose.breath), v3(0, 1, 0), tip, { rings: 9, segs: 13 });
  const hx = 11.5 + pose.peck * 0.9,
    hz = 21.5 + lift - pose.peck * 0.85;
  const head = b.mesh(headMat);
  blob(head, v3(hx, 0, hz), v3(7.8, 7.4, 7.4), 0, { rings: 8, segs: 12 });
  // The tail fans out behind, a little lower than the back.
  const tail = b.mesh(wingMat);
  blobAlong(tail, v3(-16, 0, 9 + lift), v3(10.5, 3.6, 2.6), v3(0, 1, 0), flying ? 0.05 : 0.4, { rings: 6, segs: 9 });
  // The beak is two short cones, the upper and the lower, so it can open to chirp.
  const beak = b.mesh(beakMat, { noLines: true });
  const gape = pose.chirp * 3.2;
  tube(
    beak,
    [
      { p: v3(hx + 6, 0, hz + 0.2), r: 2.3 },
      { p: v3(hx + 10.6, 0, hz - 0.5 + gape * 0.35), r: 1.1 },
      { p: v3(hx + 12.4, 0, hz - 0.9 + gape * 0.6), r: 0.4 },
    ],
    { segs: 7, n: 7, capEnd: true },
  );
  if (pose.chirp > 0)
    tube(
      beak,
      [
        { p: v3(hx + 6, 0, hz - 1.6), r: 1.5 },
        { p: v3(hx + 10, 0, hz - 2.4 - gape), r: 0.8 },
        { p: v3(hx + 11.4, 0, hz - 2.8 - gape * 1.25), r: 0.35 },
      ],
      { segs: 6, n: 6, capEnd: true },
    );
  for (const side of [-1, 1]) {
    const eye = b.mesh(eyeMat, { noLines: true });
    blob(eye, v3(hx + 4.4, side * 6.3, hz + 1.8), v3(1.9, 1.7, 2.3), 0, { rings: 5, segs: 8 });
    const cheek = b.mesh(blushMat, { noLines: true });
    blob(cheek, v3(hx + 2.4, side * 6.6, hz - 2.9), v3(2.8, 1.4, 1.8), 0, { rings: 4, segs: 7 });
  }
  if (!flying) {
    for (const side of [-1, 1]) {
      const leg = b.mesh(legMat, { noLines: true });
      tube(
        leg,
        [
          { p: v3(1, side * 3.6, 4), r: 1 },
          { p: v3(1.5, side * 3.6, 0.6), r: 0.9 },
        ],
        { segs: 5, n: 4, capEnd: true },
      );
      blob(leg, v3(3.2, side * 3.6, 0.5), v3(3.2, 1.3, 0.7), 0, { rings: 4, segs: 6 });
    }
  }
  // Wings: folded along the side while perched, spread and beating in flight.
  for (const side of [-1, 1]) {
    const w = b.mesh(wingMat);
    if (!flying) {
      blobAlong(w, v3(-2.4, side * 8.6, 13.2), v3(10, 2.8, 6.2), v3(0, 1, 0), -0.28, { rings: 7, segs: 10 });
    } else {
      // Spread wings: a tapered blade from the shoulder, swept back and turned by the beat of the
      // wing.
      const ang = pose.flap! * 0.9;
      const c = Math.cos(ang),
        n = Math.sin(ang);
      const at = (s: number, sweep: number) => v3(-1 - sweep, side * (5 + s * c), 17 + lift + s * n);
      ribbon(
        w,
        [
          { p: at(0, 0), w: 5.5, t: 1.6 },
          { p: at(8, 2), w: 7.4, t: 1.3 },
          { p: at(16, 6), w: 6, t: 1 },
          { p: at(23, 11), w: 2.2, t: 0.6 },
        ],
        v3(0, -side * n, c),
        6,
      );
    }
  }
  return b;
}

/** The eye's highlight, painted on after the render so it lands on exact pixels. */
function glint(
  img: Rgba,
  at: (p: readonly [number, number, number]) => [number, number],
  p: readonly [number, number, number],
): void {
  const [x, y] = at(p);
  const paint = new Painter(img);
  paint.px(x, y - 1, [255, 255, 255]);
  paint.px(x + 1, y - 1, [255, 255, 255]);
}

/** One frame of a bird. `clip` is idle (a breath and a chirp), peck, or fly. */
export function renderBird(name: BirdName, clip: 'idle' | 'peck' | 'fly', frame: number): Rgba {
  const look = BIRD_LOOKS[name];
  let pose: Pose;
  switch (clip) {
    case 'idle':
      pose = { peck: 0, flap: null, breath: frame % 2 === 0 ? 0 : 0.7, chirp: frame % 2 === 0 ? 0 : 1 };
      break;
    case 'peck':
      pose = { peck: [0, 7, 1][frame % 3]!, flap: null, breath: 0, chirp: 0 };
      break;
    case 'fly':
      pose = { peck: 0, flap: [1, 0.2, -0.8, 0.2][frame % 4]!, breath: 0, chirp: 0 };
      break;
  }
  const { rgba, at } = drawTiny(songbird(look, pose), BIRD.canvas);
  const lift = pose.flap !== null ? 4 : 0;
  glint(rgba, at, v3(11.5 + pose.peck * 0.9 + 4.4, -6.3, 21.5 + lift - pose.peck * 0.85 + 1.8));
  return rgba;
}
