import { describe, expect, it } from 'vitest';
import { Durability, type Durable, type StorageManagerLike } from '../../src/persistence/durable';

/**
 * A storage manager that answers as it is told. It also has `persist`, which asks the browser, so
 * that a test can see it is never called.
 */
function manager(says: boolean | 'refuses') {
  const calls = { persisted: 0, persist: 0 };
  const storage: StorageManagerLike & { persist(): Promise<boolean> } = {
    persisted: async () => {
      calls.persisted += 1;
      if (says === 'refuses') throw new DOMException('no', 'NotAllowedError');
      return says;
    },
    persist: async () => {
      calls.persist += 1;
      return true;
    },
  };
  return { storage, calls };
}

describe('what the browser says about keeping what is stored', () => {
  it('knows nothing until it looks', () => {
    const { storage, calls } = manager(true);
    expect(new Durability(storage).get()).toBe('unknown');
    expect(calls.persisted).toBe(0);
  });

  it('says what the browser says, as it is now', async () => {
    const kept = manager(true);
    const promised = new Durability(kept.storage);
    expect(await promised.check()).toBe('promised');
    expect(promised.get()).toBe('promised');

    const loose = manager(false);
    const not = new Durability(loose.storage);
    expect(await not.check()).toBe('not-promised');
    expect(not.get()).toBe('not-promised');
  });

  it('only reads, and never asks the browser for anything, so it cannot put a question to whoever is at the screen', async () => {
    const { storage, calls } = manager(false);
    const durable = new Durability(storage);
    await durable.check();
    await durable.check();
    expect(calls.persist).toBe(0);
    expect(calls.persisted).toBe(2);
  });

  it('reads again each time, since a browser can change its mind once the game has been installed', async () => {
    let installed = false;
    const durable = new Durability({ persisted: async () => installed });
    expect(await durable.check()).toBe('not-promised');
    installed = true;
    expect(await durable.check()).toBe('promised');
  });

  it('gives one answer to two lookers at once, and reads once', async () => {
    const { storage, calls } = manager(true);
    const durable = new Durability(storage);
    const [first, second] = await Promise.all([durable.check(), durable.check()]);
    expect([first, second]).toEqual(['promised', 'promised']);
    expect(calls.persisted).toBe(1);
    // And it can read again once that is over.
    await durable.check();
    expect(calls.persisted).toBe(2);
  });

  it('does not throw when the browser will not answer, and says it has neither promised nor refused', async () => {
    expect(await new Durability(manager('refuses').storage).check()).toBe('unknown');
    const broken = new Durability({ persisted: () => Promise.reject(new Error('storage is not available here')) });
    expect(await broken.check()).toBe('unknown');
  });

  it('forgets a promise it can no longer read', async () => {
    let answer: () => Promise<boolean> = async () => true;
    const durable = new Durability({ persisted: () => answer() });
    expect(await durable.check()).toBe('promised');
    answer = () => Promise.reject(new Error('gone'));
    expect(await durable.check()).toBe('unknown');
  });

  it('says unknown where there is no storage manager, or one that cannot say', async () => {
    expect(await new Durability(undefined).check()).toBe('unknown');
    expect(await new Durability({}).check()).toBe('unknown');
  });

  it('calls the method on the manager it was given, as a real storage manager must be called', async () => {
    class Real {
      kept = true;
      async persisted(): Promise<boolean> {
        return this.kept;
      }
    }
    expect(await new Durability(new Real()).check()).toBe('promised');
  });

  it('tells whoever is watching about a change, once, and not about an answer that is the same', async () => {
    let answer = false;
    const durable = new Durability({ persisted: async () => answer });
    const heard: Durable[] = [];
    const stop = durable.subscribe((d) => heard.push(d));
    await durable.check();
    await durable.check();
    answer = true;
    await durable.check();
    await durable.check();
    expect(heard).toEqual(['not-promised', 'promised']);
    stop();
    answer = false;
    await durable.check();
    expect(heard).toEqual(['not-promised', 'promised']);
    expect(durable.get()).toBe('not-promised');
  });
});
