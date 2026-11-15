import { authorCrystalCave } from './crystal-cave';
import { authorDanceFloor } from './dance-floor';
import { authorForest } from './forest';
import { authorManorHall } from './manor-hall';
import { authorManorUpper } from './manor-upper';
import { authorPalaceGarden } from './palace-garden';
import { authorPalaceHall } from './palace-hall';
import { PALACE_ROOMS } from './palace-rooms';
import { authorPlayground } from './playground';
import { authorStable } from './stable';
import { authorTreasureHouse } from './treasure-house';

interface Authored {
  stats: { obstacles: number; decor: number; maskRects: number };
}

/** Every map author, in the order the maps are listed in the manifest. */
const AUTHORS: readonly (readonly [string, () => Authored])[] = [
  ['forest', authorForest],
  ['palace-garden', authorPalaceGarden],
  ['treasure-house', authorTreasureHouse],
  ['palace-hall', authorPalaceHall],
  ...PALACE_ROOMS,
  ['stable', authorStable],
  ['playground', authorPlayground],
  ['dance-floor', authorDanceFloor],
  ['manor-hall', authorManorHall],
  ['manor-upper', authorManorUpper],
  ['crystal-cave', authorCrystalCave],
];

/**
 * Writes every authored map to assets/maps, so the maps always match the sprites the same build
 * just drew.
 */
export function authorAll(): void {
  for (const [id, author] of AUTHORS) {
    const { stats } = author();
    console.log(`author ${id}: ${stats.decor} decor, ${stats.obstacles} obstacles`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) authorAll();
