import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { READ_LINES } from '../../src/content/reading';
import { timesOf } from '../../src/content/reading/times';
import { paceOf } from '../../src/shared/audio';
import { Manifest } from '../../src/shared/manifest';
import { type ReportClips, timesJson } from '../../tools/voice/times-json';

const report = (
  JSON.parse(readFileSync('assets/source/voice/report.json', 'utf8')) as {
    clips: ReportClips & Record<string, { seconds: number }>;
  }
).clips;
const shipped = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'))).audio!.speech!.clips;

describe('when each word of a sentence is said', () => {
  it('is what the voice report holds for the clips, so the screen lights a word when the voice reaches it', () => {
    const { json, missing } = timesJson(report);
    expect(missing, 'a sentence whose clip is not made has no times').toEqual([]);
    expect(
      readFileSync('src/content/reading/line-times.json', 'utf8'),
      'run `pnpm voice:times` to write it again',
    ).toBe(json);
  });

  it('has a span for every word of every sentence, and the screen can find it', () => {
    for (const line of READ_LINES) expect(timesOf(line.id, line.words.length), line.id).toHaveLength(line.words.length);
  });

  it('puts the words in order, one after another, inside the clip, and not far from either end of it', () => {
    for (const line of READ_LINES) {
      const spans = timesOf(line.id, line.words.length)!;
      const seconds = shipped[`line.${line.id}`]!.seconds;
      let before = 0;
      for (const [from, to] of spans) {
        expect(from, line.id).toBeGreaterThanOrEqual(before - 0.001);
        expect(to, line.id).toBeGreaterThan(from);
        expect(to, line.id).toBeLessThanOrEqual(seconds + 0.001);
        before = to;
      }
      expect(spans[0]![0], `${line.id} starts as the clip does`).toBeLessThan(0.4);
      expect(seconds - spans.at(-1)![1], `${line.id} ends as the clip does`).toBeLessThan(0.4);
    }
  });

  it('is spread over the clip that ships, which is as much longer than the master as the pace says', () => {
    for (const line of READ_LINES) {
      const id = `line.${line.id}`;
      const ratio = shipped[id]!.seconds / report[id]!.seconds;
      expect(ratio, `${id} is ${ratio.toFixed(3)} times its master`).toBeCloseTo(paceOf(id), 1);
    }
  });

  it('gives a longer word more time than a shorter one, taken over the whole course', () => {
    const seconds = new Map<number, number[]>();
    for (const line of READ_LINES) {
      const spans = timesOf(line.id, line.words.length)!;
      line.words.forEach((word, i) => {
        seconds.set(word.length, [...(seconds.get(word.length) ?? []), spans[i]![1] - spans[i]![0]]);
      });
    }
    const mean = (n: number): number => {
      const all = seconds.get(n) ?? [];
      return all.reduce((a, b) => a + b, 0) / all.length;
    };
    expect(mean(8)).toBeGreaterThan(mean(5));
    expect(mean(5)).toBeGreaterThan(mean(2));
  });
});
