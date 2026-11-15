import { cacheNames } from '../shared/offline';
import { type ContainerLike, type OfflineEnv, OfflineService } from './service';

const SWITCHED = 'ua.switched';
/**
 * A tab that switched release this recently does not do it again by itself, so a fault cannot make
 * the page load for ever. A tab left open for days still takes each new release.
 */
const SWITCH_COOLDOWN_MS = 2 * 60_000;

/**
 * A tab keeps a note of when it switched release. A page that may not use session storage never
 * switches by itself.
 */
const switchedNote: OfflineEnv['switched'] = {
  get: () => {
    try {
      const at = Number(sessionStorage.getItem(SWITCHED));
      return Number.isFinite(at) && at > 0 && Date.now() - at < SWITCH_COOLDOWN_MS;
    } catch {
      return true;
    }
  },
  set: () => {
    try {
      sessionStorage.setItem(SWITCHED, String(Date.now()));
    } catch {
      // Nothing was written, and get() already says yes for a page that cannot read it either.
    }
  },
};

/**
 * Offline play as this browser offers it. Without service workers the service reports that offline
 * play is not available.
 */
export function browserOffline(): OfflineService {
  const container: ContainerLike | null =
    'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as ContainerLike) : null;
  // The game is served from a folder of its own, which is the folder the page is in, so it runs
  // under any path of a site.
  const scope = new URL('./', document.baseURI);
  const script = new URL('sw.js', scope).href;
  const names = cacheNames(scope.pathname);
  return new OfflineService({
    container,
    scope: scope.href,
    script,
    forgetEverything: async () => {
      for (const name of await caches.keys())
        if (name.startsWith(names.prefix) || names.isLegacy(name)) await caches.delete(name);
    },
    reachable: async () => {
      try {
        // A captive portal or an error page answers with a redirect or a page. Only the real script
        // is JavaScript with a 200.
        const answer = await fetch(script, { cache: 'no-store', redirect: 'manual' });
        return answer.status === 200 && (answer.headers.get('content-type') ?? '').includes('javascript');
      } catch {
        return false;
      }
    },
    later: (ms, run) => {
      const handle = setTimeout(run, ms);
      return () => clearTimeout(handle);
    },
    switched: switchedNote,
  });
}
