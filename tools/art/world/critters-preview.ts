import { contactSheet, type Rgba, writePng } from '../core/image';
import { BIRD_LOOKS, type BirdName, renderBird } from './birds';
import {
  BUNNY_LOOKS,
  type BunnyName,
  DUCK_LOOKS,
  type DuckName,
  FISH_LOOKS,
  type FishName,
  FROG_LOOKS,
  type FrogName,
  LADYBUG_LOOKS,
  type LadybugName,
  renderBunny,
  renderDuck,
  renderFish,
  renderFishShade,
  renderFrog,
  renderLadybug,
  renderSnail,
  SNAIL_LOOKS,
  type SnailName,
} from './critters';
import {
  BUTTERFLY_LOOKS,
  type ButterflyName,
  DRAGONFLY_LOOKS,
  type DragonflyName,
  FAIRY_LOOKS,
  type FairyName,
  renderBee,
  renderButterfly,
  renderDragonfly,
  renderFairy,
} from './winged';

/** Usage: tsx tools/art/world/critters-preview.ts [birds|ground|water] */
const which = process.argv[2] ?? 'ground';
const t0 = Date.now();
const frames: Rgba[] = [];
let cols = 8;
if (which === 'birds') {
  cols = 9;
  for (const name of Object.keys(BIRD_LOOKS) as BirdName[]) {
    for (let f = 0; f < 2; f++) frames.push(renderBird(name, 'idle', f));
    for (let f = 0; f < 3; f++) frames.push(renderBird(name, 'peck', f));
    for (let f = 0; f < 4; f++) frames.push(renderBird(name, 'fly', f));
  }
} else if (which === 'ground') {
  cols = 8;
  for (const n of Object.keys(FROG_LOOKS) as FrogName[]) {
    frames.push(
      renderFrog(n, 'sit', 0),
      renderFrog(n, 'sit', 2),
      renderFrog(n, 'sit', 5),
      renderFrog(n, 'crouch', 0),
      renderFrog(n, 'air', 0),
    );
  }
  for (const n of Object.keys(BUNNY_LOOKS) as BunnyName[])
    frames.push(renderBunny(n, 'sit', 0), renderBunny(n, 'sit', 1), renderBunny(n, 'hop', 0));
  for (const n of Object.keys(SNAIL_LOOKS) as SnailName[]) frames.push(renderSnail(n, 0), renderSnail(n, 1));
  for (const n of Object.keys(LADYBUG_LOOKS) as LadybugName[])
    frames.push(
      renderLadybug(n, 'walk', 0),
      renderLadybug(n, 'walk', 1),
      renderLadybug(n, 'fly', 0),
      renderLadybug(n, 'fly', 1),
    );
} else if (which === 'fairy') {
  cols = 6;
  for (const n of Object.keys(FAIRY_LOOKS) as FairyName[]) for (let f = 0; f < 6; f++) frames.push(renderFairy(n, f));
} else if (which === 'winged') {
  cols = 8;
  for (const n of Object.keys(BUTTERFLY_LOOKS) as ButterflyName[])
    for (let f = 0; f < 4; f++) frames.push(renderButterfly(n, f));
  for (const n of Object.keys(DRAGONFLY_LOOKS) as DragonflyName[])
    for (let f = 0; f < 3; f++) frames.push(renderDragonfly(n, f));
  frames.push(renderBee(0), renderBee(1));
} else {
  cols = 8;
  for (const n of Object.keys(DUCK_LOOKS) as DuckName[])
    frames.push(renderDuck(n, 'float', 0), renderDuck(n, 'float', 1), renderDuck(n, 'quack', 0));
  for (const n of Object.keys(FISH_LOOKS) as FishName[])
    for (let f = 0; f < 3; f++) frames.push(renderFish(n, 'leap', f));
  for (const n of Object.keys(FISH_LOOKS) as FishName[]) frames.push(renderFishShade(n, 0), renderFishShade(n, 1));
}
console.log('rendered', frames.length, 'in', Date.now() - t0, 'ms');
writePng(
  `assets/source/_scratch/critters-${which}.png`,
  contactSheet(frames, { cols, scale: which === 'fairy' ? 2 : 3, bg: [112, 168, 110, 255], grid: true }),
);
