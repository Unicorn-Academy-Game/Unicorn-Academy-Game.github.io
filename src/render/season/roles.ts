import type { SeasonId } from '../../shared/seasons';
import type { Role } from './pixels';

/**
 * The prefixes the bundles put in front of a name so that two bundles can have a bush of the same
 * kind: the garden's, the playground's and the manor's.
 */
const BUNDLE_PREFIX = /^(?:g|pg|mn)-/;

/**
 * Sprites by name, first match wins. Everything not named here is a prop, which only takes a cap of
 * snow. The words are the ones the pictures are already called by in `tools/assets/env/kit`.
 */
const ROLES: readonly (readonly [RegExp, Role])[] = [
  [/^sky-strip/, 'sky'],
  [
    /^(?:cloud|rainbow|fountain-(?:rainbow|jet|ripples)|ornament|bubbles|fireworks|balloon|gem-jet|popper|slide-ball|lantern-on|brazier-lit|ice-display|pinwheel)/,
    'skip',
  ],
  [/^hills-/, 'distant'],
  [/^tree-fir/, 'conifer'],
  [/^tree-blossom/, 'blossom'],
  [/^(?:tree|twisty-tree)/, 'tree'],
  [/^(?:flowers|windflower|lily|bed-flowering)/, 'flower'],
  [/^(?:bush|tuft|hedge|topiary|reeds|bed-)/, 'plant'],
  [/^(?:rock|pebbles|crystal)/, 'rock'],
  [/^manor-house/, 'manor'],
  [/^(?:palace-(?:end|keep|tower|wing)|stable-house|treasure-house)/, 'building'],
];

/** What the seasons make of a sprite, by its name in the manifest. */
export function roleOf(name: string): Role {
  const plain = name.replace(BUNDLE_PREFIX, '');
  for (const [pattern, role] of ROLES) if (pattern.test(plain)) return role;
  return 'prop';
}

/**
 * Whether a piece of scenery that is only set down for looks is not there in a season: blooms and
 * lily pads are under the snow.
 */
export const outOfSeason = (season: SeasonId, name: string): boolean =>
  season === 'winter' && roleOf(name) === 'flower';
