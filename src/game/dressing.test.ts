import { describe, expect, it, vi } from 'vitest';
import type { Cell } from '../render/season';
import type { SeasonId } from '../shared/seasons';
import { Dressing, inSlices, type Paint, type Painting } from './dressing';

const cell = (w: number, h: number, x = 0): Cell => ({ x, y: 0, w, h, role: 'prop' });

describe('the pictures on a page, in slices', () => {
  it('gives nothing for a page with nothing on it', () => {
    expect(inSlices([], 100)).toEqual([]);
  });

  it('keeps every picture whole and in its place, and closes a slice once it holds the budget', () => {
    const cells = [cell(10, 10), cell(10, 10), cell(10, 10), cell(10, 10), cell(10, 10)];
    const slices = inSlices(cells, 200);
    expect(slices.map((s) => s.length)).toEqual([2, 2, 1]);
    expect(slices.flat()).toEqual(cells);
  });

  it('puts a picture that is bigger than the budget in a slice of its own', () => {
    const big = cell(100, 100);
    const slices = inSlices([cell(5, 5), big, cell(5, 5)], 500);
    expect(slices.map((s) => s.length)).toEqual([2, 1]);
    expect(slices[0]).toContain(big);
  });
});

/**
 * A picture the engine holds, which `updateSource` replaces, and a way to tell what it was changed
 * to.
 */
interface Held {
  image: object;
  changes: object[];
  updateSource(image: object): void;
}

function engine(keys: readonly string[]): {
  textures: ConstructorParameters<typeof Dressing>[0];
  held: Map<string, Held>;
  remove(key: string): void;
} {
  const held = new Map<string, Held>();
  for (const key of keys) {
    const source: Held = {
      image: { drawn: key },
      changes: [],
      updateSource(image) {
        source.image = image;
        source.changes.push(image);
      },
    };
    held.set(key, source);
  }
  const textures = {
    exists: (key: string) => held.has(key),
    get: (key: string) => ({ source: [held.get(key)] }),
  } as unknown as ConstructorParameters<typeof Dressing>[0];
  return { textures, held, remove: (key) => void held.delete(key) };
}

/** A painter that makes a canvas that says what it is for, and notes what it was asked to paint. */
function painter(): { paint: Paint; asked: { key: unknown; season: SeasonId; cells: Painting['cells'] }[] } {
  const asked: { key: unknown; season: SeasonId; cells: Painting['cells'] }[] = [];
  const paint: Paint = async (picture, season) => {
    asked.push({ key: (picture.pristine as unknown as { drawn: string }).drawn, season, cells: picture.cells });
    return { painted: season, from: picture.pristine } as unknown as HTMLCanvasElement;
  };
  return { paint, asked };
}

const CELLS = [cell(8, 8)];

/** A painter that is stopped part way until the test lets it go, and says when it got there. */
function gate(): { wait(): Promise<void>; started: Promise<void>; open(): void } {
  let open: () => void = () => undefined;
  let began: () => void = () => undefined;
  const opened = new Promise<void>((done) => (open = done));
  const started = new Promise<void>((done) => (began = done));
  return {
    wait: () => {
      began();
      return opened;
    },
    started,
    open: () => open(),
  };
}

describe('textures that are kept dressed', () => {
  it('leave a picture alone in summer, which is the picture itself', async () => {
    const { textures, held } = engine(['page']);
    const { paint, asked } = painter();
    const dressing = new Dressing(textures, paint);
    dressing.keep('page', CELLS);
    await dressing.dress(['page']);
    expect(asked).toEqual([]);
    expect(held.get('page')!.changes).toEqual([]);
  });

  it('paint every kept texture for a season, from the picture as it was drawn, with its own cells', async () => {
    const { textures, held } = engine(['page', 'ground']);
    const { paint, asked } = painter();
    const dressing = new Dressing(textures, paint);
    dressing.keep('page', CELLS);
    dressing.keep('ground', null);
    await dressing.setSeason('winter');
    expect(asked.map((a) => [a.key, a.season])).toEqual([
      ['page', 'winter'],
      ['ground', 'winter'],
    ]);
    expect(asked.find((a) => a.key === 'page')!.cells).toBe(CELLS);
    expect(asked.find((a) => a.key === 'ground')!.cells).toBeNull();
    expect(held.get('page')!.image).toMatchObject({ painted: 'winter', from: { drawn: 'page' } });
    expect(held.get('ground')!.image).toMatchObject({ painted: 'winter' });
  });

  it('go back to the picture itself when summer comes round', async () => {
    const { textures, held } = engine(['page']);
    const { paint } = painter();
    const dressing = new Dressing(textures, paint);
    const original = held.get('page')!.image;
    dressing.keep('page', CELLS);
    await dressing.setSeason('autumn');
    expect(held.get('page')!.image).not.toBe(original);
    await dressing.setSeason('summer');
    expect(held.get('page')!.image).toBe(original);
  });

  it('paint the next season from the picture as it was drawn and not from the last season', async () => {
    const { textures } = engine(['page']);
    const { paint, asked } = painter();
    const dressing = new Dressing(textures, paint);
    dressing.keep('page', CELLS);
    await dressing.setSeason('winter');
    await dressing.setSeason('spring');
    expect(asked.map((a) => a.key)).toEqual(['page', 'page']);
  });

  it('are painted for the season that is showing when they come in late', async () => {
    const { textures, held } = engine(['early', 'late']);
    const { paint, asked } = painter();
    const dressing = new Dressing(textures, paint);
    dressing.keep('early', CELLS);
    await dressing.setSeason('winter');
    dressing.keep('late', CELLS);
    await dressing.dress(['late']);
    expect(asked.map((a) => [a.key, a.season])).toEqual([
      ['early', 'winter'],
      ['late', 'winter'],
    ]);
    expect(held.get('late')!.image).toMatchObject({ painted: 'winter' });
  });

  it('are not painted twice for the same season', async () => {
    const { textures } = engine(['page']);
    const { paint, asked } = painter();
    const dressing = new Dressing(textures, paint);
    dressing.keep('page', CELLS);
    await dressing.setSeason('winter');
    await dressing.setSeason('winter');
    await dressing.dress(['page']);
    dressing.keep('page', null);
    expect(asked).toHaveLength(1);
  });

  it('move to the newest season when the season changes while one is being painted, and show only what is right', async () => {
    const { textures, held } = engine(['page']);
    const stillAsked: boolean[] = [];
    const stopped = gate();
    const slow: Paint = async (picture, season, still) => {
      if (season === 'winter') {
        await stopped.wait();
        stillAsked.push(still());
        if (!still()) return null;
      }
      return { painted: season, from: picture.pristine } as unknown as HTMLCanvasElement;
    };
    const dressing = new Dressing(textures, slow);
    dressing.keep('page', CELLS);
    const first = dressing.setSeason('winter');
    await stopped.started;
    const second = dressing.setSeason('autumn');
    stopped.open();
    await Promise.all([first, second]);
    expect(stillAsked).toEqual([false]);
    expect(held.get('page')!.changes).toHaveLength(1);
    expect(held.get('page')!.image).toMatchObject({ painted: 'autumn' });
  });

  it('are not touched once they are forgotten, though a painting of them is on its way', async () => {
    const { textures, held } = engine(['page']);
    const stopped = gate();
    const slow: Paint = async (picture, season) => {
      await stopped.wait();
      return { painted: season, from: picture.pristine } as unknown as HTMLCanvasElement;
    };
    const dressing = new Dressing(textures, slow);
    dressing.keep('page', CELLS);
    const work = dressing.setSeason('winter');
    await stopped.started;
    dressing.forget('page');
    stopped.open();
    await work;
    expect(held.get('page')!.changes).toEqual([]);
  });

  it('are left as they were when the engine let them go while they were being painted', async () => {
    const { textures, held, remove } = engine(['page']);
    const stopped = gate();
    const slow: Paint = async (picture, season) => {
      await stopped.wait();
      return { painted: season, from: picture.pristine } as unknown as HTMLCanvasElement;
    };
    const dressing = new Dressing(textures, slow);
    dressing.keep('page', CELLS);
    const source = held.get('page')!;
    const work = dressing.setSeason('winter');
    await stopped.started;
    remove('page');
    stopped.open();
    await work;
    expect(source.changes).toEqual([]);
  });

  it('keep the picture they had when a season cannot be painted, and go on to the next one that can', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { textures, held } = engine(['page']);
      const failing: Paint = async (picture, season) => {
        if (season === 'winter') throw new Error('no room');
        return { painted: season, from: picture.pristine } as unknown as HTMLCanvasElement;
      };
      const dressing = new Dressing(textures, failing);
      const original = held.get('page')!.image;
      dressing.keep('page', CELLS);
      await dressing.setSeason('winter');
      expect(held.get('page')!.image).toBe(original);
      expect(quiet).toHaveBeenCalledTimes(1);
      await dressing.setSeason('autumn');
      expect(held.get('page')!.image).toMatchObject({ painted: 'autumn' });
    } finally {
      quiet.mockRestore();
    }
  });

  it('do not keep a texture twice, so a place that is brought in again is not painted again', async () => {
    const { textures } = engine(['page']);
    const { paint, asked } = painter();
    const dressing = new Dressing(textures, paint);
    dressing.keep('page', CELLS);
    await dressing.setSeason('winter');
    dressing.keep('page', CELLS);
    await dressing.dress(['page']);
    expect(asked).toHaveLength(1);
  });
});
