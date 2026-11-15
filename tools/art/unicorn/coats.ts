import { SOUTH } from '../../../src/shared/compass';
import type { UnicornId } from '../../../src/shared/ids';
import { fromOklch, hex, toHex, toOklch } from '../core/color';
import type { Rgba } from '../core/image';
import { clipPose } from './anims';
import { UNICORNS } from './characters';
import { makeKit, renderFrame } from './frame';
import type { PaletteEntry, UnicornSpec } from './spec';

/**
 * Other unicorns for the stalls, in coats the five friends do not wear. Each is one of the six
 * unicorns with its colours turned round the colour wheel, drawn by the same renderer with the same
 * model, light and shading, so it looks like it belongs. `coat` turns everything but the mane,
 * `mane` turns the mane and tail by its own amount, so the two can disagree.
 */
export interface Coat {
  id: string;
  /** Whose build, markings and halter it borrows. */
  base: UnicornId;
  /** Degrees to turn the body, horn and halter round the colour wheel. */
  coat: number;
  /** Degrees to turn the mane and tail. */
  mane: number;
  /** A multiplier on how vivid the colours are. */
  vivid?: number;
}

/**
 * Entries that are the same on every unicorn: eyes, nostrils, mouth and the white glint of the
 * horn. They stay as drawn.
 */
const KEPT = new Set(['eyeRing', 'eyeIris', 'eyeGlint', 'nostril', 'mouth', 'hornGlow']);

const turn = (color: string, degrees: number, vivid: number): string => {
  const [l, c, h] = toOklch(hex(color));
  return toHex(fromOklch(l, Math.min(0.37, c * vivid), (h + degrees + 360) % 360));
};

function turned(entry: PaletteEntry, degrees: number, vivid: number): PaletteEntry {
  const t = (c: string): string => turn(c, degrees, vivid);
  const out: PaletteEntry = { ...entry, base: t(entry.base) };
  if (entry.colors) out.colors = entry.colors.map(t);
  if (entry.outline) out.outline = t(entry.outline);
  if (entry.outlineLit) out.outlineLit = t(entry.outlineLit);
  if (entry.line) out.line = t(entry.line);
  if (entry.ramp) {
    const ramp = { ...entry.ramp };
    if (ramp.shadowHue !== undefined) ramp.shadowHue = (ramp.shadowHue + degrees + 360) % 360;
    if (ramp.lightHue !== undefined) ramp.lightHue = (ramp.lightHue + degrees + 360) % 360;
    out.ramp = ramp;
  }
  return out;
}

/** The base unicorn's spec with its colours turned. Nothing about its shape changes. */
export function coatSpec(coat: Coat): UnicornSpec {
  const base = UNICORNS[coat.base];
  const vivid = coat.vivid ?? 1;
  const hair = new Set(base.hair);
  const palette = Object.fromEntries(
    Object.entries(base.palette).map(([key, entry]) => [
      key,
      KEPT.has(key) ? entry : turned(entry, hair.has(key) ? coat.mane : coat.coat, vivid),
    ]),
  );
  return { ...base, palette };
}

export const BOXED_FRAMES = 4;

/**
 * One frame of the coat standing in its stall, facing the viewer. Four of them make its breathing
 * loop.
 */
export function renderBoxed(coat: Coat, frame: number): Rgba {
  const spec = coatSpec(coat);
  const kit = makeKit(spec);
  return renderFrame(kit, clipPose(spec, 'idle', frame, SOUTH), SOUTH).rgba;
}

/**
 * The coats that stand in the stable's stalls. They are not the friends: each is a colour none of
 * them wears.
 */
export const BOX_COATS: readonly Coat[] = [
  { id: 'mint', base: 'cinder', coat: 120, mane: 120 },
  { id: 'orchid', base: 'river', coat: 60, mane: 60 },
  { id: 'sky', base: 'cinder', coat: 180, mane: 180 },
  { id: 'lilac', base: 'leaf', coat: 240, mane: 240 },
  { id: 'ocean', base: 'storm', coat: 300, mane: 300 },
  { id: 'lagoon', base: 'river', coat: 300, mane: 300 },
];
