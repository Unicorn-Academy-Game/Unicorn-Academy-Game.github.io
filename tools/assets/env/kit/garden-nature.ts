import type { Recipe } from '../types';
import { FLORA_RECIPES } from './flora';
import { TREE_RECIPES } from './trees';

/**
 * The palace grounds grow the same trees and flowers as the forest, from the same recipes, under
 * new ids. Atlases are per bundle, so each map carries its own copy and loads only what it shows.
 */
const reuse = (from: readonly Recipe[], ids: readonly string[]): Recipe[] =>
  ids.map((id) => {
    const r = from.find((x) => x.id === id);
    if (!r) throw new Error(`no recipe ${id} to reuse in the garden`);
    return { ...r, id: `g-${id}`, bundle: 'garden' };
  });

const blooms = ['pink', 'sky', 'yellow', 'white', 'lilac', 'coral'];

export const GARDEN_NATURE_RECIPES: Recipe[] = [
  ...reuse(TREE_RECIPES, [
    'tree-blossom-1',
    'tree-blossom-2',
    'tree-oak-lavender-1',
    'tree-oak-lavender-2',
    'tree-oak-lime-1',
    'tree-oak-lime-2',
    'tree-oak-emerald-1',
    'tree-birch-lime-1',
    'tree-willow-emerald-1',
  ]),
  ...reuse(FLORA_RECIPES, [
    'bush-lime-1',
    'bush-lime-2',
    'bush-emerald-1',
    'bush-emerald-2',
    'bush-pink-dots',
    'bush-rose-dots',
    ...blooms.flatMap((c) => [`flowers-${c}-1`, `flowers-${c}-2`]),
    'windflower-pink-1',
    'windflower-pink-2',
    'windflower-lilac-1',
    'windflower-lilac-2',
    'tuft-1',
    'tuft-2',
    'tuft-3',
    'pebbles-1',
    'pebbles-2',
    'reeds-1',
    'reeds-2',
    'lily-1',
    'lily-2',
    'rock-moss-1',
    'rock-moss-2',
    'rock-grey-1',
  ]),
];
