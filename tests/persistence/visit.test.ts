import { afterEach, describe, expect, it, vi } from 'vitest';
import { newPersistent, toSave } from '../../src/domain';
import type { LoadOutcome } from '../../src/persistence/load';
import { SaveService } from '../../src/persistence/save-service';
import {
  BEGUN_KEY,
  beginAt,
  chooseVisit,
  firstPlan,
  forgetBegun,
  forgetVisit,
  hasBegun,
  markBegun,
  openingOf,
  VISIT_KEY,
  VisitSink,
  visitOutcome,
} from '../../src/persistence/visit';
import { MAP_IDS } from '../../src/shared/ids';
import { START_PLACES } from '../../src/shared/places';
import { makeWorld, teleport } from '../domain/fixtures';
import { ManualClock } from './helpers';

const at = (search = '') => ({ search });

describe('how an opening treats the saved world', () => {
  it('carries on with the saved world, and starts from the beginning when the setting says so', () => {
    expect(chooseVisit(at(), true)).toBe('fresh');
    expect(chooseVisit(at(), false)).toBe('kept');
  });

  it('is a look around when the address says incognito, whatever the setting says', () => {
    expect(chooseVisit(at('?incognito'), true)).toBe('incognito');
    expect(chooseVisit(at('?incognito'), false)).toBe('incognito');
    expect(chooseVisit(at('?test&incognito=1'), false)).toBe('incognito');
  });

  it('does not take other words for it', () => {
    for (const search of ['?incognitos', '?Incognito', '?x=incognito', '#incognito'])
      expect(chooseVisit(at(search), true), search).toBe('fresh');
  });

  it('lets ?keep carry on with the saved world once, but never over a look around', () => {
    expect(chooseVisit(at('?keep'), true)).toBe('kept');
    expect(chooseVisit(at('?keep&incognito'), true)).toBe('incognito');
  });

  it('lets ?fresh start from the beginning once, never over a look around, and never over ?keep', () => {
    expect(chooseVisit(at('?fresh'), false)).toBe('fresh');
    expect(chooseVisit(at('?test&fresh'), false)).toBe('fresh');
    expect(chooseVisit(at('?fresh&incognito'), false)).toBe('incognito');
    expect(chooseVisit(at('?keep&fresh'), true)).toBe('kept');
  });
});

describe('the note that a game was begun in a tab', () => {
  it('is there once Play was pressed, and gone when it is forgotten', () => {
    const t = tab();
    expect(hasBegun(t)).toBe(false);
    markBegun(t);
    expect(t.items.get(BEGUN_KEY)).toBe('1');
    expect(hasBegun(t)).toBe(true);
    forgetBegun(t);
    expect(hasBegun(t)).toBe(false);
  });

  it('reads as not begun, and costs nothing, when the tab cannot remember or cannot be read', () => {
    const refusing = {
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    expect(() => markBegun(refusing)).not.toThrow();
    expect(() => forgetBegun(refusing)).not.toThrow();
    expect(hasBegun(refusing)).toBe(false);
    expect(() => markBegun(null)).not.toThrow();
    expect(hasBegun(null)).toBe(false);
  });

  it('does not count what is not the note', () => {
    expect(hasBegun(tab({ [BEGUN_KEY]: 'yes' }))).toBe(false);
    expect(hasBegun(tab({ [VISIT_KEY]: '{}' }))).toBe(false);
  });
});

/**
 * A world saved on the device with three friends, a prop changed and a map visited, standing in the
 * playground.
 */
function savedWorld(): Extract<LoadOutcome, { kind: 'resume' }> {
  const world = makeWorld();
  world.persistent.recruited = ['wildstar', 'leaf', 'river', 'storm'];
  world.persistent.visitedMaps = ['forest', 'playground'];
  world.persistent.props = { 'forest/chest-1': { kind: 'chest', open: true } };
  teleport(world, 'wildstar', { x: 910, y: 640 });
  const planned = visitOutcome(
    tab({ [VISIT_KEY]: JSON.stringify(toSave(world, '00000000-0000-4000-8000-000000000001')) }),
    MAP_IDS,
  );
  if (planned.kind !== 'resume') throw new Error('the saved world was not read');
  return planned;
}
const NEW = { worldGeneration: '00000000-0000-4000-8000-0000000000aa', seed: 99 };

describe('what an opening puts on the screen', () => {
  it('carries a kept world on where the player stood only in a tab that has begun, and otherwise begins it at the start place with its herd', () => {
    const saved = savedWorld();
    expect(openingOf('kept', saved, true, NEW).resumed).toBe(saved.plan);
    const here = openingOf('kept', saved, false, NEW);
    expect(here.resumed).toBeNull();
    expect(here.held.persistent.recruited).toEqual(['wildstar', 'leaf', 'river', 'storm']);
    expect(here.held.persistent.props).toEqual({ 'forest/chest-1': { kind: 'chest', open: true } });
  });

  it('carries a visit on from its note, whether or not Play was pressed, because the note is the visit', () => {
    const saved = savedWorld();
    expect(openingOf('fresh', saved, false, NEW).resumed).not.toBeNull();
    expect(openingOf('fresh', saved, true, NEW).resumed).not.toBeNull();
  });

  it('starts a new world when nothing is saved, in a kept visit, a visit from the beginning and a look around alike', () => {
    for (const visit of ['kept', 'fresh', 'incognito'] as const) {
      for (const begun of [false, true]) {
        const opening = openingOf(visit, { kind: 'fresh', damaged: false }, begun, NEW);
        expect(opening.resumed, `${visit} ${begun}`).toBeNull();
        expect(opening.held).toEqual({ persistent: newPersistent(NEW.worldGeneration), seed: 99 });
      }
    }
  });

  it('begins at the place the player chose, with the herd and the changes the world holds', () => {
    const opening = openingOf('kept', savedWorld(), false, NEW);
    for (const place of ['forest', 'palace'] as const) {
      const plan = firstPlan(opening, place);
      expect(plan.mapId).toBe(START_PLACES[place].mapId);
      expect(plan.arrival).toEqual({ kind: 'spawn', spawnId: START_PLACES[place].spawnId });
      expect(plan.persistent.recruited).toEqual(['wildstar', 'leaf', 'river', 'storm']);
      expect(plan.persistent.visitedMaps).toEqual(['forest', 'playground']);
      expect(plan.persistent.props).toEqual({ 'forest/chest-1': { kind: 'chest', open: true } });
    }
  });

  it('puts a carried-on game back where the player stood, whatever place is chosen', () => {
    const saved = savedWorld();
    const opening = openingOf('kept', saved, true, NEW);
    const plan = firstPlan(opening, 'palace');
    expect(plan.mapId).toBe('forest');
    expect(plan.arrival).toMatchObject({ kind: 'saved', position: { x: 910, y: 640 } });
  });

  it('makes each plan from a copy, so a world made from one cannot change the herd or places of the next', () => {
    const opening = openingOf('kept', savedWorld(), true, NEW);
    const first = firstPlan(opening, 'forest');
    first.persistent.recruited.push('cinder');
    first.persistent.visitedMaps.push('stable');
    (first.persistent.props['forest/chest-1'] as { open: boolean }).open = false;
    const later = beginAt(opening.held, 'palace');
    expect(later.persistent.recruited).toEqual(['wildstar', 'leaf', 'river', 'storm']);
    expect(later.persistent.visitedMaps).toEqual(['forest', 'playground']);
    expect(later.persistent.props['forest/chest-1']).toEqual({ kind: 'chest', open: true });
    expect(beginAt(opening.held, 'palace').persistent).not.toBe(later.persistent);
  });
});

/** The part of a tab's storage that a visit uses, with a record of what was written. */
function tab(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

describe('the note a visit keeps in its tab', () => {
  it('holds the latest save, so a reload carries the visit on', async () => {
    const t = tab();
    const sink = new VisitSink(t);
    const world = makeWorld();
    await sink.commit(toSave(world, '00000000-0000-4000-8000-000000000001'));
    teleport(world, 'wildstar', { x: 900, y: 700 });
    await sink.commit(toSave(world, '00000000-0000-4000-8000-000000000002'));
    expect(JSON.parse(t.items.get(VISIT_KEY)!).snapshotId).toBe('00000000-0000-4000-8000-000000000002');
    expect(visitOutcome(t, MAP_IDS)).toMatchObject({ kind: 'resume', skipped: 0 });
  });

  it('is forgotten when a new version takes over, so the next load is a new game', async () => {
    const t = tab();
    await new VisitSink(t).commit(toSave(makeWorld(), '00000000-0000-4000-8000-000000000001'));
    expect(visitOutcome(t, MAP_IDS).kind).toBe('resume');
    forgetVisit(t);
    expect(visitOutcome(t, MAP_IDS).kind).toBe('fresh');
    expect(() => forgetVisit(null)).not.toThrow();
  });

  it('puts the visit back where it was', async () => {
    const t = tab();
    const world = makeWorld();
    teleport(world, 'wildstar', { x: 910, y: 640 });
    await new VisitSink(t).commit(toSave(world, '00000000-0000-4000-8000-000000000001'));
    const outcome = visitOutcome(t, MAP_IDS);
    if (outcome.kind !== 'resume') throw new Error('the visit was not resumed');
    expect(outcome.plan.mapId).toBe(world.map.id);
    expect(outcome.plan.persistent.recruited).toEqual(world.persistent.recruited);
  });

  it('starts from the beginning when the tab has no note, no tab storage, or a note that cannot be used', () => {
    const fresh = { kind: 'fresh', damaged: false };
    expect(visitOutcome(tab(), MAP_IDS)).toEqual(fresh);
    expect(visitOutcome(null, MAP_IDS)).toEqual(fresh);
    expect(visitOutcome(tab({ [VISIT_KEY]: '{not json' }), MAP_IDS)).toEqual(fresh);
    expect(visitOutcome(tab({ [VISIT_KEY]: '{"schemaVersion":1}' }), MAP_IDS)).toEqual(fresh);
    expect(visitOutcome(tab({ [VISIT_KEY]: 'null' }), MAP_IDS)).toEqual(fresh);
  });

  it('starts from the beginning when the note is in a place this build does not have', async () => {
    const t = tab();
    await new VisitSink(t).commit(toSave(makeWorld(), '00000000-0000-4000-8000-000000000001'));
    expect(
      visitOutcome(
        t,
        MAP_IDS.filter((id) => id !== 'forest'),
      ),
    ).toEqual({ kind: 'fresh', damaged: false });
  });

  it('costs a visit its reload and nothing else when the tab cannot remember', async () => {
    const refusing = {
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const save = toSave(makeWorld(), '00000000-0000-4000-8000-000000000001');
    await expect(new VisitSink(refusing).commit(save)).resolves.toBeUndefined();
    await expect(new VisitSink(null).commit(save)).resolves.toBeUndefined();
  });
});

describe('saving a visit', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes to the tab, reports saved, and does not ask the browser to protect storage it is not using', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const t = tab();
    let n = 0;
    const service = new SaveService(
      new VisitSink(t),
      new ManualClock(1_000),
      () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    );
    await service.flush(makeWorld());
    expect(service.status.state).toBe('saved');
    expect(t.items.has(VISIT_KEY)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });
});
