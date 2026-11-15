import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMPTS, planRound } from '../../src/learning/reading';
import { T0 } from '../learning/helpers';
import { booked, readWords, rig, settle, sitAndStart, touchAll } from './reading-rig';

/**
 * `target` is a sentence given made-up times, and `unknown` one that is given none, as if its clip
 * had not been timed. Every other sentence has the times it ships with.
 */
const times = vi.hoisted(() => ({ target: '', unknown: '' }));

vi.mock('../../src/content/reading/times', async (original) => {
  const real = await original<typeof import('../../src/content/reading/times')>();
  return {
    ...real,
    timesOf: (id: string, words: number) => {
      if (id === times.unknown) return undefined;
      return id === times.target
        ? Array.from({ length: words }, (_, at): readonly [number, number] => [0.3 + at * 0.7, 0.8 + at * 0.7])
        : real.timesOf(id, words);
    },
  };
});

beforeEach(() => {
  times.target = '';
  times.unknown = '';
});

describe('a sentence that is read to the player, when the times of its words are known', () => {
  it('lights each word from the time it begins to the time it ends, after the voice begins', () => {
    const line = planRound(booked(1), T0).find((item) => item.kind === 'line')!;
    if (line.kind !== 'line') throw new Error('a sentence');
    times.target = line.line.id;
    const r = rig({ profile: booked(1) });
    sitAndStart(r);
    readWords(r);
    touchAll(r);
    settle(r);
    const before = r.said.length;
    r.screen.handlers.hear();
    const said = r.said.slice(before)[0]!;
    said.began!(said.clips[0]!, 9, 0.25);
    const cue = r.screen.cues.at(-1)!;
    if (cue.kind !== 'voiced') throw new Error('the voice makes a cue');
    expect(cue.marks).toHaveLength(line.line.words.length);
    cue.marks.forEach((mark, at) => {
      expect(mark.at).toBe(at);
      expect(mark.after).toBeCloseTo(0.25 + 0.3 + at * 0.7, 10);
      expect(mark.seconds).toBeCloseTo(0.5, 10);
    });
    expect(r.said.slice(before)[0]!.clips).toEqual([`line.${line.line.id}`]);
    expect(PROMPTS.together.id).toBe('read.together');
  });

  it('lights each word for a share of the clip as long as the word is, from the time the voice begins to the time it ends, when they are not known', () => {
    const line = planRound(booked(1), T0).find((item) => item.kind === 'line')!;
    if (line.kind !== 'line') throw new Error('a sentence');
    times.unknown = line.line.id;
    const r = rig({ profile: booked(1) });
    sitAndStart(r);
    readWords(r);
    touchAll(r);
    settle(r);
    const before = r.said.length;
    r.screen.handlers.hear();
    const said = r.said.slice(before)[0]!;
    said.began!(said.clips[0]!, 4, 0.3);
    const cue = r.screen.cues.at(-1)!;
    if (cue.kind !== 'voiced') throw new Error('the voice makes a cue');
    const tokens = line.line.text.split(' ');
    expect(cue.marks).toHaveLength(tokens.length);
    const letters = tokens.join('').length;
    cue.marks.forEach((mark, at) => {
      expect(mark.at).toBe(at);
      expect(mark.seconds).toBeCloseTo((tokens[at]!.length / letters) * 4, 10);
      if (at > 0) expect(mark.after).toBeCloseTo(cue.marks[at - 1]!.after + cue.marks[at - 1]!.seconds, 10);
    });
    expect(cue.marks[0]!.after).toBeCloseTo(0.3, 10);
    const last = cue.marks.at(-1)!;
    expect(last.after + last.seconds).toBeCloseTo(0.3 + 4, 10);
  });
});
