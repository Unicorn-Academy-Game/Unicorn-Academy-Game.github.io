import type { DeviceSettings } from '../shared/save';

/**
 * What the player controls: music, effects with ambience beneath them, and one switch to silence it
 * all.
 */
export type AudioMix = Pick<DeviceSettings, 'musicVolume' | 'effectsVolume' | 'muted'>;

/**
 * Slider position to gain. A square keeps the middle of the slider comfortably quiet (about -12 dB)
 * and the bottom gentle rather than abrupt, which suits a game for a small child who may turn it up
 * by accident.
 */
export const volumeGain = (v: number): number => Math.min(1, Math.max(0, v)) ** 2;

/** Ambience sits under the effects slider, a little lower than effects. */
export const AMBIENCE_TRIM = 0.85;
