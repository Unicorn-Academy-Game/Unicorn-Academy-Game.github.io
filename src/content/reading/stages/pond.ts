import type { StageSource } from '../types';

/**
 * The Pond, stages 18 to 23: words with consonants side by side, which are harder to blend than the
 * short words of the Meadow although every tile is a letter the player knows. Blends at the start
 * (s, l, r).
 */
export const POND: readonly StageSource[] = [
  {
    title: 'Stop and Spin',
    teaches: [],
    words: 'stop step stem spin spot snap snug slug slip slid sled',
    tricky: 'his do',
    lines: [
      'The slug sat on a stem.',
      'The sled slid to a stop.',
      'Do not step in the mud.',
      'Dad is snug in his bed.',
      'The sled can not stop.',
      'I can spin and not slip.',
      'A slug sat on his sled.',
    ],
  },
  {
    title: 'Slim and Swim',
    teaches: [],
    words: 'slim swim swam skip skin skid scan spun slot',
    lines: [
      'I can swim and skip.',
      'The pup swam in the tub.',
      'A pig can swim.',
      'The kid can skip and spin.',
      'Can you scan the map?',
      'His pup spun on the rug.',
      'The slim pig can swim.',
    ],
  },
  {
    title: 'Clap and Flag',
    teaches: [],
    words: 'clap clip club clam flag flap flat flip flop',
    lines: [
      'I can clap and flip.',
      'The flag is flat on the rug.',
      'A pup can flop in the mud.',
      'The flag can flap in the sun.',
      'His club has a flag.',
      'I can clip a flag on a hat.',
      'A clam is in the mud.',
    ],
  },
  {
    title: 'Glad and Glum',
    teaches: [],
    words: 'glad glum plan plug plum plot plus blob clop plant blend',
    tricky: 'from some',
    lines: [
      'Mom got a plum from the box.',
      'The plan is to plant a plum.',
      'I am glad and Mom is glad.',
      'Dad can plug it in.',
      'I can plug the tub.',
      'The blob is in the mud.',
      'Some plum is on my lip.',
    ],
  },
  {
    title: 'Frog and Drum',
    teaches: [],
    words: 'crab crib crop drip drop drum frog grab grin grip',
    lines: [
      'Mom has a drum.',
      'The crab can grab a plum.',
      'The drip is from the tap.',
      'I can grin and clap.',
      'Drop the plum in the box.',
      'A frog can grab a bug.',
      'I can drop the drum.',
    ],
  },
  {
    title: 'Trim and Trip',
    teaches: [],
    words: 'grub prop trim trip trot brim tram grid drift print',
    tricky: 'were there',
    lines: [
      'The frog can hop and trot.',
      'There is a frog on a log.',
      'They were in the tram.',
      'The grub sat on the crop.',
      'A grub sat on the brim of the hat.',
      'I can trim the hat.',
      'The pup can trot on the grid.',
    ],
  },
];
