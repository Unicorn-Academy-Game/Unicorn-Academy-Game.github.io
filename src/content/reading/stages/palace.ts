import type { StageSource } from '../types';

/**
 * The Palace, stages 42 to 49: the long vowels, which say their own names. A silent e makes a vowel
 * long and is drawn joined to it, and two letters can make one long vowel. Words that need a sound
 * other than the usual one for a tile have it written out.
 */
export const PALACE: readonly StageSource[] = [
  {
    title: 'Cake by the Lake',
    teaches: ['a_e', 'i_e'],
    words: 'make made gave cake lake bake name game came take late wave cave plate ate safe',
    lines: [
      'I can make a cake, and then I can take it to Mom.',
      'Mom made a big cake.',
      'The pup came to the lake, and the kid gave it a hug.',
      'Dad will bake a cake in the pan.',
      'I ate the cake on a plate.',
      'Mom came late to the game.',
      'The pup came to the cave.',
      'Dad can take the plate to Mom.',
    ],
  },
  {
    title: 'Skate and Bike',
    teaches: [],
    words: 'same shape skate brave bike like time five hide ride slide smile kite white drive line',
    tricky: 'many give',
    lines: [
      'A kid can skate on the lake, and I can ride my bike.',
      'Wave at the king and smile.',
      'The brave pup ran to the cave.',
      'I like to ride my bike.',
      'The white kite is on the hill, and the pup ran up.',
      'It is time to drive to the lake.',
      'I like to ride my bike in the sun.',
      'The brave cat can hide in the cave.',
    ],
  },
  {
    title: 'Rose and Rope',
    teaches: ['o_e', 'u_e', 's:z'],
    words: 'home bone nose=n.o:oh.s:z.e:- rose=r.o:oh.s:z.e:- hole note rope stone joke phone hope',
    tricky: 'love',
    lines: [
      'The bone is in the hole, and the pup can not get it.',
      'A rose is on the stone, and a note is on the rose.',
      'Dad can tell a joke.',
      'Give the note to Mom.',
      'I love my home and my mom.',
      'I hope the bone is in the hole.',
      'Mom has a phone and a rose.',
    ],
  },
  {
    title: 'Cube and Cone',
    teaches: [],
    words:
      'vote cone dome cube cute mule tube=t.u:oo.b.e:- rule=r.u:oo.l.e:- flute=f.l.u:oo.t.e:- tune=t.u:oo.n.e:- dune=d.u:oo.n.e:-',
    tricky: 'done',
    lines: [
      'I hope to get a pet mule.',
      'Dad can tune the flute.',
      'The cute pup has a rope, and it can run and hop.',
      'I have a cube and a cone.',
      'Is the cake done yet?',
      'The cute mule can hum a tune.',
      'I can ride a mule on the dune.',
    ],
  },
  {
    title: 'Rain and Snail',
    teaches: ['ai', 'ay', 'a:ay'],
    words: 'rain tail mail nail train paint snail wait chain brain pail sail',
    tricky: 'gone once',
    lines: [
      'Mom will paint a big pail, and I can help Mom.',
      'Wait and get the mail, and then run back to Dad.',
      'My brain can think and think.',
      'The rain is gone and the sun is up.',
      'Once I was in the rain and I was wet.',
      'The snail has a long tail.',
      'Wait on the bank in the rain.',
    ],
  },
  {
    title: 'Day and Play',
    teaches: [],
    words: 'day play stay say way gray tray spray pay hay clay a|way',
    lines: [
      'The train is on the way, and I can wave at it.',
      'I can play in the rain, and then I can nap.',
      'A snail sat on a gray tray.',
      'I can stay and play in the hay.',
      'Can you say the name of the train?',
      'I can play with the clay.',
      'The gray pup ran away.',
    ],
  },
  {
    title: 'Tree and Bee',
    teaches: ['ee', 'ea', 'e:ee'],
    words: 'see tree bee feet green sleep seed week keep three sheep queen deep need free eat sea',
    tricky: 'their',
    lines: [
      'I see a big tree in the sun, and a bee on it.',
      'The sheep can sleep on the hay, and the hen can sleep.',
      'The queen has a green dress, and the king has a green hat.',
      'Their dog can swim in the sea.',
      'The queen can see three sheep.',
      'I need to keep the seed.',
      'The bee is on the green tree.',
    ],
  },
  {
    title: 'Team and Leaf',
    teaches: [],
    words: 'team leaf beach bean dream clean cream seat peach speak he she we me be',
    tricky: 'people',
    lines: [
      'We can eat a peach at the beach.',
      'She will keep the seed in the pot.',
      'I need a clean seat, and he can keep the seat.',
      'We dream of a big cream cake.',
      'She can make me a cake.',
      'The people are on the beach.',
      'We can be a team.',
    ],
  },
];
