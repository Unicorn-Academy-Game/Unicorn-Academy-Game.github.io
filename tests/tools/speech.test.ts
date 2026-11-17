import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ALL_CLIPS } from '../../src/learning/course-clips';
import type { Clip } from '../../src/learning/lines';
import {
  type AudioAssets,
  isPiece,
  KEPT_AT_MASTER_PACE,
  PIECE_LUFS,
  paceOf,
  SPEECH,
  SPEECH_RESIDENT,
  SpeechAssets,
} from '../../src/shared/audio';
import { Manifest } from '../../src/shared/manifest';
import { audioAccount } from '../../tools/assets/check/budgets';
import { loadMaps } from '../../tools/assets/check/maps';
import { checkSpeechFiles, checkSpeechManifest } from '../../tools/assets/check/speech';
import { decodeMono, hasFfmpeg } from '../../tools/assets/lib/ffmpeg';
import { shortHash } from '../../tools/assets/lib/hash';
import { buildSpeech, MAX_HELD, PIECE_MAX_OVER } from '../../tools/assets/speech';
import { wavBytes } from '../../tools/audio/dsp';
import { momentaryLoudness } from '../../tools/audio/loudness';

/**
 * The voice is made of lossless masters, one for each line the game says, and the build sets each
 * to one loudness, encodes it and writes down what it measured. These tests make masters out of
 * tones, so they need no model and no recording, and look at what the build does with them: the
 * level, the names, the cache, and what the checks say about a damaged file.
 */

const SAYS: Clip[] = [
  { id: 'letter.a', text: 'A' },
  { id: 'word.frog', text: 'frog.' },
  { id: 'cheer.yes', text: 'Yes!' },
];

/**
 * A held note with a few partials, faded in and out at the ends, as loud as `level` at its highest.
 */
function note(seconds: number, level: number, hz = 210, fade = true): Float32Array {
  const n = Math.round(seconds * SPEECH.rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SPEECH.rate;
    const edge = fade ? Math.min(1, i / (0.01 * SPEECH.rate), (n - i) / (0.03 * SPEECH.rate)) : 1;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * h * hz * t) / h;
    out[i] = (level * edge * v) / 2.7;
  }
  return out;
}

let scratch = '';
let n = 0;
/** A directory of masters and a directory to build into, both new. */
function room(masters: Record<string, Float32Array>): { masters: string; out: string } {
  const base = join(scratch, `room-${++n}`);
  mkdirSync(join(base, 'masters'), { recursive: true });
  mkdirSync(join(base, 'out'), { recursive: true });
  for (const [id, samples] of Object.entries(masters))
    writeFileSync(join(base, 'masters', `${id}.wav`), wavBytes([samples], SPEECH.rate));
  return { masters: join(base, 'masters'), out: join(base, 'out') };
}

const ordinary = (): Record<string, Float32Array> => ({
  'letter.a': note(0.4, 0.2),
  'word.frog': note(0.7, 0.5, 180),
  'cheer.yes': note(0.6, 0.9, 240),
});
const audioOf = (speech: SpeechAssets): AudioAssets => ({ speech }) as unknown as AudioAssets;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'unicorn-speech-test-'));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

describe('the 16-bit samples the packer writes', () => {
  it('are each level rounded as Math.round(v * 32767) does, with a half going up and nothing past full scale, which is what tools/voice/test_generate.py holds the voice tool to', () => {
    const levels = [0.7, -0.7, 0.3, 1, -1, 1.5, -1.5, 0.5, -0.5, 0.123456789, 0, 0.00001, -0.00001];
    const data = wavBytes([Float32Array.from(levels)], SPEECH.rate).subarray(44);
    expect(levels.map((_, i) => data.readInt16LE(i * 2))).toEqual([
      22937, -22937, 9830, 32767, -32767, 32767, -32767, 16384, -16383, 4045, 0, 0, 0,
    ]);
  });
});

describe.skipIf(!hasFfmpeg())('packing the voice', () => {
  it('sets every clip to the one loudness however loud its master was, and keeps every peak under the limit', () => {
    const r = room(ordinary());
    const speech = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    expect(SpeechAssets.safeParse(speech).success).toBe(true);
    expect(Object.keys(speech.clips).sort()).toEqual(['cheer.yes', 'letter.a', 'word.frog']);
    for (const [id, clip] of Object.entries(speech.clips)) {
      expect(Math.abs(clip.lufs - SPEECH.lufs), `${id} is ${clip.lufs} LUFS`).toBeLessThan(0.4);
      expect(clip.truePeak, `${id} peaks at ${clip.truePeak}`).toBeLessThanOrEqual(SPEECH.truePeak);
    }
  }, 60_000);

  it('turns the pieces of a sentence up by one amount, so they keep the levels they had in it, unless one would ship louder than a piece may be, and still sets a clip of its own to the loudness of the voice', () => {
    const masters = {
      'lead.34': note(0.6, 0.5, 200),
      'last.5': note(0.4, 0.25, 220),
      'word.frog': note(0.7, 0.5, 180),
    };
    const r = room(masters);
    const speech = buildSpeech(r.out, {
      masters: r.masters,
      clips: [
        { id: 'lead.34', text: '34', say: 'thirty-four', frame: 'What is [thirty-four] plus five?' },
        { id: 'last.5', text: '5', say: 'five', frame: 'What is five plus [five]?' },
        { id: 'word.frog', text: 'frog.' },
      ],
    });
    const { 'lead.34': loud, 'last.5': soft, 'word.frog': word } = speech.clips;
    const heardOf = (id: 'lead.34' | 'last.5'): number =>
      momentaryLoudness({ l: masters[id], r: masters[id] }, SPEECH.rate);
    // Each piece is its master turned up by the one amount, with no more than the encoder's own
    // change, unless that would ship it louder than a piece may be (slowing a piece voiced all
    // through raises its loudest 400 ms), when it is turned up only to there. Against each other,
    // two pieces under that ceiling are as far apart as their masters were.
    const ceiling = SPEECH.lufs + PIECE_MAX_OVER;
    expect(loud!.lufs).toBeCloseTo(Math.min(heardOf('lead.34') + (SPEECH.lufs - PIECE_LUFS), ceiling), 0);
    expect(soft!.lufs).toBeCloseTo(Math.min(heardOf('last.5') + (SPEECH.lufs - PIECE_LUFS), ceiling), 0);
    expect(Math.abs(word!.lufs - SPEECH.lufs), 'a clip of its own is set to the loudness of the voice').toBeLessThan(
      0.4,
    );
    expect(isPiece('lead.34') && isPiece('last.5') && !isPiece('word.frog') && !isPiece('num.34')).toBe(true);
  }, 60_000);

  it('makes a clip as much longer than its master as the pace of its kind says, at the pitch of its master, and leaves a kind with no pace as it is', () => {
    const masters = ordinary();
    const r = room(masters);
    const speech = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    // The pitch of a note is the lag at which its middle half most looks like itself, searched from
    // 80 to 500 Hz. The middle half is the steady part, so what the encoder adds at either end is
    // not heard.
    const pitchOf = (all: Float32Array): number => {
      const x = all.subarray(Math.floor(all.length * 0.25), Math.floor(all.length * 0.75));
      let best = 0;
      let bestLag = 0;
      for (let lag = Math.floor(SPEECH.rate / 500); lag <= Math.floor(SPEECH.rate / 80); lag++) {
        let sum = 0;
        for (let i = 0; i + lag < x.length; i++) sum += x[i]! * x[i + lag]!;
        if (sum > best) {
          best = sum;
          bestLag = lag;
        }
      }
      return SPEECH.rate / bestLag;
    };
    for (const [id, master] of Object.entries(masters)) {
      const clip = speech.clips[id]!;
      const seconds = master.length / SPEECH.rate;
      const longer = clip.seconds / seconds;
      expect(longer, `${id} is ${clip.seconds} s from a master of ${seconds} s`).toBeGreaterThan(paceOf(id) * 0.95);
      expect(longer, `${id} is ${clip.seconds} s from a master of ${seconds} s`).toBeLessThan(paceOf(id) * 1.05);
      const pitch = pitchOf(decodeMono(join(r.out, clip.file), SPEECH.rate)) / pitchOf(master);
      expect(pitch, `${id} changed its pitch`).toBeGreaterThan(0.95);
      expect(pitch, `${id} changed its pitch`).toBeLessThan(1.05);
    }
    expect(paceOf('letter.a'), 'a letter has no pace').toBe(1);
    expect(paceOf('word.frog'), 'a word is slowed').toBeGreaterThan(1);
    expect(paceOf('line.the-duck-sat-on-a-rock'), 'a sentence is slowed more than a word').toBeGreaterThan(
      paceOf('word.frog'),
    );
  }, 60_000);

  it('says a word that slowing spoils at the pace of its master, and only a word the game says', () => {
    const says = new Set(ALL_CLIPS.map((clip) => clip.id));
    for (const id of KEPT_AT_MASTER_PACE) {
      expect(says.has(id), `${id} is a clip the game says`).toBe(true);
      expect(paceOf(id), `${id} is said at the pace of its master`).toBe(1);
    }
    expect(paceOf('word.frog'), 'a word that is not on the list is still slowed').toBeGreaterThan(1);
  });

  it('names each file by what is in it, so a clip that changes is a new file and one that does not is cached for good', () => {
    const r = room(ordinary());
    const speech = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    for (const [id, clip] of Object.entries(speech.clips)) {
      const bytes = readFileSync(join(r.out, clip.file));
      expect(clip.bytes).toBe(bytes.length);
      expect(clip.file).toBe(`speech/${id.replace('.', '-')}.${shortHash(bytes)}.mp3`);
    }
  }, 60_000);

  it('turns a clip with one tall syllable up to the loudness of the rest by holding the syllable down, and says by how much', () => {
    // Its tallest sample is 5 dB under full scale, and a clip with that peak could not be as loud
    // as the target without going over the ceiling.
    const tall = note(0.5, 0.25);
    const from = Math.round(0.2 * SPEECH.rate);
    for (let i = from; i < from + Math.round(0.004 * SPEECH.rate); i++) tall[i] = tall[i]! * 3.5;
    const r = room({ ...ordinary(), 'letter.a': tall });
    const speech = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    const report = JSON.parse(readFileSync(join(r.masters, 'build.json'), 'utf8')).report.clips as Record<
      string,
      { heldDb: number }
    >;
    const held = report['letter.a']!.heldDb;
    expect(held, 'the limiter had to hold it').toBeGreaterThan(0.5);
    expect(held, 'by no more than it may').toBeLessThanOrEqual(MAX_HELD);
    expect(Math.abs(speech.clips['letter.a']!.lufs - SPEECH.lufs), 'and the clip is at the target').toBeLessThan(0.4);
    expect(speech.clips['letter.a']!.truePeak).toBeLessThanOrEqual(SPEECH.truePeak);
    expect(report['word.frog']!.heldDb, 'a clip with no tall peak is not touched').toBe(0);
    expect(checkSpeechManifest(audioOf(speech), SAYS)).toEqual([]);
  }, 60_000);

  it('holds a clip with one tall click in it under the limit and says so, instead of clipping it or crushing it', () => {
    const quiet = note(0.5, 0.02);
    quiet[Math.round(0.25 * SPEECH.rate)] = 0.9;
    const r = room({ ...ordinary(), 'letter.a': quiet });
    const speech = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    const report = JSON.parse(readFileSync(join(r.masters, 'build.json'), 'utf8')).report.clips as Record<
      string,
      { heldDb: number }
    >;
    expect(report['letter.a']!.heldDb, 'the limiter took off no more than it may').toBeLessThanOrEqual(MAX_HELD);
    expect(speech.clips['letter.a']!.truePeak).toBeLessThanOrEqual(SPEECH.truePeak);
    expect(speech.clips['letter.a']!.lufs, 'it is left quieter than the target').toBeLessThan(SPEECH.lufs - 6);
    expect(report['word.frog']!.heldDb).toBe(0);
    // ...and the check on the manifest is what stops it shipping.
    expect(
      checkSpeechManifest(audioOf(speech), SAYS)
        .map((f) => f.message)
        .join('\n'),
    ).toMatch(/letter\.a is .* LUFS, more than 6 LU under/);
  }, 60_000);

  it('packs a word that the usual settings spoil with the settings that spare it, and no other word', () => {
    const tall = note(0.5, 0.25);
    const from = Math.round(0.2 * SPEECH.rate);
    for (let i = from; i < from + Math.round(0.004 * SPEECH.rate); i++) tall[i] = tall[i]! * 3.5;
    const same = note(0.5, 0.5, 200);
    const says: Clip[] = [
      { id: 'letter.a', text: 'A' },
      { id: 'word.bug', text: 'bug.' },
      { id: 'word.hole', text: 'hole.' },
      { id: 'word.hat', text: 'hat.' },
    ];
    const r = room({ 'letter.a': tall, 'word.bug': tall, 'word.hole': same, 'word.hat': same });
    const speech = buildSpeech(r.out, { masters: r.masters, clips: says });
    const report = JSON.parse(readFileSync(join(r.masters, 'build.json'), 'utf8')).report.clips as Record<
      string,
      { heldDb: number }
    >;
    expect(report['letter.a']!.heldDb, 'an ordinary clip is held').toBeGreaterThan(0.5);
    expect(report['word.bug']!.heldDb, 'a word the limiter spoils is not held at all').toBe(0);
    expect(speech.clips['word.bug']!.lufs, 'and is left quieter').toBeLessThan(speech.clips['letter.a']!.lufs);
    expect(
      speech.clips['word.hole']!.bytes,
      'a word the encoder spoils is encoded finer than the same sound in another word',
    ).toBeGreaterThan(speech.clips['word.hat']!.bytes * 1.3);
  }, 60_000);

  it('builds nothing again when nothing it depends on has changed, and only what changed when something has', () => {
    const r = room(ordinary());
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const first = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    const second = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    expect(second).toEqual(first);
    expect(log.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/^speech: 3 clips/),
      expect.stringMatching(/^speech: unchanged/),
    ]);

    writeFileSync(join(r.masters, 'word.frog.wav'), wavBytes([note(0.7, 0.5, 200)], SPEECH.rate));
    const third = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    expect(third.clips['word.frog']!.file).not.toBe(first.clips['word.frog']!.file);
    expect(third.clips['letter.a']!.file).toBe(first.clips['letter.a']!.file);
    expect(existsSync(join(r.out, first.clips['word.frog']!.file)), 'the file of the old clip is removed').toBe(false);
  }, 60_000);

  it('builds again when a file it made is gone', () => {
    const r = room(ordinary());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const first = buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    rmSync(join(r.out, first.clips['cheer.yes']!.file));
    buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    expect(existsSync(join(r.out, first.clips['cheer.yes']!.file))).toBe(true);
  }, 60_000);

  it('removes files that an older build left, and nothing else', () => {
    const r = room(ordinary());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mkdirSync(join(r.out, 'speech'), { recursive: true });
    writeFileSync(join(r.out, 'speech', 'old-clip.0123456789.mp3'), 'x');
    writeFileSync(join(r.out, 'elsewhere.txt'), 'y');
    buildSpeech(r.out, { masters: r.masters, clips: SAYS });
    expect(existsSync(join(r.out, 'speech', 'old-clip.0123456789.mp3'))).toBe(false);
    expect(existsSync(join(r.out, 'elsewhere.txt'))).toBe(true);
  }, 60_000);

  it('says which clips have no master and how to make them, instead of building a voice with holes in it', () => {
    const masters = ordinary();
    delete masters['word.frog'];
    const r = room(masters);
    expect(() => buildSpeech(r.out, { masters: r.masters, clips: SAYS })).toThrow(
      /1 clips have no master.*word\.frog.*tools\/voice\/generate\.py/,
    );
  });

  it('refuses a master that is not mono at the rate the voice is made at', () => {
    const r = room(ordinary());
    writeFileSync(join(r.masters, 'letter.a.wav'), wavBytes([note(0.4, 0.2), note(0.4, 0.2)], SPEECH.rate));
    expect(() => buildSpeech(r.out, { masters: r.masters, clips: SAYS })).toThrow(/letter\.a is 2 channel\(s\)/);
    writeFileSync(join(r.masters, 'letter.a.wav'), wavBytes([note(0.4, 0.2)], 48000));
    expect(() => buildSpeech(r.out, { masters: r.masters, clips: SAYS })).toThrow(/mono at 24000/);
  });

  it('refuses a master with nothing in it', () => {
    const r = room({ ...ordinary(), 'letter.a': new Float32Array(SPEECH.rate / 2) });
    expect(() => buildSpeech(r.out, { masters: r.masters, clips: SAYS })).toThrow(/letter\.a is silent/);
  });
});

describe.skipIf(!hasFfmpeg())('checking the voice that was packed', () => {
  function built(masters = ordinary()): { dir: string; speech: SpeechAssets } {
    const r = room(masters);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return { dir: r.out, speech: buildSpeech(r.out, { masters: r.masters, clips: SAYS }) };
  }

  it('finds nothing wrong with a clean build, and measures it', () => {
    const { dir, speech } = built();
    expect(checkSpeechManifest(audioOf(speech), SAYS)).toEqual([]);
    const { found, measured } = checkSpeechFiles(dir, audioOf(speech));
    expect(found.map((f) => f.message)).toEqual([]);
    expect(measured).toMatchObject({ clips: 3, longest: { id: 'word.frog' } });
    expect(measured!.bytes).toBe(Object.values(speech.clips).reduce((sum, clip) => sum + clip.bytes, 0));
  }, 60_000);

  it('notices a line the game says that has no clip, and a clip for a line the game never says', () => {
    const { speech } = built();
    const fewer = structuredClone(speech);
    delete fewer.clips['cheer.yes'];
    expect(checkSpeechManifest(audioOf(fewer), SAYS).map((f) => f.message)).toEqual([
      'the game says cheer.yes and there is no clip for it',
    ]);
    expect(checkSpeechManifest(audioOf(speech), SAYS.slice(0, 2)).map((f) => f.message)).toEqual([
      'the manifest has a clip for cheer.yes, which the game never says',
    ]);
  }, 60_000);

  it('lets a piece of a sentence be quieter or louder than a clip of its own may be, and not by much more', () => {
    const { speech } = built();
    const piece = (lufs: number) => ({ ...speech.clips['word.frog']!, lufs });
    const made = structuredClone(speech);
    made.clips['lead.34'] = piece(SPEECH.lufs - 6.5);
    made.clips['last.5'] = piece(SPEECH.lufs - 8);
    made.clips['lead.35'] = piece(SPEECH.lufs + 1);
    made.clips['lead.36'] = piece(SPEECH.lufs + 1.5);
    made.clips['word.frog'] = { ...speech.clips['word.frog']!, lufs: SPEECH.lufs + 1 };
    const says: Clip[] = [
      ...SAYS,
      { id: 'lead.34', text: '34' },
      { id: 'last.5', text: '5' },
      { id: 'lead.35', text: '35' },
      { id: 'lead.36', text: '36' },
    ];
    expect(checkSpeechManifest(audioOf(made), says).map((f) => f.message)).toEqual([
      `word.frog is ${SPEECH.lufs + 1} LUFS, louder than the ${SPEECH.lufs} it is set to`,
      `last.5 is ${SPEECH.lufs - 8} LUFS, more than 7 LU under the ${SPEECH.lufs} it is set to`,
      `lead.36 is ${SPEECH.lufs + 1.5} LUFS, more than 1 LU over the ${SPEECH.lufs} it is set to`,
    ]);
  }, 60_000);

  it('notices a manifest with no voice at all', () => {
    expect(checkSpeechManifest({} as AudioAssets, SAYS).map((f) => f.message)).toEqual([
      'the manifest has no speech, so the game would have no voice: run pnpm assets:build',
    ]);
  });

  it('notices a clip too loud, too quiet, too long, too short, too hot, or put outside the speech directory', () => {
    const { speech } = built();
    const bad = structuredClone(speech);
    bad.clips['letter.a'] = { ...bad.clips['letter.a']!, lufs: SPEECH.lufs + 1, file: 'sounds/a.mp3' };
    bad.clips['word.frog'] = { ...bad.clips['word.frog']!, lufs: SPEECH.lufs - 7, seconds: 11, truePeak: 0 };
    bad.clips['cheer.yes'] = { ...bad.clips['cheer.yes']!, seconds: 0.05 };
    const said = checkSpeechManifest(audioOf(bad), SAYS)
      .map((f) => f.message)
      .join('\n');
    expect(said).toContain('letter.a is at sounds/a.mp3, outside the speech directory');
    expect(said).toContain(`letter.a is ${SPEECH.lufs + 1} LUFS, louder than the ${SPEECH.lufs} it is set to`);
    expect(said).toContain(`word.frog is ${SPEECH.lufs - 7} LUFS, more than 6 LU under`);
    expect(said).toContain('word.frog is 11 s long');
    expect(said).toContain('word.frog peaks at 0 dBTP, over -1');
    expect(said).toContain('cheer.yes is 0.05 s long');
  }, 60_000);

  it('notices a file that is not the size, the length or the loudness the manifest says', () => {
    const { dir, speech } = built();
    const lied = structuredClone(speech);
    lied.clips['letter.a'] = { ...lied.clips['letter.a']!, bytes: lied.clips['letter.a']!.bytes + 1 };
    lied.clips['word.frog'] = {
      ...lied.clips['word.frog']!,
      seconds: lied.clips['word.frog']!.seconds + 0.5,
      lufs: lied.clips['word.frog']!.lufs + 2,
    };
    const said = checkSpeechFiles(dir, audioOf(lied))
      .found.map((f) => f.message)
      .join('\n');
    expect(said).toMatch(/letter\.a is \d+ bytes and the manifest says \d+/);
    expect(said).toMatch(/word\.frog decodes to [\d.]+ s and the manifest says/);
    expect(said).toMatch(/word\.frog measures -?[\d.]+ LUFS and the manifest says/);
  }, 60_000);

  it('notices a clip that begins or ends with a click, and one that starts off centre', () => {
    const abrupt = note(0.5, 0.5, 210, false);
    const { dir, speech } = built({ ...ordinary(), 'letter.a': abrupt });
    const said = checkSpeechFiles(dir, audioOf(speech))
      .found.map((f) => f.message)
      .join('\n');
    expect(said).toMatch(/letter\.a begins loud/);
    expect(said).toMatch(/letter\.a ends loud/);
    expect(said).not.toMatch(/word\.frog/);

    const lifted = note(0.5, 0.3).map((v) => v + 0.1);
    const off = built({ ...ordinary(), 'letter.a': lifted });
    expect(
      checkSpeechFiles(off.dir, audioOf(off.speech))
        .found.map((f) => f.message)
        .join('\n'),
    ).toMatch(/letter\.a has an offset/);
  }, 60_000);

  it('does not look at a file that is not there, since the check on the files of the build says so', () => {
    const { dir, speech } = built();
    rmSync(join(dir, speech.clips['letter.a']!.file));
    const { found, measured } = checkSpeechFiles(dir, audioOf(speech));
    expect(found).toEqual([]);
    expect(measured!.clips).toBe(2);
  }, 60_000);
});

describe('the voice in the account of decoded sound', () => {
  it('adds what the voice may hold to every figure, and nothing when the manifest has no voice', () => {
    const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    const maps = loadMaps('public/assets', manifest);
    const withVoice = audioAccount(manifest.audio!, maps, 32000);
    const without = audioAccount({ ...manifest.audio!, speech: undefined }, maps, 32000);
    expect(withVoice.speech).toBe(SPEECH_RESIDENT);
    expect(without.speech).toBe(0);
    for (const figure of ['steady', 'crossfade', 'floor'] as const)
      expect(withVoice[figure] - without[figure], figure).toBe(SPEECH_RESIDENT);
  });
});
