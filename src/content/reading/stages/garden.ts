import type { StageSource } from '../types';

/**
 * The Garden, stages 50 to 55: more long vowels: oa and ow, igh, and a vowel at the end of a word,
 * which says its name, as in go, me and baby.
 */
export const GARDEN: readonly StageSource[] = [
  {
    title: 'Boat and Goat',
    teaches: ['oa', 'ow:oh', 'o:oh'],
    words: 'boat coat goat road soap toad float toast snow grow show slow blow low flow yel|low',
    tricky: 'because',
    lines: [
      'The boat can float on the lake.',
      'Mom will make toast and jam, and we can eat it.',
      'I will grow a big yellow rose.',
      'I like the boat because it can float.',
      'The toad sat on the road.',
      'I need a coat in the snow.',
      'Dad can show me the yellow boat.',
    ],
  },
  {
    title: 'Window and Pillow',
    teaches: [],
    words:
      'win|dow pil|low go no so old=o:oh.l.d cold=c.o:oh.l.d gold=g.o:oh.l.d hold=h.o:oh.l.d told=t.o:oh.l.d fold=f.o:oh.l.d',
    tricky: 'other',
    lines: [
      'The old goat is cold.',
      'I told Mom the snow is cold.',
      'Hold on to the gold boat.',
      'I can go in the snow, and I can show you the goat.',
      'She can show me the pillow.',
      'The window is wet from the rain.',
      'The old man told me no.',
    ],
  },
  {
    title: 'Night Light',
    teaches: ['igh', 'i:eye'],
    words: 'light night right sight tight high bright flight',
    tricky: 'mother father',
    lines: [
      'The night is long and the light is bright.',
      'I can see the light in the night, and it is so bright.',
      'The kite is high and the string is tight.',
      'A flight can be long, but the light is bright.',
      'My father is in the home, and my mother is at the lake.',
      'The light is bright at night.',
      'The light is on the high shelf.',
    ],
  },
  {
    title: 'Find and Kind',
    teaches: [],
    words:
      'knight find=f.i:eye.n.d kind=k.i:eye.n.d mind=m.i:eye.n.d be|hind=b.e:ee|h.i:eye.n.d child=ch.i:eye.l.d wild=w.i:eye.l.d mild=m.i:eye.l.d',
    lines: [
      'The kind knight can find the child.',
      'Do you mind if I sit behind you?',
      'A wild goat is on the hill, and the knight can see it.',
      'The child is kind to the pup.',
      'He is right behind me.',
      'The knight is kind and mild.',
      'I can find the child behind the tree.',
    ],
  },
  {
    title: 'Sky and Fly',
    teaches: ['y:ee', 'y:eye', 'ie', 'pp', 'nn', 'dd', 'rr', 'tt', 'mm', 'gg', 'bb'],
    words: 'by fly try sky cry dry why shy happ|y pupp|y bunn|y',
    tricky: 'brother two',
    lines: [
      'I can fly a kite in the sky.',
      'The bunny is shy but the puppy is not.',
      'My brother can fly the kite, and I can fly it.',
      'One plus one is two.',
      'Why is the puppy shy?',
      'The sun can dry the wet coat.',
      'A happy bunny can fly a kite.',
    ],
  },
  {
    title: 'Funny and Sunny',
    teaches: [],
    words: 'funn|y sunn|y mudd|y berr|y=b.e.rr|y:ee jell|y ba|by la|dy can|dy pie tie',
    lines: [
      'My puppy is happy and funny, and it can run and jump.',
      'The baby can smile and wave, and the lady can smile.',
      'Try the jelly and the berry pie.',
      'A muddy puppy is a happy puppy.',
      'The lady has candy in a dish.',
      'It is a sunny day, and the sky is not gray.',
      'The baby has a funny tie.',
    ],
  },
];
