import { LIFE } from '../../../../src/content/life';
import type { LifeKind } from '../../../../src/shared/life';
import type { ShadowSpec } from '../../../../src/shared/manifest';
import type { Rgba } from '../../../art/core/image';
import { BIRD, BIRD_LOOKS, renderBird } from '../../../art/world/birds';
import {
  BUNNY,
  BUNNY_LOOKS,
  DUCK,
  DUCK_LOOKS,
  FISH,
  FISH_LOOKS,
  FISH_SWIM,
  type FishName,
  FROG,
  FROG_LOOKS,
  LADYBUG,
  LADYBUG_LOOKS,
  renderBunny,
  renderDuck,
  renderFish,
  renderFishShade,
  renderFrog,
  renderLadybug,
  renderSnail,
  SNAIL,
  SNAIL_LOOKS,
} from '../../../art/world/critters';
import {
  BEE,
  BUTTERFLY,
  BUTTERFLY_LOOKS,
  DRAGONFLY,
  DRAGONFLY_LOOKS,
  FAIRY,
  FAIRY_LOOKS,
  renderBee,
  renderButterfly,
  renderDragonfly,
  renderFairy,
} from '../../../art/world/winged';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/life.ts',
  '../src/content/life.ts',
  'art/world/birds.ts',
  'art/world/critters.ts',
  'art/world/winged.ts',
  'art/world/critter-kit.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
  'art/core/raster.ts',
  'art/core/mesh.ts',
  'art/core/color.ts',
  'art/core/image.ts',
  'art/core/vec.ts',
];

/**
 * The soft pool of shade a creature leaves on the ground: wide for the ones that sit, small and
 * pale for the ones that fly.
 */
const ground = (rx: number, ry: number, a = 0.3): ShadowSpec => ({ rx, ry, dx: 0, dy: 2, a });

interface Clip<Look extends string> {
  /** The sprite id is `${kind}-${look}-${clip}`. */
  clip: string;
  frames: number;
  fps: number;
  loop: boolean;
  draw: (look: Look, frame: number) => Rgba;
}

/**
 * Every look of one kind of creature, with a recipe for each of its clips. The looks come from the
 * game's content, and the art has to paint exactly those, so a colour added in one place and not
 * the other stops the build.
 */
function kind<Look extends string>(
  id: LifeKind,
  canvas: Recipe['canvas'],
  palette: Readonly<Record<Look, unknown>>,
  clips: readonly Clip<Look>[],
  shadow: ShadowSpec | undefined,
): Recipe[] {
  const looks = LIFE[id].looks;
  const painted = Object.keys(palette).sort().join(',');
  if ([...looks].sort().join(',') !== painted)
    throw new Error(`${id}: the content has looks ${[...looks].sort().join(',')} but the art paints ${painted}`);
  return looks.flatMap((look) =>
    clips.map(
      (c): Recipe => ({
        id: `${id}-${look}-${c.clip}`,
        bundle: 'life',
        canvas,
        ...(c.frames > 1 ? { anim: { frames: c.frames, fps: c.fps, loop: c.loop } } : {}),
        render: (frame) => c.draw(look as Look, frame),
        source: SRC,
        ...(shadow ? { shadow } : {}),
      }),
    ),
  );
}

/**
 * Everyone who lives in the world: birds, frogs, ducks, rabbits, snails, ladybirds, fish,
 * butterflies, dragonflies, bees and fairies. Each look is its own set of sprites so a creature
 * never changes colour, and every one faces east, which the game mirrors for west. They share one
 * bundle that loads with the unicorns.
 */
export const LIFE_RECIPES: Recipe[] = [
  ...kind(
    'bird',
    BIRD.canvas,
    BIRD_LOOKS,
    [
      { clip: 'idle', frames: BIRD.idleFrames, fps: 1.6, loop: true, draw: (l, f) => renderBird(l, 'idle', f) },
      { clip: 'peck', frames: BIRD.peckFrames, fps: 6, loop: true, draw: (l, f) => renderBird(l, 'peck', f) },
      { clip: 'fly', frames: BIRD.flyFrames, fps: 12, loop: true, draw: (l, f) => renderBird(l, 'fly', f) },
    ],
    ground(15, 5),
  ),
  ...kind(
    'frog',
    FROG.canvas,
    FROG_LOOKS,
    [
      { clip: 'sit', frames: FROG.sitFrames, fps: 3, loop: true, draw: (l, f) => renderFrog(l, 'sit', f) },
      { clip: 'crouch', frames: 1, fps: 1, loop: false, draw: (l) => renderFrog(l, 'crouch', 0) },
      { clip: 'air', frames: 1, fps: 1, loop: false, draw: (l) => renderFrog(l, 'air', 0) },
    ],
    ground(19, 6),
  ),
  ...kind(
    'duck',
    DUCK.canvas,
    DUCK_LOOKS,
    [
      { clip: 'float', frames: DUCK.floatFrames, fps: 2, loop: true, draw: (l, f) => renderDuck(l, 'float', f) },
      { clip: 'quack', frames: 1, fps: 1, loop: false, draw: (l) => renderDuck(l, 'quack', 0) },
    ],
    undefined,
  ),
  ...kind(
    'bunny',
    BUNNY.canvas,
    BUNNY_LOOKS,
    [
      { clip: 'sit', frames: BUNNY.sitFrames, fps: 2, loop: true, draw: (l, f) => renderBunny(l, 'sit', f) },
      { clip: 'hop', frames: 1, fps: 1, loop: false, draw: (l) => renderBunny(l, 'hop', 0) },
    ],
    ground(19, 6),
  ),
  ...kind(
    'snail',
    SNAIL.canvas,
    SNAIL_LOOKS,
    [{ clip: 'crawl', frames: SNAIL.crawlFrames, fps: 2, loop: true, draw: (l, f) => renderSnail(l, f) }],
    ground(15, 4),
  ),
  ...kind(
    'ladybug',
    LADYBUG.canvas,
    LADYBUG_LOOKS,
    [
      { clip: 'walk', frames: LADYBUG.walkFrames, fps: 8, loop: true, draw: (l, f) => renderLadybug(l, 'walk', f) },
      { clip: 'fly', frames: LADYBUG.flyFrames, fps: 20, loop: true, draw: (l, f) => renderLadybug(l, 'fly', f) },
    ],
    ground(10, 3, 0.26),
  ),
  ...kind(
    'fish',
    FISH.canvas,
    FISH_LOOKS,
    [{ clip: 'leap', frames: FISH.leapFrames, fps: 4, loop: false, draw: (l, f) => renderFish(l, 'leap', f) }],
    undefined,
  ),
  // Under the water they swim as a flat picture of themselves, on a canvas of their own, and only
  // rise when they leap.
  ...LIFE.fish.looks.map(
    (look): Recipe => ({
      id: `fish-${look}-swim`,
      bundle: 'life',
      canvas: FISH_SWIM.canvas,
      anim: { frames: FISH_SWIM.frames, fps: 3, loop: true },
      render: (frame) => renderFishShade(look as FishName, frame),
      source: SRC,
    }),
  ),
  ...kind(
    'butterfly',
    BUTTERFLY.canvas,
    BUTTERFLY_LOOKS,
    [{ clip: 'flutter', frames: BUTTERFLY.frames, fps: 10, loop: true, draw: (l, f) => renderButterfly(l, f) }],
    ground(11, 4, 0.22),
  ),
  ...kind(
    'dragonfly',
    DRAGONFLY.canvas,
    DRAGONFLY_LOOKS,
    [{ clip: 'hover', frames: DRAGONFLY.frames, fps: 18, loop: true, draw: (l, f) => renderDragonfly(l, f) }],
    ground(13, 4, 0.22),
  ),
  ...kind(
    'bee',
    BEE.canvas,
    { honey: 0 },
    [{ clip: 'fly', frames: BEE.frames, fps: 20, loop: true, draw: (_, f) => renderBee(f) }],
    ground(8, 3, 0.22),
  ),
  ...kind(
    'fairy',
    FAIRY.canvas,
    FAIRY_LOOKS,
    [{ clip: 'fly', frames: FAIRY.frames, fps: FAIRY.fps, loop: true, draw: (l, f) => renderFairy(l, f) }],
    ground(13, 5, 0.22),
  ),
];
