/**
 * Every sound the game plays and how it is made. A recipe renders one take of a family; `peak` is
 * the level its loudest sample is set to, in dBFS, which is what keeps a footstep gentle and a
 * spell bright without per-sound fiddling later.
 */
import { SOUND_FAMILIES, type SoundFamilyId } from '../../src/shared/audio';
import { UNICORN_IDS, type UnicornId } from '../../src/shared/ids';
import type { Stereo } from './dsp';
import { dbToGain, fadeEdges, peakOf, SR } from './dsp';
import { forestTheme } from './music/forest';
import { gardenTheme } from './music/garden';
import { forestAmbience, gardenAmbience, stableRoomAmbience, treasureRoomAmbience } from './sfx/ambience';
import { computerWake } from './sfx/computer';
import {
  confirm,
  hearts,
  hello,
  nicker,
  recruit,
  refusal,
  tap,
  transition,
  unicornVoice,
  type VoiceId,
} from './sfx/creatures';
import {
  fxBloom,
  fxBrazier,
  fxGlow,
  fxIce,
  fxLantern,
  fxPinwheel,
  fxRainbow,
  fxRelocate,
  fxSplash,
  fxSpray,
  spellFire,
  spellIce,
  spellLight,
  spellLightning,
  spellNature,
  spellWater,
} from './sfx/magic';
import { codeSuccess, liftDing, manorHallAmbience, manorYardAmbience, skyGardenAmbience } from './sfx/manor';
import { broomSwish, brushStroke, hayRustle, hoofGrass, hoofHard, shearsSnip, waterPour } from './sfx/movement';
import {
  chestClose,
  chestOpen,
  cupFill,
  doorClose,
  doorOpen,
  drink,
  gemSparkle,
  hop,
  palaceWelcome,
  stomp,
  treasureBounce,
  treasureFloat,
} from './sfx/objects';
import { pianoRun } from './sfx/piano';

export interface Recipe {
  /** Level of the loudest sample, dBFS. */
  peak: number;
  build: (variant: number) => Float32Array;
}

type VoiceKey = `voice-${UnicornId}` | `nicker-${UnicornId}`;
const voiceRecipes = Object.fromEntries(
  UNICORN_IDS.flatMap((id) => [
    [`voice-${id}`, { peak: -12, build: (v: number) => unicornVoice(id as VoiceId, v === 0 ? 'a' : 'b') }],
    [`nicker-${id}`, { peak: -14, build: () => nicker(id as VoiceId) }],
  ]),
) as Record<VoiceKey, Recipe>;

export const RECIPES: Record<SoundFamilyId, Recipe> = {
  'hoof-grass': { peak: -20, build: hoofGrass },
  'hoof-hard': { peak: -18, build: hoofHard },
  ...voiceRecipes,
  recruit: { peak: -8, build: recruit },
  hearts: { peak: -14, build: hearts },
  hello: { peak: -13, build: hello },
  drink: { peak: -14, build: drink },
  stomp: { peak: -16, build: stomp },
  hop: { peak: -14, build: hop },
  splash: { peak: -13, build: fxSplash },
  relocate: { peak: -13, build: fxRelocate },
  tap: { peak: -17, build: tap },
  confirm: { peak: -12, build: confirm },
  refusal: { peak: -17, build: refusal },
  transition: { peak: -14, build: transition },
  'spell-light': { peak: -8, build: spellLight },
  'spell-nature': { peak: -8, build: spellNature },
  'spell-ice': { peak: -8, build: spellIce },
  'spell-water': { peak: -8, build: spellWater },
  'spell-fire': { peak: -8, build: spellFire },
  'spell-lightning': { peak: -8, build: spellLightning },
  'fx-bloom': { peak: -11, build: fxBloom },
  'fx-lantern': { peak: -11, build: fxLantern },
  'fx-brazier': { peak: -11, build: fxBrazier },
  'fx-ice': { peak: -11, build: fxIce },
  'fx-spray': { peak: -12, build: fxSpray },
  'fx-pinwheel': { peak: -13, build: fxPinwheel },
  'fx-glow': { peak: -12, build: fxGlow },
  'fx-rainbow': { peak: -9, build: fxRainbow },
  'door-open': { peak: -11, build: doorOpen },
  'door-close': { peak: -12, build: doorClose },
  'chest-open': { peak: -9, build: chestOpen },
  'chest-close': { peak: -13, build: chestClose },
  gem: { peak: -14, build: gemSparkle },
  'piano-run': { peak: -13, build: pianoRun },
  'computer-wake': { peak: -13, build: computerWake },
  'treasure-bounce': { peak: -12, build: treasureBounce },
  'treasure-float': { peak: -12, build: treasureFloat },
  'palace-welcome': { peak: -8, build: palaceWelcome },
  'cup-fill': { peak: -14, build: cupFill },
  brush: { peak: -18, build: brushStroke },
  broom: { peak: -18, build: broomSwish },
  hay: { peak: -18, build: hayRustle },
  shears: { peak: -14, build: shearsSnip },
  'water-pour': { peak: -15, build: waterPour },
  'lift-ding': { peak: -12, build: liftDing },
  'code-success': { peak: -10, build: codeSuccess },
};

/** One finished take: trimmed, faded at both ends, peak-normalised. */
export function renderSound(id: SoundFamilyId, variant: number): Float32Array {
  const recipe = RECIPES[id];
  const raw = recipe.build(variant);
  // Trim the tail once it has fallen 50 dB below the loudest moment, keeping a few milliseconds.
  const top = peakOf(raw);
  const floor = top * 0.003;
  let end = raw.length;
  while (end > 1 && Math.abs(raw[end - 1]!) < floor) end--;
  end = Math.min(raw.length, end + Math.round(0.01 * SR));
  const out = raw.slice(0, end);
  // Remove any offset, then fade both ends so a take can be started and stopped without a click.
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i]!;
  mean /= Math.max(1, out.length);
  for (let i = 0; i < out.length; i++) out[i] = out[i]! - mean;
  fadeEdges(out, 0.001, Math.min(0.15, (out.length / SR) * 0.25));
  const peak = peakOf(out);
  const gain = peak > 0 ? dbToGain(recipe.peak) / peak : 0;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * gain;
  return out;
}

/** Every take of every family, in a stable order. */
export function* allTakes(): Generator<{ id: SoundFamilyId; variant: number }> {
  for (const id of Object.keys(SOUND_FAMILIES) as SoundFamilyId[]) {
    for (let variant = 0; variant < SOUND_FAMILIES[id].variants; variant++) yield { id, variant };
  }
}

export const LOOP_RENDERERS = {
  'music-forest': () => forestTheme(),
  'music-garden': () => gardenTheme(),
  'ambience-forest': () => forestAmbience(),
  'ambience-garden': () => gardenAmbience(),
  'ambience-treasure-room': () => treasureRoomAmbience(),
  'ambience-stable-room': () => stableRoomAmbience(),
  'ambience-manor-yard': () => manorYardAmbience(),
  'ambience-manor-hall': () => manorHallAmbience(),
  'ambience-sky-garden': () => skyGardenAmbience(),
} satisfies Record<string, () => Stereo>;
