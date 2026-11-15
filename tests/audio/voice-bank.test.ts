import { describe, expect, it } from 'vitest';
import { GAP, VoiceBank, type VoiceBankDeps } from '../../src/audio/voice-bank';
import { ALPHABET, CLIPS, type ClipId, soundClip } from '../../src/learning';
import { SPEECH, SPEECH_RESIDENT, type SpeechAssets } from '../../src/shared/audio';
import { type FakeNode, type FakeRig, fakeRig } from './web-audio-fake';

/**
 * The voice is made of clips, so what it must get right is what a clip goes through on its way to
 * the speakers: fetched once, decoded once, started at the right moment, cut off when something
 * newer is said, and let go when it is old. The context is a stand-in that counts what is made and
 * when it starts, so nothing here makes a sound. How a clip sounds is for the voice's own checks
 * and for ears.
 */

const RATE = 32000;

const speech = (seconds = 0.5): SpeechAssets => ({
  voice: 'af_heart',
  clips: Object.fromEntries(
    CLIPS.map((clip) => [
      clip.id,
      { file: `speech/${clip.id}.0123456789.mp3`, bytes: 1000, seconds, lufs: SPEECH.lufs, truePeak: -2 },
    ]),
  ),
});

interface Rig {
  rig: FakeRig;
  bank: VoiceBank;
  /** The files that were asked for, in order. */
  fetched: string[];
  /** How long a clip lasts, by file, in seconds. Anything not here lasts `seconds`. */
  lasts: Map<string, number>;
  /** Files that fail to arrive. */
  missing: Set<string>;
  /** Holds the files named until `release` is called, as a slow network does. */
  hold: (file: string) => () => void;
  allow: { value: boolean };
  /** Lets every promise that can settle settle. */
  settle: () => Promise<void>;
  sources: () => FakeNode[];
}

function bankRig(patch: Partial<VoiceBankDeps> = {}, seconds = 0.5): Rig {
  const rig = fakeRig();
  const fetched: string[] = [];
  const lasts = new Map<string, number>();
  const missing = new Set<string>();
  const held = new Map<string, Promise<void>>();
  const allow = { value: true };
  Object.assign(rig.ctx, {
    sampleRate: RATE,
    decodeAudioData: async (data: ArrayBuffer) => {
      const length = Math.round(new DataView(data).getFloat32(0) * RATE);
      return { numberOfChannels: 1, length, sampleRate: RATE, duration: length / RATE };
    },
  });
  const fetcher = (async (url: string) => {
    const file = url.replace(/^\/assets\//, '');
    fetched.push(file);
    await held.get(file);
    if (missing.has(file)) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    const bytes = new ArrayBuffer(8);
    new DataView(bytes).setFloat32(0, lasts.get(file) ?? seconds);
    return { ok: true, arrayBuffer: async () => bytes };
  }) as unknown as typeof fetch;
  const bank = new VoiceBank({
    speech: speech(seconds),
    graph: () => rig.graph(),
    url: (file) => `/assets/${file}`,
    allowed: () => allow.value,
    fetcher,
    ...patch,
  });
  return {
    rig,
    bank,
    fetched,
    lasts,
    missing,
    allow,
    hold: (file) => {
      let release!: () => void;
      held.set(file, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    settle: async () => {
      for (let i = 0; i < 20; i++) await new Promise((done) => setTimeout(done, 0));
    },
    sources: () => rig.ctx.nodes.filter((n) => n.kind === 'bufferSource'),
  };
}

const file = (id: ClipId): string => `speech/${id}.0123456789.mp3`;

describe('saying a line', () => {
  it("fetches the clip, decodes it and starts it into the effects bus, so the volume the player set is the voice's too", async () => {
    const r = bankRig();
    r.bank.say(['word.frog']);
    await r.settle();
    expect(r.fetched[0]).toBe(file('word.frog'));
    expect(r.bank.heard).toEqual(['word.frog']);
    const [source] = r.sources();
    expect(source!.starts).toHaveLength(1);
    const gain = source!.connections[0] as FakeNode;
    expect(gain.kind).toBe('gain');
    expect(gain.connections).toHaveLength(1);
    expect(gain.connections[0]).toBe(r.rig.effects);
  });

  it('says clips one after another with a gap between them, and never two at once', async () => {
    const r = bankRig();
    r.lasts.set(file('cheer.yes'), 0.4);
    r.bank.say(['cheer.yes', 'word.frog']);
    await r.settle();
    const [first, second] = r.sources();
    expect(r.bank.heard).toEqual(['cheer.yes', 'word.frog']);
    expect(second!.starts[0]! - first!.starts[0]!).toBeCloseTo(0.4 + GAP, 5);
  });

  it('lays the pieces of a sentence end to end, and leaves the gap after a clip that ends one', async () => {
    const piece = (id: ClipId) => ({ file: file(id), bytes: 1000, seconds: 0.5, lufs: SPEECH.lufs, truePeak: -2 });
    const ids = ['lead.what-is', 'lead.34', 'last.5', 'word.frog'];
    const r = bankRig({ speech: { voice: 'af_heart', clips: Object.fromEntries(ids.map((id) => [id, piece(id)])) } });
    r.bank.say(ids);
    await r.settle();
    const [what, number, last, word] = r.sources();
    expect(r.bank.heard).toEqual(ids);
    expect(number!.starts[0]! - what!.starts[0]!).toBeCloseTo(0.5, 5);
    expect(last!.starts[0]! - number!.starts[0]!).toBeCloseTo(0.5, 5);
    expect(word!.starts[0]! - last!.starts[0]!).toBeCloseTo(0.5 + GAP, 5);
  });

  it('starts the first clip as soon as it has arrived, without waiting for the ones after it', async () => {
    const r = bankRig();
    const release = r.hold(file('word.frog'));
    r.bank.say(['cheer.yes', 'word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual(['cheer.yes']);
    release();
    await r.settle();
    expect(r.bank.heard).toEqual(['cheer.yes', 'word.frog']);
  });

  it('asks for every clip of a line at once, so the later ones are on their way while the first is heard', async () => {
    const r = bankRig();
    const release = r.hold(file('cheer.yes'));
    r.bank.say(['cheer.yes', 'word.frog']);
    await r.settle();
    expect(r.fetched).toEqual(expect.arrayContaining([file('cheer.yes'), file('word.frog')]));
    release();
  });

  it('cuts off what is being said when something newer comes: the old clip fades out in a few milliseconds, and the rest of the old line is never started', async () => {
    const r = bankRig();
    r.rig.ctx.currentTime = 5;
    const release = r.hold(file('word.frog'));
    r.bank.say(['cheer.yes', 'word.frog']);
    await r.settle();
    const [old] = r.sources();
    r.rig.ctx.currentTime = 5.1;
    r.bank.say(['star']);
    release();
    await r.settle();
    expect(r.bank.heard).toEqual(['cheer.yes', 'star']);
    const gain = old!.connections[0] as FakeNode;
    const ramp = (gain.gain as unknown as { events: Array<{ kind: string; args: unknown[] }> }).events.find(
      (e) => e.kind === 'linearRampToValueAtTime',
    );
    expect(ramp?.args[0], 'it fades to nothing').toBe(0);
    expect(ramp!.args[1] as number, 'in about thirty milliseconds').toBeCloseTo(5.1 + 0.03, 5);
    expect(old!.stops, 'and is stopped just after').toHaveLength(1);
    expect(old!.stops[0]).toBeCloseTo(5.1 + 0.03 + 0.01, 5);
  });

  it('is cut off by stop, and nothing that was on its way is started afterwards', async () => {
    const r = bankRig();
    const release = r.hold(file('word.frog'));
    r.bank.say(['cheer.yes', 'word.frog']);
    await r.settle();
    r.bank.stop();
    release();
    await r.settle();
    expect(r.bank.heard).toEqual(['cheer.yes']);
    expect(r.sources()[0]!.stops).toHaveLength(1);
  });

  it('skips a clip that cannot be had and says the rest', async () => {
    const r = bankRig();
    r.missing.add(file('cheer.yes'));
    r.bank.say(['cheer.yes', 'word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual(['word.frog']);
  });

  it('says nothing, and never fetches, for a clip it has no file for', async () => {
    const r = bankRig();
    r.bank.say(['word.dragon']);
    await r.settle();
    expect(r.bank.heard).toEqual([]);
    expect(r.fetched.filter((f) => f.includes('dragon'))).toEqual([]);
  });

  it('plays a clip it has already decoded without asking for it again', async () => {
    const r = bankRig();
    r.bank.say(['word.frog']);
    await r.settle();
    const before = r.fetched.filter((f) => f === file('word.frog')).length;
    r.bank.say(['word.frog']);
    await r.settle();
    expect(before).toBe(1);
    expect(r.fetched.filter((f) => f === file('word.frog'))).toHaveLength(1);
    expect(r.bank.heard).toEqual(['word.frog', 'word.frog']);
  });

  it('fetches a clip once when it is asked for twice before it has arrived', async () => {
    const r = bankRig();
    const release = r.hold(file('word.frog'));
    r.bank.say(['word.frog']);
    r.bank.say(['word.frog']);
    release();
    await r.settle();
    expect(r.fetched.filter((f) => f === file('word.frog'))).toHaveLength(1);
  });

  it('says nothing for an empty line, and an empty line still cuts off what was being said', async () => {
    const r = bankRig();
    r.bank.say(['word.frog']);
    await r.settle();
    r.bank.say([]);
    await r.settle();
    expect(r.bank.heard).toEqual(['word.frog']);
    expect(r.sources()[0]!.stops).toHaveLength(1);
  });
});

describe('following a line as it is said', () => {
  type Told = { clip: ClipId; seconds: number; delay: number };
  const listener = (): { told: Told[]; began: (clip: ClipId, seconds: number, delay: number) => void } => {
    const told: Told[] = [];
    return { told, began: (clip, seconds, delay) => void told.push({ clip, seconds, delay }) };
  };

  it('tells each clip as it is set to sound, how long it lasts and how long until it is heard', async () => {
    const r = bankRig();
    r.rig.ctx.currentTime = 2;
    r.lasts.set(file('cheer.yes'), 0.4);
    r.lasts.set(file('word.frog'), 0.7);
    const { told, began } = listener();
    r.bank.say(['cheer.yes', 'word.frog'], began);
    await r.settle();
    expect(told.map((t) => t.clip)).toEqual(['cheer.yes', 'word.frog']);
    expect(told[0]!.seconds).toBeCloseTo(0.4, 5);
    expect(told[1]!.seconds).toBeCloseTo(0.7, 5);
    expect(told[0]!.delay).toBeCloseTo(0.01, 5);
    // The second is heard when the first has ended and the gap has passed, whatever the time was
    // when it was told.
    expect(told[1]!.delay).toBeCloseTo(0.01 + 0.4 + GAP, 5);
  });

  it('says how long until a clip is heard from now, so a clip that arrives late is not told as if it were early', async () => {
    const r = bankRig();
    r.rig.ctx.currentTime = 1;
    const release = r.hold(file('word.frog'));
    const { told, began } = listener();
    r.bank.say(['cheer.yes', 'word.frog'], began);
    await r.settle();
    r.rig.ctx.currentTime = 1.1;
    release();
    await r.settle();
    const [, frog] = told;
    // The first was set at 1.01 and lasts 0.5, and the gap follows, so the second is that much
    // later. It is 1.1 now.
    expect(frog!.delay).toBeCloseTo(1.01 + 0.5 + GAP - 1.1, 5);
  });

  it('adds the time the speakers take where the browser says, so what is shown follows what is heard', async () => {
    const r = bankRig();
    (r.rig.ctx as unknown as { outputLatency: number }).outputLatency = 0.12;
    const { told, began } = listener();
    r.bank.say(['word.frog'], began);
    await r.settle();
    expect(told[0]!.delay).toBeCloseTo(0.01 + 0.12, 5);
  });

  it('allows for no more than a few tenths of a second, and nothing for a latency that is not a number', async () => {
    const slow = bankRig();
    (slow.rig.ctx as unknown as { outputLatency: number }).outputLatency = 9;
    const a = listener();
    slow.bank.say(['word.frog'], a.began);
    await slow.settle();
    expect(a.told[0]!.delay).toBeCloseTo(0.01 + 0.4, 5);
    for (const odd of [Number.NaN, -1, Infinity]) {
      const r = bankRig();
      (r.rig.ctx as unknown as { outputLatency: number }).outputLatency = odd;
      const { told, began } = listener();
      r.bank.say(['word.frog'], began);
      await r.settle();
      expect(told[0]!.delay, String(odd)).toBeCloseTo(0.01, 5);
    }
  });

  it('does not tell of a clip that cannot be had, or of the rest of a line that was cut off first', async () => {
    const r = bankRig();
    r.missing.add(file('cheer.yes'));
    const release = r.hold(file('word.frog'));
    const { told, began } = listener();
    r.bank.say(['cheer.yes', 'word.frog'], began);
    await r.settle();
    r.bank.stop();
    release();
    await r.settle();
    expect(told).toEqual([]);
  });

  it('tells nothing when it says nothing, and is still just as quiet without anyone to tell', async () => {
    const r = bankRig();
    r.allow.value = false;
    const { told, began } = listener();
    r.bank.say(['word.frog'], began);
    await r.settle();
    expect(told).toEqual([]);
    r.allow.value = true;
    r.bank.say(['word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual(['word.frog']);
  });
});

describe('whether a word would be heard', () => {
  it('is so when there is a voice and it is wanted, and is not when a parent has not asked for it or the game is muted', () => {
    const r = bankRig();
    expect(r.bank.audible).toBe(true);
    r.allow.value = false;
    expect(r.bank.audible).toBe(false);
    r.allow.value = true;
    expect(r.bank.audible).toBe(true);
  });

  it('is not so when the game has no voice at all, whatever is wanted', () => {
    const r = bankRig({ speech: undefined });
    expect(r.bank.audible).toBe(false);
    expect(r.bank.available).toBe(false);
  });
});

describe('the name of a letter', () => {
  it('is the clip of that letter, in either case', async () => {
    const r = bankRig();
    r.bank.letter('r');
    await r.settle();
    r.bank.letter('R');
    await r.settle();
    expect(r.bank.heard).toEqual([soundClip('r'), soundClip('r')]);
  });

  it('is not said for anything that is not a letter of the alphabet', async () => {
    const r = bankRig();
    for (const key of ['', '7', ' ', 'ab', 'é', '.', 'Enter']) r.bank.letter(key);
    await r.settle();
    expect(r.bank.heard).toEqual([]);
    expect(r.fetched).toEqual([]);
  });

  it('cuts off the letter before it, so a child who types fast hears each key and never a pile of them', async () => {
    const r = bankRig();
    r.rig.ctx.currentTime = 1;
    r.bank.letter('f');
    await r.settle();
    r.rig.ctx.currentTime = 1.2;
    r.bank.letter('r');
    await r.settle();
    const [first, second] = r.sources();
    expect(first!.stops).toHaveLength(1);
    expect(second!.stops).toHaveLength(0);
    expect(r.bank.heard).toEqual([soundClip('f'), soundClip('r')]);
  });

  it('has every letter of the alphabet, which is the proof that no key the player can press is silent', () => {
    const ids = new Set(CLIPS.map((clip) => clip.id));
    for (const letter of ALPHABET) expect(ids.has(soundClip(letter)), letter).toBe(true);
  });

  it('is made ready the first time the player is spoken to: every letter is fetched, so the first key they press is as quick as the rest', async () => {
    const r = bankRig();
    r.bank.say(['open.frog']);
    await r.settle();
    for (const letter of ALPHABET) expect(r.fetched, letter).toContain(file(soundClip(letter)));
    expect(r.fetched.filter((f) => f === file(soundClip('a')))).toHaveLength(1);
  });
});

describe('when it must stay quiet', () => {
  it('says nothing, and does not even fetch, when a parent has not asked for it or the game is muted', async () => {
    const r = bankRig();
    r.allow.value = false;
    r.bank.say(['word.frog']);
    r.bank.letter('a');
    await r.settle();
    expect(r.fetched).toEqual([]);
    expect(r.bank.heard).toEqual([]);
  });

  it('says nothing while the context is waiting for a touch, because it would be heard late and all at once', async () => {
    const r = bankRig();
    r.rig.hear(false);
    r.bank.say(['word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual([]);
  });

  it('says nothing, and breaks nothing, when there is no context yet', async () => {
    const r = bankRig({ graph: () => null });
    r.bank.say(['word.frog']);
    r.bank.letter('a');
    r.bank.stop();
    await r.settle();
    expect(r.bank.heard).toEqual([]);
  });

  it('says nothing, and says so, when the game has no voice', async () => {
    const r = bankRig({ speech: undefined });
    expect(r.bank.available).toBe(false);
    r.bank.say(['word.frog']);
    await r.settle();
    expect(r.fetched).toEqual([]);
    expect(bankRig().bank.available).toBe(true);
  });

  it('is not stopped by a network that is down: every clip that fails is skipped, and the next try asks again', async () => {
    const r = bankRig();
    r.missing.add(file('word.frog'));
    r.bank.say(['word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual([]);
    r.missing.clear();
    r.bank.say(['word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual(['word.frog']);
  });

  it('is not broken by a context that throws when a sound is made', async () => {
    const r = bankRig();
    (r.rig.ctx as unknown as { createBufferSource: () => never }).createBufferSource = () => {
      throw new Error('the context has gone away');
    };
    r.bank.say(['word.frog']);
    await expect(r.settle()).resolves.toBeUndefined();
    expect(r.bank.heard).toEqual([]);
  });

  it('is not broken by a file the browser cannot decode', async () => {
    const r = bankRig();
    (r.rig.ctx as unknown as { decodeAudioData: () => Promise<never> }).decodeAudioData = () =>
      Promise.reject(new Error('not audio'));
    r.bank.say(['word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual([]);
  });
});

describe('what it holds', () => {
  it('lets the clips used longest ago go when more than its share is decoded, and keeps the ones being said', async () => {
    // Three seconds of speech at 32 kHz is 375 KiB, so the share of 2.5 MiB holds six of them and
    // not seven.
    const r = bankRig({}, 3);
    const perClip = 3 * RATE * 4;
    const fits = Math.floor(SPEECH_RESIDENT / perClip);
    const ids: ClipId[] = CLIPS.filter((clip) => clip.id.startsWith('open.'))
      .slice(0, fits + 4)
      .map((clip) => clip.id);
    for (const id of ids) {
      r.bank.say([id]);
      await r.settle();
    }
    // The letters were fetched too, and the oldest of everything has gone.
    expect(r.bank.stats().resident).toBeLessThanOrEqual(SPEECH_RESIDENT);
    r.bank.say([ids.at(-1)!]);
    await r.settle();
    expect(
      r.fetched.filter((f) => f === file(ids.at(-1)!)),
      'the newest was kept, so it was not fetched again',
    ).toHaveLength(1);
    r.bank.say([ids[0]!]);
    await r.settle();
    expect(
      r.fetched.filter((f) => f === file(ids[0]!)),
      'the oldest was let go, so it was fetched again',
    ).toHaveLength(2);
  });

  it('never lets go of what a line it is saying needs, even when the line alone is more than its share', async () => {
    const r = bankRig({}, 20);
    r.bank.say(['cheer.yes', 'word.frog']);
    await r.settle();
    expect(r.bank.heard).toEqual(['cheer.yes', 'word.frog']);
  });

  it('counts what it holds, for the game to check', async () => {
    const r = bankRig();
    expect(r.bank.stats()).toEqual({ resident: 0, clips: 0, live: 0, loading: 0, started: 0 });
    r.bank.say(['word.frog']);
    await r.settle();
    const stats = r.bank.stats();
    expect(stats.started).toBe(1);
    expect(stats.clips).toBeGreaterThanOrEqual(1);
    expect(stats.resident).toBe(stats.clips * Math.round(0.5 * RATE) * 4);
    expect(stats.live).toBe(1);
    r.rig.ctx.finish();
    expect(r.bank.stats().live).toBe(0);
  });

  it('says how many clips are on their way, so that a caller can wait until nothing is', async () => {
    const r = bankRig();
    const release = r.hold(file(soundClip('c')));
    r.bank.say(['open.frog']);
    await r.settle();
    expect(r.bank.stats().loading, 'the letter held on the network is still on its way').toBeGreaterThanOrEqual(1);
    release();
    await r.settle();
    expect(r.bank.stats().loading).toBe(0);
    expect(r.bank.stats().clips).toBeGreaterThanOrEqual(ALPHABET.length);
  });

  it('remembers the last clips that began, and no more than a few dozen', async () => {
    const r = bankRig();
    for (let i = 0; i < 80; i++) {
      r.bank.say(['star']);
      await r.settle();
    }
    expect(r.bank.heard.length).toBeLessThanOrEqual(64);
    expect(r.bank.heard.at(-1)).toBe('star');
  });
});
