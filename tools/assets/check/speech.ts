import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_CLIPS } from '../../../src/learning/course-clips';
import type { Clip } from '../../../src/learning/lines';
import { type AudioAssets, isPiece, SPEECH } from '../../../src/shared/audio';
import { momentaryLoudness } from '../../audio/loudness';
import { decodeMono, hasFfmpeg } from '../lib/ffmpeg';
import { error, type Finding, warn } from './finding';

/**
 * How far under the target a clip may be, in LU. A clip is only quieter than the target when its
 * peaks were too tall for the limiter to hold, as the burst of a `t` is: `sound.t` is 5.5 LU under,
 * which is as loud as the whole voice was before it was made louder.
 */
const MAX_QUIET = 6;
/**
 * The same for a piece of a sentence, which is as loud against the voice as it was in its sentence.
 * The last word of a question falls away, so a piece may be under the target, but the generator
 * turns up one that is more than 6 LU under its sentence (`MOST_UNDER` in `tools/voice/frames.py`),
 * and this is that and one more for what the encoder and the limiter do.
 */
const MAX_QUIET_PIECE = 7;
/**
 * How far over the target a piece of a sentence may be, in LU. The packer sets a sentence's
 * loudest 400 ms to the target, and that window holds the pauses between its words. A piece
 * measured by itself is a word that is voiced all the way through, so it reads hotter than the
 * sentence it came from at the same gain. The hottest of the 224 pieces is 1.0 LU over. The
 * questions the game makes of them, heard as a whole, are from 0.4 LU under to 0.8 LU over.
 */
const MAX_LOUD_PIECE = 1;
/** How far a measured level may be from the one the manifest records, in LU. */
const LUFS_TOLERANCE = 0.3;
/** How far a decoded length may be from the one the manifest records, in seconds. */
const SECONDS_TOLERANCE = 0.06;
/**
 * The shortest and longest a clip may be, in seconds. A letter is a syllable, and the longest line
 * is a sentence said slowly.
 */
const SHORTEST = 0.15;
const LONGEST = 10;
/**
 * How much quieter than the clip's peak its first and last half millisecond must be, in dB. A clip
 * that rises from silence over a few milliseconds passes, and one that begins at its full level,
 * which is a click, does not.
 */
const EDGE_DB = -20;
const EDGE_SECONDS = 0.0005;

const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));
const peakOf = (x: Float32Array, from: number, to: number): number => {
  let peak = 0;
  for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) peak = Math.max(peak, Math.abs(x[i]!));
  return peak;
};

/**
 * What the voice promises, read from the manifest alone: a clip for every line the game says, and
 * nothing the game does not.
 */
export function checkSpeechManifest(audio: AudioAssets, says: readonly Clip[] = ALL_CLIPS): Finding[] {
  const found: Finding[] = [];
  const speech = audio.speech;
  if (!speech)
    return [error('speech', 'the manifest has no speech, so the game would have no voice: run pnpm assets:build')];
  const wanted = new Set(says.map((clip) => clip.id));
  for (const id of wanted)
    if (!(id in speech.clips)) found.push(error('speech', `the game says ${id} and there is no clip for it`));
  for (const [id, clip] of Object.entries(speech.clips)) {
    if (!wanted.has(id)) {
      found.push(error('speech', `the manifest has a clip for ${id}, which the game never says`));
      continue;
    }
    if (!clip.file.startsWith('speech/'))
      found.push(error('speech', `${id} is at ${clip.file}, outside the speech directory`));
    if (clip.seconds < SHORTEST || clip.seconds > LONGEST)
      found.push(
        error('speech', `${id} is ${clip.seconds} s long, and a clip is between ${SHORTEST} and ${LONGEST} s`),
      );
    if (isPiece(id)) {
      if (clip.lufs > SPEECH.lufs + MAX_LOUD_PIECE + LUFS_TOLERANCE)
        found.push(
          error(
            'speech',
            `${id} is ${clip.lufs} LUFS, more than ${MAX_LOUD_PIECE} LU over the ${SPEECH.lufs} it is set to`,
          ),
        );
    } else if (clip.lufs > SPEECH.lufs + LUFS_TOLERANCE) {
      found.push(error('speech', `${id} is ${clip.lufs} LUFS, louder than the ${SPEECH.lufs} it is set to`));
    }
    const quiet = isPiece(id) ? MAX_QUIET_PIECE : MAX_QUIET;
    if (clip.lufs < SPEECH.lufs - quiet)
      found.push(
        error('speech', `${id} is ${clip.lufs} LUFS, more than ${quiet} LU under the ${SPEECH.lufs} it is set to`),
      );
    if (clip.truePeak > SPEECH.truePeak)
      found.push(error('speech', `${id} peaks at ${clip.truePeak} dBTP, over ${SPEECH.truePeak}`));
  }
  return found;
}

export interface SpeechMeasure {
  clips: number;
  seconds: number;
  bytes: number;
  quietest: { id: string; lufs: number };
  loudest: { id: string; lufs: number };
  longest: { id: string; seconds: number };
}

/**
 * Decodes the shipped files and measures what the manifest claims: the size, the length, the
 * loudness and the peak. A clip must also begin and end in quiet, because a voice that starts or
 * stops with a click is the first thing a listener notices. Needs ffmpeg; when it is missing the
 * files are left unchecked and a warning says so, which `assets:validate` never turns into a pass.
 */
export function checkSpeechFiles(
  dir: string,
  audio: AudioAssets,
): { found: Finding[]; measured: SpeechMeasure | null } {
  const found: Finding[] = [];
  const speech = audio.speech;
  if (!speech) return { found, measured: null };
  if (!hasFfmpeg())
    return {
      found: [
        warn('speech', 'ffmpeg with MP3 support is not installed, so the speech files were not decoded and measured'),
      ],
      measured: null,
    };
  const measured: SpeechMeasure = {
    clips: 0,
    seconds: 0,
    bytes: 0,
    quietest: { id: '', lufs: Infinity },
    loudest: { id: '', lufs: -Infinity },
    longest: { id: '', seconds: 0 },
  };
  for (const [id, clip] of Object.entries(speech.clips)) {
    const path = join(dir, clip.file);
    if (!existsSync(path)) continue;
    const size = statSync(path).size;
    if (size !== clip.bytes) found.push(error('speech', `${id} is ${size} bytes and the manifest says ${clip.bytes}`));
    const pcm = decodeMono(path, SPEECH.rate);
    const seconds = pcm.length / SPEECH.rate;
    if (Math.abs(seconds - clip.seconds) > SECONDS_TOLERANCE)
      found.push(error('speech', `${id} decodes to ${seconds.toFixed(3)} s and the manifest says ${clip.seconds} s`));
    const level = momentaryLoudness({ l: pcm, r: pcm }, SPEECH.rate);
    if (Math.abs(level - clip.lufs) > LUFS_TOLERANCE)
      found.push(error('speech', `${id} measures ${level.toFixed(2)} LUFS and the manifest says ${clip.lufs}`));
    const peak = peakOf(pcm, 0, pcm.length);
    if (db(peak) > SPEECH.truePeak)
      found.push(error('speech', `${id} has a sample at ${db(peak).toFixed(2)} dBFS, over ${SPEECH.truePeak}`));
    if (db(peak) < -30) found.push(error('speech', `${id} is silent (${db(peak).toFixed(0)} dBFS at its loudest)`));
    const edge = Math.round(EDGE_SECONDS * SPEECH.rate);
    const start = db(peakOf(pcm, 0, edge) / peak);
    const end = db(peakOf(pcm, pcm.length - edge, pcm.length) / peak);
    if (start > EDGE_DB)
      found.push(error('speech', `${id} begins loud (${start.toFixed(0)} dB under its peak), so it would click`));
    if (end > EDGE_DB)
      found.push(error('speech', `${id} ends loud (${end.toFixed(0)} dB under its peak), so it would click`));
    let mean = 0;
    for (let i = 0; i < pcm.length; i++) mean += pcm[i]!;
    if (Math.abs(mean / pcm.length) > 0.01 * peak)
      found.push(
        error(
          'speech',
          `${id} has an offset of ${(mean / pcm.length).toExponential(1)}, which would thump when it starts`,
        ),
      );

    measured.clips += 1;
    measured.seconds += seconds;
    measured.bytes += size;
    if (level < measured.quietest.lufs) measured.quietest = { id, lufs: level };
    if (level > measured.loudest.lufs) measured.loudest = { id, lufs: level };
    if (seconds > measured.longest.seconds) measured.longest = { id, seconds };
  }
  return { found, measured };
}
