import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DRAWN_WORD_IDS,
  isWordId,
  lifeSubject,
  PAGES,
  PICTURE_BUNDLES,
  propSubject,
  SUBJECTS,
  type SubjectId,
  tierOf,
  unicornSubject,
  WORD_IDS,
  WORDS,
  type WordId,
  wordSprite,
  wordsOf,
} from '../../src/content/lexicon';
import { LIFE } from '../../src/content/life';
import { PRODUCE } from '../../src/content/produce';
import { GEM_TABLES, gemOn, PROP_DEFS, tableOf } from '../../src/content/props';
import { UNICORN_DEFS } from '../../src/content/unicorns';
import { CompiledMap } from '../../src/shared/compiled-map';
import { UNICORN_IDS } from '../../src/shared/ids';
import { WORD_PATTERN } from '../../src/shared/learning';
import { LIFE_KINDS } from '../../src/shared/life';
import { Manifest } from '../../src/shared/manifest';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const maps = Object.values(manifest.maps).map((m) =>
  CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${m.file}`, 'utf8'))),
);

/**
 * Every subject that really stands somewhere in the game: a creature in a zone, a prop in a map, a
 * friend waiting in a clearing.
 */
const inTheWorld = new Set<SubjectId>(['unicorn.wildstar']);
for (const map of maps) {
  for (const zone of map.logic.life) inTheWorld.add(lifeSubject(zone.kind));
  for (const prop of map.logic.interactables) inTheWorld.add(propSubject(prop.definitionId));
  for (const encounter of map.logic.encounters) inTheWorld.add(unicornSubject(encounter.unicornId));
}

describe('the words', () => {
  it('are spelled with lower case letters and fit on the card', () => {
    for (const id of WORD_IDS) {
      expect(id, id).toMatch(WORD_PATTERN);
      expect(id.length, id).toBeLessThanOrEqual(12);
      expect(isWordId(id)).toBe(true);
    }
    expect(isWordId('toString')).toBe(false);
    expect(isWordId('dragon')).toBe(false);
  });

  it('are graded by length, so a short word comes first', () => {
    expect(tierOf('bee')).toBe(1);
    expect(tierOf('frog')).toBe(1);
    expect(tierOf('apple')).toBe(2);
    expect(tierOf('carrot')).toBe(2);
    expect(tierOf('unicorn')).toBe(3);
    expect(tierOf('strawberry')).toBe(3);
  });

  it('each have a thing in the world that gives them, and a way to be pictured', () => {
    for (const id of WORD_IDS) {
      expect(WORDS[id].subjects.length, id).toBeGreaterThan(0);
      expect(WORDS[id].picture, id).toBeDefined();
    }
  });
});

describe('the pictures', () => {
  it('are all in the manifest, in a bundle that loads with the unicorns', () => {
    for (const id of WORD_IDS) {
      const picture = WORDS[id].picture;
      if (picture.kind === 'portrait') {
        expect(UNICORN_IDS, id).toContain(picture.unicorn);
        expect(manifest.unicorns[picture.unicorn], id).toBeDefined();
      } else {
        expect(PICTURE_BUNDLES, id).toContain(picture.bundle);
        expect(manifest.bundles[picture.bundle]?.sprites[picture.sprite], `${id}: ${picture.sprite}`).toBeDefined();
      }
    }
  });

  it('are drawn for the words that have none of their own already, one each, in the bundle with the fruit', () => {
    expect(DRAWN_WORD_IDS.length).toBeGreaterThan(0);
    for (const id of DRAWN_WORD_IDS)
      expect(WORDS[id].picture, id).toEqual({ kind: 'sprite', bundle: 'produce', sprite: wordSprite(id) });
  });

  it('show the crop that the tree or the bed gives', () => {
    for (const def of Object.values(PROP_DEFS)) {
      if (!def.harvest) continue;
      const words = wordsOf(propSubject(def.id));
      expect(words.length, def.id).toBeGreaterThan(0);
      const shown = words.map((w) => WORDS[w].picture).map((p) => (p.kind === 'sprite' ? p.sprite : ''));
      // The rainbow gem never keeps one colour, so it is spelled with the word for a gem that is
      // not one stone.
      for (const produce of def.harvest.produce)
        expect(shown, `${def.id} gives ${produce}`).toContain(
          produce === 'rainbow' ? wordSprite('crystal') : PRODUCE[produce].sprite,
        );
    }
  });
});

describe('the things that give words', () => {
  it('are all in the game: every creature kind, friend and prop named is real, and the props are ones the player can tap', () => {
    for (const subject of SUBJECTS) {
      const [family, name] = [subject.slice(0, subject.indexOf('.')), subject.slice(subject.indexOf('.') + 1)];
      if (family === 'life') expect(LIFE_KINDS, subject).toContain(name);
      else if (family === 'unicorn') expect(UNICORN_IDS, subject).toContain(name);
      else {
        const def = PROP_DEFS[name];
        expect(def, subject).toBeDefined();
        expect(['harvest', 'treasure', 'delight'], `${subject} must be something that answers a tap`).toContain(
          def!.tap,
        );
      }
    }
  });

  it('are standing somewhere in a real map, so every word can be collected', () => {
    for (const subject of SUBJECTS) expect(inTheWorld.has(subject), `${subject} is in no map`).toBe(true);
    for (const id of WORD_IDS)
      expect(
        WORDS[id].subjects.some((s) => inTheWorld.has(s)),
        `${id} cannot be reached`,
      ).toBe(true);
  });

  it('include every creature, every friend, everything that gives fruit and everything that delights the player, so nothing is free once learning is on', () => {
    for (const kind of LIFE_KINDS) expect(wordsOf(lifeSubject(kind)).length, kind).toBeGreaterThan(0);
    for (const id of UNICORN_IDS) expect(wordsOf(unicornSubject(id)).length, id).toBeGreaterThan(0);
    for (const def of Object.values(PROP_DEFS))
      if (def.harvest || def.tap === 'delight') expect(wordsOf(propSubject(def.id)).length, def.id).toBeGreaterThan(0);
  });

  it('offer the easiest word first, and a friend her own name before the word for every unicorn', () => {
    for (const subject of SUBJECTS) {
      const tiers = wordsOf(subject).map(tierOf);
      expect(tiers, subject).toEqual([...tiers].sort((a, b) => a - b));
    }
    expect(wordsOf('unicorn.leaf')).toEqual(['leaf', 'unicorn']);
    // Even where her name is as long as "unicorn", or longer.
    for (const id of UNICORN_IDS) expect(wordsOf(unicornSubject(id)), id).toEqual([id, 'unicorn']);
    expect(wordsOf('life.fairy')).toEqual(['wand', 'dust', 'wish', 'fairy', 'potion']);
    expect(wordsOf('prop.boxed-unicorn')).toEqual(['horn', 'hoof', 'hay', 'heart', 'ribbon']);
    expect(wordsOf('prop.nothing-here')).toEqual([]);
  });
});

describe('the treasure', () => {
  const treasures = Object.values(PROP_DEFS).filter((def) => def.tap === 'treasure');

  it('is one word for each thing the player can tap, so what they tap is what they are asked to spell', () => {
    expect(treasures.length).toBeGreaterThan(0);
    for (const def of treasures) expect(wordsOf(propSubject(def.id)), def.id).toHaveLength(1);
  });

  it('gives every gem a table of its own, and the table gives that gem', () => {
    for (const gem of GEM_TABLES) {
      expect(wordsOf(propSubject(tableOf(gem))), gem).toEqual([gem]);
      expect(gemOn(tableOf(gem)), gem).toBe(gem);
    }
    expect(treasures.filter((def) => def.treasure === 'gem').map((def) => def.id)).toEqual(GEM_TABLES.map(tableOf));
  });

  it('puts no word on two things, so no table can ask for what another table asks for', () => {
    const givers = treasures.map((def) => wordsOf(propSubject(def.id))[0]);
    expect(new Set(givers).size).toBe(givers.length);
  });

  it('lists the gems in the book in the order that the tables stand in the room', () => {
    expect(PAGES.find((page) => page.id === 'gem-room')!.words).toEqual(GEM_TABLES);
  });
});

describe('the words in the game already', () => {
  it('match what the creatures are called, and the friends are spelled by their names', () => {
    for (const kind of LIFE_KINDS) {
      expect(isWordId(LIFE[kind].word), `${kind} is called ${LIFE[kind].word}`).toBe(true);
      expect(LIFE[kind].id).toBe(lifeSubject(kind));
    }
    for (const id of UNICORN_IDS) {
      expect(isWordId(id), id).toBe(true);
      expect(UNICORN_DEFS[id].displayName.toLowerCase()).toBe(id);
    }
  });

  it('name the crops by what a child says, even where the game says more', () => {
    for (const [id, def] of Object.entries(PRODUCE)) {
      const word = id === 'sky-berry' ? 'berry' : id === 'rainbow' ? 'crystal' : id;
      expect(isWordId(word), `${def.word} is spelled ${word}`).toBe(true);
    }
  });
});

describe('the book', () => {
  it('has pages with a title, an emblem on the page, and between one and twelve words that exist', () => {
    const ids = new Set<string>();
    for (const page of PAGES) {
      expect(ids.has(page.id), `${page.id} twice`).toBe(false);
      ids.add(page.id);
      expect(page.title.length).toBeGreaterThan(2);
      expect(page.words.length).toBeGreaterThanOrEqual(1);
      expect(page.words.length).toBeLessThanOrEqual(12);
      expect(page.words as readonly string[]).toContain(page.emblem);
      expect(new Set(page.words).size, `${page.id} repeats a word`).toBe(page.words.length);
    }
  });

  it('puts every word on a page, so nothing the player collects is lost from the book', () => {
    const shown = new Set<WordId>(PAGES.flatMap((p) => p.words));
    for (const id of WORD_IDS) expect(shown.has(id), `${id} is on no page`).toBe(true);
  });
});
