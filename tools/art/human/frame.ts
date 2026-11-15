import type { Facing } from '../../../src/shared/ids';
import type { Rgba } from '../core/image';
import { variantOf } from '../core/render';
import type { M3, V3 } from '../core/vec';
import { renderScene, SceneBuilder } from '../world/scene';
import { type FaceStyle, paintFace } from './face';
import { yawMeshes } from './mesh-util';
import { type HumanPose, type Joints, solve } from './rig';

/** Every human frame is drawn on this canvas, with the feet at `ORIGIN`. */
export const FRAME = { w: 200, h: 232 } as const;
export const ORIGIN = { x: 100, y: 208 } as const;
/**
 * Pixels per model unit. The figure is modelled generously and drawn at the size that sits well
 * beside a unicorn.
 */
export const UNIT = 0.9;
const SS = 4;

/**
 * Rotation about the vertical axis that turns a figure modelled facing +x to face the named way.
 */
export const YAW: Record<Facing, number> = { east: 0, south: -Math.PI / 2, north: Math.PI / 2, west: Math.PI };

/** What a figure holds in a frame, and how. Model space, facing +x. */
export type Tool =
  | { kind: 'can'; tilt: number; yaw: number; pour: boolean }
  | { kind: 'shears'; pitch: number; open: number; leaves: boolean }
  | { kind: 'broom'; head: V3; top: V3 }
  | { kind: 'fruit'; at: V3; R: M3; scale: number }
  | { kind: 'brush'; R: M3 };

/** Anything a character wears or carries that depends on the frame. */
export interface Extras {
  tool?: Tool;
  /** Seconds into the clip, for things that move on their own such as a stream of water. */
  time?: number;
  /** How far hair that hangs free is swung out to the side, radians. */
  sway?: number;
}

export interface Character {
  readonly id: string;
  readonly face: FaceStyle;
  /** Adds every mesh for one frame, in model space. */
  dress(sb: SceneBuilder, j: Joints, pose: HumanPose, extras: Extras, facing: Facing): void;
}

export interface RenderedFrame {
  rgba: Rgba;
  /** Where a model-space point lands in the frame, for attachment anchors. */
  at: (p: readonly [number, number, number]) => [number, number];
}

export function renderHuman(c: Character, pose: HumanPose, facing: Facing, extras: Extras = {}): RenderedFrame {
  const sb = new SceneBuilder();
  const j = solve(pose);
  c.dress(sb, j, pose, extras, facing);
  const yaw = YAW[facing];
  yawMeshes(sb.meshes, yaw);
  const out = renderScene(sb, {
    width: FRAME.w,
    height: FRAME.h,
    originX: ORIGIN.x,
    originY: ORIGIN.y,
    ss: SS,
    unit: UNIT,
    lineDepth: 4,
    aoRadius: 8,
    shadowFit: true,
  });
  const skin = sb.variants.findIndex((v) => v.name === 'skin');
  const { cid, width } = out.sprite;
  paintFace(
    out.rgba,
    out.at,
    j,
    pose,
    yaw,
    c.face,
    (x, y) =>
      x >= 0 &&
      y >= 0 &&
      x < width &&
      y < FRAME.h &&
      cid[y * width + x] !== 0 &&
      variantOf(cid[y * width + x]!) === skin,
  );
  return { rgba: out.rgba, at: out.at };
}
