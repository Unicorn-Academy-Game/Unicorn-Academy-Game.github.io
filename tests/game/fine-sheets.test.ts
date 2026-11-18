import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FineSheets } from '../../src/game/fine-sheets';
import type { UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const PAGES = manifest.unicorns.wildstar.fine!.atlases.length;
const sheetsOf = (id: UnicornId): number => manifest.unicorns[id].fine!.atlases.length;
/** Each unicorn's name once for every sheet she has, in the order they are asked for. */
const eachSheetOf = (ids: readonly UnicornId[]): UnicornId[] =>
  ids.flatMap((id) => Array.from({ length: sheetsOf(id) }, () => id));

/** A loader that records what it was asked and lets a test say when each answer comes. */
function loader(fail: (id: UnicornId, page: number) => boolean = () => false) {
  const log: string[] = [];
  let inFlight = 0;
  let mostAtOnce = 0;
  return {
    log,
    get mostAtOnce() {
      return mostAtOnce;
    },
    textures: {
      async loadUnicornFine(_: Manifest, id: UnicornId, page: number): Promise<void> {
        log.push(`load ${id} ${page}`);
        inFlight += 1;
        mostAtOnce = Math.max(mostAtOnce, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        if (fail(id, page)) throw new Error('no network');
      },
    },
  };
}

/** Lets everything that can run, run. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

describe('bringing in the fine sheets of the unicorns who are out', () => {
  it('loads every sheet of a unicorn who is asked for, in order, with a rest after each', async () => {
    const l = loader();
    const waits: number[] = [];
    const sheets = new FineSheets(l.textures, manifest, 'herd', async (ms) => void waits.push(ms));
    sheets.want('wildstar');
    await settle();
    expect(l.log).toEqual(Array.from({ length: PAGES }, (_, p) => `load wildstar ${p}`));
    expect(waits).toHaveLength(PAGES);
    expect(Math.min(...waits)).toBeGreaterThan(0);
  });

  it('brings the unicorns in the order they were asked for, one sheet at a time', async () => {
    const l = loader();
    const sheets = new FineSheets(l.textures, manifest, 'herd', () => Promise.resolve());
    const order = ['storm', 'wildstar', 'leaf'] as const;
    for (const id of order) sheets.want(id);
    await settle();
    expect(l.log.map((entry) => entry.split(' ')[1])).toEqual(eachSheetOf(order));
    expect(l.mostAtOnce).toBe(1);
  });

  it('waits for the rest before the next sheet, so the game is left alone in between', async () => {
    const l = loader();
    let release: () => void = () => undefined;
    let resting = 0;
    const sheets = new FineSheets(l.textures, manifest, 'herd', () => {
      resting += 1;
      return new Promise<void>((resolve) => (release = resolve));
    });
    sheets.want('wildstar');
    await settle();
    expect(l.log).toEqual(['load wildstar 0']);
    expect(resting).toBe(1);
    release();
    await settle();
    expect(l.log).toEqual(['load wildstar 0', 'load wildstar 1']);
  });

  it('asks for a unicorn once however often she is put on screen', async () => {
    const l = loader();
    const sheets = new FineSheets(l.textures, manifest, 'herd', () => Promise.resolve());
    sheets.want('river');
    sheets.want('river');
    await settle();
    sheets.want('river');
    await settle();
    expect(l.log).toHaveLength(PAGES);
  });

  it('takes an ask that comes while another unicorn is coming, and brings her after', async () => {
    const l = loader();
    const sheets = new FineSheets(l.textures, manifest, 'herd', () => Promise.resolve());
    sheets.want('glacier');
    await Promise.resolve();
    sheets.want('cinder');
    await settle();
    expect(l.log.map((entry) => entry.split(' ')[1])).toEqual(eachSheetOf(['glacier', 'cinder']));
  });

  it('loads only Wildstar for a device that shows the fine facings of the leader alone', async () => {
    const l = loader();
    const sheets = new FineSheets(l.textures, manifest, 'leader', () => Promise.resolve());
    for (const id of ['leaf', 'wildstar', 'storm']) sheets.want(id as UnicornId);
    await settle();
    expect(l.log).toEqual(Array.from({ length: PAGES }, (_, p) => `load wildstar ${p}`));
  });

  it('loads nothing on a device that does not show the fine facings', async () => {
    const l = loader();
    const sheets = new FineSheets(l.textures, manifest, 'none', () => Promise.resolve());
    sheets.want('wildstar');
    await settle();
    expect(l.log).toEqual([]);
  });

  it('leaves a unicorn with the eight she has when a sheet does not come, goes on to the next, and asks for her again when she is next put on screen', async () => {
    let failing = true;
    const l = loader((id) => id === 'leaf' && failing);
    const sheets = new FineSheets(l.textures, manifest, 'herd', () => Promise.resolve());
    sheets.want('leaf');
    sheets.want('storm');
    await settle();
    const storm = Array.from({ length: sheetsOf('storm') }, (_, page) => `load storm ${page}`);
    expect(l.log).toEqual(['load leaf 0', ...storm]);
    failing = false;
    sheets.want('leaf');
    await settle();
    expect(l.log.slice(1 + storm.length)).toEqual(
      Array.from({ length: sheetsOf('leaf') }, (_, page) => `load leaf ${page}`),
    );
  });
});
