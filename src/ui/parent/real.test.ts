import { describe, expect, it, vi } from 'vitest';
import { parentServices, type RealParts } from './real';

/**
 * The parts a test cares about. Anything else is only touched if the code under test reaches for
 * it, and then the test fails loudly.
 */
function parts(over: Record<string, unknown> = {}): RealParts {
  const untouched = new Proxy(
    {},
    { get: (_target, name) => () => Promise.reject(new Error(`unexpected use of ${String(name)}`)) },
  );
  return { ...(untouched as object), now: () => 0, visit: 'fresh', ...over } as unknown as RealParts;
}

describe('starting a new Spell Book from the controls', () => {
  it('puts the old book away on this device and says whether that worked', async () => {
    const reset = vi.fn(async () => true);
    const services = parentServices(parts({ learner: { reset }, play: { reset: async () => true } }));
    expect(await services.learning.startNew()).toBe('started');
    reset.mockResolvedValueOnce(false);
    expect(await services.learning.startNew()).toBe('refused');
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('puts away what was done at the tables with the book, and only when the book was put away', async () => {
    const played = vi.fn(async () => true);
    const started = parentServices(parts({ learner: { reset: async () => true }, play: { reset: played } }));
    expect(await started.learning.startNew()).toBe('started');
    expect(played).toHaveBeenCalledTimes(1);
    const refused = parentServices(parts({ learner: { reset: async () => false }, play: { reset: played } }));
    expect(await refused.learning.startNew()).toBe('refused');
    expect(played, 'a book that was not put away leaves what was done at the tables alone').toHaveBeenCalledTimes(1);
  });

  it("is not stopped by the tables, whose record is only the device's: a refusal there still leaves the book started", async () => {
    const services = parentServices(
      parts({ learner: { reset: async () => true }, play: { reset: async () => false } }),
    );
    expect(await services.learning.startNew()).toBe('started');
  });
});

describe('what was put aside, as the Recovery page lists it', () => {
  const store = {
    quarantined: async () => [{ at: 7, why: 'the spell book, put aside before it was cleared', raw: '{"words":{}}' }],
  };

  it('is there in a visit that starts from the beginning, since a Spell Book is kept in every one of them', async () => {
    for (const visit of ['fresh', 'incognito'] as const) {
      const services = parentServices(parts({ visit, store, keeper: null }));
      expect(await services.world.damagedData(), visit).toEqual([
        { at: 7, why: 'the spell book, put aside before it was cleared', text: '{"words":{}}' },
      ]);
    }
  });

  it('is there in a visit that keeps the world, with a keeper or without one', async () => {
    const services = parentServices(parts({ visit: 'kept', store, keeper: null }));
    expect(await services.world.damagedData()).toHaveLength(1);
    const withKeeper = parentServices(parts({ visit: 'kept', store, keeper: { current: async () => null } }));
    expect(await withKeeper.world.damagedData()).toHaveLength(1);
  });

  it('is an empty shelf when the browser has no storage', async () => {
    expect(await parentServices(parts({ store: null })).world.damagedData()).toEqual([]);
  });
});
