import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_CLIPS } from '../../src/learning/course-clips';
import type { Clip } from '../../src/learning/lines';
import { isPiece, PIECE_LUFS, paceOf, SPEECH, SpeechAssets, type SpeechClip } from '../../src/shared/audio';
import { peakOf, readWav, wavBytes } from '../audio/dsp';
import { type Limited, limit } from '../audio/limiter';
import { momentaryLoudness } from '../audio/loudness';
import { decodeMono, ffmpeg, meter } from './lib/ffmpeg';
import { shortHash } from './lib/hash';

/**
 * Packs the voice. Every clip in `src/learning/lines.ts` has a lossless master in
 * `assets/source/voice`, made by `tools/voice/generate.py`. A sentence or an instruction is slowed
 * first (`PACE` in `src/shared/audio.ts`), then each clip is set to the same loudness, encoded as
 * MP3 and measured again on the encoded file, and the manifest's speech section says where each one
 * ended up. The game speaks only from these files.
 */

const VOICE_MASTERS = 'assets/source/voice';
/**
 * The highest sample after the level is set, before encoding. Encoding can add a little, and the
 * encoded file is held to `SPEECH.truePeak`.
 */
const SAMPLE_PEAK_LIMIT = -1.5;
/**
 * The most the limiter may take off a peak, in dB. A clip with one tall syllable would otherwise be
 * left quiet by it, and a limiter that is asked for more than this changes how the voice sounds. A
 * clip that needs more is left under the target, and the check on the manifest says so.
 */
export const MAX_HELD = 6;
/** How many times the gain is halved in on when the limiter is holding a peak. */
const STEPS = 20;
/**
 * VBR quality for the MP3 encoder, where 0 is the biggest file. A sentence is 1.5 times as long as
 * its master now, and 5 makes a clip three quarters the size of 2, which keeps the voice where it
 * was in bytes. Speech at 24 kHz keeps every band within 0.6 dB of its master at 5 (measured on
 * four clips), and what is lost is the fine detail that a phone's speaker does not play.
 */
const QUALITY = 5;
/**
 * The quality of the clips in `FINER`, which is what every clip had before the voice was slowed.
 */
const FINE_QUALITY = 2;
/**
 * Clips that the encoder at `QUALITY` spoils. The listeners understood each master and then wrote
 * something else for its file: `pull` for `hole`, `ribby` for `rib`, a `j` after the `d` of
 * `sound.d` and a sound in front of the `h` of `cheer.hooray`. A clip a fifth to a third of a
 * second long has little to spare, and the encoder smears its first and last sound. These are
 * encoded at `FINE_QUALITY`, which costs about a kilobyte each. `tools/voice/verify.py` is how a
 * clip gets on this list.
 */
const FINER: ReadonlySet<string> = new Set([
  'word.fill',
  'word.full',
  'word.hole',
  'word.petal',
  'word.rib',
  'word.sang',
  'word.were',
  'sound.ch',
  'sound.d',
  'sound.ng',
  'sound.t',
  'cheer.hooray',
]);
/**
 * Clips that the limiter spoils when it holds a peak by the usual amount, which is how far the
 * level may be turned down at the tallest peak, in dB. A hold of 1.5 dB turns `bug` into `buggy`,
 * because the level comes back up over the burst of the g, a hold of 6 dB puts a thump under
 * `pumpkin` that the check for a rattle hears, and a hold of 2 dB leaves the sound listener nothing
 * to write for the hum of `sound.ng`. Each is held by no more than this and is left that much
 * quieter.
 */
const HOLD_AT_MOST: Readonly<Record<string, number>> = { 'word.bug': 0, 'shout.pumpkin': 1.5, 'sound.ng': 0 };
/** Where the voice's files go under the assets directory. */
const SPEECH_DIR = 'speech';
const SOURCES = [
  'tools/assets/speech.ts',
  'tools/assets/lib/ffmpeg.ts',
  'tools/audio/limiter.ts',
  'tools/audio/loudness.ts',
  'src/learning/lines.ts',
];

const dbOf = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));
const heard = (x: Float32Array): number => momentaryLoudness({ l: x, r: x }, SPEECH.rate);

interface PackedClip extends SpeechClip {
  /** The gain applied to the master before the limiter, in dB. */
  gainDb: number;
  /** The most the limiter turned a peak down, in dB. It is 0 for a clip that needed no holding. */
  heldDb: number;
}

/**
 * The name of a clip's file: its id, with the dot made a dash so it reads as one word, and the hash
 * of what is in it.
 */
const speechFile = (id: string, bytes: Uint8Array): string =>
  `${SPEECH_DIR}/${id.replace(/\./g, '-')}.${shortHash(bytes)}.mp3`;

/**
 * A master spoken slower by `pace` and no higher, with ffmpeg's `atempo`, which cuts the voice into
 * short pieces and lays them down further apart where they match. A pace of 1 gives the master
 * back. It drops the last piece when it is not whole, so the clip comes out up to a few hundredths
 * of a second short of the master's length times `pace`, and the quiet it ends in is made up to
 * that length. The times of the words of a sentence are the master's times times `pace`, and none
 * of them is then later than the clip.
 */
function slow(master: Float32Array, pace: number, id: string, scratch: string): Float32Array {
  if (pace === 1) return master;
  const from = join(scratch, `${id}.fast.wav`);
  const to = join(scratch, `${id}.slow.wav`);
  writeFileSync(from, wavBytes([master], SPEECH.rate));
  ffmpeg(['-i', from, '-af', `atempo=${(1 / pace).toFixed(6)}`, '-c:a', 'pcm_f32le', to]);
  const slowed = decodeMono(to, SPEECH.rate);
  rmSync(from);
  rmSync(to);
  const length = Math.round(master.length * pace);
  if (slowed.length >= length) return slowed;
  const made = new Float32Array(length);
  made.set(slowed);
  return made;
}

/** What the encoded file sounds like, measured the way a player would hear it. */
function measure(path: string): { lufs: number; seconds: number; samplePeak: number } {
  const pcm = decodeMono(path, SPEECH.rate);
  return { lufs: heard(pcm), seconds: pcm.length / SPEECH.rate, samplePeak: dbOf(peakOf(pcm)) };
}

/**
 * Sets a master to the target loudness with no sample over `ceilingDb`. When the tallest sample
 * would go over, the limiter turns the peaks down, which takes some loudness off with them, so the
 * clip is turned up again until it is back at the target. That is as far as `maxHeld` lets it go,
 * since a peak turned up by some amount is held down by at least that amount.
 */
function level(master: Float32Array, ceilingDb: number, maxHeld: number): Limited & { gainDb: number } {
  const wanted = SPEECH.lufs - heard(master);
  const apply = (gainDb: number): Limited =>
    limit(
      master.map((v) => v * 10 ** (gainDb / 20)),
      ceilingDb,
      SPEECH.rate,
    );
  const flat = ceilingDb - dbOf(peakOf(master));
  if (flat >= wanted) return { ...apply(wanted), gainDb: wanted };
  const fits = (r: Limited): boolean => r.heldDb <= maxHeld && heard(r.samples) <= SPEECH.lufs;
  let low = flat;
  let high = flat + maxHeld;
  let best = apply(high);
  if (fits(best)) return { ...best, gainDb: high };
  best = apply(low);
  for (let step = 0; step < STEPS; step++) {
    const middle = (low + high) / 2;
    const tried = apply(middle);
    if (fits(tried)) {
      low = middle;
      best = tried;
    } else {
      high = middle;
    }
  }
  return { ...best, gainDb: low };
}

/**
 * Turns a piece of a sentence up by the one amount every piece is, with no sample over `ceilingDb`.
 * The masters of the pieces were set to `PIECE_LUFS` as whole sentences, so a word that was
 * spoken quietly in its sentence is quiet in the clip, as it was when it was said, and a question
 * that is joined from its pieces has the levels of one that was said whole. A peak the gain puts
 * over the ceiling is turned down by the limiter, and the check on the manifest says how much.
 */
function raise(master: Float32Array, ceilingDb: number): Limited & { gainDb: number } {
  const gainDb = SPEECH.lufs - PIECE_LUFS;
  const gain = 10 ** (gainDb / 20);
  return {
    ...limit(
      master.map((v) => v * gain),
      ceilingDb,
      SPEECH.rate,
    ),
    gainDb,
  };
}

/**
 * Sets one master to the level, encodes it, and measures the result. If encoding pushed the true
 * peak over the limit the ceiling is lowered by the overshoot and the clip is levelled and encoded
 * again.
 */
function pack(id: string, spoken: Float32Array, outDir: string, scratch: string): PackedClip {
  if (!Number.isFinite(heard(spoken))) throw new Error(`the master of ${id} is silent`);
  const master = slow(spoken, paceOf(id), id, scratch);
  let ceilingDb = SAMPLE_PEAK_LIMIT;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { samples, gainDb, heldDb } = isPiece(id)
      ? raise(master, ceilingDb)
      : level(master, ceilingDb, HOLD_AT_MOST[id] ?? MAX_HELD);
    const tmpWav = join(scratch, `${id}.wav`);
    const tmpMp3 = join(scratch, `${id}.mp3`);
    writeFileSync(tmpWav, wavBytes([samples], SPEECH.rate));
    ffmpeg([
      '-i',
      tmpWav,
      '-codec:a',
      'libmp3lame',
      '-q:a',
      String(FINER.has(id) ? FINE_QUALITY : QUALITY),
      '-ac',
      '1',
      '-ar',
      String(SPEECH.rate),
      tmpMp3,
    ]);
    const bytes = readFileSync(tmpMp3);
    rmSync(tmpWav);
    const m = meter(tmpMp3);
    if (m.truePeak > SPEECH.truePeak) {
      rmSync(tmpMp3);
      ceilingDb -= m.truePeak - SPEECH.truePeak + 0.3;
      continue;
    }
    const file = speechFile(id, bytes);
    mkdirSync(join(outDir, SPEECH_DIR), { recursive: true });
    writeFileSync(join(outDir, file), bytes);
    const got = measure(tmpMp3);
    rmSync(tmpMp3);
    return {
      file,
      bytes: bytes.length,
      seconds: Number(got.seconds.toFixed(4)),
      lufs: Number(got.lufs.toFixed(2)),
      truePeak: m.truePeak,
      gainDb: Number(gainDb.toFixed(2)),
      heldDb: Number(heldDb.toFixed(2)),
    };
  }
  throw new Error(`${id}: the true peak stayed over ${SPEECH.truePeak} dBTP after lowering the ceiling`);
}

const fingerprint = (masters: string, clips: readonly Clip[]): string => {
  const hash = createHash('sha1');
  for (const source of SOURCES) hash.update(source).update(readFileSync(source));
  hash.update(String([SPEECH.lufs, PIECE_LUFS, SAMPLE_PEAK_LIMIT, SPEECH.truePeak, QUALITY, SPEECH.rate, MAX_HELD]));
  for (const clip of clips) {
    const path = join(masters, `${clip.id}.wav`);
    hash
      .update(clip.id)
      .update(String(paceOf(clip.id)))
      .update(existsSync(path) ? readFileSync(path) : 'missing');
  }
  return hash.digest('hex').slice(0, 12);
};

const filesOf = (assets: SpeechAssets): string[] => Object.values(assets.clips).map((c) => c.file);

interface SpeechReport {
  key: string;
  clips: Record<
    string,
    { gainDb: number; heldDb: number; seconds: number; lufs: number; truePeak: number; bytes: number }
  >;
  totalBytes: number;
}

export interface SpeechOptions {
  /** Build again even if nothing it depends on changed. */
  force?: boolean;
  /** Where the lossless masters are. */
  masters?: string;
  /** The clips to make, which is every clip the game says unless a test asks for fewer. */
  clips?: readonly Clip[];
}

/**
 * Packs every master into `outDir/speech` and returns the manifest's speech section, or the last
 * build when nothing it depends on changed.
 */
export function buildSpeech(outDir: string, options: SpeechOptions = {}): SpeechAssets {
  const masters = options.masters ?? VOICE_MASTERS;
  const clipList = options.clips ?? ALL_CLIPS;
  const cache = join(masters, 'build.json');
  const missing = clipList.filter((clip) => !existsSync(join(masters, `${clip.id}.wav`)));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} clips have no master in ${masters}, such as ${missing[0]!.id}. Make them with: python tools/voice/generate.py (see tools/voice/README.md)`,
    );
  }
  const key = fingerprint(masters, clipList);
  if (!options.force && existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache, 'utf8')) as { key: string; assets: unknown };
    const parsed = SpeechAssets.safeParse(cached.assets);
    if (cached.key === key && parsed.success && filesOf(parsed.data).every((f) => existsSync(join(outDir, f)))) {
      console.log(`speech: unchanged (${key})`);
      return parsed.data;
    }
  }

  const started = Date.now();
  const report: SpeechReport = { key, clips: {}, totalBytes: 0 };
  const clips: Record<string, SpeechClip> = {};
  const scratch = mkdtempSync(join(tmpdir(), 'unicorn-speech-'));
  try {
    for (const clip of clipList) {
      const wav = readWav(readFileSync(join(masters, `${clip.id}.wav`)));
      if (wav.sampleRate !== SPEECH.rate || wav.channels.length !== 1)
        throw new Error(
          `the master of ${clip.id} is ${wav.channels.length} channel(s) at ${wav.sampleRate} Hz, and must be mono at ${SPEECH.rate} Hz`,
        );
      const packed = pack(clip.id, wav.channels[0]!, outDir, scratch);
      const { gainDb, heldDb, ...entry } = packed;
      clips[clip.id] = entry;
      report.clips[clip.id] = {
        gainDb,
        heldDb,
        seconds: entry.seconds,
        lufs: entry.lufs,
        truePeak: entry.truePeak,
        bytes: entry.bytes,
      };
      report.totalBytes += entry.bytes;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const assets = SpeechAssets.parse({ voice: 'af_heart', clips });

  // Remove files from older builds.
  const keep = new Set(filesOf(assets).map((f) => f.slice(`${SPEECH_DIR}/`.length)));
  const dir = join(outDir, SPEECH_DIR);
  if (existsSync(dir)) for (const name of readdirSync(dir)) if (!keep.has(name)) rmSync(join(dir, name));

  writeFileSync(cache, JSON.stringify({ key, assets, report }));
  const held = Object.values(report.clips).filter((c) => c.heldDb > 0);
  const most = Math.max(0, ...held.map((c) => c.heldDb));
  console.log(
    `speech: ${clipList.length} clips, ${(report.totalBytes / 1024).toFixed(0)} KiB, ${held.length} peaks held by the limiter (at most ${most.toFixed(1)} dB), in ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );
  return assets;
}
