import type { StageSource } from '../types';

/**
 * Tiny Tales, stages 1 to 5: a few words at a time, which make a sentence at once. The first stage
 * has cat, hat and in, and the little word a, which is never asked on its own, so "A cat in a hat."
 * is read before the player has met ten words. Every stage adds one vowel, and the first tricky
 * words (the, is, my, you, was) come in a few at a time as the sentences need them.
 */
export const TINY: readonly StageSource[] = [
  {
    title: 'A Cat in a Hat',
    teaches: ['a', 'i'],
    words: 'cat hat mat sat in it',
    lines: [
      'A cat sat.',
      'A cat in a hat.',
      'I sat in it.',
      'A cat sat in a hat.',
      'A cat sat in it.',
      'I sat in a hat.',
    ],
  },
  {
    title: 'A Pig in a Wig',
    teaches: [],
    words: 'pig wig big dig kid sit',
    lines: [
      'A big pig.',
      'A pig in a wig.',
      'A kid in a wig.',
      'A pig sat in it.',
      'I sit in a big hat.',
      'A big pig sat in a hat.',
      'A big cat sat.',
      'I dig in it.',
    ],
  },
  {
    title: 'A Dog on a Log',
    teaches: ['o'],
    words: 'dog log hot pot on top',
    tricky: 'the is',
    lines: [
      'A dog on a log.',
      'The dog is hot.',
      'The pot is hot.',
      'A cat is on top.',
      'The cat sat on the mat.',
      'A big dog sat on a log.',
      'The cat sat.',
      'The pig is big.',
    ],
  },
  {
    title: 'A Bug on a Rug',
    teaches: ['u'],
    words: 'bug rug mug hug up sun',
    tricky: 'my you',
    lines: [
      'A bug on a rug.',
      'I hug my pig.',
      'The bug is up.',
      'The sun is hot.',
      'The mug is on the rug.',
      'A bug sat in the sun.',
      'The bug sat on a rug.',
    ],
  },
  {
    title: 'A Hen in a Pen',
    teaches: ['e'],
    words: 'hen pen ten red bed net',
    tricky: 'was',
    lines: [
      'A hen in a pen.',
      'The hen is red.',
      'The hen was in the pen.',
      'A red hen sat on my bed.',
      'A big pig is in the pen.',
      'My red hen sat in a net.',
      'The hen is in the pen.',
    ],
  },
];
