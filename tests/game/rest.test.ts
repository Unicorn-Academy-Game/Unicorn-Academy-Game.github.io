import { describe, expect, it } from 'vitest';
import type { Rest } from '../../src/game/ports';
import { sharedRest } from '../../src/game/rest';

/** A world that says what was done to it. */
function world(): { rest: Rest; log: string[] } {
  const log: string[] = [];
  return { log, rest: { freeze: () => void log.push('freeze'), thaw: () => void log.push('thaw') } };
}

describe('the world held still by more than one thing', () => {
  it('is frozen and thawed once for one holder, as if there were no sharing', () => {
    const { rest, log } = world();
    const shared = sharedRest(rest);
    shared.freeze();
    shared.thaw();
    expect(log).toEqual(['freeze', 'thaw']);
  });

  it('stays frozen until the last of two holders lets go: a card over the book does not wake the world when it comes down', () => {
    const { rest, log } = world();
    const shared = sharedRest(rest);
    shared.freeze();
    shared.freeze();
    expect(log).toEqual(['freeze']);
    shared.thaw();
    expect(log).toEqual(['freeze']);
    shared.thaw();
    expect(log).toEqual(['freeze', 'thaw']);
  });

  it('freezes again for a holder who comes after the world has been let go', () => {
    const { rest, log } = world();
    const shared = sharedRest(rest);
    shared.freeze();
    shared.thaw();
    shared.freeze();
    shared.thaw();
    expect(log).toEqual(['freeze', 'thaw', 'freeze', 'thaw']);
  });

  it('does nothing when it is told to thaw a world nothing was holding, so a stray thaw never wakes a world another holder still has', () => {
    const { rest, log } = world();
    const shared = sharedRest(rest);
    shared.thaw();
    expect(log).toEqual([]);
    shared.freeze();
    shared.thaw();
    shared.thaw();
    shared.freeze();
    expect(log).toEqual(['freeze', 'thaw', 'freeze']);
  });
});
