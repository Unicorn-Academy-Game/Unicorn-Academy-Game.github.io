import { describe, expect, it } from 'vitest';
import { MANOR_CODE } from '../content/manor';
import { hintFor } from './code-pad';

describe('what the secret word pad says', () => {
  it('asks kindly at first, then gives the first letter, then asks the player to copy', () => {
    expect(hintFor(0)).toMatch(/unicorn who leads/);
    expect(hintFor(1)).toContain(`starts with ${MANOR_CODE[0]!.toUpperCase()}`);
    expect(hintFor(2)).toContain('starts with');
    expect(hintFor(3)).toMatch(/copy/i);
    expect(hintFor(40)).toMatch(/copy/i);
  });

  it('never calls a try wrong, or a failure', () => {
    for (let misses = 0; misses < 6; misses++) expect(hintFor(misses)).not.toMatch(/wrong|fail|bad|no\b/i);
  });
});
