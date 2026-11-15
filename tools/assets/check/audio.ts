import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AudioAssets,
  decodedBytes,
  LOOPS,
  type LoopId,
  SHEET_IDS,
  type SheetId,
  SOUND_FAMILIES,
  type SoundFamilyId,
  spriteId,
} from '../../../src/shared/audio';
import { decodeMono, hasFfmpeg, meter } from '../lib/ffmpeg';
import { error, type Finding, warn } from './finding';

/**
 * How far a loop's loudness may be from its target, in LU, and the true peak every encoded file
 * must stay under.
 */
const LUFS_TOLERANCE = 1;
const TRUE_PEAK_CEILING = -1;
/** The least gap between two sounds in a sheet, in seconds. */
const MIN_GAP = 0.05;
/**
 * How alike a loop's padding must be to the start of the loop it continues into, from 0 (unrelated)
 * to 1 (identical).
 */
const MIN_JOIN_MATCH = 0.8;
/** Sample rate the files are decoded at when they are checked. */
const RATE = 44100;
const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));

const peakOf = (x: Float32Array, from: number, to: number): number => {
  let peak = 0;
  for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) peak = Math.max(peak, Math.abs(x[i]!));
  return peak;
};

/**
 * What every sound promises, read from the manifest alone: it exists, sits where its sheet says,
 * and does not run into the next.
 */
export function checkAudioManifest(audio: AudioAssets): Finding[] {
  const found: Finding[] = [];
  for (const [id, spec] of Object.entries(LOOPS) as [LoopId, (typeof LOOPS)[LoopId]][]) {
    const loop = audio.loops[id];
    if (!loop) {
      found.push(error('audio', `the loop ${id} is missing`));
      continue;
    }
    if (loop.kind !== spec.kind) found.push(error('audio', `${id} is ${loop.kind} and should be ${spec.kind}`));
    if (Math.abs(loop.seconds - spec.seconds) > 1e-6)
      found.push(error('audio', `${id} is ${loop.seconds} s and should be ${spec.seconds} s`));
    if (Math.abs(loop.loopEnd - loop.loopStart - loop.seconds) > 1e-6)
      found.push(
        error(
          'audio',
          `${id} repeats ${(loop.loopEnd - loop.loopStart).toFixed(4)} s, not its length of ${loop.seconds} s`,
        ),
      );
    if (Math.abs(loop.lufs - spec.lufs) > LUFS_TOLERANCE)
      found.push(error('audio', `${id} is ${loop.lufs} LUFS and should be ${spec.lufs} within ${LUFS_TOLERANCE}`));
    if (loop.truePeak > TRUE_PEAK_CEILING)
      found.push(error('audio', `${id} peaks at ${loop.truePeak} dBTP, over ${TRUE_PEAK_CEILING}`));
    if (loop.decodedBytes !== decodedBytes(loop.loopEnd + loop.loopStart, 2))
      found.push(
        error(
          'audio',
          `${id} says it needs ${loop.decodedBytes} bytes decoded and its length says ${decodedBytes(loop.loopEnd + loop.loopStart, 2)}`,
        ),
      );
  }

  const expected = new Map<string, SheetId>();
  for (const [id, family] of Object.entries(SOUND_FAMILIES) as [
    SoundFamilyId,
    (typeof SOUND_FAMILIES)[SoundFamilyId],
  ][]) {
    for (let v = 0; v < family.variants; v++) expected.set(spriteId(id, v), family.sheet);
  }
  for (const sheetId of SHEET_IDS) {
    const sheet = audio.sheets[sheetId];
    if (!sheet) {
      found.push(error('audio', `the sound sheet ${sheetId} is missing`));
      continue;
    }
    const names = Object.keys(sheet.sprites);
    for (const [name, home] of expected)
      if (home === sheetId && !(name in sheet.sprites))
        found.push(error('audio', `${name} should be in sheet ${sheetId} and is not`));
    for (const name of names) {
      if (!expected.has(name))
        found.push(error('audio', `sheet ${sheetId} has ${name}, which no sound is registered as`));
      else if (expected.get(name) !== sheetId)
        found.push(error('audio', `${name} is in sheet ${sheetId} and belongs in ${expected.get(name)}`));
    }
    const windows = names.map((n) => ({ n, ...sheet.sprites[n]! })).sort((a, b) => a.start - b.start);
    windows.forEach((w, i) => {
      if (w.start + w.duration > sheet.seconds + 1e-6)
        found.push(
          error(
            'audio',
            `${w.n} ends at ${(w.start + w.duration).toFixed(3)} s, past the end of sheet ${sheetId} at ${sheet.seconds.toFixed(3)} s`,
          ),
        );
      const next = windows[i + 1];
      if (next && next.start - (w.start + w.duration) < MIN_GAP - 1e-6)
        found.push(
          error(
            'audio',
            `${w.n} and ${next.n} are ${(next.start - w.start - w.duration).toFixed(3)} s apart in sheet ${sheetId}, and a decoder needs ${MIN_GAP} s`,
          ),
        );
    });
    if (sheet.decodedBytes !== decodedBytes(sheet.seconds, 1))
      found.push(
        error(
          'audio',
          `sheet ${sheetId} says it needs ${sheet.decodedBytes} bytes decoded and its length says ${decodedBytes(sheet.seconds, 1)}`,
        ),
      );
  }
  return found;
}

export interface AudioMeasure {
  loops: Record<string, { lufs: number; truePeak: number; seconds: number; joinLag: number; joinMatch: number }>;
  sheets: Record<string, { seconds: number; sounds: number; quietestSoundDb: number; loudestEdgeDb: number }>;
}

/** Normalised correlation of two equal-length stretches. 1 is the same sound, 0 is unrelated. */
function match(a: Float32Array, b: Float32Array, at: number, otherAt: number, length: number): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < length; i++) {
    const x = a[at + i]!;
    const y = b[otherAt + i]!;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return ab / Math.sqrt(Math.max(aa * bb, 1e-18));
}

/**
 * Decodes the shipped files and measures what the manifest claims. A loop's padding past its end
 * must be the start of the loop again, at the same sample, so the repeat is seamless whatever delay
 * a decoder adds. Every sound in a sheet must be there, and quiet at both edges of its window so a
 * cut never lands in the middle of a sound. Needs ffmpeg; when it is missing the files are left
 * unchecked and a warning says so, which `assets:validate` never turns into a pass.
 */
export function checkAudioFiles(dir: string, audio: AudioAssets): { found: Finding[]; measured: AudioMeasure | null } {
  const found: Finding[] = [];
  if (!hasFfmpeg())
    return {
      found: [
        warn('audio', 'ffmpeg with MP3 support is not installed, so the audio files were not decoded and measured'),
      ],
      measured: null,
    };
  const measured: AudioMeasure = { loops: {}, sheets: {} };

  for (const [id, loop] of Object.entries(audio.loops)) {
    const path = join(dir, loop.file);
    if (!existsSync(path)) continue;
    if (statSync(path).size !== loop.bytes)
      found.push(error('audio', `${id} is ${statSync(path).size} bytes and the manifest says ${loop.bytes}`));
    const m = meter(path);
    if (Math.abs(m.lufs - loop.lufs) > 0.3)
      found.push(error('audio', `${id} measures ${m.lufs} LUFS and the manifest says ${loop.lufs}`));
    if (m.truePeak > TRUE_PEAK_CEILING)
      found.push(error('audio', `${id} measures a true peak of ${m.truePeak} dBTP, over ${TRUE_PEAK_CEILING}`));
    const pcm = decodeMono(path, RATE);
    const seconds = pcm.length / RATE;
    const padded = loop.loopEnd + loop.loopStart;
    if (Math.abs(seconds - padded) > 0.05)
      found.push(
        error(
          'audio',
          `${id} decodes to ${seconds.toFixed(3)} s and should be ${padded.toFixed(3)} s with its padding`,
        ),
      );
    // After the loop's end the file carries its beginning again. Find how far that stretch is from
    // where it should be.
    const length = Math.round(RATE * 0.4);
    const end = Math.round(loop.loopEnd * RATE);
    const start = Math.round(loop.loopStart * RATE);
    let bestLag = 0;
    let best = -2;
    for (let lag = -2048; lag <= 2048; lag++) {
      if (end + lag < 0 || end + lag + length > pcm.length) continue;
      const c = match(pcm, pcm, start, end + lag, length);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    measured.loops[id] = { lufs: m.lufs, truePeak: m.truePeak, seconds, joinLag: bestLag, joinMatch: best };
    // A sample or two is an encoder's rounding; a millisecond or more would be heard as a hiccup in
    // the music.
    if (Math.abs(bestLag) > 4)
      found.push(
        error(
          'audio',
          `${id}: where it repeats is ${bestLag} samples from where it should be, so the loop would stutter`,
        ),
      );
    // Two separately encoded copies of the same noise agree to about 0.9, and of tonal music to
    // 0.999. Material that is not the same agrees to near 0.
    if (best < MIN_JOIN_MATCH)
      found.push(
        error(
          'audio',
          `${id}: its padding matches its own start at ${best.toFixed(3)}, so it is not the same material and the loop does not repeat seamlessly`,
        ),
      );
  }

  for (const [id, sheet] of Object.entries(audio.sheets)) {
    const path = join(dir, sheet.file);
    if (!existsSync(path)) continue;
    if (statSync(path).size !== sheet.bytes)
      found.push(error('audio', `sheet ${id} is ${statSync(path).size} bytes and the manifest says ${sheet.bytes}`));
    const m = meter(path);
    if (m.truePeak > TRUE_PEAK_CEILING)
      found.push(error('audio', `sheet ${id} measures a true peak of ${m.truePeak} dBTP, over ${TRUE_PEAK_CEILING}`));
    const pcm = decodeMono(path, RATE);
    const seconds = pcm.length / RATE;
    if (Math.abs(seconds - sheet.seconds) > 0.05)
      found.push(
        error(
          'audio',
          `sheet ${id} decodes to ${seconds.toFixed(3)} s and the manifest says ${sheet.seconds.toFixed(3)} s`,
        ),
      );
    let quietest = Infinity;
    let loudestEdge = -200;
    for (const [name, s] of Object.entries(sheet.sprites)) {
      const from = Math.round(s.start * RATE);
      const to = Math.round((s.start + s.duration) * RATE);
      const body = db(peakOf(pcm, from, to));
      quietest = Math.min(quietest, body);
      if (body < -40)
        found.push(
          error(
            'audio',
            `${name} is silent in its window in sheet ${id} (${body.toFixed(0)} dBFS), so the sheet and its map disagree`,
          ),
        );
      // The first and last 8 ms of a window are lead and tail room. Sound there means the window
      // cuts a sound off.
      const edge = Math.round(0.008 * RATE);
      const edges = Math.max(db(peakOf(pcm, from, from + edge)), db(peakOf(pcm, to - edge, to)));
      loudestEdge = Math.max(loudestEdge, edges);
      if (edges > -34)
        found.push(
          error(
            'audio',
            `${name} has sound at the edge of its window (${edges.toFixed(0)} dBFS), so it would be cut or click`,
          ),
        );
    }
    measured.sheets[id] = {
      seconds,
      sounds: Object.keys(sheet.sprites).length,
      quietestSoundDb: quietest,
      loudestEdgeDb: loudestEdge,
    };
  }
  return { found, measured };
}
