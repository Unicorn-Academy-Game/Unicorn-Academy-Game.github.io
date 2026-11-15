import type { SampleInfo } from '../core/render';
import { hash2 } from '../core/rng';
import { GEM, PAL, PALACE, type Ramp } from './palette';
import type { SceneBuilder } from './scene';

/**
 * Faint veins that follow a slow wave, so marble is more than a flat tone. Returns a shade bias.
 */
function veins(seed: number, scale = 1) {
  return (s: SampleInfo): number => {
    const [x, y, z] = s.rest;
    const w = Math.sin(
      (x * 0.071 + z * 0.043) * scale + 2.2 * Math.sin((y * 0.05 - z * 0.03) * scale + seed) + seed * 3.1,
    );
    const fine = (hash2(s.px, s.py, seed + 7) - 0.5) * 0.03;
    return (Math.abs(w) < 0.045 ? -0.1 : 0) + fine;
  };
}

export interface StoneKit {
  marble: number;
  marbleSmooth: number;
  gold: number;
  water: number;
  /** Warm rosy stone for accents. */
  rose: number;
  /** Dark interior of an empty vessel. */
  hollow: number;
}

const ROSE: Ramp = PALACE.roofRose;

/**
 * The materials every garden structure shares, so a bench, a plinth and the fountain are plainly of
 * one stone.
 */
export function stoneKit(b: SceneBuilder, seed = 1): StoneKit {
  const marbleV = b.variant('marble', PAL.marble);
  const goldV = b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] });
  const waterV = b.variant('water', PAL.water, { protect: true });
  const roseV = b.variant('rose', ROSE);
  const hollowV = b.variant(
    'hollow',
    [
      [88, 52, 8],
      [124, 76, 12],
      [166, 108, 24],
    ] as Ramp,
    { flat: 0, noLines: true },
  );
  const waterRings = (s: SampleInfo): number => {
    const [x, y] = s.rest;
    const r = Math.hypot(x, y);
    return (
      Math.sin(r * 0.36 + 1.4 * Math.sin(Math.atan2(y, x) * 3 + seed)) * 0.035 +
      (hash2(s.px, s.py, seed + 3) - 0.5) * 0.02
    );
  };
  return {
    marble: b.material({ name: 'marble', shade: () => marbleV, bias: veins(seed) }),
    marbleSmooth: b.solid('marbleSmooth', marbleV, (s) => (hash2(s.px, s.py, seed + 5) - 0.5) * 0.025),
    gold: b.solid('gold', goldV, (s) => (hash2(s.px, s.py, 11) - 0.5) * 0.05),
    water: b.material({ name: 'water', shade: () => waterV, bias: waterRings }),
    rose: b.solid('rose', roseV),
    hollow: b.solid('hollow', hollowV),
  };
}
