import type { StageSource } from '../types';

/**
 * The Farm, stages 12 to 17: the short u and e, and then all five vowels mixed. Still one tile per
 * letter, and still short words.
 */
export const FARM: readonly StageSource[] = [
  {
    title: 'Run and Bun',
    teaches: ['u'],
    words: 'run bun cup mud jug fun gum hut',
    lines: [
      'I can run in the sun.',
      'Dad got a bun.',
      'It was fun!',
      'The cup was on the rug.',
      'A cup is in the hut.',
      'Mom had a bun in the sun.',
      'I can run to the hut.',
      'A hog sat in the mud.',
    ],
  },
  {
    title: 'Nut and Bus',
    teaches: [],
    words: 'nut cut bus us but tub pup hum',
    tricky: 'said',
    lines: [
      'The pup is in the mud.',
      'Mom said I can run.',
      'Can I hug the pup?',
      'Dad said it is fun.',
      'The pup was in my tub.',
      'The bus is not in the mud.',
      'The pup can run to the bus.',
      'Mom said the pup is in the tub.',
    ],
  },
  {
    title: 'Men and Jet',
    teaches: ['e'],
    words: 'men leg peg wet jet get yes',
    tricky: 'have',
    lines: [
      'Ten men got in a jet.',
      'I have a red net.',
      'Yes, you can get it.',
      'I have a red peg.',
      'The men have a jet.',
      'I have a wet leg.',
      'Yes, the bus is wet.',
    ],
  },
  {
    title: 'Vet and Pet',
    teaches: [],
    words: 'vet set web fed pet let den',
    tricky: 'are',
    lines: [
      'The pet is wet.',
      'Dad fed the hen.',
      'Mom set the bed.',
      'Are you in the van?',
      'My pet can run to the vet.',
      'The vet can pet the pup.',
      'A web is in the den.',
      'Are the men in the den?',
    ],
  },
  {
    title: 'Ram and Ham',
    teaches: [],
    words: 'pad pat tag wag ram ham yam gap lap bib jig fig',
    tricky: 'they',
    lines: [
      'Dad had ham and jam.',
      'They sat in the sun.',
      'Mom got a fig and a yam.',
      'They had a jig on the rug.',
      'The pup can wag.',
      'I pat the pup on my lap.',
      'The ram sat in the mud.',
    ],
  },
  {
    title: 'Ox and Cub',
    teaches: [],
    words: 'dim pod rod ox dug tug cub bud yet elf end ask ant',
    tricky: 'has',
    lines: [
      'The pup dug in the mud.',
      'I can tug the rug.',
      'Is the ant in the pod?',
      'A cub sat in the mud.',
      'The bud is not wet yet.',
      'The elf has a bib.',
      'I ask the elf to get a rod.',
    ],
  },
];
