import { emptyProfile, exportBook, type LearnerProfile, mergeProfiles, withProgress } from '../../src/learning';
import type { OfflineStatus } from '../../src/offline/status';
import type { Durable } from '../../src/persistence/durable';
import type { ShelfEntry } from '../../src/persistence/keeper';
import type { Keeping } from '../../src/persistence/learner';
import type { SaveStatus } from '../../src/persistence/save-service';
import type { VisitKind } from '../../src/persistence/visit';
import type { ProfileId } from '../../src/render/profile';
import { GAME_NAME } from '../../src/shared/brand';
import { summarize } from '../../src/shared/exchange';
import type { Progress } from '../../src/shared/learning';
import { DEFAULT_SETTINGS, type DeviceSettings, type WorldSaveV1 } from '../../src/shared/save';
import { initialWorld } from '../../src/shared/start';
import type { Fullscreen } from '../../src/ui/fullscreen';
import { ParentPanel } from '../../src/ui/parent/panel';
import type { ParentServices, Source, StartNewResult } from '../../src/ui/parent/services';
import { Ui } from '../../src/ui/ui';

/**
 * The parent controls with made-up services, so every state of every page can be looked at and
 * driven in a real browser without a service worker or a stored world. `window.lab` is how a test
 * or a person sets the scene.
 */

const params = new URLSearchParams(location.search);

function source<T>(initial: T): Source<T> & { set(value: T): void } {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      listener(value);
      return () => void listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const l of listeners) l(next);
    },
  };
}

const world = (
  friends: ('leaf' | 'glacier' | 'river' | 'cinder' | 'storm')[],
  map: WorldSaveV1['mapId'],
  visited: WorldSaveV1['visitedMaps'],
  id: number,
): WorldSaveV1 => ({
  ...initialWorld({
    worldGeneration: `00000000-0000-4000-8000-00000000000${id}`,
    snapshotId: `00000000-0000-4000-8000-0000000000a${id}`,
    rngState: id,
  }),
  mapId: map,
  recruited: ['wildstar', ...friends],
  visitedMaps: visited,
});

const here = world(['leaf', 'river'], 'palace-garden', ['forest', 'palace-garden'], 1);
const there = {
  ...world(['leaf', 'storm', 'glacier'], 'stable', ['forest', 'palace-garden', 'stable'], 1),
  snapshotId: '00000000-0000-4000-8000-0000000000b1',
};
const elsewhere = world(['cinder'], 'forest', ['forest'], 2);

/**
 * A Spell Book with words at every level, some ready to be asked again and a few that took more
 * wrong keys than the rest. `?reading=none` leaves out what the player has read.
 */
function sampleBook(now: number): LearnerProfile {
  const day = 86_400_000;
  const spell = (level: number, over: Partial<Progress> = {}): Progress => ({
    level,
    best: level,
    streak: 0,
    struggles: 0,
    due: now,
    done: 3,
    clean: 2,
    slips: 0,
    first: now - 6 * day,
    last: now - 60_000,
    ...over,
  });
  const entries: [string, Progress][] = [
    ['bird', spell(3, { due: now - 1_000, slips: 7 })],
    ['frog', spell(5, { due: now + 14 * day })],
    ['bunny', spell(1, { due: now + 10 * 60_000, slips: 3, done: 2 })],
    ['snail', spell(0, { done: 1 })],
    ['ladybug', spell(2, { due: now + 3_600_000, slips: 1, done: 4 })],
    ['apple', spell(4, { due: now + day })],
    ['carrot', spell(5, { due: now + 14 * day })],
    ['ruby', spell(2, { due: now + 3_600_000 })],
    ['unicorn', spell(1, { due: now + 10 * 60_000, slips: 5 })],
  ];
  const spelled = entries.reduce(
    (book, [word, progress]) => withProgress(book, word, 'spell', progress),
    emptyProfile(),
  );
  if (params.get('reading') === 'none') return spelled;
  // Reading is asked of words the player has spelled: some read on their own, one ready again, and
  // two that took more wrong choices.
  const read = (level: number, over: Partial<Progress> = {}): Progress => ({
    level,
    best: level,
    streak: 0,
    struggles: 0,
    due: now + day,
    done: 4,
    clean: 3,
    slips: 0,
    first: now - 4 * day,
    last: now - 120_000,
    ...over,
  });
  const reads: [string, Progress][] = [
    ['frog', read(5, { due: now + 14 * day, done: 8, clean: 8 })],
    ['bird', read(3, { done: 5, clean: 3, slips: 4 })],
    ['apple', read(4, { due: now - 1_000, done: 6, clean: 4, slips: 9 })],
    ['bunny', read(1, { due: now + 10 * 60_000, done: 2, clean: 1, slips: 3 })],
    ['ladybug', read(2, { due: now + 3_600_000, done: 3, clean: 2, slips: 1 })],
  ];
  return reads.reduce((book, [word, progress]) => withProgress(book, word, 'read', progress), spelled);
}

const KEEPING: readonly Keeping[] = ['device', 'page', 'newer', 'unreadable'];
const DURABLE: readonly Durable[] = ['promised', 'not-promised', 'unknown'];
const durable = source<Durable>(DURABLE.find((d) => d === params.get('durable')) ?? 'unknown');
const book = source<LearnerProfile>(params.get('book') === 'empty' ? emptyProfile() : sampleBook(Date.now()));

const saves = source<SaveStatus>({ state: 'saved', at: Date.now() - 20_000 });
const offline = source<OfflineStatus>({
  kind: 'ready',
  spoken: { done: 212, total: 2280, bytes: 16_000_000, keeping: false, failed: false },
});
const settings = source<DeviceSettings>({ ...DEFAULT_SETTINGS });
const downloads: { filename: string; text: string }[] = [];
const calls: string[] = [];

const lab = {
  calls,
  downloads,
  saves,
  offline,
  settings,
  book,
  /** What the browser has promised about keeping the Spell Book, for the page that says so. */
  durable,
  /** Where the Spell Book is going, for the page that says so. */
  keeping: (KEEPING.find((k) => k === params.get('keeping')) ?? 'device') as Keeping,
  /** How starting a new Spell Book goes. Only `started` empties the book. */
  startNewResult: 'started' as StartNewResult,
  here,
  there,
  elsewhere,
  /** Milliseconds each fake service call takes, so the waiting cover can be seen. */
  slowMs: 0,
  /** When set, replacements fail with this reason. */
  failReplace: null as string | null,
  shelf: [
    { key: '2', at: Date.now() - 3 * 3_600_000, reason: 'Before starting over', summary: summarize(here) },
    { key: '1', at: Date.now() - 30 * 3_600_000, reason: 'Before loading a file', summary: summarize(elsewhere) },
  ] as ShelfEntry[],
  damaged: [] as { at: number; why: string; text: string }[],
  currentWorld: here as WorldSaveV1 | null,
};
Object.assign(window, { lab });

const pause = (): Promise<void> => (lab.slowMs > 0 ? new Promise((r) => setTimeout(r, lab.slowMs)) : Promise.resolve());

const visit = (['fresh', 'incognito'] as const).find((k) => k === params.get('visit')) ?? ('kept' satisfies VisitKind);
const profile: ProfileId = params.get('profile') === 'low' ? 'low' : 'standard';

const fullscreenState = source(false);
const fullscreen: Fullscreen | null =
  params.get('fullscreen') === '0'
    ? null
    : {
        supported: true,
        get active() {
          return fullscreenState.get();
        },
        async toggle() {
          calls.push('full screen');
          fullscreenState.set(!fullscreenState.get());
        },
        subscribe: (listener) => fullscreenState.subscribe(listener),
      };

const services: ParentServices = {
  visit,
  profile,
  fullscreen,
  settings: {
    get: settings.get,
    subscribe: settings.subscribe,
    update(patch) {
      calls.push(`settings ${JSON.stringify(patch)}`);
      settings.set({ ...settings.get(), ...patch });
    },
  },
  saves,
  world: {
    async current() {
      return lab.currentWorld ? summarize(lab.currentWorld) : null;
    },
    async exportWorld() {
      calls.push('export');
      await pause();
      return lab.currentWorld ? { filename: 'unicorn-academy-2026-10-24.json', text: '{}' } : null;
    },
    async shelf() {
      await pause();
      return lab.shelf;
    },
    async preview(source) {
      calls.push(`preview ${source.kind}`);
      await pause();
      return source.kind === 'fresh'
        ? summarize(initialWorld({ worldGeneration: 'x', snapshotId: 'y', rngState: 1 }))
        : summarize(there);
    },
    async replace(source) {
      calls.push(`replace ${source.kind}${'id' in source ? ` ${source.id}` : ''}`);
      await pause();
      return lab.failReplace ? { ok: false, reason: lab.failReplace } : { ok: true };
    },
    async damagedData() {
      return lab.damaged;
    },
  },
  learning: {
    book,
    keeping: () => lab.keeping,
    durable: {
      ...durable,
      async check() {
        calls.push('check durable');
        return durable.get();
      },
    },
    async startNew() {
      calls.push('start new book');
      await pause();
      if (lab.startNewResult === 'started') book.set(emptyProfile());
      return lab.startNewResult;
    },
    save: () => {
      calls.push('save book');
      return exportBook(book.get(), new Date(Date.now()).toISOString());
    },
    add(file) {
      calls.push('add book');
      book.set(mergeProfiles(book.get(), file));
    },
    change(update) {
      calls.push('change book');
      book.set(update(book.get()));
    },
  },
  offline:
    params.get('offline') === '0'
      ? null
      : {
          status: offline,
          async update() {
            calls.push('update');
            await pause();
          },
          retry() {
            calls.push('retry offline');
          },
          keepSpoken() {
            calls.push('keep spoken lessons');
          },
          async repair() {
            calls.push('repair offline');
            await pause();
          },
        },
  about: {
    name: GAME_NAME,
    version: '1.0.0',
    contentVersion: '2026.10.24',
    source: params.has('source') ? 'https://github.com/example/unicorn-academy-fan-game' : null,
    // What the game put right: nothing, or `?touches=2&freed=1&errors=3`.
    caught: () => ({
      touches: Number(params.get('touches') ?? 0),
      freed: Number(params.get('freed') ?? 0),
      errors: Number(params.get('errors') ?? 0),
    }),
  },
  now: () => Date.now(),
  confirmSound: () => void calls.push('confirm sound'),
  download(file) {
    downloads.push(file);
  },
};

const ui = new Ui(document.getElementById('ui')!);
const panel = new ParentPanel(ui.host, services, {
  onOpen: () => void calls.push('opened'),
  onClose: () => void calls.push('closed'),
});
ui.doneLoading();
ui.showHud({ onSound: () => calls.push('sound'), onParent: (opener) => panel.open(opener) });
saves.subscribe((status) => ui.setAttention(status.state === 'failed'));
Object.assign(lab, { panel, ui });
