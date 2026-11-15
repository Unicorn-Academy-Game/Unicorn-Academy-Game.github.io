import type { UnicornFacing } from '../../../src/shared/compass';
import type { Rgba } from '../core/image';
import { add, applyM, rotZ, type V3 } from '../core/vec';
import { renderScene, type SceneBuilder } from '../world/scene';
import { crownScene } from '../world/throne-room';
import { ORIGIN_X, ORIGIN_Y, PITCH } from './frame';
import { facingYaw, makeRig } from './model';
import type { Pose } from './pose';
import type { UnicornSpec } from './spec';

/**
 * The crown Wildstar wears. It is drawn once, in a view for each way she can face, and laid over
 * her picture at a point on her head that the rig gives for every frame, so one small picture
 * serves every clip and every facing.
 */

/**
 * The scale of the crown on her head: the crown on its stand is 1.3, and she is about a third as
 * tall as it is.
 */
export const HEAD_CROWN_SCALE = 0.46;
/**
 * The views: one for each facing. A facing that is shown by turning over the picture of its mirror
 * wears that facing's view, turned over with it.
 */
export const CROWN_VIEWS = 32;
export const CROWN_CANVAS = { w: 40, h: 36, ox: 20, oy: 26 } as const;

/**
 * Where the crown stands, in the head's own frame, as a share of the head's scale: on top of the
 * skull, between the ears and behind the horn.
 */
const ON_HEAD: V3 = [3.5, 0, 7.6];
/** How far up the crown's axis the second point is, which is only for finding its tilt. */
const AXIS = 10;

export interface CrownPlacement {
  /** Where the foot of the crown stands, in the 192 canvas. */
  at: [number, number];
  /** How far the crown leans, in radians turned clockwise from upright on the screen. */
  tilt: number;
}

const project = (p: V3): [number, number] => [
  ORIGIN_X + p[0],
  ORIGIN_Y - (p[1] * Math.sin(PITCH) + p[2] * Math.cos(PITCH)),
];

/**
 * Where her crown is in the picture of a pose seen from a facing, and which way it leans with her
 * head.
 */
export function crownPlacement(spec: UnicornSpec, pose: Pose, facing: UnicornFacing): CrownPlacement {
  const { head, hs } = makeRig(spec.build, pose);
  const R = rotZ(facingYaw(facing));
  const at = (up: number): V3 =>
    applyM(R, add(applyM(head.posed.r, [ON_HEAD[0] * hs, 0, ON_HEAD[2] * hs + up]), head.posed.o));
  const foot = project(at(0));
  const top = project(at(AXIS));
  return { at: foot, tilt: Math.atan2(top[0] - foot[0], foot[1] - top[1]) };
}

/** Turns everything in a scene about the vertical axis. */
function turn(b: SceneBuilder, yaw: number): void {
  const R = rotZ(yaw);
  for (const m of b.meshes) {
    for (const field of [m.pos, m.nor, m.rest]) {
      for (let i = 0; i < field.length; i += 3) {
        const p = applyM(R, [field[i]!, field[i + 1]!, field[i + 2]!]);
        field[i] = p[0];
        field[i + 1] = p[1];
        field[i + 2] = p[2];
      }
    }
  }
}

/**
 * The crown seen from the facing numbered `view` round the ring, standing on the point
 * `CROWN_CANVAS` names.
 */
export function renderCrownView(view: number): Rgba {
  const b = crownScene(HEAD_CROWN_SCALE);
  turn(b, facingYaw(view as UnicornFacing));
  return renderScene(b, {
    width: CROWN_CANVAS.w,
    height: CROWN_CANVAS.h,
    originX: CROWN_CANVAS.ox,
    originY: CROWN_CANVAS.oy,
    ss: 4,
    aoRadius: 3,
    lineDepth: 2,
  }).rgba;
}
