import { WebAudioEngine } from '../audio/engine';
import { GameAudio } from '../audio/service';
import { WonderSynth } from '../audio/synth/synth';
import { TRIMS } from '../audio/synth/trims';
import { VoiceBank } from '../audio/voice-bank';
import { assetUrl } from '../game/assets';
import type { SettingsModel } from '../persistence/settings';
import type { Profile } from '../render/profile';
import type { Manifest } from '../shared/manifest';
import type { Ui } from '../ui/ui';

/** What is left of the world's music and ambience while a full-screen game has the stage. */
export const WORLD_UNDER_A_GAME = 0.14;
/** What is left of the world's music while a card is up, so the chimes and the voice are clear. */
export const WORLD_UNDER_A_CARD = 0.35;

/**
 * Everything that makes a sound. Without an audio manifest the game is silent, and the voice has
 * nothing to say.
 */
export interface Sound {
  engine: WebAudioEngine | null;
  audio: GameAudio | null;
  /** The playground games make every sound they play themselves, into the same mix. */
  synth: WonderSynth | null;
  voice: VoiceBank;
}

interface SoundDeps {
  manifest: Manifest;
  profile: Profile;
  settings: SettingsModel;
  ui: Ui;
}

export function makeSound({ manifest, profile, settings, ui }: SoundDeps): Sound {
  const engine = manifest.audio ? new WebAudioEngine(manifest.audio, assetUrl) : null;
  const audio = engine && manifest.audio ? new GameAudio({ engine, assets: manifest.audio }) : null;
  const synth = engine ? new WonderSynth(() => engine.graph(), Math.random, TRIMS, profile.soundBudget) : null;
  // What the player is told, and the sound of every letter pressed, is a clip that ships with the
  // game, spoken once by a model and the same on every device. It belongs to learning, so with
  // learning off the game is as it was. It is said when a parent wants it and the game is not
  // muted, at the level of the effects.
  const voice = new VoiceBank({
    speech: manifest.audio?.speech,
    graph: () => engine?.graph() ?? null,
    url: assetUrl,
    allowed: () => {
      const s = settings.get();
      return !s.muted && s.learning.on && s.learning.say;
    },
  });
  audio?.setMix(settings.get());
  settings.subscribe((s) => {
    audio?.setMix(s);
    ui.setMuted(s.muted);
  });
  return { engine, audio, synth, voice };
}
