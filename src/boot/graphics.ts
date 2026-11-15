import { fetchManifest, Textures } from '../game/assets';
import { faults } from '../game/faults';
import { FineSheets } from '../game/fine-sheets';
import { createStage, type Stage } from '../game/game';
import type { SettingsModel } from '../persistence/settings';
import { chooseProfile, type Profile } from '../render/profile';
import { createShadowTexture } from '../render/shadow';
import type { Manifest } from '../shared/manifest';
import type { Ui } from '../ui/ui';

/** The stage and the pictures the world and the unicorns are drawn from. */
export interface Graphics {
  profile: Profile;
  stage: Stage;
  scene: Stage['scene'];
  manifest: Manifest;
  textures: Textures;
  fine: FineSheets;
}

/**
 * Makes the stage in the shape the device can draw, and brings down what the world is painted with.
 */
export async function loadGraphics(ui: Ui, surface: HTMLElement, settings: SettingsModel): Promise<Graphics> {
  const profile = chooseProfile(
    settings.get().lowEnd,
    navigator.userAgent,
    (navigator as { deviceMemory?: number }).deviceMemory,
  );
  document.documentElement.dataset.profile = profile.id;
  const stage = await createStage(surface, profile);
  faults.guard(stage.game.loop);
  const { scene } = stage;
  createShadowTexture(scene);

  const manifest = await fetchManifest();
  const textures = new Textures(scene);
  const fine = new FineSheets(textures, manifest, profile.fineFacings);
  ui.progress(0.12, 'Brushing manes');
  await textures.loadUnicorns(manifest, (f) => ui.progress(0.12 + f * 0.45));
  await textures.loadShared(manifest, 'fx');
  await textures.loadShared(manifest, 'life');
  await textures.loadShared(manifest, 'produce');
  return { profile, stage, scene, manifest, textures, fine };
}
