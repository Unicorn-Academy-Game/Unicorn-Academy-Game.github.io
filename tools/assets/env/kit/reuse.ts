import type { BundleId, Recipe } from '../types';

/**
 * Draws again under another name, in another bundle, what another place already drew: the same
 * picture, so a room that borrows a cauldron or a lamp looks like the one it borrowed it from.
 * `prefix` replaces the two letters that start the ids of the bundle the picture came from.
 */
export const reuse = (from: readonly Recipe[], ids: readonly string[], prefix: string, bundle: BundleId): Recipe[] =>
  ids.map((id) => {
    const r = from.find((x) => x.id === id);
    if (!r) throw new Error(`no recipe ${id} to reuse in ${bundle}`);
    return { ...r, id: `${prefix}-${id.replace(/^[a-z]{2}-/, '')}`, bundle };
  });
