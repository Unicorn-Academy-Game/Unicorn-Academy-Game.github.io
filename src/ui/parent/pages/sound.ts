import { h } from '../../dom';
import type { Page } from '../panel';
import { card, pageTitle, slider, toggle } from '../widgets';

/** How loud the music and effects are, whether sound is off, and whether magic is toned down. */
export const sound: Page = (ctx) => {
  const { settings, confirmSound } = ctx.services;
  const now = settings.get();

  const music = slider(
    'Music',
    now.musicVolume,
    (musicVolume) => settings.update({ musicVolume }),
    () => undefined,
  );
  const effects = slider(
    'Effects',
    now.effectsVolume,
    (effectsVolume) => settings.update({ effectsVolume }),
    confirmSound,
  );
  const muted = toggle(
    'Sound off',
    'Silences the music and the effects. The speaker button in the game does the same.',
    now.muted,
    (value) => settings.update({ muted: value }),
  );
  const gentle = toggle(
    'Gentler effects',
    'Fewer sparkles and softer motion when the unicorns use magic.',
    now.reducedEffects,
    (value) => settings.update({ reducedEffects: value }),
  );

  const page = h(
    'div',
    { class: 'page' },
    pageTitle('Sound and effects', 'These stay on this device.'),
    card('Levels', music.node, effects.node),
    card('Switches', muted.node, gentle.node),
  );
  const paint = (): void => {
    if (settings.get().muted) page.dataset.muted = 'true';
    else delete page.dataset.muted;
  };
  paint();

  ctx.onLeave(
    settings.subscribe((s) => {
      music.set(s.musicVolume);
      effects.set(s.effectsVolume);
      muted.set(s.muted);
      gentle.set(s.reducedEffects);
      paint();
    }),
  );
  return page;
};
