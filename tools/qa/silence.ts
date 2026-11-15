import type { BrowserContext, Page } from '@playwright/test';

/**
 * A browser that a script drives must not make a sound on the machine of whoever ran the script.
 * Playwright starts its Chromium muted, but its WebKit has no mute switch: it plays the game's
 * music, chimes and recorded voice through the real speakers, and a page that asked the device to
 * speak would be heard in the system's voice. This is the one place that shuts both, and every test
 * and tool that opens the game in a browser that could be heard goes through it (`openGame` does,
 * and `tests/tools/silence.test.ts` fails a file that does not).
 *
 * The script runs in the page before any of the page's own, and does two things.
 *   - Every context that plays in real time gets a gain of zero between its output and the
 *     speakers. The game's own graph, the meters that tests read and the mute switch all sit before
 *     it and work as they would. A context that renders to memory is left alone, because the synth
 *     tests measure what it renders.
 *   - A word handed to the voice of the device is written to `window.__silence.spoken` and not
 *     said. The game never does that, because its voice is recorded clips that play through its
 *     own graph and the gate above, so a word that turns up here is a regression, and
 *     `tests/e2e/silence.spec.ts` checks that none does while the game speaks. It still starts and
 *     ends, so code that waits for the end of a word is not left waiting.
 *
 * It is a string, not a function, so a tool that runs through esbuild (which adds helpers to a
 * function's body that the page does not have) sends the same text a test does.
 */
export const SILENCE_SCRIPT = `(() => {
  if (window.__silence) return;
  const record = { spoken: [], gated: 0 };
  Object.defineProperty(window, '__silence', { value: record });

  const inherited = (proto, key) => {
    for (let at = proto; at; at = Object.getPrototypeOf(at)) {
      const found = Object.getOwnPropertyDescriptor(at, key);
      if (found) return found;
    }
    return undefined;
  };
  const gates = new WeakMap();
  const patched = new Set();
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Context = window[name];
    const proto = typeof Context === 'function' ? Context.prototype : undefined;
    const real = proto && inherited(proto, 'destination');
    if (!real || !real.get || patched.has(proto)) continue;
    patched.add(proto);
    Object.defineProperty(proto, 'destination', {
      configurable: true,
      enumerable: real.enumerable,
      get() {
        let gate = gates.get(this);
        if (!gate) {
          gate = this.createGain();
          gate.gain.value = 0;
          gate.connect(real.get.call(this));
          gates.set(this, gate);
          record.gated += 1;
        }
        return gate;
      },
    });
  }

  const voice = window.SpeechSynthesis && window.SpeechSynthesis.prototype;
  if (voice) {
    Object.defineProperty(voice, 'speak', {
      configurable: true,
      writable: true,
      value(utterance) {
        if (utterance.text !== '') record.spoken.push(utterance.text);
        setTimeout(() => {
          utterance.dispatchEvent(new Event('start'));
          utterance.dispatchEvent(new Event('end'));
        }, 0);
      },
    });
  }
})();`;

const shut = new WeakSet<Page | BrowserContext>();

/**
 * Shuts the speakers and the voice of every page that `target` opens from now on. A page that is
 * already showing something keeps what it has until it is navigated, so call this before the first
 * `goto`. Calling it again for the same target does nothing.
 */
export async function silence(target: Page | BrowserContext): Promise<void> {
  if (shut.has(target)) return;
  shut.add(target);
  await target.addInitScript({ content: SILENCE_SCRIPT });
}
