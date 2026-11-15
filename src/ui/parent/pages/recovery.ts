import type { ReplaceSource, ShelfEntry } from '../../../persistence/keeper';
import { parseImport, summarize } from '../../../shared/exchange';
import { MAX_SAVE_BYTES } from '../../../shared/save';
import { fill, h } from '../../dom';
import type { Page, PageContext } from '../panel';
import { describeMoment, describeWorld, PLACE_NAMES } from '../text';
import { button, card, note, pageTitle, para, statusLine } from '../widgets';
import { downloadCopy, swapWorld } from './common';

/** Room for the wrapper around a save, the same allowance the reader makes. */
const FILE_SLACK = 4096;

/**
 * Download, load a file, go back to an earlier copy, start over, and get at data that was set
 * aside.
 */
export const recovery: Page = (ctx) => {
  const { world } = ctx.services;
  let alive = true;
  ctx.onLeave(() => (alive = false));

  // While each visit starts from the beginning, the saved world is left alone, so the only world to
  // work with is the one on screen.
  const visiting = ctx.services.visit !== 'kept';
  const current = h('p', { class: 'note' }, 'Looking at the world…');
  void world.current().then((summary) => {
    if (!alive) return;
    if (!summary) current.textContent = 'There is no world on this device yet.';
    else
      current.textContent = `${visiting ? 'This visit holds' : 'The world on this device holds'} ${describeWorld(summary)} and is in ${PLACE_NAMES[summary.mapId]}.`;
  });

  const page = h(
    'div',
    { class: 'page' },
    pageTitle(
      'Recovery',
      'Keep a copy, go back to an earlier one, or start fresh. Nothing here deletes the world you have now without keeping it.',
    ),
    card(visiting ? 'This visit right now' : 'Your world right now', current),
    downloadCard(ctx),
    ...(visiting
      ? [
          card(
            'The saved world',
            para(
              'It is left alone while each visit starts from the beginning, so it cannot be swapped or restored now. Turn that off under Play and open the game again to work with it.',
            ),
            h(
              'div',
              { class: 'actions' },
              button('Go to Play', () => ctx.go('play'), 'quiet'),
            ),
          ),
        ]
      : [fileCard(ctx), shelfCard(ctx, () => alive), startOverCard(ctx)]),
  );

  const damaged = h('div');
  page.append(damaged);
  void world.damagedData().then((items) => {
    if (!alive || items.length === 0) return;
    damaged.replaceChildren(
      card(
        'Data that was set aside',
        para(
          'Something saved on this device could not be read, or was put aside before it was cleared, so it was kept instead of being deleted. You can download it and keep it, or send it to whoever looks after the game.',
        ),
        ...items.map((item) =>
          h(
            'div',
            { class: 'copy' },
            h(
              'div',
              { class: 'copy-text' },
              h('strong', {}, describeMoment(item.at, ctx.services.now())),
              h('span', { class: 'muted' }, item.why),
            ),
            button(
              'Download',
              () =>
                ctx.services.download({
                  filename: `unicorn-academy-unreadable-${new Date(item.at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`,
                  text: item.text,
                }),
              'quiet',
            ),
          ),
        ),
      ),
    );
  });
  return page;
};

const downloadCard = (ctx: PageContext): HTMLElement =>
  card(
    'Download a copy',
    para(
      'Saves the world as a file to keep. It holds the unicorns and where they have been. It never holds a password or a sign-in.',
    ),
    h(
      'div',
      { class: 'actions' },
      button('Download a copy', () => void downloadCopy(ctx)),
    ),
  );

function fileCard(ctx: PageContext): HTMLElement {
  const slot = h('div', { class: 'choice-result' });
  const input = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    'aria-label': 'Choose a saved world file',
  });
  const choose = button('Choose a file…', () => input.click(), 'quiet');

  const clear = (): void => slot.replaceChildren();

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void read(file);
  });

  async function read(file: File): Promise<void> {
    if (file.size > MAX_SAVE_BYTES + FILE_SLACK) return reject('That file is too big to be a saved world.');
    let text: string;
    try {
      text = await file.text();
    } catch {
      return reject('That file could not be opened.');
    }
    const parsed = parseImport(text);
    if (!parsed.ok) return reject(parsed.reason);
    const summary = summarize(parsed.save);
    const source: ReplaceSource = { kind: 'file', save: parsed.save };
    slot.replaceChildren(
      statusLine({
        tone: 'good',
        title: 'This file holds a world',
        detail: `${describeWorld(summary)}, last in ${PLACE_NAMES[summary.mapId]}.`,
      }),
      h(
        'div',
        { class: 'actions' },
        button(
          'Use this world',
          () =>
            void swapWorld(ctx, source, {
              title: 'Replace the world with this file?',
              body: [
                para(`The file holds ${describeWorld(summary)}. It becomes the world on this device.`),
                para(
                  'The world you have now is kept first, under Earlier copies. The game restarts to use the new one.',
                ),
              ],
              confirm: 'Use this world',
              cancel: 'Keep my world',
            }),
        ),
        button('Cancel', clear, 'quiet'),
      ),
    );
  }

  function reject(reason: string): void {
    slot.replaceChildren(
      statusLine({ tone: 'bad', title: 'That file cannot be used', detail: reason }),
      h(
        'div',
        { class: 'actions' },
        button('Choose a different file…', () => input.click(), 'quiet'),
      ),
    );
  }

  return card(
    'Load from a file',
    para('Choose a file made with Download a copy. You will see what is in it before anything changes.'),
    h('div', { class: 'actions' }, choose),
    input,
    slot,
  );
}

function shelfCard(ctx: PageContext, alive: () => boolean): HTMLElement {
  const slot = h('div', { class: 'shelf' }, note('Looking for earlier copies…'));

  const row = (entry: ShelfEntry): HTMLElement => {
    const source: ReplaceSource = { kind: 'device-backup', id: Number(entry.key) };
    const when = describeMoment(entry.at, ctx.services.now());
    const use = async (): Promise<void> => {
      const done = ctx.busy('Looking at that copy…');
      const found = await ctx.services.world.preview(source);
      done();
      if (!found) {
        ctx.say('That copy could not be read.', 'bad');
        return;
      }
      await swapWorld(ctx, source, {
        title: 'Go back to this copy?',
        body: [
          para(`This copy is from ${when}. It holds ${describeWorld(found)} and is in ${PLACE_NAMES[found.mapId]}.`),
          para('The world you have now is kept first, under Earlier copies. The game restarts to use this one.'),
        ],
        confirm: 'Go back to this copy',
        cancel: 'Keep my world',
      });
    };
    return h(
      'div',
      { class: 'copy' },
      h(
        'div',
        { class: 'copy-text' },
        h('strong', {}, when),
        h('span', {}, describeWorld(entry.summary)),
        h('span', { class: 'muted' }, entry.reason),
      ),
      button('Use this copy', () => void use(), 'quiet'),
    );
  };

  void ctx.services.world.shelf().then((shelf) => {
    if (!alive()) return;
    fill(slot, ...(shelf.length > 0 ? shelf.map(row) : [note('Nothing has been put aside on this device yet.')]));
  });

  return card(
    'Earlier copies',
    para('A copy is put aside whenever a world is replaced, so a mistake can be undone.'),
    slot,
  );
}

function startOverCard(ctx: PageContext): HTMLElement {
  const start = async (): Promise<void> => {
    const summary = await ctx.services.world.current();
    await swapWorld(
      ctx,
      { kind: 'fresh' },
      {
        title: 'Start a brand-new world?',
        body: [
          para('Wildstar begins alone at the start of the forest, with no friends found yet.'),
          para(
            summary
              ? `The world you have now (${describeWorld(summary)}) is kept first, under Earlier copies, so it can be brought back.`
              : 'The game restarts to begin the new world.',
          ),
        ],
        confirm: 'Start over',
        cancel: 'Keep my world',
        tone: 'danger',
      },
    );
  };
  return card(
    'Start over',
    para('Begins a brand-new world. The world you have now is kept under Earlier copies first.'),
    h(
      'div',
      { class: 'actions' },
      button('Start over…', () => void start(), 'danger'),
    ),
  );
}
