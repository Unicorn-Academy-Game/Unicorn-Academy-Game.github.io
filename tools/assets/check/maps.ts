import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_SPRITE } from '../../../src/content/exits';
import { lifeSprites } from '../../../src/content/life';
import { NPC_DEFS } from '../../../src/content/npcs';
import { PRODUCE_IDS, produceSprite } from '../../../src/content/produce';
import { CompiledMap } from '../../../src/shared/compiled-map';
import { MAP_IDS, type MapId, UNICORN_IDS } from '../../../src/shared/ids';
import type { Manifest } from '../../../src/shared/manifest';
import { factsOf } from '../../maps/facts';
import { error, type Finding } from './finding';

/** Reads and parses a map the manifest names. Returns the reason as text when it cannot. */
function readMap(dir: string, file: string): CompiledMap | string {
  const path = join(dir, file);
  if (!existsSync(path)) return `${file} is not there`;
  try {
    const parsed = CompiledMap.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success
      ? parsed.data
      : `${file} is not a valid compiled map: ${parsed.error.issues[0]?.message ?? 'unknown'} at ${parsed.error.issues[0]?.path.join('.') ?? ''}`;
  } catch (cause) {
    return `${file} cannot be read: ${String(cause)}`;
  }
}

/**
 * Every map the manifest names that can be read. Problems with the others are for `checkMaps` to
 * report.
 */
export function loadMaps(dir: string, manifest: Manifest): Map<MapId, CompiledMap> {
  const loaded = new Map<MapId, CompiledMap>();
  for (const id of MAP_IDS) {
    const entry = manifest.maps[id];
    const map = entry ? readMap(dir, entry.file) : null;
    if (map && typeof map !== 'string') loaded.set(id, map);
  }
  return loaded;
}

/** The music and ambience loops a map's `audio` asks for, by the ids the manifest uses. */
export const loopsOfMap = (audio: CompiledMap['logic']['audio']): [string, string] => [
  audio.music === 'quiet' ? 'music-garden' : `music-${audio.music}`,
  `ambience-${audio.ambience}`,
];

/**
 * Every reference inside the maps resolves: to a sprite in the bundle, a tile in the tile sheet, a
 * spawn on the map a portal leads to, an anchor the work needs, a clip the grown-up is drawn with
 * and a loop that exists. The game would otherwise find out at the moment a child reached the
 * broken thing.
 */
export function checkMaps(dir: string, manifest: Manifest): Finding[] {
  const found: Finding[] = [];
  const loaded = loadMaps(dir, manifest);
  for (const id of MAP_IDS) {
    const entry = manifest.maps[id];
    if (!entry) found.push(error('maps', `the manifest has no map ${id}`));
    else if (!loaded.has(id)) {
      const reason = readMap(dir, entry.file);
      found.push(error('maps', typeof reason === 'string' ? reason : `${id} could not be loaded`));
    }
  }

  for (const [id, map] of loaded) {
    const at = (what: string): string => `${id}: ${what}`;
    const entry = manifest.maps[id]!;
    const { logic, render } = map;
    if (logic.id !== id) found.push(error('maps', at(`the file holds the map ${logic.id}`)));
    if (render.bundle !== entry.bundle || render.tileset !== entry.tileset)
      found.push(error('maps', at('the map and the manifest disagree about which bundle and tile sheet it uses')));
    const facts = factsOf(logic);
    if (JSON.stringify(entry.subjects) !== JSON.stringify(facts.subjects))
      found.push(error('maps', at('the manifest is out of date about the things in the map that give a word')));
    if (JSON.stringify(entry.exits) !== JSON.stringify(facts.exits))
      found.push(error('maps', at('the manifest is out of date about the ways out of the map')));

    const bundle = manifest.bundles[render.bundle];
    const tileset = manifest.tilesets[render.tileset];
    if (!bundle) found.push(error('maps', at(`bundle ${render.bundle} is not in the manifest`)));
    if (!tileset) found.push(error('maps', at(`tile sheet ${render.tileset} is not in the manifest`)));

    const cells = logic.widthTiles * logic.heightTiles;
    if (render.ground.length !== cells)
      found.push(error('maps', at(`${render.ground.length} ground tiles for a map of ${cells}`)));
    if (render.water.length !== cells)
      found.push(error('maps', at(`${render.water.length} water tiles for a map of ${cells}`)));
    if (tileset) {
      for (const layer of ['ground', 'water'] as const) {
        const bad = render[layer].find((t) => t >= tileset.count);
        if (bad !== undefined)
          found.push(error('maps', at(`${layer} uses tile ${bad} and the tile sheet has ${tileset.count}`)));
      }
      if (tileset.surfaces.length !== tileset.count)
        found.push(
          error(
            'maps',
            at(`the tile sheet says what ${tileset.surfaces.length} of its ${tileset.count} tiles sound like`),
          ),
        );
      for (const a of tileset.animations)
        if (a.tiles.some((t) => t >= tileset.count))
          found.push(error('maps', at('a tile animation uses a tile the sheet does not have')));
    }
    if (bundle) {
      const missing = new Set(render.decor.filter((d) => !(d.sprite in bundle.sprites)).map((d) => d.sprite));
      for (const sprite of missing)
        found.push(error('maps', at(`scenery uses ${sprite} and bundle ${render.bundle} has no such sprite`)));
    }

    for (const portal of logic.portals) {
      const target = loaded.get(portal.to.mapId);
      if (!target)
        found.push(error('maps', at(`portal ${portal.portalId} leads to ${portal.to.mapId}, which is not loaded`)));
      else if (!target.logic.spawns.some((s) => s.spawnId === portal.to.spawnId))
        found.push(
          error(
            'maps',
            at(`portal ${portal.portalId} leads to spawn ${portal.to.spawnId}, which ${portal.to.mapId} does not have`),
          ),
        );
      if (portal.door && !logic.interactables.some((i) => i.instanceId === portal.door))
        found.push(error('maps', at(`portal ${portal.portalId} opens door ${portal.door}, which is not on the map`)));
    }
    for (const i of logic.interactables) {
      if (i.anchor && !logic.anchors.some((a) => a.anchorId === i.anchor))
        found.push(error('maps', at(`${i.instanceId} names anchor ${i.anchor}, which is not on the map`)));
    }

    // Grown-ups: drawn, animated for every job they do, and given somewhere to do it.
    for (const placed of logic.npcs) {
      const asset = manifest.npcs[placed.npcId];
      if (!asset) {
        found.push(error('maps', at(`${placed.npcId} is placed and has no pictures in the manifest`)));
        continue;
      }
      const def = NPC_DEFS[placed.npcId];
      const tags = new Set<string>();
      const clips = new Set<string>(['idle', 'walk', 'wave']);
      for (const step of def.routine) {
        if (step.kind === 'work') {
          tags.add(step.tag);
          clips.add(step.clip);
        } else {
          tags.add(step.from);
          tags.add(step.to);
          clips.add('carry').add('pickup').add('putdown');
        }
      }
      if (def.groomer) {
        tags.add(def.groomer.tag);
        clips.add('brush');
      }
      for (const clip of clips)
        if (!asset.clips[clip])
          found.push(error('maps', at(`${placed.npcId} is never drawn doing "${clip}", which the job needs`)));
      for (const tag of tags)
        if (!logic.anchors.some((a) => a.tags.includes(tag)))
          found.push(error('maps', at(`${placed.npcId} needs somewhere tagged "${tag}" and the map has none`)));
    }

    const [music, ambience] = loopsOfMap(logic.audio);
    if (!manifest.audio) found.push(error('maps', at('the manifest has no sound')));
    else
      for (const loop of [music, ambience])
        if (!(loop in manifest.audio.loops))
          found.push(error('maps', at(`the map asks for the loop ${loop} and there is none`)));
  }

  // Every way out is marked with the same three pictures, and they come from the effects bundle.
  const effects = manifest.bundles.fx;
  if (!effects) found.push(error('maps', 'the manifest has no bundle of effects'));
  else
    for (const id of Object.values(EXIT_SPRITE))
      if (!(id in effects.sprites))
        found.push(error('maps', `the game marks every way out with ${id} and the effects bundle has no such sprite`));
  // Everyone who lives in the world is drawn from one bundle, in every colour and every clip the
  // content gives them.
  const creatures = manifest.bundles.life;
  if (!creatures) found.push(error('maps', 'the manifest has no bundle of creatures'));
  else
    for (const id of lifeSprites())
      if (!(id in creatures.sprites))
        found.push(error('maps', `the game draws creatures from ${id} and the creatures bundle has no such sprite`));

  // What grows in the garden and fills the crates is drawn from one bundle too, a picture for each
  // kind.
  const produce = manifest.bundles.produce;
  if (!produce) found.push(error('maps', 'the manifest has no bundle of fruit and vegetables'));
  else
    for (const id of PRODUCE_IDS)
      if (!(produceSprite(id) in produce.sprites))
        found.push(
          error('maps', `the game draws ${id} from ${produceSprite(id)} and the produce bundle has no such sprite`),
        );

  const forest = loaded.get('forest');
  if (forest) {
    const waiting = forest.logic.encounters.map((e) => e.unicornId).sort();
    const friends = UNICORN_IDS.filter((u) => u !== 'wildstar').sort();
    if (waiting.join() !== friends.join())
      found.push(
        error(
          'maps',
          `forest: friends waiting to be found are ${waiting.join(', ')} and should be ${friends.join(', ')}`,
        ),
      );
  }
  const garden = loaded.get('palace-garden');
  if (garden) {
    const drinking = garden.logic.interactables.filter(
      (i) =>
        i.definitionId === 'cup' &&
        i.anchor &&
        garden.logic.anchors.find((a) => a.anchorId === i.anchor)?.tags.includes('drink'),
    );
    if (drinking.length < 2)
      found.push(error('maps', `palace-garden: ${drinking.length} cups can be drunk from and the fountain needs two`));
  }
  return found;
}
