/// <reference lib="webworker" />
import type { Plan, Report, ToWorker } from '../shared/offline';
import { createPrecache } from './precache';

/**
 * The service worker. The build bundles this file into `sw.js` and writes the release's plan in as
 * `__PLAN__`. The rules live in precache.ts. This file only connects them to the browser's events.
 */

declare const self: ServiceWorkerGlobalScope;
declare const __PLAN__: Plan;

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const precache = createPrecache(__PLAN__, {
  caches: self.caches,
  fetch: (request) => self.fetch(request),
  sha256: async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes)),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  scope: self.registration.scope,
});

let lastSent = 0;
let lastPhase: Report['phase'] | null = null;

/**
 * Tells every open page how far the release has got. Steady progress is sent a few times a second,
 * and a change of phase at once.
 */
function broadcast(report: Report): void {
  const now = Date.now();
  if (report.phase === lastPhase && report.done < report.total && now - lastSent < 250) return;
  lastSent = now;
  lastPhase = report.phase;
  void self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((pages) => {
    for (const page of pages) page.postMessage(report);
  });
}

self.addEventListener('install', (event) => {
  // The first worker has nothing to protect and keeps just what a first start needs. A newer one
  // has the older one serving in the meantime, so it takes its time and keeps everything before it
  // asks to be used.
  event.waitUntil(precache.install(self.registration.active !== null, broadcast));
});

// Nothing here calls skipWaiting or claim. A newer release waits until the page asks for it at a
// safe moment.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    precache
      .activate()
      .then(() => precache.report())
      .then(broadcast),
  );
});

self.addEventListener('fetch', (event) => {
  const answer = precache.route(event.request, (work) => event.waitUntil(work));
  if (answer) event.respondWith(answer);
});

self.addEventListener('message', (event) => {
  const message = event.data as ToWorker | null;
  switch (message?.type) {
    case 'hello':
      event.waitUntil(precache.report().then((report) => event.source?.postMessage(report)));
      break;
    case 'warm':
      event.waitUntil(
        precache
          .warm(broadcast, message.voice)
          .then(() => precache.report())
          .then(broadcast),
      );
      break;
    case 'skip-waiting':
      event.waitUntil(self.skipWaiting());
      break;
  }
});
