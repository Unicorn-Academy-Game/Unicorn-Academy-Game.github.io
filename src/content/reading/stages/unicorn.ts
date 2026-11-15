import type { StageSource } from '../types';

/**
 * Unicorn Land, stages 80 to 85: words that are put together out of parts: the le ending, compound
 * words, and the longest words of the course. The tiles of every part are drawn with a gap before
 * the next one.
 */
export const UNICORN: readonly StageSource[] = [
  {
    title: 'Apple and Bubble',
    teaches: ['le'],
    words: 'ap|ple lit|tle bub|ble puz|zle ta|ble can|dle pur|ple tur|tle gig|gle=g.i.g|g.le wig|gle jun|gle sim|ple',
    tricky: 'castle',
    lines: [
      'I have a purple apple on the table, and Mom has a pink one.',
      'The turtle is little, but it can swim in the pond.',
      'The bubble can fly up, and then it will pop.',
      'The puzzle is simple, so I can do it with Dad.',
      'The castle has a big table, and the king sits at it.',
      'The turtle can wiggle in the jungle.',
      'A little candle is on the table.',
    ],
  },
  {
    title: 'Middle and Bottle',
    teaches: [],
    words: 'mid|dle bot|tle cud|dle un|cle cir|cle han|dle tick|le ankle=a.nk.le nee|dle noo|dle ket|tle bun|dle',
    lines: [
      'The puzzle is on the middle shelf, and the kettle is by the sink.',
      'My uncle has a purple bottle and a little cup.',
      'Mom will tickle me, and I giggle and giggle.',
      'Mom has a needle and a bundle of wool.',
      'Draw a circle, and then draw a star.',
      'My uncle can cuddle the little puppy.',
      'The kettle has a handle on the top.',
    ],
  },
  {
    title: 'Sunshine and Rainbow',
    teaches: [],
    words:
      'may|be sea|shell=s.ea|sh.e.ll rain|bow=r.ai.n|b.ow:oh sun|shine sun|set sun|light sun|flow|er rain|drop cup|cake pan|cake bed|time play|time bed|room bath|tub back|pack pop|corn',
    lines: [
      'The sunshine is warm, and the rainbow is big and bright.',
      'Dad made a big pancake for me, and Mom made a cupcake.',
      'We sat by the sea and found a seashell.',
      'Maybe we can eat popcorn at bedtime, and then we can go to bed.',
      'The sunset is pink, and the rainbow is bright.',
      'I put a seashell in my backpack.',
      'A raindrop fell on the sunflower.',
    ],
  },
  {
    title: 'Starfish and Moonlight',
    teaches: [],
    words:
      'star|fish moon|light snow|man=s.n.ow:oh|m.a.n snow|flake=s.n.ow:oh|f.l.a:ay.k.e:- bird|house=b.ir.d|h.ou.s.e:- gold|fish=g.o:oh.l.d|f.i.sh foot|ball=f.oo:uu.t|b.a:aw.ll air|plane in|side out|side bee|hive play|ground',
    tricky: 'together',
    lines: [
      'The sunflower is tall and the birdhouse is small.',
      'I put my backpack in my bedroom, and then I went to play outside.',
      'The snowman is cold, and it has a red scarf and a black hat.',
      'Let us go inside and play together, and then we can eat a pancake.',
      'The football is in the playground, and the girl is playing with it.',
      'The bee has a nice home in the beehive.',
      'The starfish is in the bathtub with the goldfish.',
    ],
  },
  {
    title: 'Rabbit and Robot',
    teaches: ['u:yoo'],
    words:
      'hel|lo ro|bot o|ver rab|bit kit|ten pump|kin nap|kin bas|ket pic|nic jack|et blank|et pup|pet rock|et chick|en lem|on',
    lines: [
      'Hello, little rabbit, I have a jacket.',
      'A kitten sat in a basket on the hill.',
      'The robot is over the hill and it is red.',
      'The rabbit has a jacket and a blanket.',
      'The puppet is in the basket by the rocket.',
      'The kitten sat on the pumpkin.',
      'We can have a picnic with a lemon cupcake.',
    ],
  },
  {
    title: 'Butterfly and Unicorn',
    teaches: [],
    words:
      'mel|on wag|on drag|on pre|tend re|mem|ber sand|wich straw|berr|y=s.t.r.aw|b.e.rr|y:ee yes|ter|day fam|i|ly=f.a.m|i|l.y:ee el|e|phant=e.l|e|ph.a.n.t di|no|saur=d.i:eye|n.o:oh|s.au.r um|brel|la=u.m|b.r.e.l|l.a mu|sic=m.u:yoo|s:z.i.c but|ter|fly=b.u.t|t.er|f.l.y:eye u|ni|corn=u:yoo|n.i|c.or.n',
    tricky: 'beautiful tomorrow',
    lines: [
      'The butterfly sat on the pumpkin, and the rabbit sat on the napkin.',
      'The rabbit is hiding under the umbrella, and the rain can not get it.',
      'A unicorn can fly over the rainbow, and then it can rest on a cloud.',
      'The robot said hello to the elephant.',
      'We sat on a blanket and ate a sandwich.',
      'The dinosaur is big, but the puppet is little.',
      'Remember to pack a jacket and a blanket, and put them in the wagon.',
      'I love music, and I can sing and dance with my sister.',
      'Do you remember the day we saw a beautiful butterfly on the sunflower?',
      'The unicorn has a rainbow. It is big and bright, and we love it.',
    ],
  },
];
