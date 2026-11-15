/**
 * The colours the crystals of the cave go through. A picture drawn in white takes a tint by
 * multiplying every colour in it, so a tint has to be light as well as clear or the crystal goes
 * dark. These run all the way round the rainbow and stay bright the whole way.
 */

/**
 * A colour from an angle round the colour wheel, in degrees, as 0xRRGGBB. `soft` is the share of
 * white mixed in: 0 is the fullest colour.
 */
export function wheel(degrees: number, soft = 0.4): number {
  const h = (((degrees % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] =
    h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const lift = (c: number): number => Math.round(255 * (c + (1 - c) * soft));
  return (lift(r!) << 16) | (lift(g!) << 8) | lift(b!);
}

/**
 * Where on the wheel, in degrees, a thing that goes once round every `period` seconds is when the
 * world is `seconds` old. `offset` is how far round it starts, from 0 to 1, so two of them side by
 * side are not the same colour.
 */
export const turn = (seconds: number, period: number, offset = 0): number =>
  ((((seconds / period + offset) % 1) + 1) % 1) * 360;

/** A colour part of the way from one to another, `t` from 0 to 1. */
export function blend(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const channel = (shift: number): number => {
    const a = (from >> shift) & 255;
    const b = (to >> shift) & 255;
    return Math.round(a + (b - a) * k);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
