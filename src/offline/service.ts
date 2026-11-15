import { isReport, type Report, type ToWorker } from '../shared/offline';
import { type Facts, type OfflineStatus, sameStatus, statusOf } from './status';

/**
 * The page's side of offline play. It registers the service worker, listens to what the worker says
 * about keeping the game on the device, and turns that into the status a parent sees. It also
 * decides when it is safe to switch to a newer release: at the start of a visit, before the game
 * exists, or when a parent asks.
 *
 * The browser objects it needs come in through `OfflineEnv`, so the rules run the same under test
 * as in the browser.
 */

export interface WorkerLike {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export interface RegistrationLike {
  readonly active: WorkerLike | null;
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  update(): Promise<unknown>;
  unregister(): Promise<boolean>;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

export interface ContainerLike {
  register(script: string, options: { scope: string; updateViaCache: 'none' }): Promise<RegistrationLike>;
  getRegistration(scope: string): Promise<RegistrationLike | undefined>;
  addEventListener(type: 'message', listener: (event: { data: unknown; source: unknown }) => void): void;
  /**
   * Starts delivering messages that arrived before a listener was added. Browsers hold them until
   * it is called.
   */
  startMessages?(): void;
}

export interface OfflineEnv {
  /** Null where the browser has no service workers. */
  container: ContainerLike | null;
  /** The address of the folder the worker serves, which is the folder the game is in. */
  scope: string;
  script: string;
  /** Removes every copy of the game the worker kept on this device. */
  forgetEverything(): Promise<void>;
  /**
   * Whether the game's own worker script can be fetched right now. If it cannot, a copy that was
   * removed could not be made again.
   */
  reachable(): Promise<boolean>;
  /** Runs `run` once after `ms`. Returns a way to cancel it. */
  later(ms: number, run: () => void): () => void;
  /**
   * Whether this visit has already switched release by itself. It does so at most once, so a fault
   * cannot make the page reload for ever.
   */
  switched: { get(): boolean; set(): void };
}

type Listener = (status: OfflineStatus) => void;

/** How long a switch waits for the new release to take over before the page gives up on it. */
export const SWITCH_WAIT_MS = 5_000;
/**
 * How long to wait before asking again after the worker could not get everything. It gives up after
 * the last.
 */
export const RETRY_AFTER_MS = [30_000, 120_000, 600_000] as const;

const TROUBLE = 'This device would not let the game set up offline play.';

export class OfflineService {
  private registration: RegistrationLike | null = null;
  private report: Report | null = null;
  private unavailable: Facts['unavailable'];
  private shown: OfflineStatus;
  private readonly listeners = new Set<Listener>();
  private readonly watched = new WeakSet<WorkerLike>();
  private listening = false;
  /** Set once the game has started. Until then the rest of the release is left alone. */
  private keeping = false;
  /**
   * Set once a parent has asked for every spoken lesson. From then on a newer release and a lost
   * connection are followed by another try.
   */
  private wantsSpoken = false;
  private lastWarmedAt = -1;
  private retries = 0;
  private cancelRetry: (() => void) | null = null;

  constructor(private readonly env: OfflineEnv) {
    this.unavailable = env.container ? null : { kind: 'unsupported' };
    this.shown = this.compute();
  }

  get status(): OfflineStatus {
    return this.shown;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /**
   * Registers the worker and starts listening to it. Resolves once the page knows its registration,
   * not once the release is kept.
   */
  async start(): Promise<void> {
    const { container } = this.env;
    if (!container) return;
    if (!this.listening) {
      this.listening = true;
      container.addEventListener('message', (event) => this.heard(event));
      container.startMessages?.();
    }
    try {
      const { scope, script } = this.env;
      this.registration =
        (await container.getRegistration(scope)) ??
        (await container.register(script, { scope, updateViaCache: 'none' }));
    } catch {
      this.unavailable = { kind: 'trouble', detail: TROUBLE };
      this.refresh();
      return;
    }
    this.unavailable = null;
    const registration = this.registration;
    registration.addEventListener('updatefound', () => {
      this.follow(registration.installing);
      this.refresh();
    });
    for (const worker of [registration.installing, registration.waiting, registration.active]) this.follow(worker);
    this.refresh();
  }

  /**
   * At the start of a visit, before the game exists: if a newer release finished downloading during
   * an earlier visit, make it the running one. True when it took over, which means the page should
   * load again.
   */
  async switchIfWaiting(): Promise<boolean> {
    if (!this.newer || this.env.switched.get()) return false;
    this.env.switched.set();
    return this.activate();
  }

  /**
   * At the start of a visit, before the game exists: looks for a newer release, waits for it to
   * finish downloading, and makes it the running one. True when it took over, which means the page
   * should load again. It gives up quietly when there is no connection, when nothing newer exists,
   * or when the download takes longer than `downloadMs`.
   */
  async switchToNewest(o: { lookMs: number; downloadMs: number; found: () => void }): Promise<boolean> {
    const registration = this.registration;
    if (!registration?.active || this.env.switched.get()) return false;
    // The browser looks for a changed script as the page opens. Asking again makes sure it has
    // looked before the page decides there is nothing.
    await this.within(
      registration.update().catch(() => undefined),
      o.lookMs,
    );
    const coming = registration.installing;
    if (!this.newer && coming) {
      o.found();
      const settled = new Promise<void>((done) => {
        const check = (): void => {
          if (coming.state === 'installed' || coming.state === 'activated' || coming.state === 'redundant') done();
        };
        coming.addEventListener('statechange', check);
        check();
      });
      await this.within(settled, o.downloadMs);
    }
    return this.switchIfWaiting();
  }

  /**
   * Whether a newer release is ready and this visit has not already switched, so that switching now
   * cannot start a loop.
   */
  get readyToSwitch(): boolean {
    return this.newer !== null && !this.env.switched.get();
  }

  /** The game has started, so the rest of the release can be fetched in the background. */
  keep(): void {
    this.keeping = true;
    this.warm();
  }

  /**
   * A parent asked for every spoken lesson to be kept on the device, which is most of what the game
   * weighs.
   */
  keepSpoken(): void {
    this.wantsSpoken = true;
    this.keeping = true;
    this.retries = 0;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.warm();
  }

  /** A parent asked to try again after trouble. Starts from nothing it was waiting for. */
  async retry(): Promise<void> {
    this.retries = 0;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.keeping = true;
    this.lastWarmedAt = -1;
    if (!this.registration) await this.start();
    this.checkForUpdate();
    this.warm();
  }

  /** The network came back. */
  online(): void {
    this.checkForUpdate();
    if (this.keeping && this.report && this.lacks(this.report)) {
      this.retries = 0;
      this.warm();
    }
  }

  /**
   * Asks the browser whether a newer worker exists. A failure means there is no connection, and
   * changes nothing.
   */
  checkForUpdate(): void {
    void this.registration?.update().catch(() => undefined);
  }

  /**
   * Makes the waiting release the running one. True when it did, and false when there is none or it
   * did not in time.
   */
  async activate(): Promise<boolean> {
    const waiting = this.newer;
    if (!waiting) return false;
    return new Promise<boolean>((resolve) => {
      const cancel = this.env.later(SWITCH_WAIT_MS, () => resolve(false));
      waiting.addEventListener('statechange', () => {
        if (waiting.state !== 'activated') return;
        cancel();
        resolve(true);
      });
      waiting.postMessage({ type: 'skip-waiting' } satisfies ToWorker);
    });
  }

  /**
   * Removes the worker and everything it kept, so the next load starts offline play from nothing.
   * The page must load again after. The copy kept here is the only one that opens with no
   * connection, so nothing is removed unless a new one can be fetched.
   */
  async repair(): Promise<void> {
    if (!(await this.env.reachable()))
      throw new Error('the game could not be fetched, so the copy on this device was left as it was');
    this.cancelRetry?.();
    this.cancelRetry = null;
    await this.registration?.unregister().catch(() => false);
    await this.env.forgetEverything();
  }

  /** Waits for `work`, or for `ms` to pass, whichever is first. */
  private async within(work: Promise<unknown>, ms: number): Promise<void> {
    let cancel: () => void = () => undefined;
    const late = new Promise<void>((resolve) => {
      cancel = this.env.later(ms, resolve);
    });
    await Promise.race([work, late]);
    cancel();
  }

  /**
   * A newer worker that is waiting to replace the one running. During a first install the worker
   * waits for an instant and is not a newer one.
   */
  private get newer(): WorkerLike | null {
    const registration = this.registration;
    return registration?.waiting && registration.active ? registration.waiting : null;
  }

  private compute(): OfflineStatus {
    return statusOf({ unavailable: this.unavailable, report: this.report, waiting: this.newer !== null });
  }

  private refresh(): void {
    const next = this.compute();
    if (sameStatus(next, this.shown)) return;
    this.shown = next;
    for (const listener of [...this.listeners]) listener(next);
  }

  private follow(worker: WorkerLike | null): void {
    if (!worker || this.watched.has(worker)) return;
    this.watched.add(worker);
    worker.addEventListener('statechange', () => this.moved(worker));
    this.moved(worker);
  }

  private moved(worker: WorkerLike): void {
    // A worker that has just become the active one is asked where it has got to.
    if (worker.state === 'activated' && worker === this.registration?.active)
      worker.postMessage({ type: 'hello' } satisfies ToWorker);
    this.refresh();
  }

  private heard(event: { data: unknown; source: unknown }): void {
    const registration = this.registration;
    if (!registration || !isReport(event.data)) return;
    // Only the worker that serves the game speaks for it. A newer one that is still downloading is
    // not the one being played.
    if (event.source !== (registration.active ?? registration.waiting ?? registration.installing)) return;
    this.report = event.data;
    this.refresh();
    this.keepGoing(event.data);
  }

  private warm(): void {
    this.registration?.active?.postMessage({ type: 'warm', voice: this.wantsSpoken } satisfies ToWorker);
  }

  /**
   * Whether the device lacks something that has been asked for: part of the game, or part of the
   * spoken lessons once a parent wanted them all.
   */
  private lacks(report: Report): boolean {
    return report.phase !== 'complete' || (this.wantsSpoken && report.voice.done < report.voice.total);
  }

  /**
   * What to do about a report once the game has started: finish a half-kept release, and ask again
   * after a failure.
   */
  private keepGoing(report: Report): void {
    if (!this.keeping) return;
    if (!this.lacks(report)) {
      this.retries = 0;
      this.cancelRetry?.();
      this.cancelRetry = null;
      return;
    }
    const failed = report.phase === 'failed' || (this.wantsSpoken && report.voice.failed);
    const working = report.phase === 'installing' || report.phase === 'warming' || report.voice.keeping;
    const progress = report.done + report.voice.done;
    if (failed) {
      if (this.cancelRetry || this.retries >= RETRY_AFTER_MS.length) return;
      this.cancelRetry = this.env.later(RETRY_AFTER_MS[this.retries++]!, () => {
        this.cancelRetry = null;
        this.warm();
      });
    } else if (!working && progress > this.lastWarmedAt) {
      // The worker stopped with files missing, such as after the browser ended it. Ask once for
      // each step of progress, so a stuck one cannot loop.
      this.lastWarmedAt = progress;
      this.warm();
    }
  }
}
