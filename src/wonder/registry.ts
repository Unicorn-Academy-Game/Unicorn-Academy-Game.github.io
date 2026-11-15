import type { ScreenId } from '../content/wonders';
import { BalloonSong } from './games/balloon-song';
import { BubbleGarden } from './games/bubble-garden';
import { CloudBounce } from './games/cloud-bounce';
import { FinderFinale } from './games/finder-finale';
import { JewelFountain } from './games/jewel-fountain';
import { LilyHop } from './games/lily-hop';
import { ManorLift } from './games/manor-lift';
import { ManorWord } from './games/manor-word';
import { MorphMachine } from './games/morph-machine';
import { PartyTime } from './games/party-time';
import { RainbowRide } from './games/rainbow-ride';
import { SparkleSky } from './games/sparkle-sky';
import { StarCannon } from './games/star-cannon';
import { StatuePostcard } from './games/statue-postcard';
import { ToneMatrix } from './games/tone-matrix';
import { TreasureRain } from './games/treasure-rain';
import type { WonderEnv, WonderHandle, WonderMaker } from './wonder';

/** How to make the game of each toy. */
const MAKERS: Partial<Record<ScreenId, WonderMaker>> = {
  'sparkle-sky': (env) => new SparkleSky(env),
  'rainbow-ride': (env) => new RainbowRide(env),
  'cloud-bounce': (env) => new CloudBounce(env),
  'star-cannon': (env) => new StarCannon(env),
  'balloon-song': (env) => new BalloonSong(env),
  'bubble-garden': (env) => new BubbleGarden(env),
  'party-time': (env) => new PartyTime(env),
  'morph-machine': (env) => new MorphMachine(env),
  'jewel-fountain': (env) => new JewelFountain(env),
  'lily-hop': (env) => new LilyHop(env),
  'treasure-rain': (env) => new TreasureRain(env),
  'statue-postcard': (env) => new StatuePostcard(env),
  'manor-word': (env) => new ManorWord(env),
  'finder-finale': (env) => new FinderFinale(env),
  // The ride builds its own, with the hooks it waits on. This is the one the lab and the shell can
  // open to look at.
  'manor-lift': (env) => new ManorLift(env, env.look === 'down' ? 'down' : 'up'),
  'tone-matrix': (env) => new ToneMatrix(env),
};

/** Which games exist so far. */
export const builtWonders = (): ScreenId[] => Object.keys(MAKERS) as ScreenId[];

export function createWonder(id: ScreenId, env: WonderEnv): WonderHandle {
  const make = MAKERS[id];
  if (!make) throw new Error(`there is no game called ${id} yet`);
  return make(env);
}
