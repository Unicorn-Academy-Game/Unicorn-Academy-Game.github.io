import type { StageSource } from '../types';

/**
 * The Beach, stages 24 to 29: blends at the end, double letters, and ck. Only `nk` is a new tile,
 * since n and k said one after the other would not say the sound.
 */
export const BEACH: readonly StageSource[] = [
  {
    title: 'Hand in Sand',
    teaches: ['nk'],
    words: 'hand sand band land bend send pond tent went bent lamp camp',
    lines: [
      'The frog sat in the pond.',
      'Mom set the lamp on my bed.',
      'They went to camp.',
      'A band can drum and clap.',
      'A tent is on the sand.',
      'Dad can send a lamp to camp.',
      'The land is flat.',
    ],
  },
  {
    title: 'Damp and Jump',
    teaches: [],
    words: 'damp jump bump pump dump limp pink sink wink bank tank drink trunk',
    tricky: 'come want',
    lines: [
      'I want to jump in the sand.',
      'Can you jump and spin?',
      'Come and sit on the bank.',
      'The pink tent is on the sand.',
      'I can drink from my cup.',
      'Dad can pump it up.',
      'The pink tank is damp.',
      'I can wink and jump.',
    ],
  },
  {
    title: 'Bell on a Hill',
    teaches: ['ll', 'ss', 'ff', 'zz'],
    words: 'bell hill doll tell well fell sell fill spill still will mess',
    tricky: 'what where',
    lines: [
      'The bell is on the hill.',
      'I will tell you.',
      'Where is the doll?',
      'What a big mess!',
      'I will fill the tank.',
      'The doll fell in the sink.',
      'Dad will sell a pink doll.',
    ],
  },
  {
    title: 'Moss and Grass',
    teaches: [],
    words: 'miss kiss moss dress grass glass off puff buzz fizz fuzz stuff',
    lines: [
      'Mom has a pink dress.',
      'The bug can buzz.',
      'The grass is still wet.',
      'I can kiss my pup.',
      'Mom will fill the glass.',
      'The doll fell on the moss.',
      'The fizz is in the glass.',
    ],
  },
  {
    title: 'Duck and Clock',
    teaches: ['ck'],
    words: 'back deck lock duck neck sock pack rock tick luck pick black clock block brick truck stick',
    tricky: 'who here',
    lines: [
      'The duck sat on a rock.',
      'Come here and pick up the pack.',
      'Pick up the red sock.',
      'Who has the clock?',
      'Mom set a lock on the box.',
      'The black duck is on the deck.',
      'I can pack the truck.',
    ],
  },
  {
    title: 'Snack and Nest',
    teaches: [],
    words: 'snack nest best rest vest desk mask belt lift gift left soft help list dust fast last',
    tricky: 'one',
    lines: [
      'The black truck is fast.',
      'I have a gift in my pack.',
      'The duck can swim fast.',
      'Help Dad pick a stick.',
      'The best nest is on the rock.',
      'One duck is last.',
      'I can rest on the soft vest.',
    ],
  },
];
