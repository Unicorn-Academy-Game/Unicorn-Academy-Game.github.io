import type { Page } from '@playwright/test';

/** The handles a page opened with `?test` has, as far as this check uses them. */
interface Handles {
  __ua?: {
    controller: { phase: string; debugFreeze(on: boolean): void };
    settings: { get(): { learning: object }; update(patch: { learning: object }): void };
    lessons: { practice(word: string): boolean };
    voice: { heard: string[]; stats(): object };
    audio: { stats(): { state: string } } | null;
  };
}

const WAIT_MS = 60_000;

/**
 * What a copy that is live does with the voice. A parent's switches are on, a card opens and says
 * its word, and a key says the sound of its letter, from the clips that the copy serves and through
 * the game's own engine. The page must be open with `?test` and be sitting at the title screen, and
 * its context must have gone through `silence`, so nothing is heard in the room. It gives back what
 * went wrong, and an empty list when the voice is well.
 */
export async function voiceIsWell(page: Page): Promise<string[]> {
  const problems: string[] = [];
  const heard = (): Promise<string[]> => page.evaluate(() => [...(window as unknown as Handles).__ua!.voice.heard]);
  /** What the engine and the voice were doing, for the message of a clip that never came. */
  const state = (): Promise<string> =>
    page.evaluate(() => {
      const { audio, voice } = (window as unknown as Handles).__ua!;
      return `engine ${audio?.stats().state ?? 'missing'}, voice ${JSON.stringify(voice.stats())}`;
    });
  const hears = async (...clips: string[]): Promise<void> => {
    const deadline = Date.now() + WAIT_MS;
    while (!(await heard()).some((clip) => clips.includes(clip))) {
      if (Date.now() > deadline) {
        problems.push(`${clips.join(' or ')} was never said, only ${JSON.stringify(await heard())} (${await state()})`);
        return;
      }
      await page.waitForTimeout(250);
    }
  };

  // The tap on Play is also what wakes the audio engine, as it is for a child.
  await page
    .getByRole('button', { name: /Play|Continue/ })
    .first()
    .click({ force: true });
  await page.waitForFunction(() => (window as unknown as Handles).__ua?.controller.phase === 'playing', undefined, {
    timeout: WAIT_MS,
  });
  // The context resumes a moment after the tap, and a card that opens before it runs is silent on
  // purpose, so the card waits for it.
  const running = await page
    .waitForFunction(() => (window as unknown as Handles).__ua?.audio?.stats().state === 'running', undefined, {
      timeout: WAIT_MS,
    })
    .then(
      () => true,
      () => false,
    );
  if (!running)
    return [`the audio engine was not running ${WAIT_MS / 1000} s after the tap on Play (${await state()})`];
  const opened = await page.evaluate(() => {
    const { controller, settings, lessons } = (window as unknown as Handles).__ua!;
    controller.debugFreeze(true);
    settings.update({ learning: { ...settings.get().learning, on: true, say: true } });
    return lessons.practice('frog');
  });
  if (!opened) return ['a card for frog would not open'];
  // The player's own book may have frog in it by the time the card opens, and a word the book has
  // is opened with "again" or "can you".
  await hears('open.frog', 'again.frog', 'can.frog');
  await page.keyboard.press('f');
  await hears('sound.f');
  return problems;
}
