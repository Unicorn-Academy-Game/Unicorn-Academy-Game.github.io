import type { CDPSession, Page } from '@playwright/test';

/**
 * What a long session has to keep bounded: retained listeners, texture memory, timers, audio
 * voices, effects, the event queue and the save history. A test cannot read a phone's memory, so
 * these are counted from inside the page, where the game keeps them, and the numbers say what the
 * game itself holds on to.
 */

export interface Resources {
  map: string;
  /** Game seconds since the session began, across every map. */
  seconds: number;
  /** Textures the engine holds, and the memory they take if each is stored as 4 bytes a pixel. */
  textures: number;
  textureMiB: number;
  /**
   * How much of that is the fine sheets of the unicorns, which a device that is not in low-end mode
   * brings in after play has begun.
   */
  fineMiB: number;
  /** Things on the scene's display list. */
  objects: number;
  /** Listeners the page has added and not taken off, not counting ones that remove themselves. */
  listeners: number;
  /** Timeouts and intervals that have not fired or been cleared. */
  timers: number;
  /** Sounds playing. */
  voices: number;
  /** Effects the simulation says are still playing. */
  effects: number;
  /** Events the simulation has queued and nobody has taken. */
  events: number;
  /** Particles alive. */
  particles: number;
  /** Snapshots, backups and damaged saves kept on the device. */
  snapshots: number;
  backups: number;
  damaged: number;
  /** JavaScript heap after a full collection, in Chromium only. */
  heapMiB: number | null;
}

declare global {
  interface Window {
    __live?: { listeners(): number; timers(): number };
  }
}

/**
 * Counts what the page's own code registers, from before any of it runs. Call it before the first
 * `goto`. Listeners that remove themselves (`once`, or tied to a signal) are not counted, because
 * the browser takes them off without telling anyone.
 */
export async function countHandles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const registered = new WeakMap<object, Map<string, Set<unknown>>>();
    let listeners = 0;
    const slot = (type: string, options: unknown): string =>
      `${type}|${typeof options === 'boolean' ? options : Boolean((options as AddEventListenerOptions | null | undefined)?.capture)}`;
    const selfRemoving = (options: unknown): boolean =>
      typeof options === 'object' &&
      options !== null &&
      Boolean((options as AddEventListenerOptions).once || (options as AddEventListenerOptions).signal);

    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (listener && !selfRemoving(options)) {
        const byType = registered.get(this) ?? new Map<string, Set<unknown>>();
        registered.set(this, byType);
        const set = byType.get(slot(type, options)) ?? new Set<unknown>();
        byType.set(slot(type, options), set);
        if (!set.has(listener)) {
          set.add(listener);
          listeners++;
        }
      }
      add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ): void {
      if (listener && registered.get(this)?.get(slot(type, options))?.delete(listener)) listeners--;
      remove.call(this, type, listener, options);
    };

    const pending = new Set<number>();
    const setTimeoutNow = window.setTimeout.bind(window);
    const setIntervalNow = window.setInterval.bind(window);
    const clearTimeoutNow = window.clearTimeout.bind(window);
    const clearIntervalNow = window.clearInterval.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
      const id: number = setTimeoutNow(() => {
        pending.delete(id);
        (handler as (...rest: unknown[]) => void)(...args);
      }, timeout);
      pending.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
      const id: number = setIntervalNow(handler as (...rest: unknown[]) => void, timeout, ...args);
      pending.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearTimeout = ((id?: number): void => {
      if (id !== undefined) pending.delete(id);
      clearTimeoutNow(id);
    }) as typeof window.clearTimeout;
    window.clearInterval = ((id?: number): void => {
      if (id !== undefined) pending.delete(id);
      clearIntervalNow(id);
    }) as typeof window.clearInterval;

    Object.defineProperty(window, '__live', { value: { listeners: () => listeners, timers: () => pending.size } });
  });
}

/**
 * A Chromium page's debugging connection, for collecting garbage before the heap is read. Null in
 * other browsers.
 */
export async function heapProbe(page: Page): Promise<CDPSession | null> {
  if (page.context().browser()?.browserType().name() !== 'chromium') return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  return cdp;
}

const MIB = 1024 * 1024;

export async function resources(page: Page, probe: CDPSession | null, seconds: number): Promise<Resources> {
  let heapMiB: number | null = null;
  if (probe) {
    await probe.send('HeapProfiler.collectGarbage');
    heapMiB = (await probe.send('Runtime.getHeapUsage')).usedSize / MIB;
  }
  const inPage = await page.evaluate(() => {
    const ua = window.__ua!;
    const { world } = ua.controller;
    let bytes = 0;
    let fine = 0;
    const textures = Object.entries(ua.stage.game.textures.list);
    for (const [key, texture] of textures) {
      for (const source of texture.source) {
        bytes += source.width * source.height * 4;
        if (/^unicorn:[a-z]+:\d+$/.test(key)) fine += source.width * source.height * 4;
      }
    }
    return {
      map: world.map.id,
      textures: textures.length,
      bytes,
      fine,
      objects: ua.stage.scene.children.list.length,
      listeners: window.__live!.listeners(),
      timers: window.__live!.timers(),
      voices: ua.audio?.stats().voices ?? 0,
      effects: world.effects.filter((until) => until > world.time).length,
      events: world.events.length,
      particles: ua.controller.debugParticles(),
    };
  });
  const kept = await page.evaluate(async () => {
    const store = window.__ua!.store;
    if (!store) return { snapshots: 0, backups: 0, damaged: 0 };
    return {
      snapshots: (await store.history()).length,
      backups: (await store.backups()).length,
      damaged: (await store.quarantined()).length,
    };
  });
  const { bytes, fine, ...rest } = inPage;
  return { ...rest, seconds, textureMiB: bytes / MIB, fineMiB: fine / MIB, ...kept, heapMiB };
}
