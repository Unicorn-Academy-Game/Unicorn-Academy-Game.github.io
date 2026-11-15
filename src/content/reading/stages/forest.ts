import type { StageSource } from '../types';

/**
 * The Forest, stages 30 to 35: letters that work together, which are one tile each because a child
 * is taught sh as one sound. The voiced th of this, that and them is not a tile with a clip of its
 * own, so those words are tricky words spelled by name.
 */
export const FOREST: readonly StageSource[] = [
  {
    title: 'Ship and Shop',
    teaches: ['sh'],
    words: 'ship shop shed shin shut shell shelf shrub shrimp fish dish',
    tricky: 'put',
    lines: [
      'The ship is red and black.',
      'Mom will shop and get a dish.',
      'Put the shell in the dish.',
      'The shed is on the hill.',
      'Dad has a shrub in the sun.',
      'I can shut the shed.',
      'A shrimp is in the dish.',
    ],
  },
  {
    title: 'Wish and Brush',
    teaches: [],
    words: 'wish cash dash rush hush lush brush flash splash fresh slush',
    tricky: 'push',
    lines: [
      'I wish I had a pet fish.',
      'The fish can splash in the pond, and I can swim.',
      'I can brush the pup, and Dad can brush the hen.',
      'Hush, the pup is in bed.',
      'The fresh fish is in the dish.',
      'I can dash to the shop.',
      'The grass is lush and fresh.',
    ],
  },
  {
    title: 'Chip and Chat',
    teaches: ['ch', 'tch', 'dge'],
    words: 'chip chop chin chat much such rich lunch bench chest chick check munch pinch chimp catch',
    lines: [
      'The chick sat on the bench.',
      'I can catch a fish, and Dad can catch one.',
      'Mom will pack my lunch.',
      'The chimp can chat and munch.',
      'Dad can chop the stick.',
      'A rich chimp sat on the bench.',
      'The chick sat on my chin.',
    ],
  },
  {
    title: 'Patch and Ditch',
    teaches: [],
    words: 'patch ditch fetch hutch badge edge bridge fudge ridge hedge',
    tricky: 'very any',
    lines: [
      'The bridge is on the ridge.',
      'Dad can fetch the chest, and I can check the hutch.',
      'Dad can check the hutch.',
      'A very big hedge is on the hill.',
      'Mom has fudge in a dish.',
      'Do you have any fudge?',
      'The hedge is on the ridge.',
    ],
  },
  {
    title: 'Thin and Thick',
    teaches: ['th', 'wh'],
    words: 'thin thick thank think thump math bath path moth',
    tricky: 'this that them then',
    lines: [
      'This is a thick path, and that is a thin path.',
      'I will thank them, and then I will help them.',
      'Then I can jump in the bath.',
      'Do you think that is a moth?',
      'What was that thump?',
      'I think the moth is on the bath.',
      'Thank them, and then sit on the bench.',
    ],
  },
  {
    title: 'Cloth and Thrill',
    teaches: [],
    words: 'cloth thrill tenth sixth when which whiz whisk',
    tricky: 'with',
    lines: [
      'That moth is on the cloth.',
      'When is my bath?',
      'Mom set the whisk with the dish.',
      'Which path is thick?',
      'I think this cloth is thin.',
      'I can whisk the fudge with Mom.',
      'Which is the sixth bell?',
    ],
  },
];
