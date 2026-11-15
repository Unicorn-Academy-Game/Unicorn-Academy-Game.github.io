import type { UnicornFacing } from '../../../src/shared/compass';
import type { Rgba } from '../core/image';
import { projectPoint, type RenderConfig, renderSprite, type Sprite, spriteToRgba } from '../core/render';
import { deg, norm, type V3 } from '../core/vec';
import { buildKit, type Kit } from './kit';
import { buildUnicorn, facingYaw, makeRig, type UnicornModel } from './model';
import { type Pose, restPose } from './pose';
import type { UnicornSpec } from './spec';
import { faceStamps } from './stamps';

export const FRAME = 192;
export const ORIGIN_X = 96;
export const ORIGIN_Y = 156;
export const PITCH = deg(27);
export const LIGHT: V3 = norm([-0.55, -0.32, 0.77] as V3);

export const renderConfig = (): RenderConfig => ({
  width: FRAME,
  height: FRAME,
  originX: ORIGIN_X,
  originY: ORIGIN_Y,
  pitch: PITCH,
  light: LIGHT,
  ss: 4,
  wrap: 0.3,
  shadowStrength: 0.55,
  aoStrength: 0.55,
});

export function makeKit(spec: UnicornSpec): Kit {
  return buildKit(spec, makeRig(spec.build, restPose()).head.rest);
}

export interface RenderedFrame {
  sprite: Sprite;
  rgba: Rgba;
  model: UnicornModel;
  /** Anchor pixels in the 192 canvas. */
  anchors: { feet: [number, number]; horn: [number, number]; muzzle: [number, number]; back: [number, number] };
}

export function renderFrame(kit: Kit, pose: Pose, facing: UnicornFacing, yawOverride?: number): RenderedFrame {
  const model = buildUnicorn(kit, pose, yawOverride ?? facingYaw(facing));
  const cfg = renderConfig();
  const sprite = renderSprite({ meshes: model.meshes, materials: kit.materials, variants: kit.variants }, cfg, {
    afterLines: faceStamps(kit, model, pose, cfg),
  });
  const rgba: Rgba = { width: sprite.width, height: sprite.height, data: spriteToRgba(sprite) };
  const pr = (p: V3): [number, number] => projectPoint(cfg, p);
  return {
    sprite,
    rgba,
    model,
    anchors: {
      feet: pr([0, 0, 0]),
      horn: pr(model.anchors.horn),
      muzzle: pr(model.anchors.muzzle),
      back: pr(model.anchors.back),
    },
  };
}
