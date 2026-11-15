import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SILENCE_SCRIPT } from '../../tools/qa/silence';
import { ROOT, sourceFiles, strip } from '../architecture/source';

/**
 * A test browser must not make a sound on the machine of whoever ran it. Playwright mutes its
 * Chromium and cannot mute its WebKit, which played the game's music and said its words through the
 * speakers of whoever ran the tests. The first half of this file runs the page script against a
 * stand-in for the parts of a browser it touches. The second half fails a file that drives a
 * browser that could be heard without going through `silence`.
 */

interface Speakers {
  readonly kind: 'speakers';
}

class Gain {
  readonly gain = { value: 1 };
  to: unknown = null;
  connect(to: unknown): unknown {
    this.to = to;
    return to;
  }
}

class Utterance {
  readonly handlers = new Map<string, () => void>();
  constructor(readonly text: string) {}
  dispatchEvent(event: { type: string }): boolean {
    this.handlers.get(event.type)?.();
    return true;
  }
}

class Happening {
  constructor(readonly type: string) {}
}

/**
 * The parts of a browser the script touches. Each page gets classes of its own, as a real page gets
 * prototypes of its own.
 */
function browser() {
  class Base {
    readonly out: Speakers = { kind: 'speakers' };
    get destination(): Speakers {
      return this.out;
    }
    createGain(): Gain {
      return new Gain();
    }
  }
  class Realtime extends Base {}
  class Offline extends Base {}
  class Voice {
    speak(_utterance: Utterance): void {
      throw new Error('the system voice was used');
    }
  }
  /** What the speakers of this context really are, whatever `destination` says now. */
  const speakers = (context: Base): Speakers =>
    (Object.getOwnPropertyDescriptor(Base.prototype, 'destination')!.get as () => Speakers).call(context);
  return { Realtime, Offline, Voice, speakers };
}

interface Kept {
  gated: number;
  spoken: string[];
}

/** A page with `parts` in it, which has run the script once, and what the script keeps. */
function open(parts: Record<string, unknown> = {}): { page: Record<string, unknown>; kept: () => Kept } {
  const page: Record<string, unknown> = { Event: Happening, setTimeout, ...parts };
  page.window = page;
  runInNewContext(SILENCE_SCRIPT, page);
  return { page, kept: () => page.__silence as Kept };
}

const gateOf = (context: { destination: unknown }): Gain => context.destination as Gain;

describe('the page script', () => {
  it('puts a gain of zero between a real-time context and the speakers', () => {
    const b = browser();
    const { kept } = open({ AudioContext: b.Realtime });
    const context = new b.Realtime();
    const gate = gateOf(context);
    expect(gate).toBeInstanceOf(Gain);
    expect(gate.gain.value).toBe(0);
    expect(gate.to).toBe(b.speakers(context));
    expect(context.destination).toBe(gate);
    expect(kept().gated).toBe(1);
  });

  it('gives each context its own gate', () => {
    const b = browser();
    const { kept } = open({ AudioContext: b.Realtime });
    const [first, second] = [new b.Realtime(), new b.Realtime()];
    expect(gateOf(first)).not.toBe(gateOf(second));
    expect(gateOf(second).to).toBe(b.speakers(second));
    expect(kept().gated).toBe(2);
  });

  it('leaves a context that renders to memory as it is', () => {
    const b = browser();
    open({ AudioContext: b.Realtime, OfflineAudioContext: b.Offline });
    const offline = new b.Offline();
    expect(offline.destination).toBe(b.speakers(offline));
  });

  it('gates once when the old name and the new name are the same context', () => {
    const b = browser();
    const { kept } = open({ AudioContext: b.Realtime, webkitAudioContext: b.Realtime });
    const context = new b.Realtime();
    expect(gateOf(context).to).toBe(b.speakers(context));
    expect(kept().gated).toBe(1);
  });

  it('gates the old name when it is the only one', () => {
    const b = browser();
    open({ webkitAudioContext: b.Realtime });
    expect(gateOf(new b.Realtime()).gain.value).toBe(0);
  });

  it('does no more the second time it runs on a page', () => {
    const b = browser();
    const { page, kept } = open({ AudioContext: b.Realtime });
    runInNewContext(SILENCE_SCRIPT, page);
    const context = new b.Realtime();
    expect(gateOf(context).to).toBe(b.speakers(context));
    expect(kept().gated).toBe(1);
  });

  it('runs on a browser with no Web Audio and no voice', () => {
    expect(open().kept()).toEqual({ gated: 0, spoken: [] });
  });

  it('keeps a word from the voice, writes it down, and still ends it', async () => {
    const b = browser();
    const { kept } = open({ SpeechSynthesis: b.Voice });
    const word = new Utterance('frog');
    const events: string[] = [];
    word.handlers.set('start', () => events.push('start'));
    word.handlers.set('end', () => events.push('end'));
    new b.Voice().speak(word);
    expect(kept().spoken).toEqual(['frog']);
    await new Promise((done) => setTimeout(done, 10));
    expect(events).toEqual(['start', 'end']);
  });

  it('does not write down the empty word that wakes the voice', () => {
    const b = browser();
    const { kept } = open({ SpeechSynthesis: b.Voice });
    new b.Voice().speak(new Utterance(''));
    expect(kept().spoken).toEqual([]);
  });
});

const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

describe('what drives a browser', () => {
  it('shuts the output before openGame loads a page', () => {
    const helpers = strip(read('tests/e2e/helpers.ts')).code;
    const body = helpers.slice(helpers.indexOf('export async function openGame'));
    expect(body.indexOf('silence('), 'openGame calls silence').toBeGreaterThanOrEqual(0);
    expect(body.indexOf('silence('), 'and does it before it loads the page').toBeLessThan(body.indexOf('.goto('));
  });

  it('opens the game only through openGame or after silence, in every spec and every tool', () => {
    // A tool runs in Chromium, which Playwright mutes, and a lab page plays nothing in real time,
    // so a tool may open one as it is. A spec also runs in WebKit, which cannot be muted, so a spec
    // shuts the output whatever page it opens.
    const labOfATool = (file: string, url: string): boolean => file.startsWith('tools/') && /tools\/lab\//.test(url);
    const offenders = [...sourceFiles('tests/e2e'), ...sourceFiles('tools')]
      .filter((file) => file !== 'tests/e2e/helpers.ts')
      .filter((file) => {
        const text = strip(read(file));
        const opensAPage = [...text.withStrings.matchAll(/\.goto\(([^)]*)\)/g)].some(
          (m) => !labOfATool(file, m[1] ?? ''),
        );
        return opensAPage && !/\b(openGame|silence)\(/.test(text.code);
      });
    expect(
      offenders,
      'open the game with openGame(page), or call silence(context) from tools/qa/silence.ts before the first goto. Chromium is muted for Web Audio and not for the system voice, and WebKit is not muted at all',
    ).toEqual([]);
  });

  it('shuts the output of every script that starts a browser that could be heard', () => {
    // A WebKit or a Firefox, or a browser with a window.
    const heard =
      /import\s*\{[^}]*\b(?:webkit|firefox)\b[^}]*\}\s*from\s*\S?(?:@playwright\/test|playwright)\S?|headless:\s*false|--headed/;
    const offenders = [...sourceFiles('tools'), ...sourceFiles('tests')]
      .filter((file) => file !== 'tests/tools/silence.test.ts')
      .filter((file) => {
        const text = strip(read(file));
        return heard.test(text.withStrings) && !/\bsilence\(/.test(text.code);
      });
    expect(offenders, 'call silence(context) from tools/qa/silence.ts before the first goto').toEqual([]);
  });
});
