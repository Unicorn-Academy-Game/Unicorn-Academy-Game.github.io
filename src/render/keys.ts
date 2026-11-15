import type { UnicornId } from '../shared/ids';
import type { NpcId } from '../shared/npc';

/**
 * Texture manager keys. Frames inside a page or atlas are named by their rect index in the
 * manifest.
 */
export const unicornTexture = (id: UnicornId): string => `unicorn:${id}`;
export const npcTexture = (id: NpcId): string => `npc:${id}`;
export const pageTexture = (bundle: string, page: number): string => `bundle:${bundle}:${page}`;
export const tilesTexture = (tileset: string): string => `tiles:${tileset}`;

/**
 * The key of one of the fine sheets that go with a texture. The pictures of its first sheet are
 * under the texture's own key.
 */
export const finePage = (texture: string, page: number): string => `${texture}:${page}`;

/** The key of the views of the crown that goes with a texture. */
export const crownPage = (texture: string): string => `${texture}:crown`;
