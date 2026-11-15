/**
 * The word that opens the door of the Spooky Manor. It is the name of the unicorn who leads, so a
 * young child who can spell it can go in, and a grown-up who knows it can too. The check is
 * forgiving: capitals and spaces do not matter.
 */
export const MANOR_CODE = 'wildstar';

/** Whether what was typed is the word, ignoring capitals and any spaces around or inside it. */
export const codeMatches = (typed: string): boolean => typed.replace(/\s+/g, '').toLowerCase() === MANOR_CODE;
