/**
 * A peak limiter that looks ahead. It holds every sample under a ceiling by turning the level down
 * in a smooth dip around the peak, and leaves everything outside the dip as it was. A clip with one
 * tall syllable in it can then be turned up to a loudness that the syllable alone would not allow.
 */

export interface Limited {
  samples: Float32Array;
  /**
   * The most the level was turned down, in dB. It is 0 when nothing was over the ceiling, and
   * `samples` is then the input itself.
   */
  heldDb: number;
}

/**
 * How far ahead of a peak the level starts to come down, and how far the dip is spread behind it,
 * in seconds.
 */
const REACH = 0.002;
/**
 * How long the level takes to come back up after a peak, in seconds. A voice is a few milliseconds
 * a cycle, so this spans many.
 */
const RELEASE = 0.06;

/** The lowest value within `reach` samples of each sample, on either side. */
export function windowMinimum(x: Float32Array, reach: number): Float32Array {
  const out = new Float32Array(x.length);
  const queue = new Int32Array(x.length);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let i = 0; i < x.length; i++) {
    for (; next <= Math.min(x.length - 1, i + reach); next++) {
      while (tail > head && x[queue[tail - 1]!]! >= x[next]!) tail--;
      queue[tail++] = next;
    }
    while (queue[head]! < i - reach) head++;
    out[i] = x[queue[head]!]!;
  }
  return out;
}

/**
 * The mean of the values within `reach` samples of each sample, on either side, which is fewer at
 * the ends.
 */
function windowMean(x: Float32Array, reach: number): Float32Array {
  const sums = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) sums[i + 1] = sums[i]! + x[i]!;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const from = Math.max(0, i - reach);
    const to = Math.min(x.length, i + reach + 1);
    out[i] = (sums[to]! - sums[from]!) / (to - from);
  }
  return out;
}

/**
 * Holds `input` under `ceilingDb`, which is in dB full scale. The gain each sample needs is spread
 * to the samples around it, so it is already coming down when the peak arrives, then it is let back
 * up slowly, and the result is smoothed so that it never steps. Every sample of the output is at or
 * under the ceiling.
 */
export function limit(input: Float32Array, ceilingDb: number, rate: number): Limited {
  const ceiling = 10 ** (ceilingDb / 20);
  const need = new Float32Array(input.length).fill(1);
  let over = false;
  for (let i = 0; i < input.length; i++) {
    const size = Math.abs(input[i]!);
    if (size > ceiling) {
      need[i] = ceiling / size;
      over = true;
    }
  }
  if (!over) return { samples: input, heldDb: 0 };

  const reach = Math.max(1, Math.round(REACH * rate));
  const ahead = windowMinimum(need, reach);
  const comes = 1 - Math.exp(-1 / (RELEASE * rate));
  const level = new Float32Array(input.length);
  let gain = 1;
  for (let i = 0; i < input.length; i++) {
    gain = Math.min(ahead[i]!, gain + (1 - gain) * comes);
    level[i] = gain;
  }
  // Each sample of `level` is under what every sample within `reach` of it needs, so the mean of
  // them is as well.
  const smooth = windowMean(level, reach);
  const samples = new Float32Array(input.length);
  let lowest = 1;
  for (let i = 0; i < input.length; i++) {
    samples[i] = input[i]! * smooth[i]!;
    lowest = Math.min(lowest, smooth[i]!);
  }
  return { samples, heldDb: -20 * Math.log10(lowest) };
}
