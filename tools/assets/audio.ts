import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AudioAssets,
  CONTEXT_RATE,
  decodedBytes,
  LOOPS,
  type LoopAsset,
  type LoopId,
  SHEET_IDS,
  type SheetAsset,
  type SheetId,
  SOUND_FAMILIES,
  spriteId,
} from '../../src/shared/audio';
import { allTakes, LOOP_RENDERERS, renderSound } from '../audio/catalog';
import { gainToDb, padLoop, peakOf, peakOfStereo, readWav, rmsOf, SR, type Stereo, wavBytes } from '../audio/dsp';
import { integratedLoudness } from '../audio/loudness';
import { setLevel } from '../audio/song';
import { hashFiles, PACK_SOURCES, RENDER_SOURCES } from './lib/audio-sources';
import { decodeMono, ffmpeg, meter } from './lib/ffmpeg';
import { shortHash } from './lib/hash';

/**
 * Renders every sound, keeps lossless masters, encodes MP3s, measures the encoded files, and
 * returns the manifest's audio section. The masters are the source of truth:
 * `assets/source/audio/*.wav` is 16-bit PCM at 44.1 kHz.
 *
 * Music is set to -20 LUFS and everything is checked for true peak under -1 dBTP on the encoded
 * file, not the master, because encoding can add overs.
 */

const MASTERS = 'assets/source/audio';
const STAMPS = join(MASTERS, 'masters.json');
const TRUE_PEAK_LIMIT = -1;
/**
 * VBR quality for the MP3 encoder, where 0 is the biggest file, by what is being packed. The game
 * plays at `CONTEXT_RATE`, so nothing above 16 kHz is ever heard, and the files are made at that
 * rate and not at the masters' 44.1 kHz. Ambience is broad noise that the encoder spends most of
 * its bits on and a listener cannot tell from the original at 5. Music is tonal and made of clean
 * edges, so it keeps 4. The sound effects are short and sharp, and keep 3.
 */
const QUALITY = { music: 4, ambience: 5, sheet: 3 } as const;
/**
 * Seconds of the loop repeated on each side in the file, so a decoder that adds or trims a little
 * still loops cleanly.
 */
const LOOP_PAD = 1;
/** Silence before each sound and between sounds in a sheet. */
const SHEET_GAP = 0.1;
/**
 * A sound's window starts this long before its first sample and ends this long after its last, to
 * absorb decoder slop.
 */
const LEAD = 0.01;
const TAIL = 0.03;
/** Largest offset between a master and its decoded MP3 that is still good, in samples. */
const MAX_DRIFT = 2;

export interface TakeReport {
  id: string;
  seconds: number;
  peakDb: number;
  rmsDb: number;
}

export interface AudioReport {
  sourceHash: string;
  loops: Record<
    string,
    { lufs: number; truePeak: number; samplePeak: number; bytes: number; decodedMiB: number; drift: number }
  >;
  sheets: Record<string, { seconds: number; bytes: number; decodedMiB: number; drift: number; sounds: number }>;
  takes: TakeReport[];
  totalBytes: number;
}

/**
 * How many samples later the decoded file is than its master, found by correlating a loud stretch
 * near the start. Zero means the encoder's delay information is honoured.
 */
function drift(master: Float32Array, decoded: Float32Array, from = 0): number {
  const window = 8192;
  let at = from;
  let best = 0;
  for (let i = from; i + window < Math.min(master.length, from + SR * 4); i += window / 2) {
    let energy = 0;
    for (let k = 0; k < window; k++) energy += master[i + k]! * master[i + k]!;
    if (energy > best) {
      best = energy;
      at = i;
    }
  }
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = -3000; lag <= 3000; lag++) {
    if (at + lag < 0 || at + lag + window > decoded.length) continue;
    let score = 0;
    for (let k = 0; k < window; k++) score += master[at + k]! * decoded[at + lag + k]!;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return bestLag;
}

function encode(
  wav: Buffer,
  name: string,
  outDir: string,
  channels: 1 | 2,
  quality: number,
): { file: string; path: string; bytes: number } {
  const tmpWav = join(MASTERS, `.${name}.tmp.wav`);
  const tmpMp3 = join(MASTERS, `.${name}.tmp.mp3`);
  writeFileSync(tmpWav, wav);
  ffmpeg([
    '-i',
    tmpWav,
    '-codec:a',
    'libmp3lame',
    '-q:a',
    String(quality),
    '-ac',
    String(channels),
    '-ar',
    String(CONTEXT_RATE),
    tmpMp3,
  ]);
  const bytes = readFileSync(tmpMp3);
  const file = `audio/${name}.${shortHash(bytes)}.mp3`;
  const path = join(outDir, file);
  mkdirSync(join(outDir, 'audio'), { recursive: true });
  writeFileSync(path, bytes);
  rmSync(tmpWav);
  rmSync(tmpMp3);
  return { file, path, bytes: bytes.length };
}

/**
 * The loop's lossless master. It is rendered once per change to the sound code, then read back from
 * disk.
 */
function loopMaster(id: LoopId, renderHash: string): Stereo {
  const spec = LOOPS[id];
  const path = join(MASTERS, `${id}.wav`);
  const stamps = existsSync(STAMPS) ? (JSON.parse(readFileSync(STAMPS, 'utf8')) as Record<string, string>) : {};
  if (stamps[id] !== renderHash || !existsSync(path)) {
    const stereo = LOOP_RENDERERS[id]();
    if (spec.kind === 'music') setLevel(stereo, integratedLoudness(stereo), spec.lufs);
    if (Math.abs(stereo.l.length / SR - spec.seconds) > 1 / SR)
      throw new Error(`${id} is ${(stereo.l.length / SR).toFixed(3)} s, expected ${spec.seconds} s`);
    writeFileSync(path, wavBytes([stereo.l, stereo.r]));
    writeFileSync(STAMPS, JSON.stringify({ ...stamps, [id]: renderHash }));
  }
  const [l, r] = readWav(readFileSync(path)).channels;
  return { l: l!, r: r! };
}

function buildLoop(id: LoopId, outDir: string, report: AudioReport, renderHash: string): LoopAsset {
  const spec = LOOPS[id];
  const stereo = loopMaster(id, renderHash);

  // Encode, measure the real file, and turn the level down if encoding pushed the true peak over
  // the limit.
  let level = 1;
  for (let attempt = 0; attempt < 3; attempt++) {
    const padded = padLoop(stereo, SR * LOOP_PAD);
    const scaled = { l: padded.l.map((v) => v * level), r: padded.r.map((v) => v * level) } as Stereo;
    const out = encode(wavBytes([scaled.l, scaled.r]), id, outDir, 2, QUALITY[spec.kind]);
    const m = meter(out.path);
    if (m.truePeak > TRUE_PEAK_LIMIT) {
      level *= 10 ** ((TRUE_PEAK_LIMIT - 0.5 - m.truePeak) / 20);
      rmSync(out.path);
      continue;
    }
    const decoded = decodeMono(out.path, SR, 'left');
    const lag = drift(padded.l, decoded);
    const decoded48 = decodedBytes(spec.seconds + 2 * LOOP_PAD, 2);
    report.loops[id] = {
      lufs: m.lufs,
      truePeak: m.truePeak,
      samplePeak: gainToDb(peakOfStereo(scaled)),
      bytes: out.bytes,
      decodedMiB: decoded48 / 1048576,
      drift: lag,
    };
    if (Math.abs(lag) > MAX_DRIFT) console.warn(`  ${id}: the decoded file is ${lag} samples off its master`);
    return {
      file: out.file,
      kind: spec.kind,
      seconds: spec.seconds,
      loopStart: LOOP_PAD,
      loopEnd: LOOP_PAD + spec.seconds,
      bytes: out.bytes,
      lufs: m.lufs,
      truePeak: m.truePeak,
      decodedBytes: decoded48,
    };
  }
  throw new Error(`${id}: the true peak stayed over ${TRUE_PEAK_LIMIT} dBTP after lowering the level`);
}

function buildSheet(id: SheetId, outDir: string, report: AudioReport): SheetAsset {
  const takes = [...allTakes()].filter((t) => SOUND_FAMILIES[t.id].sheet === id);
  const rendered = takes.map((t) => ({ ...t, buf: renderSound(t.id, t.variant) }));
  const total = Math.ceil(SR * (SHEET_GAP + rendered.reduce((sum, t) => sum + t.buf.length / SR + SHEET_GAP, 0)));
  const sheet = new Float32Array(total);
  const sprites: SheetAsset['sprites'] = {};
  let at = Math.round(SHEET_GAP * SR);
  for (const t of rendered) {
    sheet.set(t.buf, at);
    const start = Math.max(0, at / SR - LEAD);
    sprites[spriteId(t.id, t.variant)] = {
      start: Number(start.toFixed(5)),
      duration: Number((LEAD + t.buf.length / SR + TAIL).toFixed(5)),
    };
    report.takes.push({
      id: spriteId(t.id, t.variant),
      seconds: t.buf.length / SR,
      peakDb: gainToDb(peakOf(t.buf)),
      rmsDb: gainToDb(rmsOf(t.buf)),
    });
    at += t.buf.length + Math.round(SHEET_GAP * SR);
  }
  writeFileSync(join(MASTERS, `sheet-${id}.wav`), wavBytes([sheet]));
  const out = encode(wavBytes([sheet]), `sheet-${id}`, outDir, 1, QUALITY.sheet);
  const meterOut = meter(out.path);
  if (meterOut.truePeak > TRUE_PEAK_LIMIT + 0)
    throw new Error(`sheet ${id} has a true peak of ${meterOut.truePeak} dBTP`);
  const lag = drift(sheet, decodeMono(out.path, SR));
  const seconds = total / SR;
  report.sheets[id] = {
    seconds,
    bytes: out.bytes,
    decodedMiB: decodedBytes(seconds, 1) / 1048576,
    drift: lag,
    sounds: rendered.length,
  };
  if (Math.abs(lag) > MAX_DRIFT) console.warn(`  sheet ${id}: the decoded file is ${lag} samples off its master`);
  return { file: out.file, bytes: out.bytes, seconds, sprites, decodedBytes: decodedBytes(seconds, 1) };
}

/**
 * Renders and encodes all audio into `outDir/audio`, or returns the last build when nothing it
 * depends on changed.
 */
export async function buildAudio(outDir: string, options: { force?: boolean } = {}): Promise<AudioAssets> {
  mkdirSync(MASTERS, { recursive: true });
  const sourceHash = hashFiles(PACK_SOURCES);
  const renderHash = hashFiles(RENDER_SOURCES);
  const cachePath = join(MASTERS, 'build.json');
  if (!options.force && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as { sourceHash: string; assets: unknown };
    const parsed = AudioAssets.safeParse(cached.assets);
    if (
      cached.sourceHash === sourceHash &&
      parsed.success &&
      files(parsed.data).every((f) => existsSync(join(outDir, f)))
    ) {
      console.log(`audio: unchanged (${sourceHash})`);
      return parsed.data;
    }
  }
  const started = Date.now();
  const report: AudioReport = { sourceHash, loops: {}, sheets: {}, takes: [], totalBytes: 0 };
  const loops = {} as Record<LoopId, LoopAsset>;
  for (const id of Object.keys(LOOPS) as LoopId[]) {
    loops[id] = buildLoop(id, outDir, report, renderHash);
    console.log(
      `  ${id}: ${report.loops[id]!.lufs.toFixed(1)} LUFS, ${report.loops[id]!.truePeak.toFixed(1)} dBTP, ${(loops[id].bytes / 1024).toFixed(0)} KiB`,
    );
  }
  const sheets = {} as Record<SheetId, SheetAsset>;
  for (const id of SHEET_IDS) {
    sheets[id] = buildSheet(id, outDir, report);
    console.log(
      `  sheet ${id}: ${report.sheets[id]!.sounds} sounds, ${sheets[id].seconds.toFixed(1)} s, ${(sheets[id].bytes / 1024).toFixed(0)} KiB`,
    );
  }
  const assets = AudioAssets.parse({ loops, sheets });
  report.totalBytes = files(assets).reduce((sum, f) => sum + readFileSync(join(outDir, f)).length, 0);

  // Remove files from older builds.
  const keep = new Set(files(assets).map((f) => f.slice('audio/'.length)));
  for (const name of readdirSync(join(outDir, 'audio'))) if (!keep.has(name)) rmSync(join(outDir, 'audio', name));

  writeFileSync(cachePath, JSON.stringify({ sourceHash, assets }));
  writeFileSync(join(MASTERS, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    `audio: ${(report.totalBytes / 1048576).toFixed(2)} MiB shipped in ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );
  return assets;
}

const files = (a: AudioAssets): string[] => [
  ...Object.values(a.loops).map((l) => l.file),
  ...Object.values(a.sheets).map((s) => s.file),
];
