import type { StageSource } from '../types';

/**
 * The Treehouse, stages 36 to 41: ng, qu, kn, wr and the longest short-vowel words, which are read
 * in more pieces.
 */
export const TREEHOUSE: readonly StageSource[] = [
  {
    title: 'King Sing',
    teaches: ['ng'],
    words: 'ring sing king wing long song rang',
    tricky: 'could would',
    lines: [
      'The bell rang on the hill.',
      'I could sing this song.',
      'Would you sing a long song?',
      'A bug sat on a wing.',
      'The king could sing a long song.',
      'I would sing to the king.',
      'A ring is on the wing.',
    ],
  },
  {
    title: 'Sang and Swing',
    teaches: [],
    words: 'sang swing spring string thing strong bring gong',
    lines: [
      'The king can sing a song, and the gong can ring.',
      'The swing is long and strong, and the king can swing.',
      'Bring the ring to the king.',
      'The gong rang and the king sang.',
      'The thing has a string and a ring.',
      'The king sang a song on the swing.',
      'I can bring the string.',
    ],
  },
  {
    title: 'Quick Quiz',
    teaches: ['qu', 'kn', 'wr'],
    words: 'quiz quick quack quilt quit squid squish',
    tricky: 'should been',
    lines: [
      'The duck can quack, and the squid can swim fast.',
      'I think the quiz is not long.',
      'The squid can swim fast.',
      'I should not quit.',
      'I have been on a quick trip.',
      'The quick duck can quack.',
      'I should quit the quiz.',
    ],
  },
  {
    title: 'Knit and Knot',
    teaches: [],
    words: 'knit knot knob knock wrap wren wrist',
    lines: [
      'Mom will knit a quilt, and Dad will knit a hat.',
      'The wren sat on the knob.',
      'Quick, wrap the gift!',
      'Dad can knit a hat.',
      'Knock on the shed.',
      'Mom can wrap the gift.',
      'I can knock on the knob.',
    ],
  },
  {
    title: 'Champ and Chomp',
    teaches: ['ph'],
    words: 'champ chomp shrug bunch brunch branch ranch shack',
    tricky: 'again',
    lines: [
      'Mom set a bunch on the bench.',
      'The ranch is on the hill, and the shack is red.',
      'Can I sit in the shack again?',
      'I can chomp a bunch at brunch.',
      'The champ sat on a branch.',
      'The shack is on the ranch.',
      'Mom will shrug and sit again.',
    ],
  },
  {
    title: 'Switch and Stitch',
    teaches: [],
    words: 'shift clutch scratch stretch switch sketch stitch graph dolphin',
    tricky: 'friend',
    lines: [
      'The chimp sat on a branch, and the dolphin can splash.',
      'A dolphin can swim and splash.',
      'My friend can sketch a dolphin.',
      'I can stretch and shrug.',
      'The champ can switch and run.',
      'This graph is long and thin.',
      'Mom will stitch the quilt.',
    ],
  },
];
