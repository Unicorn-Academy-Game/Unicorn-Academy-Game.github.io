import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceCalm } from './dom';

describe('deviceCalm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is false where the page cannot ask', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(deviceCalm()).toBe(false);
  });

  it('follows the device asking for less motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    expect(deviceCalm()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(deviceCalm()).toBe(false);
  });
});
