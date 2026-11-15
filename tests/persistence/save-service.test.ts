import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { COMMIT_PATIENCE_MS, SaveService } from '../../src/persistence/save-service';
import { LocalStore } from '../../src/persistence/store';
import { makeWorld, teleport } from '../domain/fixtures';
import { ManualClock } from './helpers';

let store: LocalStore;
let ids = 0;
const newId = (): string => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  ids = 0;
  store = await LocalStore.open(`save-service-${Math.random().toString(16).slice(2)}`);
});

describe('retiring the save service', () => {
  it('stops writing, so the game cannot save over a world a parent installed', async () => {
    const service = new SaveService(store, new ManualClock(1_000), newId);
    const world = makeWorld();
    await service.flush(world);
    const before = await store.current();

    service.retire();
    teleport(world, 'wildstar', { x: 1200, y: 900 });
    service.request('position', world);
    service.request('recruit', world);
    await service.flush(world);
    service.hide();
    await service.idle();

    expect((await store.current())!.snapshotId).toBe(before!.snapshotId);
    expect(await store.history()).toHaveLength(1);
  });
});

describe('a device that stops answering', () => {
  /** A store whose writes never finish until the test lets them. */
  const stalled = (): { sink: LocalStore; release: () => void; asked: () => number } => {
    let asked = 0;
    const waiting: (() => void)[] = [];
    const sink = Object.assign(Object.create(store) as LocalStore, {
      commit: (...args: Parameters<LocalStore['commit']>): Promise<void> => {
        asked += 1;
        return new Promise<void>((resolve) => waiting.push(() => resolve(store.commit(...args))));
      },
    });
    return {
      sink,
      release: () =>
        waiting.splice(0).forEach((go) => {
          go();
        }),
      asked: () => asked,
    };
  };

  it('is called failed once a write has taken too long, so a flush returns and the status says so', async () => {
    const clock = new ManualClock(1_000);
    const { sink } = stalled();
    const service = new SaveService(sink, clock, newId);
    let flushed = false;
    void service.flush(makeWorld()).then(() => (flushed = true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(flushed).toBe(false);
    expect(service.status.state).toBe('saving');

    clock.advance(COMMIT_PATIENCE_MS);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(flushed).toBe(true);
    expect(service.status).toMatchObject({ state: 'failed', kind: 'error' });
  });

  it('tries again later, and saves what the world is by then once the device answers', async () => {
    const clock = new ManualClock(1_000);
    const { sink, release, asked } = stalled();
    const service = new SaveService(sink, clock, newId);
    const world = makeWorld();
    void service.flush(world);
    await new Promise((resolve) => setTimeout(resolve, 5));
    clock.advance(COMMIT_PATIENCE_MS);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asked()).toBe(1);

    // The retry is by the clock, and nothing was written yet.
    expect(await store.current()).toBeNull();
    teleport(world, 'wildstar', { x: 1300, y: 800 });
    clock.advance(10_000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asked()).toBe(2);
    release();
    await service.idle();
    expect(service.status.state).toBe('saved');
    expect((await store.current())!.save.wildstar.position).toEqual({ x: 1300, y: 800 });
  });

  it('does not make a write that is quick wait, or call it failed', async () => {
    const clock = new ManualClock(1_000);
    const service = new SaveService(store, clock, newId);
    await service.flush(makeWorld());
    expect(service.status.state).toBe('saved');
    // The timer that guards the write is gone with it.
    expect(clock.pending).toBe(0);
  });
});
