import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patiently, TOO_LONG } from './patience';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('waiting for work that may never finish', () => {
  it('gives what the work gave when it finishes in time, and leaves no timer behind', async () => {
    const answer = patiently(Promise.resolve(7), 1000);
    await expect(answer).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('says it took too long when the time is up, and ignores what comes later', async () => {
    let finish: (v: string) => void = () => undefined;
    const work = new Promise<string>((resolve) => (finish = resolve));
    const answer = patiently(work, 1000);
    vi.advanceTimersByTime(999);
    finish('late');
    await expect(answer).resolves.toBe('late');

    const never = patiently(new Promise<string>(() => undefined), 1000);
    vi.advanceTimersByTime(1000);
    await expect(never).resolves.toBe(TOO_LONG);
  });

  it('passes a failure on, as soon as it happens', async () => {
    const answer = patiently(Promise.reject(new Error('no connection')), 1000);
    await expect(answer).rejects.toThrow('no connection');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let work that fails after the time is up come back as an unhandled failure', async () => {
    let fail: (e: Error) => void = () => undefined;
    const answer = patiently(new Promise<void>((_, reject) => (fail = reject)), 10);
    vi.advanceTimersByTime(10);
    await expect(answer).resolves.toBe(TOO_LONG);
    fail(new Error('too late to matter'));
    await Promise.resolve();
  });
});
