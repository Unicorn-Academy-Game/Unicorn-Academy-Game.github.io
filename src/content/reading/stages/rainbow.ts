import type { StageSource } from '../types';

/**
 * The Rainbow, stages 72 to 79: the soft c and g, and the endings that are added to a word. The
 * tiles of a word with an ending are drawn with a gap before the ending (jump ing), so a long word
 * is read in pieces the player knows.
 */
export const RAINBOW: readonly StageSource[] = [
  {
    title: 'Ice and Mice',
    teaches: ['c:s', 'g:j'],
    words: 'ice nice rice mice price face race lace place space dance=d.a.n.c:s.e:- cit|y fan|cy',
    tricky: 'every',
    lines: [
      'I can see my face in the lake when the sun is out.',
      'We can dance in the city, and then we can go to the park.',
      'The girl has a fancy dress and a big hat.',
      'Every day I look at the moon, and I make a wish.',
      'The mice can race to the rice.',
      'I can see ice on the lake.',
      'She has a nice lace dress.',
    ],
  },
  {
    title: 'Pencil and Princess',
    teaches: [],
    words:
      'voice=v.oi.c:s.e:- gem=g:j.e.m age=a:ay.g:j.e:- page=p.a:ay.g:j.e:- cage=c.a:ay.g:j.e:- pen|cil prin|cess stage=s.t.a:ay.g:j.e:- huge=h.u:yoo.g:j.e:- large=l.ar.g:j.e:- change=ch.a:ay.n.g:j.e:- gi|ant=g:j.i:eye|a.n.t mag|ic=m.a.g:j|i.c',
    lines: [
      'The princess has a nice place by the lake.',
      'Your voice is nice and soft, so we can sing a song.',
      'The big gem is in a cage on the stage.',
      'Turn the page and you will see a huge gem.',
      'The giant can not fit in the large house, so he can sit on the grass.',
      'I will change my shirt, and then we can go.',
      'The princess has a magic pencil.',
    ],
  },
  {
    title: 'Cats and Dogs',
    teaches: [],
    words:
      'cat|s hat|s bag|s=b.a.g|s:z pig|s=p.i.g|s:z dog|s=d.o.g|s:z hen|s=h.e.n|s:z egg|s=e.gg|s:z frog|s=f.r.o.g|s:z duck|s cup|s top|s star|s=s.t.ar|s:z tree|s=t.r.ee|s:z leg|s=l.e.g|s:z box|es=b.o.x|e.s:z',
    tricky: 'says',
    lines: [
      'The pigs sit in the mud, and the hens sit in the sun.',
      'The fox says that the eggs are his, but the hens say no.',
      'I see three stars and a big moon.',
      'The boxes are on the top shelf, and the cups are in the sink.',
      'The ducks swim and the frogs hop.',
      'I see five hens and six ducks.',
      'The hens have eggs in the boxes.',
    ],
  },
  {
    title: 'Foxes and Dishes',
    teaches: [],
    words:
      'fox|es=f.o.x|e.s:z dish|es=d.i.sh|e.s:z wish|es=w.i.sh|e.s:z bus|es=b.u.s|e.s:z peach|es=p.ea.ch|e.s:z beach|es=b.ea.ch|e.s:z run|s=r.u.n|s:z hop|s sit|s jump|s play|s=p.l.ay|s:z sing|s=s.i.ng|s:z eat|s',
    tricky: 'goes',
    lines: [
      'The cat sits on the mat and the dog runs.',
      'Two hens sit on the eggs, and the fox sits by the trees.',
      'Mom has two dishes and a cup on the top shelf.',
      'She wishes for a pink bag, and he wishes for a red hat.',
      'He goes to the beach and sits in the sun.',
      'The cat jumps on the beach and eats a peach.',
      'The bird sings and the pup plays.',
    ],
  },
  {
    title: 'Jumped and Helped',
    teaches: ['ed:t', 'ed:d'],
    words:
      'jump|ed=j.u.m.p|ed:t help|ed=h.e.l.p|ed:t ask|ed=a.s.k|ed:t pick|ed=p.i.ck|ed:t kick|ed=k.i.ck|ed:t pack|ed=p.a.ck|ed:t hopp|ed=h.o.pp|ed:t stopp|ed=s.t.o.pp|ed:t clapp|ed=c.l.a.pp|ed:t fix|ed=f.i.x|ed:t look|ed=l.oo:uu.k|ed:t play|ed=p.l.ay|ed:d',
    lines: [
      'The frog jumped in the pond, and the ducks swam away.',
      'I asked Dad to help me, and he picked me up.',
      'Mom picked the peach from the tree and put it in the bag.',
      'We played in the sand all day, and then we went home.',
      'The boy kicked the ball up to the roof, and it fell on the grass.',
      'The cat hopped on the box and sat down.',
      'Dad packed the car and we went to the beach.',
    ],
  },
  {
    title: 'Rained and Filled',
    teaches: [],
    words:
      'rain|ed=r.ai.n|ed:d fill|ed=f.i.ll|ed:d call|ed=c.a:aw.ll|ed:d clean|ed=c.l.ea.n|ed:d paint|ed=p.ai.n.t|e.d plant|ed=p.l.a.n.t|e.d lift|ed=l.i.f.t|e.d wait|ed=w.ai.t|e.d need|ed=n.ee.d|e.d land|ed=l.a.n.d|e.d melt|ed=m.e.l.t|e.d rest|ed=r.e.s.t|e.d',
    tricky: 'laugh walked',
    lines: [
      'The king waited for the queen, and then they ate a cake.',
      'I needed a hug, so Mom gave me one.',
      'We can laugh and play in the sun.',
      'Dad planted a seed, and it grew and grew.',
      'It rained all day, and we sat in.',
      'Mom called me, and I ran to her.',
      'The snow melted and the sun came out.',
      'Dad cleaned the car and painted the door.',
    ],
  },
  {
    title: 'Jumping and Playing',
    teaches: ['ing'],
    prefer: { oo: 'uu' },
    words:
      'jump|ing play|ing sing|ing help|ing eat|ing fish|ing splash|ing paint|ing wait|ing look|ing go|ing runn|ing swimm|ing',
    lines: [
      'The frog is jumping in the pond, and the ducks are swimming.',
      'The girl is playing in the park, and the dog is running with her.',
      'The sun is up, and we are going out to play.',
      'I am waiting for Dad at the store.',
      'We are eating peaches and splashing in the pool.',
      'We are fishing at the lake, and the sun is up.',
      'The pup is looking at the cat, and the cat is running.',
    ],
  },
  {
    title: 'Hopping and Sitting',
    teaches: [],
    prefer: { oo: 'uu' },
    words:
      'hopp|ing sitt|ing digg|ing stopp|ing clapp|ing mak|ing=m.a:ay.k|ing bak|ing=b.a:ay.k|ing rid|ing=r.i:eye.d|ing hid|ing=h.i:eye.d|ing smil|ing=s.m.i:eye.l|ing tak|ing=t.a:ay.k|ing wav|ing=w.a:ay.v|ing skat|ing=s.k.a:ay.t|ing',
    lines: [
      'The cat is sitting on the mat, and the pup is digging in the dirt.',
      'Dad is baking a cake for my party.',
      'The pup is running and digging in the dirt.',
      'The bunny is hiding by the tree, and the bird is singing.',
      'We are riding on a bus, and I am waving.',
      'The girl is skating on the lake, and the boy is waving.',
      'Mom is making a cake, and I am helping.',
    ],
  },
];
