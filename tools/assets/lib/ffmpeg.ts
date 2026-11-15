import { execFileSync, spawnSync } from 'node:child_process';

/** Runs ffmpeg and returns what it writes to standard output. Quiet unless it fails. */
export const ffmpeg = (args: string[]): Buffer =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 30 });

/** Whether ffmpeg can be run here, with the MP3 encoder the audio build needs. */
export function hasFfmpeg(): boolean {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return run.status === 0 && /libmp3lame/.test(run.stdout);
}

export interface Meter {
  lufs: number;
  truePeak: number;
}

/** Reads integrated loudness and true peak out of what ffmpeg's EBU R128 meter prints. */
export function parseMeter(text: string): Meter {
  const lufs = /I:\s+(-?[\d.]+)\s+LUFS/.exec(text);
  const peak = /True peak:\s+Peak:\s+(-?[\d.]+)\s+dBFS/.exec(text);
  if (!lufs || !peak) throw new Error(`could not read the loudness meter output:\n${text.slice(-600)}`);
  return { lufs: Number(lufs[1]), truePeak: Number(peak[1]) };
}

/**
 * Integrated loudness and true peak of a file, as ffmpeg's EBU R128 meter reports them. The summary
 * goes to standard error.
 */
export function meter(file: string): Meter {
  const run = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  return parseMeter(run.stderr);
}

/** Decodes a file to mono 32-bit floats at `rate`: the left channel, or both mixed down. */
export function decodeMono(file: string, rate: number, channel: 'mixdown' | 'left' = 'mixdown'): Float32Array {
  const raw = ffmpeg([
    '-i',
    file,
    ...(channel === 'left' ? ['-af', 'pan=mono|c0=c0'] : ['-ac', '1']),
    '-ar',
    String(rate),
    '-f',
    'f32le',
    'pipe:1',
  ]);
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}
