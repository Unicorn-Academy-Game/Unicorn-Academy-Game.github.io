import { describe, expect, it } from 'vitest';
import { OfflineService, RETRY_AFTER_MS, SWITCH_WAIT_MS } from '../../src/offline/service';
import type { OfflineStatus } from '../../src/offline/status';
import { environment, FakeContainer, FakeRegistration, FakeWorker, NO_VOICE, report, SCOPE } from './world';

/**
 * A page with the service worker already installed and serving, as on any visit after the first.
 */
async function installed() {
  const container = new FakeContainer();
  const registration = new FakeRegistration();
  container.registration = registration;
  const active = new FakeWorker();
  registration.active = active;
  active.state = 'activated';
  const world = environment(container);
  const service = new OfflineService(world.env);
  await service.start();
  return { container, registration, active, service, ...world };
}

const watch = (service: OfflineService): OfflineStatus[] => {
  const seen: OfflineStatus[] = [];
  service.subscribe((s) => void seen.push(s));
  return seen;
};

describe('where there is no service worker', () => {
  it('says offline play is not available, and does nothing else', async () => {
    const { env } = environment(null);
    const service = new OfflineService(env);
    expect(service.status).toEqual({ kind: 'unsupported' });
    await service.start();
    service.keep();
    service.online();
    service.checkForUpdate();
    expect(await service.switchIfWaiting()).toBe(false);
    expect(service.status).toEqual({ kind: 'unsupported' });
  });
});

describe('the first visit', () => {
  it('registers the worker for the folder the game is in and tells the browser never to reuse a stale copy of its script', async () => {
    const container = new FakeContainer();
    const { env } = environment(container);
    await new OfflineService(env).start();
    expect(container.registered).toEqual([
      { script: `${SCOPE}sw.js`, options: { scope: SCOPE, updateViaCache: 'none' } },
    ]);
    expect(container.started).toBe(1);
  });

  it('counts the parts as the worker installs, asks it where it has got to once it is serving, and is ready when everything is kept', async () => {
    const container = new FakeContainer();
    const { env } = environment(container);
    const service = new OfflineService(env);
    const seen = watch(service);
    await service.start();
    const registration = container.registration!;
    const worker = new FakeWorker();
    registration.discover(worker);

    container.say(worker, report('installing', 2, 30));
    expect(service.status).toEqual({ kind: 'preparing', done: 2, total: 30 });
    expect(worker.received('hello')).toBe(0);

    registration.finishInstalling();
    expect(worker.received('hello')).toBe(1);
    // The instant the worker waits to activate is not a newer version.
    expect(seen.some((s) => s.kind === 'update-ready')).toBe(false);

    container.say(worker, report('partial', 12, 30));
    expect(service.status).toEqual({ kind: 'preparing', done: 12, total: 30 });
    container.say(worker, report('complete', 30, 30));
    expect(service.status).toEqual({ kind: 'ready', spoken: NO_VOICE });
  });

  it('shows trouble instead of failing when the browser refuses a worker, and starts again when asked', async () => {
    const container = new FakeContainer();
    container.failRegister = true;
    const { env } = environment(container);
    const service = new OfflineService(env);
    await service.start();
    expect(service.status).toMatchObject({ kind: 'trouble' });
    container.failRegister = false;
    await service.retry();
    expect(container.registered).toHaveLength(2);
    expect(service.status.kind).toBe('preparing');
    // Starting again does not make the page listen twice.
    expect(container.started).toBe(1);
  });
});

describe('a later visit', () => {
  it('uses the registration that exists and asks the serving worker where it has got to', async () => {
    const { container, active, service } = await installed();
    expect(container.registered).toEqual([]);
    expect(active.received('hello')).toBe(1);
    container.say(active, report('complete', 10));
    expect(service.status).toEqual({ kind: 'ready', spoken: NO_VOICE });
  });

  it('listens only to the worker that serves the game', async () => {
    const { container, registration, active, service } = await installed();
    container.say(active, report('complete', 10));
    const next = new FakeWorker();
    registration.discover(next);
    container.say(next, report('installing', 3, 12, null, 'b2'));
    container.say(new FakeWorker(), report('failed', 0, 10, 'a stranger'));
    container.say(active, 'not a report');
    expect(service.status).toEqual({ kind: 'ready', spoken: NO_VOICE });
  });

  it('offers a newer version once it has downloaded, and not before', async () => {
    const { container, registration, active, service } = await installed();
    container.say(active, report('complete', 10));
    const seen = watch(service);
    const next = new FakeWorker();
    registration.discover(next);
    expect(service.status).toEqual({ kind: 'ready', spoken: NO_VOICE });
    registration.finishInstalling();
    expect(service.status).toEqual({ kind: 'update-ready' });
    expect(seen).toEqual([{ kind: 'update-ready' }]);
  });

  it('says nothing again when nothing changed', async () => {
    const { container, active, service } = await installed();
    const seen = watch(service);
    container.say(active, report('complete', 10));
    container.say(active, report('complete', 10));
    expect(seen).toEqual([{ kind: 'ready', spoken: NO_VOICE }]);
  });

  it('shows an update that was already waiting when the page opened', async () => {
    const container = new FakeContainer();
    const registration = new FakeRegistration();
    container.registration = registration;
    registration.active = new FakeWorker();
    registration.active.state = 'activated';
    registration.waiting = new FakeWorker();
    registration.waiting.state = 'installed';
    const { env } = environment(container);
    const service = new OfflineService(env);
    await service.start();
    expect(service.status).toEqual({ kind: 'update-ready' });
  });
});

describe('keeping the rest of the game once play has started', () => {
  it('asks the worker for the rest of the release, and not before play', async () => {
    const { container, active, service } = await installed();
    container.say(active, report('partial', 4, 10));
    expect(active.received('warm')).toBe(0);
    service.keep();
    expect(active.received('warm')).toBe(1);
  });

  it('asks again when it finds the release only part kept, once for each step of progress', async () => {
    const { container, active, service } = await installed();
    service.keep();
    container.say(active, report('partial', 4, 10));
    expect(active.received('warm')).toBe(2);
    container.say(active, report('partial', 4, 10));
    container.say(active, report('partial', 4, 10));
    expect(active.received('warm')).toBe(2);
    container.say(active, report('partial', 6, 10));
    expect(active.received('warm')).toBe(3);
  });

  it('does not keep asking while the worker is already fetching', async () => {
    const { container, active, service } = await installed();
    service.keep();
    for (const done of [1, 2, 3]) container.say(active, report('warming', done, 10));
    expect(active.received('warm')).toBe(1);
  });

  it('asks again after a failure, a little later each time, and then leaves it to a parent', async () => {
    const { container, active, service, timers } = await installed();
    service.keep();
    for (const wait of RETRY_AFTER_MS) {
      container.say(active, report('failed', 3, 10, 'The connection dropped.'));
      expect(timers.waiting()).toEqual([wait]);
      timers.fire();
    }
    container.say(active, report('failed', 3, 10, 'The connection dropped.'));
    expect(timers.waiting()).toEqual([]);
    expect(active.received('warm')).toBe(1 + RETRY_AFTER_MS.length);
    expect(service.status).toMatchObject({ kind: 'trouble' });
  });

  it('does not set up a second retry while one is waiting', async () => {
    const { container, active, service, timers } = await installed();
    service.keep();
    container.say(active, report('failed', 3, 10, 'x'));
    container.say(active, report('failed', 3, 10, 'x'));
    expect(timers.waiting()).toHaveLength(1);
  });

  it('stops waiting to retry once everything is kept', async () => {
    const { container, active, service, timers } = await installed();
    service.keep();
    container.say(active, report('failed', 3, 10, 'x'));
    container.say(active, report('complete', 10, 10));
    expect(timers.waiting()).toEqual([]);
    // And a later failure starts the delays again from the shortest.
    container.say(active, report('failed', 3, 10, 'x'));
    expect(timers.waiting()).toEqual([RETRY_AFTER_MS[0]]);
  });

  it('asks again at once when the connection comes back, and looks for a newer version', async () => {
    const { container, registration, active, service } = await installed();
    service.keep();
    container.say(active, report('failed', 3, 10, 'x'));
    const asked = active.received('warm');
    service.online();
    expect(active.received('warm')).toBe(asked + 1);
    expect(registration.updates).toBe(1);
  });

  it('has nothing to ask for when the release is complete', async () => {
    const { container, active, service } = await installed();
    service.keep();
    container.say(active, report('complete', 10));
    const asked = active.received('warm');
    service.online();
    expect(active.received('warm')).toBe(asked);
  });

  it('starts over when a parent asks to try again', async () => {
    const { container, registration, active, service, timers } = await installed();
    service.keep();
    for (let i = 0; i < RETRY_AFTER_MS.length; i++) {
      container.say(active, report('failed', 3, 10, 'x'));
      timers.fire();
    }
    container.say(active, report('failed', 3, 10, 'x'));
    expect(timers.waiting()).toEqual([]);
    await service.retry();
    expect(registration.updates).toBe(1);
    container.say(active, report('failed', 3, 10, 'x'));
    expect(timers.waiting()).toEqual([RETRY_AFTER_MS[0]]);
  });
});

describe('keeping the spoken lessons when a parent asks for them', () => {
  const some = { done: 100, total: 2280, bytes: 16_000_000, keeping: false, failed: false };
  const warms = (worker: FakeWorker): unknown[] => worker.sent.filter((m) => (m as { type?: string }).type === 'warm');

  it('asks for the game alone until a parent asks for the lessons, and for both after', async () => {
    const { container, active, service } = await installed();
    service.keep();
    expect(warms(active)).toEqual([{ type: 'warm', voice: false }]);
    container.say(active, report('complete', 10, 10, null, 'b1', some));
    service.keepSpoken();
    expect(warms(active).at(-1)).toEqual({ type: 'warm', voice: true });
  });

  it('shows how many lessons are kept once the game is ready, and follows them as they come', async () => {
    const { container, active, service } = await installed();
    const seen = watch(service);
    container.say(active, report('complete', 10, 10, null, 'b1', some));
    container.say(active, report('complete', 10, 10, null, 'b1', { ...some, keeping: true, done: 400 }));
    expect(seen.map((s) => (s.kind === 'ready' ? s.spoken.done : null))).toEqual([100, 400]);
  });

  it('does not ask for the lessons by itself, however few are kept', async () => {
    const { container, active, service } = await installed();
    service.keep();
    container.say(active, report('complete', 10, 10, null, 'b1', some));
    container.say(active, report('complete', 10, 10, null, 'b1', { ...some, done: 101 }));
    service.online();
    expect(active.received('warm')).toBe(1);
  });

  it('asks again when the worker stopped with lessons missing, once for each step of progress, and not while it is fetching them', async () => {
    const { container, active, service } = await installed();
    service.keepSpoken();
    expect(active.received('warm')).toBe(1);
    container.say(active, report('complete', 10, 10, null, 'b1', { ...some, keeping: true }));
    expect(active.received('warm'), 'it is fetching').toBe(1);
    container.say(active, report('complete', 10, 10, null, 'b1', some));
    expect(active.received('warm')).toBe(2);
    container.say(active, report('complete', 10, 10, null, 'b1', some));
    expect(active.received('warm'), 'no progress since the last ask').toBe(2);
    container.say(active, report('complete', 10, 10, null, 'b1', { ...some, done: 900 }));
    expect(active.received('warm')).toBe(3);
  });

  it('asks again after a failure, a little later each time, and again at once when the connection comes back', async () => {
    const { container, active, service, timers } = await installed();
    service.keepSpoken();
    container.say(active, report('complete', 10, 10, null, 'b1', { ...some, failed: true }));
    expect(timers.waiting()).toEqual([RETRY_AFTER_MS[0]]);
    timers.fire();
    expect(active.received('warm')).toBe(2);
    service.online();
    expect(active.received('warm')).toBe(3);
  });

  it('has nothing left to ask for once every lesson is kept', async () => {
    const { container, active, service, timers } = await installed();
    service.keepSpoken();
    container.say(active, report('complete', 10, 10, null, 'b1', { ...some, failed: true }));
    container.say(active, report('complete', 10, 10, null, 'b1', { ...some, done: some.total }));
    expect(timers.waiting()).toEqual([]);
    service.online();
    expect(active.received('warm')).toBe(1);
  });
});

describe('looking for a newer version', () => {
  it('asks the browser to check, and carries on when it cannot', async () => {
    const { registration, service } = await installed();
    registration.updateFails = true;
    service.checkForUpdate();
    await Promise.resolve();
    expect(registration.updates).toBe(1);
  });
});

/** Lets every promise that can run, run. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

describe('getting the newest version at the start of a visit', () => {
  const ask = { lookMs: 3000, downloadMs: 60_000 };

  it('takes a release that is already waiting', async () => {
    const page = await installed();
    page.container.say(page.active, report('complete', 10));
    const next = new FakeWorker();
    page.registration.discover(next);
    page.registration.finishInstalling();
    let found = 0;
    const result = page.service.switchToNewest({
      ...ask,
      found: () => {
        found += 1;
      },
    });
    await settle();
    page.registration.takeOver();
    expect(await result).toBe(true);
    expect(found, 'nothing was left to download').toBe(0);
  });

  it('waits for a release that is still downloading, says so, and takes it when it is ready', async () => {
    const page = await installed();
    page.container.say(page.active, report('complete', 10));
    const next = new FakeWorker();
    page.registration.discover(next);
    let found = 0;
    const result = page.service.switchToNewest({
      ...ask,
      found: () => {
        found += 1;
      },
    });
    await settle();
    expect(found).toBe(1);
    expect(page.timers.waiting()).toContain(ask.downloadMs);
    page.registration.finishInstalling();
    await settle();
    page.registration.takeOver();
    expect(await result).toBe(true);
    expect(page.switched.value).toBe(true);
  });

  it('plays the version it has when the download takes too long', async () => {
    const page = await installed();
    const next = new FakeWorker();
    page.registration.discover(next);
    const result = page.service.switchToNewest({ ...ask, found: () => undefined });
    await settle();
    expect(page.timers.waiting()).toContain(ask.downloadMs);
    page.timers.pending.find((t) => !t.cancelled && t.ms === ask.downloadMs)!.run();
    expect(await result).toBe(false);
    expect(next.received('skip-waiting')).toBe(0);
  });

  it('carries on at once when there is nothing newer or no connection', async () => {
    const page = await installed();
    expect(await page.service.switchToNewest({ ...ask, found: () => undefined })).toBe(false);
    page.registration.updateFails = true;
    expect(await page.service.switchToNewest({ ...ask, found: () => undefined })).toBe(false);
  });

  it('does not switch twice in a row, so a fault cannot make the page load for ever', async () => {
    const page = await installed();
    page.switched.value = true;
    page.registration.discover(new FakeWorker());
    expect(await page.service.switchToNewest({ ...ask, found: () => undefined })).toBe(false);
    expect(page.service.readyToSwitch).toBe(false);
  });

  it('does nothing on the very first visit, when there is no older version to leave', async () => {
    const container = new FakeContainer();
    const { env } = environment(container);
    const service = new OfflineService(env);
    await service.start();
    expect(await service.switchToNewest({ ...ask, found: () => undefined })).toBe(false);
  });
});

describe('switching to a newer version', () => {
  async function withNewer() {
    const page = await installed();
    page.container.say(page.active, report('complete', 10));
    const next = new FakeWorker();
    page.registration.discover(next);
    page.registration.finishInstalling();
    return { ...page, next };
  }

  it('does nothing at the start of a visit when no newer version is waiting', async () => {
    const { service, switched } = await installed();
    expect(await service.switchIfWaiting()).toBe(false);
    expect(switched.value).toBe(false);
  });

  it('tells the waiting worker to take over, and says so when it has', async () => {
    const { service, registration, next, switched } = await withNewer();
    const result = service.switchIfWaiting();
    expect(next.sent).toEqual([{ type: 'skip-waiting' }]);
    registration.takeOver();
    expect(await result).toBe(true);
    expect(switched.value).toBe(true);
  });

  it('switches by itself once in a visit, so a fault cannot make the page load for ever', async () => {
    const { service, switched } = await withNewer();
    switched.value = true;
    expect(await service.switchIfWaiting()).toBe(false);
  });

  it('gives up waiting for a worker that does not take over', async () => {
    const { service, timers } = await withNewer();
    const result = service.switchIfWaiting();
    expect(timers.waiting()).toEqual([SWITCH_WAIT_MS]);
    timers.fire();
    expect(await result).toBe(false);
  });

  it('does the same when a parent asks, even after the visit has switched once', async () => {
    const { service, registration, next, switched } = await withNewer();
    switched.value = true;
    const result = service.activate();
    expect(next.received('skip-waiting')).toBe(1);
    registration.takeOver();
    expect(await result).toBe(true);
  });

  it('has nothing to switch to when there is no newer version', async () => {
    const { service } = await installed();
    expect(await service.activate()).toBe(false);
  });

  it('asks the worker that took over where it has got to', async () => {
    const { service, registration, next } = await withNewer();
    const result = service.activate();
    registration.takeOver();
    await result;
    expect(next.received('hello')).toBe(1);
  });
});

describe('starting offline play over', () => {
  it('removes the worker and everything it kept', async () => {
    const { service, registration, forgot } = await installed();
    await service.repair();
    expect(registration.unregistered).toBe(true);
    expect(forgot.count).toBe(1);
  });

  it('stops asking for what it could not get', async () => {
    const { container, active, service, timers } = await installed();
    service.keep();
    container.say(active, report('failed', 3, 10, 'x'));
    await service.repair();
    expect(timers.waiting()).toEqual([]);
  });

  it('leaves the copy alone when the game cannot be fetched, because it could not be made again', async () => {
    const { service, registration, forgot, reachable } = await installed();
    reachable.value = false;
    await expect(service.repair()).rejects.toThrow(/left as it was/);
    expect(registration.unregistered).toBe(false);
    expect(forgot.count).toBe(0);
  });
});
