export type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The tab's own storage, which a visit and a reload are remembered in. Null where the browser keeps
 * it from the page.
 */
export function tabStorage(): TabStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Offline play exists only in a production build, which is the one that ships with a service worker
 * beside it.
 */
export const offlineEnabled = (): boolean => import.meta.env.PROD;

export const newId = (): string => crypto.randomUUID();

export const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;

/** Runs `run` after `ms` and returns the way to stop it. */
export const after = (ms: number, run: () => void): (() => void) => {
  const timer = window.setTimeout(run, ms);
  return () => window.clearTimeout(timer);
};
