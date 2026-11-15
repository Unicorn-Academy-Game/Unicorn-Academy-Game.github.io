import { outlineOf, type RGB } from '../core/color';
import type { Rgba } from '../core/image';
import { type Mesh, newMesh } from '../core/mesh';
import {
  type MaterialDef,
  projectPoint,
  type RenderConfig,
  renderSprite,
  type SampleInfo,
  type Sprite,
  spriteToRgba,
  type Variant,
} from '../core/render';
import { deg, norm, type V3 } from '../core/vec';
import type { Ramp } from './palette';

/** Same camera and light as the unicorns, so everything in a scene is lit and viewed alike. */
export const WORLD_PITCH = deg(27);
export const WORLD_LIGHT: V3 = norm([-0.55, -0.32, 0.77] as V3);

export interface VariantOpts {
  outline?: RGB;
  outlineLit?: RGB;
  line?: RGB;
  bands?: readonly number[];
  emissive?: number;
  flat?: number;
  priority?: number;
  protect?: boolean;
  noOutline?: boolean;
  noLines?: boolean;
}

/**
 * Makes everything in a scene `k` times bigger about the origin, so a thing can be built in round
 * numbers and drawn at the size it is wanted.
 */
export function scaleScene(b: SceneBuilder, k: number): void {
  for (const m of b.meshes) {
    for (let i = 0; i < m.pos.length; i++) {
      m.pos[i] = m.pos[i]! * k;
      m.rest[i] = m.rest[i]! * k;
    }
  }
}

/** Collects the meshes, materials and palette variants of one object. */
export class SceneBuilder {
  readonly meshes: Mesh[] = [];
  readonly materials: MaterialDef[] = [];
  readonly variants: Variant[] = [];
  private nextPart = 1;

  variant(name: string, ramp: Ramp, o: VariantOpts = {}): number {
    const outline = o.outline ?? outlineOf(ramp[0]!);
    const v: Variant = { name, ramp, outline, outlineLit: o.outlineLit ?? outline };
    if (o.line) v.line = o.line;
    if (o.bands) v.bands = o.bands;
    if (o.emissive !== undefined) v.emissive = o.emissive;
    if (o.flat !== undefined) v.flat = o.flat;
    if (o.priority !== undefined) v.priority = o.priority;
    if (o.protect) v.protect = true;
    if (o.noOutline) v.noOutline = true;
    if (o.noLines) v.noLines = true;
    return this.variants.push(v) - 1;
  }

  /** A material that always uses one variant. */
  solid(name: string, variant: number, bias?: (s: SampleInfo) => number): number {
    const m: MaterialDef = { name, shade: () => variant };
    if (bias) m.bias = bias;
    return this.materials.push(m) - 1;
  }

  material(def: MaterialDef): number {
    return this.materials.push(def) - 1;
  }

  /** A fresh mesh with its own part id, so overlapping parts get an inner line between them. */
  mesh(material: number, o: { part?: number; twoSided?: boolean; noLines?: boolean; noShadow?: boolean } = {}): Mesh {
    const part = o.part ?? this.nextPart++;
    const m = newMesh(material, part, {
      twoSided: o.twoSided ?? false,
      noLines: o.noLines ?? false,
      noShadow: o.noShadow ?? false,
    });
    this.meshes.push(m);
    return m;
  }

  newPart(): number {
    return this.nextPart++;
  }
}

export interface RenderedObject {
  sprite: Sprite;
  rgba: Rgba;
  /** Final-pixel position of a world point. */
  at: (p: V3) => [number, number];
}

export interface ObjectRenderOpts {
  width: number;
  height: number;
  originX: number;
  originY: number;
  ss?: number;
  unit?: number;
  lineDepth?: number;
  shadowStrength?: number;
  aoStrength?: number;
  aoRadius?: number;
  shadowBias?: number;
  shadowFit?: boolean;
  wrap?: number;
  coverage?: number;
  noOutline?: boolean;
}

export function renderScene(b: SceneBuilder, o: ObjectRenderOpts): RenderedObject {
  const cfg: RenderConfig = {
    width: o.width,
    height: o.height,
    originX: o.originX,
    originY: o.originY,
    pitch: WORLD_PITCH,
    light: WORLD_LIGHT,
    ss: o.ss ?? 3,
    wrap: o.wrap ?? 0.3,
    shadowStrength: o.shadowStrength ?? 0.5,
    aoStrength: o.aoStrength ?? 0.55,
    aoRadius: o.aoRadius ?? 9,
    lineDepth: o.lineDepth ?? 5,
  };
  if (o.shadowBias !== undefined) cfg.shadowBias = o.shadowBias;
  if (o.unit !== undefined) cfg.unit = o.unit;
  if (o.shadowFit) cfg.shadowFit = true;
  if (o.coverage !== undefined) cfg.coverage = o.coverage;
  if (o.noOutline) cfg.noOutline = true;
  const sprite = renderSprite({ meshes: b.meshes, materials: b.materials, variants: b.variants }, cfg);
  return {
    sprite,
    rgba: { width: sprite.width, height: sprite.height, data: spriteToRgba(sprite) },
    at: (p) => projectPoint(cfg, p),
  };
}
