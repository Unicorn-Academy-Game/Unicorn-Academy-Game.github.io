import { describe, expect, it } from 'vitest';
import { isTable, PROP_DEFS, TABLE_IDS, type TableId } from '../../src/content/props';
import { CINEMA_IDS, CINEMAS, isCinema, isFree, isWonder, WONDER_IDS, WONDERS } from '../../src/content/wonders';
import { PIANO_KEYS, timeOfKey } from '../../src/shared/piano';
import { builtWonders } from '../../src/wonder/registry';

describe('the games of the playground toys', () => {
  it('name a toy that exists, and read the looks that toy has', () => {
    for (const id of WONDER_IDS) {
      const wonder = WONDERS[id];
      expect(wonder.id).toBe(id);
      const toy = PROP_DEFS[wonder.toy];
      // A game whose toy is still to come (the frog pond) has no toy to read yet.
      if (!toy) continue;
      expect(toy.looks ?? [], `${id} reads the looks of ${wonder.toy}`).toEqual(wonder.looks);
    }
  });

  it('are opened by the toy they name, and by no other', () => {
    // A statue opens a postcard, which is a scene to watch and belongs to no one toy: all eight
    // statues open the same one.
    const opening = Object.values(PROP_DEFS).filter((d) => d.tap === 'minigame' && isWonder(d.minigame!));
    for (const def of opening) expect(WONDERS[def.minigame as keyof typeof WONDERS].toy, `${def.id}`).toBe(def.id);
    expect(new Set(Object.values(WONDERS).map((w) => w.toy)).size, 'one toy for each game').toBe(WONDER_IDS.length);
    expect(opening.length, 'every game has its toy').toBe(WONDER_IDS.length);
  });

  it('let a toy that needs more than the usual moment take it, and never more than its own reaction lasts', () => {
    for (const def of Object.values(PROP_DEFS)) {
      if (def.leadIn === undefined) continue;
      expect(def.tap, `${def.id} opens a game`).toBe('minigame');
      expect(def.leadIn, `${def.id} waits for its reaction and no longer`).toBeLessThanOrEqual(def.delight!.seconds);
    }
  });

  it("open the piano's game only after the finger has run off the last key, so that the run is seen and heard", () => {
    expect(PROP_DEFS.piano!.leadIn!).toBeGreaterThanOrEqual(timeOfKey(PIANO_KEYS - 1));
  });

  it('give every statue the postcard that shows where that statue comes from', () => {
    const statues = Object.values(PROP_DEFS).filter((d) => d.id.startsWith('statue-'));
    expect(statues.length).toBe(8);
    for (const def of statues) expect(def.minigame, def.id).toBe('statue-postcard');
  });

  it('mark the piano as the one game with nothing to earn, so that no other game loses its stars', () => {
    expect(WONDER_IDS.filter(isFree)).toEqual(['tone-matrix']);
    expect(isFree('statue-postcard')).toBe(false);
    expect(isFree('nothing')).toBe(false);
  });

  it('name each scene that is watched, once, with a label a screen reader can say', () => {
    for (const id of CINEMA_IDS) {
      expect(isCinema(id)).toBe(true);
      expect(isWonder(id), `${id} is not also a game`).toBe(false);
      expect(CINEMAS[id].id).toBe(id);
      expect(CINEMAS[id].label.length).toBeGreaterThan(8);
    }
    expect(new Set(CINEMA_IDS).size).toBe(CINEMA_IDS.length);
  });

  it('are only opened by a toy once the game is built, so a tap never leads nowhere', () => {
    const built = new Set<string>(builtWonders());
    for (const def of Object.values(PROP_DEFS)) {
      // The screen of a table is not a wonder: its own session opens it, and the specs of the
      // tables tap them.
      if (def.tap === 'minigame' && !isTable(def.minigame))
        expect(built.has(def.minigame!), `${def.id} opens ${def.minigame}`).toBe(true);
    }
  });

  it('give each screen of learning to its own table and to nothing else', () => {
    const owner: Record<TableId, string> = { reading: 'computer', memory: 'memory-table', maths: 'abacus' };
    for (const table of TABLE_IDS)
      expect(
        Object.values(PROP_DEFS)
          .filter((def) => def.minigame === table)
          .map((def) => def.id),
        table,
      ).toEqual([owner[table]]);
  });

  it('keep a toy that has a game, and its look, reacting when it is tapped', () => {
    for (const def of Object.values(PROP_DEFS)) {
      if (def.tap === 'minigame') expect(def.delight, `${def.id} reacts as its game opens`).toBeDefined();
    }
  });
});
