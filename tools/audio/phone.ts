import { filter4, SR, type Stereo } from './dsp';
import { momentaryLoudness } from './loudness';

/**
 * The lowest note a small speaker gives, in hertz: a phone or a tablet gives next to nothing under
 * it.
 */
export const PHONE_FLOOR = 250;

/**
 * How much of a sound's loudness is left when it is played on a small speaker, in decibels under
 * what it measures with nothing taken away: 0 for a sound with nothing below the floor, and less
 * and less for one with more of its weight down there.
 */
export function phoneLoss(sound: Stereo, rate: number, loudness = momentaryLoudness(sound, rate)): number {
  // The filter is designed for the world's sample rate, so its cutoff is moved to be where it is
  // meant to be at this one.
  const small = (x: Float32Array): Float32Array => filter4(x, 'highpass', (PHONE_FLOOR * SR) / rate);
  return momentaryLoudness({ l: small(sound.l), r: small(sound.r) }, rate) - loudness;
}
