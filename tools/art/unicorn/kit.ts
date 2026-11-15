import { hex, mix, outlineOf, type RGB, ramp } from '../core/color';
import type { Xf } from '../core/mesh';
import type { MaterialDef, SampleInfo, Variant } from '../core/render';
import { add, applyM, fract } from '../core/vec';
import { PART } from './parts';
import { xfInv } from './skeleton';
import type { PaletteEntry, UnicornSpec } from './spec';

/** Shared palette and shading functions for one character. The same kit renders every frame. */
export interface Kit {
  spec: UnicornSpec;
  variants: Variant[];
  materials: MaterialDef[];
  /** Palette key to variant index. */
  vi: Record<string, number>;
  mat: {
    coat: number;
    hoof: number;
    horn: number;
    /** Glow levels 1 and 2 of the horn: grooves light up, then the whole horn. */
    hornGlow: readonly [number, number];
    earInner: number;
    hair: number[];
    flat: Record<string, number>;
  };
}

function makeVariant(name: string, e: PaletteEntry): Variant {
  const colors: readonly RGB[] = e.colors ? e.colors.map(hex) : ramp(e.base, { steps: e.steps ?? 5, ...e.ramp });
  const darkest = colors[0]!;
  const outline = e.outline ? hex(e.outline) : outlineOf(darkest);
  const outlineLit = e.outlineLit ? hex(e.outlineLit) : mix(outline, colors[Math.min(1, colors.length - 1)]!, 0.45);
  const v: Variant = { name, ramp: colors, outline, outlineLit };
  if (e.line) v.line = hex(e.line);
  if (e.priority !== undefined) v.priority = e.priority;
  if (e.protect) v.protect = true;
  if (e.flat !== undefined) v.flat = e.flat;
  if (e.emissive !== undefined) v.emissive = e.emissive;
  if (e.noOutline) v.noOutline = true;
  if (e.noLines) v.noLines = true;
  return v;
}

export function buildKit(spec: UnicornSpec, restHead: Xf): Kit {
  const variants: Variant[] = [];
  const vi: Record<string, number> = {};
  for (const [key, entry] of Object.entries(spec.palette)) {
    vi[key] = variants.length;
    variants.push(makeVariant(key, entry));
  }
  const materials: MaterialDef[] = [];
  const addMat = (m: MaterialDef): number => materials.push(m) - 1;
  const headInv = xfInv(restHead);
  const toHead = (r: readonly [number, number, number]): [number, number, number] => {
    const h = add(applyM(headInv.r, r), headInv.o);
    return [h[0] / hs, h[1] / hs, h[2] / hs];
  };

  const coatV = vi.coat!;
  const muzzleV = vi.muzzle ?? coatV;
  const hs = spec.build.head;
  const decals = spec.decals;
  const decalIdx = decals.map((d) => vi[d.paint]!);

  const coat = addMat({
    name: 'coat',
    shade: (s: SampleInfo) => {
      const h = s.part === PART.head || s.part === PART.jaw ? toHead(s.rest) : null;
      for (let i = 0; i < decals.length; i++) if (decals[i]!.test(s.rest, s.part, h)) return decalIdx[i]!;
      if (h && h[0] > 25.5) return muzzleV;
      return coatV;
    },
  });

  const hoof = addMat({ name: 'hoof', shade: () => vi.hoof ?? coatV });
  const hornBase = vi.horn!;
  const hornGroove = vi.hornGroove ?? hornBase;
  const turns = spec.horn.turns;
  const horn = addMat({
    name: 'horn',
    shade: (s) => {
      // u runs base to tip along the horn, v wraps around it. The spiral is a diagonal in (u, v).
      const phase = fract(s.v * 1 + s.u * turns);
      return phase < 0.2 ? hornGroove : hornBase;
    },
  });
  const glowV = vi.hornGlow ?? hornBase;
  const isGroove = (s: SampleInfo): boolean => fract(s.v * 1 + s.u * turns) < 0.2;
  const hornGlow: readonly [number, number] = [
    addMat({ name: 'hornGlow1', shade: (s) => (isGroove(s) ? glowV : hornBase) }),
    addMat({ name: 'hornGlow2', shade: (s) => (isGroove(s) ? hornGroove : glowV) }),
  ];
  const earInner = addMat({ name: 'earInner', shade: () => vi.earInner ?? coatV });
  const hair = spec.hair.map((key, i) => {
    const a = vi[key]!;
    const b = vi[spec.hair[(i + 1) % spec.hair.length]!]!;
    return addMat({
      name: `hair${i}`,
      // Each lock drifts into the next palette color toward its tip, with a restrained dither band
      // between them.
      shade: (s) => (s.u < 0.5 ? a : s.u > 0.68 ? b : (s.px + s.py) % 2 === 0 ? a : b),
      // Light streaks along each lock give it the clumped look of hand-placed hair.
      bias: (s) => (Math.sin(s.v * 6.283 + s.u * 9) > 0.55 ? 0.14 : 0),
    });
  });
  const flat: Record<string, number> = {};
  for (const key of Object.keys(spec.palette)) flat[key] = addMat({ name: `flat:${key}`, shade: () => vi[key]! });

  return { spec, variants, materials, vi, mat: { coat, hoof, horn, hornGlow, earInner, hair, flat } };
}
