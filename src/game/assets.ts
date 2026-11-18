import Phaser from 'phaser';
import { OPEN_AIR } from '../content/seasons';
import { crownPage, finePage, npcTexture, pageTexture, tilesTexture, unicornTexture } from '../render/keys';
import { cellsOfPage } from '../render/season';
import { CompiledMap } from '../shared/compiled-map';
import type { MapId } from '../shared/ids';
import { UNICORN_IDS, type UnicornId } from '../shared/ids';
import { type Atlas, type Bundle, Manifest, type TilesetAsset } from '../shared/manifest';
import type { NpcId } from '../shared/npc';
import type { SeasonId } from '../shared/seasons';
import { Dressing } from './dressing';

/**
 * Asset URLs are relative to the manifest, which lives in /assets. File names inside carry content
 * hashes.
 */
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}assets/${path}`;

/**
 * A file the game needs could not be fetched or read. On a phone this nearly always means there is
 * no connection.
 */
export class AssetError extends Error {
  constructor(
    readonly files: string,
    options?: { cause?: unknown },
  ) {
    super(`could not load ${files}`, options);
    this.name = 'AssetError';
  }
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`answered ${response.status}`);
    return await response.json();
  } catch (cause) {
    throw new AssetError(url, { cause });
  }
}

export async function fetchManifest(): Promise<Manifest> {
  return Manifest.parse(await fetchJson(assetUrl('manifest.json')));
}

const maps = new Map<string, Promise<CompiledMap>>();

/**
 * The compiled map for an id, fetched once. A failed fetch is forgotten so the next attempt tries
 * again.
 */
export function fetchMap(manifest: Manifest, id: MapId): Promise<CompiledMap> {
  const entry = manifest.maps[id];
  if (!entry) return Promise.reject(new Error(`the manifest has no map ${id}`));
  let pending = maps.get(entry.file);
  if (!pending) {
    pending = fetchJson(assetUrl(entry.file)).then((raw) => CompiledMap.parse(raw));
    pending.catch(() => maps.delete(entry.file));
    maps.set(entry.file, pending);
  }
  return pending;
}

/**
 * Adds an atlas page's frames to a loaded texture, named by rect index, with trims so origins match
 * the source canvas.
 */
function addFrames(texture: Phaser.Textures.Texture, atlas: Atlas): void {
  atlas.rects.forEach((r, i) => {
    const frame = texture.add(String(i), 0, r.x, r.y, r.w, r.h);
    if (!frame) throw new Error(`frame ${i} of ${texture.key} could not be added`);
    if (r.w !== r.sw || r.h !== r.sh || r.ox !== 0 || r.oy !== 0) frame.setTrim(r.sw, r.sh, r.ox, r.oy, r.w, r.h);
  });
}

interface ImageJob {
  key: string;
  url: string;
  atlas?: Atlas;
}

/**
 * Loads images into the texture manager through a scene's loader and resolves when all of them are
 * ready.
 */
function loadImages(scene: Phaser.Scene, jobs: ImageJob[], onProgress?: (fraction: number) => void): Promise<void> {
  const todo = jobs.filter((j) => !scene.textures.exists(j.key));
  if (todo.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const loader = scene.load;
    const failed: string[] = [];
    const onError = (file: Phaser.Loader.File): void => void failed.push(file.key);
    const onTick = (value: number): void => onProgress?.(value);
    loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    loader.on(Phaser.Loader.Events.PROGRESS, onTick);
    loader.once(Phaser.Loader.Events.COMPLETE, () => {
      loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      loader.off(Phaser.Loader.Events.PROGRESS, onTick);
      if (failed.length > 0) {
        for (const j of todo) if (scene.textures.exists(j.key) && failed.includes(j.key)) scene.textures.remove(j.key);
        reject(new AssetError(failed.join(', ')));
        return;
      }
      for (const j of todo) if (j.atlas) addFrames(scene.textures.get(j.key), j.atlas);
      resolve();
    });
    for (const j of todo) loader.image(j.key, assetUrl(j.url));
    loader.start();
  });
}

/**
 * Brings one picture in on its own, and not through the scene's loader. A map may be loading
 * through that, and the loader tells every wait about the failures of all of them, so a map would
 * be turned away because a picture that nobody was waiting for did not come. The picture is decoded
 * before it is handed over, so adding it to the scene does not make the frame wait for that.
 */
async function loadAlone(scene: Phaser.Scene, key: string, url: string, atlas: Atlas): Promise<void> {
  if (scene.textures.exists(key)) return;
  const image = new Image();
  image.src = assetUrl(url);
  try {
    await image.decode();
  } catch (cause) {
    throw new AssetError(url, { cause });
  }
  // Another call may have brought it in while this one was decoding.
  const texture = scene.textures.exists(key) ? null : scene.textures.addImage(key, image);
  if (texture) addFrames(texture, atlas);
}

/** What one map needs drawn: its scenery bundle, its tile sheet and the grown-ups on it. */
export interface Location {
  bundle: string;
  tileset: string;
  npcs: readonly NpcId[];
  /** Whether the sky is over it, so that its pictures change with the seasons. */
  open: boolean;
}

/** The location a compiled map describes. */
export const locationOf = (compiled: CompiledMap): Location => ({
  bundle: compiled.render.bundle,
  tileset: compiled.render.tileset,
  // Two elves are one picture to load.
  npcs: [...new Set(compiled.logic.npcs.map((n) => n.npcId))],
  open: OPEN_AIR[compiled.logic.id],
});

/**
 * Everything the scene needs from textures, owned by one scene so loads and releases share a
 * loader.
 */
export class Textures {
  private readonly dressing: Dressing;

  constructor(private readonly scene: Phaser.Scene) {
    this.dressing = new Dressing(scene.textures);
  }

  /**
   * From now on the places that are out of doors are drawn in this season, the one on the screen as
   * well. It resolves when the pictures that are in are painted. A place that comes in later is
   * painted as it comes.
   */
  setSeason(season: SeasonId): Promise<void> {
    return this.dressing.setSeason(season);
  }

  loadUnicorns(manifest: Manifest, onProgress?: (fraction: number) => void): Promise<void> {
    return loadImages(
      this.scene,
      UNICORN_IDS.flatMap((id) => {
        const { atlas, crown } = manifest.unicorns[id];
        return [
          { key: unicornTexture(id), url: atlas.file, atlas },
          ...(crown ? [{ key: crownPage(unicornTexture(id)), url: crown.atlas.file, atlas: crown.atlas }] : []),
        ];
      }),
      onProgress,
    );
  }

  /**
   * One of the fine sheets of a unicorn, with the pictures of her walking and standing at the
   * facings her first sheet does not draw.
   */
  loadUnicornFine(manifest: Manifest, id: UnicornId, page: number): Promise<void> {
    const sheet = manifest.unicorns[id].fine?.atlases[page];
    if (!sheet) return Promise.reject(new Error(`${id} has no fine sheet ${page}`));
    return loadAlone(this.scene, finePage(unicornTexture(id), page), sheet.file, sheet);
  }

  /** A bundle that stays loaded for the whole session, such as the effects. */
  loadShared(manifest: Manifest, bundleId: string, onProgress?: (fraction: number) => void): Promise<void> {
    const bundle = this.bundle(manifest, bundleId);
    return loadImages(
      this.scene,
      bundle.pages.map((atlas, i) => ({ key: pageTexture(bundleId, i), url: atlas.file, atlas })),
      onProgress,
    );
  }

  /** The bundle's pages, its map's tile sheet and the pictures of the grown-ups the map places. */
  async loadLocation(manifest: Manifest, location: Location, onProgress?: (fraction: number) => void): Promise<void> {
    const bundle = this.bundle(manifest, location.bundle);
    const tileset = this.tileset(manifest, location.tileset);
    await loadImages(
      this.scene,
      [
        ...bundle.pages.map((atlas, i) => ({ key: pageTexture(location.bundle, i), url: atlas.file, atlas })),
        { key: tilesTexture(location.tileset), url: tileset.file },
        ...location.npcs.map((id) => ({
          key: npcTexture(id),
          url: manifest.npcs[id].atlas.file,
          atlas: manifest.npcs[id].atlas,
        })),
      ],
      onProgress,
    );
    if (!location.open) return;
    const pages = bundle.pages.map((_, i) => pageTexture(location.bundle, i));
    const sheet = tilesTexture(location.tileset);
    pages.forEach((key, i) => {
      this.dressing.keep(key, cellsOfPage(bundle, i));
    });
    this.dressing.keep(sheet, null);
    await this.dressing.dress([...pages, sheet]);
  }

  /**
   * Frees the pictures of a location that is no longer on screen, except what the location now
   * shown still uses.
   */
  releaseLocation(manifest: Manifest, left: Location, keep: Location): void {
    const drop = (key: string): void => {
      this.dressing.forget(key);
      this.scene.textures.remove(key);
    };
    if (left.bundle !== keep.bundle)
      this.bundle(manifest, left.bundle).pages.forEach((_, i) => {
        drop(pageTexture(left.bundle, i));
      });
    if (left.tileset !== keep.tileset) drop(tilesTexture(left.tileset));
    for (const id of left.npcs) if (!keep.npcs.includes(id)) drop(npcTexture(id));
  }

  bundle(manifest: Manifest, id: string): Bundle {
    const b = manifest.bundles[id];
    if (!b) throw new Error(`the manifest has no bundle ${id}`);
    return b;
  }

  tileset(manifest: Manifest, id: string): TilesetAsset {
    const t = manifest.tilesets[id];
    if (!t) throw new Error(`the manifest has no tileset ${id}`);
    return t;
  }
}
