import { describe, expect, it } from 'vitest';
import { sameStatus, statusOf } from '../../src/offline/status';
import { NO_VOICE, report } from './world';

const quiet = { unavailable: null, report: null, waiting: false } as const;

describe('what a parent is told about offline play', () => {
  it('says offline play is not available where the browser cannot do it', () => {
    expect(statusOf({ ...quiet, unavailable: { kind: 'unsupported' } })).toEqual({ kind: 'unsupported' });
  });

  it('shows the reason when the browser would not set it up', () => {
    expect(statusOf({ ...quiet, unavailable: { kind: 'trouble', detail: 'no' } })).toEqual({
      kind: 'trouble',
      detail: 'no',
    });
  });

  it('says it is getting ready, without a count, before the worker has said anything', () => {
    expect(statusOf(quiet)).toEqual({ kind: 'preparing', done: 0, total: 0 });
  });

  it('counts the parts on the device while the release is being kept, or stopped part way', () => {
    for (const phase of ['installing', 'warming', 'partial'] as const)
      expect(statusOf({ ...quiet, report: report(phase, 4, 10) }), phase).toEqual({
        kind: 'preparing',
        done: 4,
        total: 10,
      });
  });

  it('says ready only when every part of the game is on the device, and how many spoken lessons are', () => {
    expect(statusOf({ ...quiet, report: report('complete', 10, 10) })).toEqual({ kind: 'ready', spoken: NO_VOICE });
    const voice = { done: 12, total: 2280, bytes: 16_000_000, keeping: false, failed: false };
    expect(statusOf({ ...quiet, report: report('complete', 10, 10, null, 'b1', voice) })).toEqual({
      kind: 'ready',
      spoken: voice,
    });
  });

  it("passes on the worker's reason for trouble, and has one when it gave none", () => {
    expect(statusOf({ ...quiet, report: report('failed', 3, 10, 'The connection dropped.') })).toEqual({
      kind: 'trouble',
      detail: 'The connection dropped.',
    });
    expect(statusOf({ ...quiet, report: report('failed', 3, 10) })).toMatchObject({ kind: 'trouble' });
  });

  it('offers the newer version over whatever state the running one is in', () => {
    for (const r of [null, report('complete', 10), report('partial', 2), report('failed', 1, 10, 'x')])
      expect(statusOf({ ...quiet, report: r, waiting: true })).toEqual({ kind: 'update-ready' });
  });

  it('compares statuses by what they say', () => {
    expect(sameStatus({ kind: 'preparing', done: 1, total: 2 }, { kind: 'preparing', done: 1, total: 2 })).toBe(true);
    expect(sameStatus({ kind: 'preparing', done: 1, total: 2 }, { kind: 'preparing', done: 2, total: 2 })).toBe(false);
    expect(sameStatus({ kind: 'ready', spoken: NO_VOICE }, { kind: 'update-ready' })).toBe(false);
    expect(
      sameStatus({ kind: 'ready', spoken: NO_VOICE }, { kind: 'ready', spoken: { ...NO_VOICE, done: 1, total: 2 } }),
    ).toBe(false);
  });
});
