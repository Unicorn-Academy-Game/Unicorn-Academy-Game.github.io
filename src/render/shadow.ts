import type Phaser from 'phaser';
import type { ShadowSpec } from '../shared/manifest';
import type { Bounds } from './cull';
import { DEPTH } from './depth';

const SHADOW_TEXTURE = 'shadow-soft';
const W = 128;
const H = 64;
/** A cool dark that reads as shade on both grass and stone. */
const SHADOW_TINT = 0x1d2742;

/** One soft ellipse that every shadow in the game is drawn from, stretched to size. */
export function createShadowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHADOW_TEXTURE)) return;
  const texture = scene.textures.createCanvas(SHADOW_TEXTURE, W, H);
  if (!texture) throw new Error('could not create the shadow texture');
  const ctx = texture.getContext();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / W);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, W / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.88)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, W / 2, 0, Math.PI * 2);
  ctx.fill();
  texture.refresh();
}

/**
 * How much the camera flattens the ground: a length on the ground straight across the picture is
 * drawn whole, and one straight into it is drawn this much. A unicorn's muzzle is 70.6 along from
 * her back facing east, and 7.8 below it. Facing south it is 39.9 below her back and facing north
 * 24.3 above it, so with the 7.8 taken out she is 32 long into the picture either way, and 32 over
 * 70.6 is this.
 */
export const GROUND_SQUASH = 0.45;

/**
 * What a shadow is drawn as: the two half-lengths of its ellipse, and the angle its first
 * half-length makes with the picture's x axis.
 */
export interface Footprint {
  rx: number;
  ry: number;
  angle: number;
}

/**
 * The shadow of a body that faces `heading`, clockwise from east. The `spec` is the shadow it has
 * facing east: `rx` long on the ground along the body, and as wide across it as makes `ry` once the
 * camera has flattened it. Turned on the ground and then flattened, that ground ellipse is drawn
 * narrower and rounder as she turns toward the camera or away from it, and tilted between.
 */
export function footprint(spec: ShadowSpec, heading: number): Footprint {
  const length = spec.rx;
  const width = spec.ry / GROUND_SQUASH;
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  // The ground ellipse's axes, flattened, are the columns of a 2 by 2 matrix, and the half-lengths
  // of what the camera draws are its singular values. These are the sums and differences of its
  // entries that give them in closed form.
  const e = (c * (length + GROUND_SQUASH * width)) / 2;
  const f = (c * (length - GROUND_SQUASH * width)) / 2;
  const g = (s * (GROUND_SQUASH * length - width)) / 2;
  const h = (s * (GROUND_SQUASH * length + width)) / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  return { rx: q + r, ry: Math.abs(q - r), angle: (Math.atan2(h, e) + Math.atan2(g, f)) / 2 };
}

/**
 * Places a shadow ellipse for something standing at (x, y). One that faces a way, as a unicorn
 * does, has the shadow of that way.
 */
export function placeShadow(
  image: Phaser.GameObjects.Image,
  spec: ShadowSpec,
  x: number,
  y: number,
  heading?: number,
): void {
  const drawn = heading === undefined ? { rx: spec.rx, ry: spec.ry, angle: 0 } : footprint(spec, heading);
  image
    .setPosition(x + spec.dx, y + spec.dy)
    .setRotation(drawn.angle)
    .setScale((drawn.rx * 2) / W, (drawn.ry * 2) / H)
    .setAlpha(spec.a);
}

/** The world area `placeShadow` covers. */
export const shadowBounds = (spec: ShadowSpec, x: number, y: number): Bounds => ({
  left: x + spec.dx - spec.rx,
  top: y + spec.dy - spec.ry,
  right: x + spec.dx + spec.rx,
  bottom: y + spec.dy + spec.ry,
});

export function makeShadow(scene: Phaser.Scene, spec: ShadowSpec, x: number, y: number): Phaser.GameObjects.Image {
  const image = scene.add.image(0, 0, SHADOW_TEXTURE).setTint(SHADOW_TINT).setDepth(DEPTH.shadow);
  placeShadow(image, spec, x, y);
  return image;
}
