import type { ContainerLike, OfflineEnv, RegistrationLike, WorkerLike } from '../../src/offline/service';
import type { Phase, Report, Voice } from '../../src/shared/offline';

/** Stand-ins for the browser's service worker objects, driven by the test. */

export class FakeWorker implements WorkerLike {
  state = 'installing';
  readonly sent: unknown[] = [];
  private readonly listeners: (() => void)[] = [];

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.push(listener);
  }

  become(state: string): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }

  /** The messages of one kind it has been sent. */
  received(type: string): number {
    return this.sent.filter((m) => (m as { type?: string }).type === type).length;
  }
}

export class FakeRegistration implements RegistrationLike {
  active: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  updates = 0;
  updateFails = false;
  unregistered = false;
  private readonly found: (() => void)[] = [];

  update(): Promise<unknown> {
    this.updates += 1;
    return this.updateFails ? Promise.reject(new Error('offline')) : Promise.resolve();
  }

  unregister(): Promise<boolean> {
    this.unregistered = true;
    return Promise.resolve(true);
  }

  addEventListener(_type: 'updatefound', listener: () => void): void {
    this.found.push(listener);
  }

  /** A worker starts installing, as when the browser finds a changed script. */
  discover(worker: FakeWorker): void {
    this.installing = worker;
    for (const listener of [...this.found]) listener();
  }

  /**
   * The installing worker finishes. It is the waiting worker for the moment its state becomes
   * installed, as in a browser. With no active worker it goes straight on to activate. With one, it
   * stays waiting.
   */
  finishInstalling(): void {
    const worker = this.installing!;
    this.installing = null;
    this.waiting = worker;
    worker.become('installed');
    if (!this.active) this.takeOver();
  }

  /** The waiting worker is told to take over, as when it has been sent skip-waiting. */
  takeOver(): void {
    const worker = this.waiting!;
    this.waiting = null;
    this.active = worker;
    worker.become('activating');
    worker.become('activated');
  }
}

export class FakeContainer implements ContainerLike {
  registration: FakeRegistration | undefined;
  readonly registered: { script: string; options: { scope: string; updateViaCache: string } }[] = [];
  failRegister = false;
  started = 0;
  private readonly listeners: ((event: { data: unknown; source: unknown }) => void)[] = [];

  async register(script: string, options: { scope: string; updateViaCache: 'none' }): Promise<RegistrationLike> {
    this.registered.push({ script, options });
    if (this.failRegister) throw new DOMException('refused', 'SecurityError');
    this.registration ??= new FakeRegistration();
    return this.registration;
  }

  async getRegistration(): Promise<RegistrationLike | undefined> {
    return this.registration;
  }

  addEventListener(_type: 'message', listener: (event: { data: unknown; source: unknown }) => void): void {
    this.listeners.push(listener);
  }

  startMessages(): void {
    this.started += 1;
  }

  /** A worker sends the page a message. */
  say(from: FakeWorker | null, data: unknown): void {
    for (const listener of [...this.listeners]) listener({ data, source: from });
  }
}

export const NO_VOICE: Voice = { done: 0, total: 0, bytes: 0, keeping: false, failed: false };

export const report = (
  phase: Phase,
  done: number,
  total = 10,
  detail: string | null = null,
  build = 'b1',
  voice: Voice = NO_VOICE,
): Report => ({ type: 'report', build, phase, done, total, voice, detail });

export class Timers {
  readonly pending: { ms: number; run: () => void; cancelled: boolean }[] = [];

  later = (ms: number, run: () => void): (() => void) => {
    const timer = { ms, run, cancelled: false };
    this.pending.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };

  /** What is waiting to run, by how long it waits. */
  waiting(): number[] {
    return this.pending.filter((t) => !t.cancelled).map((t) => t.ms);
  }

  /** Lets the next waiting timer run. */
  fire(): void {
    const next = this.pending.find((t) => !t.cancelled);
    if (!next) throw new Error('nothing is waiting');
    next.cancelled = true;
    next.run();
  }
}

/** Where the game is served from in these tests: a folder of a site, as it is on GitHub Pages. */
export const SCOPE = 'https://unicorns.test/fan/';

export function environment(
  container: ContainerLike | null,
  timers = new Timers(),
): {
  env: OfflineEnv;
  timers: Timers;
  forgot: { count: number };
  switched: { value: boolean };
  reachable: { value: boolean };
} {
  const forgot = { count: 0 };
  const reachable = { value: true };
  const switched = { value: false };
  return {
    timers,
    forgot,
    switched,
    reachable,
    env: {
      container,
      scope: SCOPE,
      script: `${SCOPE}sw.js`,
      forgetEverything: async () => {
        forgot.count += 1;
      },
      reachable: async () => reachable.value,
      later: timers.later,
      switched: {
        get: () => switched.value,
        set: () => {
          switched.value = true;
        },
      },
    },
  };
}
