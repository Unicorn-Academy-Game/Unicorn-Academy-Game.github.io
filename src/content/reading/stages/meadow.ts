import type { StageSource } from '../types';

/**
 * The Meadow, stages 6 to 11: the short vowels in short words, with the words of Tiny Tales already
 * known. Every consonant is known from the start, so a stage adds words and no new tiles.
 */
export const MEADOW: readonly StageSource[] = [
  {
    title: 'Bat and Rat',
    teaches: ['a'],
    words: 'bat rat man can fan pan ran van dad had sad bag',
    tricky: 'to',
    lines: [
      'A man ran.',
      'Dad had a hat.',
      'Dad ran to the van.',
      'The man had a bag.',
      'I can dig.',
      'Dad is in the van.',
      'You can sit in it.',
    ],
  },
  {
    title: 'Map and Tap',
    teaches: [],
    words: 'map tap cap nap jam and at am an',
    lines: [
      'I can tap the pan.',
      'The cat can nap.',
      'The sad cat sat and sat.',
      'A cat and a rat sat.',
      'Dad had a cap and a map.',
      'I am at the map.',
      'A man can tap a pan.',
    ],
  },
  {
    title: 'Tip and Pin',
    teaches: ['i'],
    words: 'tip pin win fin did lid lip',
    lines: [
      'A pin is in the bag.',
      'Did the pig win?',
      'Dad did sit in the van.',
      'I did win!',
      'The lid is on the pan.',
      'The cat can tip the pan.',
      'Dad did tip the lid.',
    ],
  },
  {
    title: 'Zip and Sip',
    teaches: [],
    words: 'zip sip fit kit six mix fix if him dip rib bin',
    lines: [
      'The kid can zip it.',
      'Can you fix a wig?',
      'The cat sat in a bin.',
      'The kit is in the bin.',
      'Dad can mix six in a pan.',
      'I can dip a rib in it.',
      'I can fix it if Dad can.',
    ],
  },
  {
    title: 'Mop and Fox',
    teaches: ['o'],
    words: 'mop hop box fox job nod got fog',
    lines: [
      'A fox is on the log.',
      'I got a pot.',
      'The dog sat on my mop.',
      'My dog can hop on a log.',
      'The fox got a rib.',
      'I got a mop and a box.',
      'A fox can hop in the fog.',
    ],
  },
  {
    title: 'Jog and Hog',
    teaches: [],
    words: 'jog lot not mom dot hog pop cot',
    tricky: 'of',
    lines: [
      'Mom can hop on top.',
      'Can you jog to the box?',
      'I did not nod.',
      'Dad got a lot of jam.',
      'Mom is on top of the box.',
      'A hog is not on the cot.',
      'Mom can jog a lot.',
    ],
  },
];
