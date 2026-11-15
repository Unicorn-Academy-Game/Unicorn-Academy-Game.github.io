import {
  COMPASS_EIGHT,
  facingNamed,
  parseFacing,
  UNICORN_FACINGS,
  type UnicornFacing,
} from '../../../src/shared/compass';

/**
 * Reads the facings a viewing tool is asked for: a comma list of ring numbers from 0 to 31, or of
 * the eight names, with `eight` for the named eight and `all` for the whole ring.
 */
export function parseFacings(text: string): UnicornFacing[] {
  return text.split(',').flatMap((word) => {
    if (word === 'all') return [...UNICORN_FACINGS];
    if (word === 'eight') return [...COMPASS_EIGHT];
    const f = facingNamed(word) ?? parseFacing(word);
    if (f === undefined)
      throw new Error(`"${word}" is not a facing: use 0 to 31, a name such as southwest, "eight" or "all"`);
    return [f];
  });
}
