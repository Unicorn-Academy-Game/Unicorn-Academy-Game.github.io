import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lifeSubject, propSubject, SUBJECTS, unicornSubject, WORD_IDS, WORDS } from '../../src/content/lexicon';
import { type Chart, chartOf, routeTo } from '../../src/learning';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';

type Entry = { subjects: string[]; exits: { portalId: string; mapId: MapId }[] };

const exit = (portalId: string, mapId: MapId): Entry['exits'][number] => ({ portalId, mapId });

/**
 * Five places. The garden joins the forest, the treasure house and the stable, and the manor joins
 * the forest, the stable and, by a short way, the garden.
 */
function row(): Chart {
  const maps: Partial<Record<MapId, Entry>> = {
    forest: { subjects: ['life.frog'], exits: [exit('to-garden', 'palace-garden'), exit('to-manor', 'manor-hall')] },
    'palace-garden': {
      subjects: ['prop.apple-tree'],
      exits: [exit('to-forest', 'forest'), exit('to-treasure', 'treasure-house'), exit('to-stable', 'stable')],
    },
    'treasure-house': { subjects: ['prop.ruby-table'], exits: [exit('to-garden', 'palace-garden')] },
    stable: {
      subjects: ['prop.boxed-unicorn'],
      exits: [exit('to-garden', 'palace-garden'), exit('to-manor', 'manor-hall')],
    },
    'manor-hall': {
      subjects: ['prop.chandelier'],
      exits: [exit('to-forest', 'forest'), exit('to-stable', 'stable'), exit('to-garden', 'palace-garden')],
    },
  };
  return chartOf(maps);
}

const NOBODY: ReadonlySet<string> = new Set();

describe('the way to a word', () => {
  it('is nowhere further than here when the thing that gives it is where the player stands', () => {
    expect(routeTo(row(), 'forest', ['life.frog'], NOBODY)).toEqual({ kind: 'here' });
    expect(routeTo(row(), 'treasure-house', ['prop.ruby-table'], NOBODY)).toEqual({ kind: 'here' });
  });

  it('is through the way out that leads there, when it is next door', () => {
    expect(routeTo(row(), 'forest', ['prop.apple-tree'], NOBODY)).toEqual({
      kind: 'onward',
      exit: exit('to-garden', 'palace-garden'),
      hops: 1,
    });
    expect(routeTo(row(), 'treasure-house', ['prop.apple-tree'], NOBODY)).toEqual({
      kind: 'onward',
      exit: exit('to-garden', 'palace-garden'),
      hops: 1,
    });
  });

  it('is through the first way out of a longer road, and says how many ways out there are in all', () => {
    expect(routeTo(row(), 'forest', ['prop.ruby-table'], NOBODY)).toEqual({
      kind: 'onward',
      exit: exit('to-garden', 'palace-garden'),
      hops: 2,
    });
    expect(routeTo(row(), 'treasure-house', ['life.frog'], NOBODY)).toEqual({
      kind: 'onward',
      exit: exit('to-garden', 'palace-garden'),
      hops: 2,
    });
  });

  it('takes the shorter of two roads, and not the first way out that gets there', () => {
    // From the manor the forest is listed first, and the road by it is three ways out. The garden
    // is listed last and is two.
    expect(routeTo(row(), 'manor-hall', ['prop.ruby-table'], NOBODY)).toEqual({
      kind: 'onward',
      exit: exit('to-garden', 'palace-garden'),
      hops: 2,
    });
  });

  it('takes the way out that is listed first when two roads are as long as each other', () => {
    expect(routeTo(row(), 'forest', ['prop.boxed-unicorn'], NOBODY)).toEqual({
      kind: 'onward',
      exit: exit('to-garden', 'palace-garden'),
      hops: 2,
    });
  });

  it('goes to the nearest of the things that give it, when more than one does', () => {
    expect(routeTo(row(), 'palace-garden', ['life.frog', 'prop.ruby-table', 'prop.chandelier'], NOBODY)).toEqual({
      kind: 'onward',
      exit: exit('to-forest', 'forest'),
      hops: 1,
    });
  });

  it('is here for a friend who walks with her, in every place', () => {
    const herd = new Set(['unicorn.leaf']);
    for (const id of row().keys()) expect(routeTo(row(), id, ['unicorn.leaf'], herd)).toEqual({ kind: 'here' });
    expect(routeTo(row(), 'forest', ['unicorn.leaf'], NOBODY)).toEqual({ kind: 'nowhere' });
  });

  it('is nowhere for a word that nothing gives, and from a place the game does not have', () => {
    expect(routeTo(row(), 'forest', ['prop.not-in-the-game'], NOBODY)).toEqual({ kind: 'nowhere' });
    expect(routeTo(row(), 'playground', ['life.frog'], NOBODY)).toEqual({ kind: 'nowhere' });
    expect(routeTo(row(), 'forest', [], NOBODY)).toEqual({ kind: 'nowhere' });
  });

  it('does not go round in a ring of places that lead to each other', () => {
    const ring = chartOf({
      forest: { subjects: [], exits: [exit('a', 'palace-garden')] },
      'palace-garden': { subjects: [], exits: [exit('b', 'forest')] },
    });
    expect(routeTo(ring, 'forest', ['prop.ruby-table'], NOBODY)).toEqual({ kind: 'nowhere' });
  });
});

describe('the places the game ships with', () => {
  const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
  const chart = chartOf(manifest.maps);
  const herd = new Set([unicornSubject('wildstar')]);

  it('are told in the manifest as the maps themselves are: what stands in each that gives a word, and where it leads', () => {
    expect(Object.keys(manifest.maps).sort()).toEqual([...MAP_IDS].sort());
    const gives = new Set<string>(SUBJECTS);
    for (const id of MAP_IDS) {
      const { logic } = CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[id]!.file}`, 'utf8')));
      const standing = new Set<string>([
        ...logic.life.map((zone) => lifeSubject(zone.kind)),
        ...logic.interactables.map((prop) => propSubject(prop.definitionId)),
        ...logic.encounters.map((encounter) => unicornSubject(encounter.unicornId)),
      ]);
      expect([...chart.get(id)!.subjects].sort(), id).toEqual([...standing].filter((s) => gives.has(s)).sort());
      expect(chart.get(id)!.exits, id).toEqual(
        logic.portals.map((portal) => ({ portalId: portal.portalId, mapId: portal.to.mapId })),
      );
    }
  });

  it('give every word a way to it from every place the player can be in, so no spell in the book is out of reach', () => {
    for (const from of MAP_IDS) {
      for (const word of WORD_IDS)
        expect(routeTo(chart, from, WORDS[word].subjects, herd), `${word} from ${from}`).not.toEqual({
          kind: 'nowhere',
        });
    }
  });

  it('lead from the forest to the cut gems through the garden, and from the garden to the treasure house', () => {
    const table = ['prop.ruby-table'] as const;
    expect(routeTo(chart, 'forest', table, herd)).toMatchObject({
      kind: 'onward',
      exit: { mapId: 'palace-garden' },
      hops: 2,
    });
    expect(routeTo(chart, 'palace-garden', table, herd)).toMatchObject({
      kind: 'onward',
      exit: { mapId: 'treasure-house' },
      hops: 1,
    });
    expect(routeTo(chart, 'treasure-house', table, herd)).toEqual({ kind: 'here' });
  });

  it('lead from the forest to the rubies that grow in the cave in one door, which is nearer than the table', () => {
    expect(routeTo(chart, 'forest', WORDS.ruby.subjects, herd)).toMatchObject({
      kind: 'onward',
      exit: { mapId: 'crystal-cave' },
      hops: 1,
    });
    expect(routeTo(chart, 'crystal-cave', WORDS.ruby.subjects, herd)).toEqual({ kind: 'here' });
  });
});
