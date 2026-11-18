import { BARN_RECIPES } from './kit/barn';
import { BARN_PROP_RECIPES } from './kit/barn-props';
import { BOXED_RECIPES } from './kit/boxed';
import { BUILDING_RECIPES } from './kit/buildings';
import { CABIN_RECIPES } from './kit/cabin';
import { CAVE_RECIPES } from './kit/cave';
import { FARM_RECIPES } from './kit/farm';
import { FLORA_RECIPES } from './kit/flora';
import { FOUNTAIN_RECIPES } from './kit/fountain';
import { FOUNTAIN_RAINBOW_RECIPES } from './kit/fountain-rainbow';
import { FX_RECIPES } from './kit/fx';
import { GARDEN_RECIPES } from './kit/garden';
import { GARDEN_NATURE_RECIPES } from './kit/garden-nature';
import { GARDENERY_RECIPES } from './kit/gardenery';
import { GROVE_GATE_RECIPES, GROVE_RECIPES } from './kit/grove';
import { HALL_RECIPES, PALACE_HALL_RECIPES, PALACE_ROOM_RECIPES } from './kit/hall';
import { HUT_RECIPES } from './kit/hut';
import { LIFE_RECIPES } from './kit/life';
import { MAGIC_RECIPES } from './kit/magic';
import { MANOR_RECIPES } from './kit/manor';
import { PALACE_RECIPES } from './kit/palace';
import { PALACE_PROP_RECIPES } from './kit/palace-props';
import { PLAYGROUND_RECIPES } from './kit/playground';
import { PRODUCE_RECIPES, RAIN_RECIPES } from './kit/produce';
import { SHORE_RECIPES } from './kit/shore';
import { SKY_RECIPES } from './kit/sky';
import { THRONE_ROOM_RECIPES } from './kit/throne-room';
import { TREASURE_RECIPES } from './kit/treasure';
import { TREE_RECIPES } from './kit/trees';
import { WORD_RECIPES } from './kit/words';
import type { Recipe } from './types';

export const RECIPES: readonly Recipe[] = [
  ...TREE_RECIPES,
  ...FLORA_RECIPES,
  ...PALACE_RECIPES,
  ...SKY_RECIPES,
  ...FOUNTAIN_RECIPES,
  ...GARDEN_RECIPES,
  ...GARDENERY_RECIPES,
  ...BUILDING_RECIPES,
  ...GARDEN_NATURE_RECIPES,
  ...TREASURE_RECIPES,
  ...HALL_RECIPES,
  ...BARN_RECIPES,
  ...BARN_PROP_RECIPES,
  ...BOXED_RECIPES,
  ...FX_RECIPES,
  ...LIFE_RECIPES,
  ...PRODUCE_RECIPES,
  ...RAIN_RECIPES,
  ...WORD_RECIPES,
  ...FARM_RECIPES,
  ...PALACE_HALL_RECIPES,
  ...PALACE_ROOM_RECIPES,
  ...PALACE_PROP_RECIPES,
  ...THRONE_ROOM_RECIPES,
  ...PLAYGROUND_RECIPES,
  ...MANOR_RECIPES,
  ...FOUNTAIN_RAINBOW_RECIPES,
  ...CAVE_RECIPES,
  ...HUT_RECIPES,
  ...SHORE_RECIPES,
  ...MAGIC_RECIPES,
  ...GROVE_RECIPES,
  ...CABIN_RECIPES,
  ...GROVE_GATE_RECIPES,
];

const byId = new Map<string, Recipe>();
for (const r of RECIPES) {
  if (byId.has(r.id)) throw new Error(`duplicate sprite id ${r.id}`);
  byId.set(r.id, r);
}

export const recipeById = (id: string): Recipe => {
  const r = byId.get(id);
  if (!r) throw new Error(`unknown sprite ${id}`);
  return r;
};

export const frameCount = (r: Recipe): number => r.anim?.frames ?? 1;
