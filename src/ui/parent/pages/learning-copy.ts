import { type BookFile, MAX_BOOK_CHARS, parseBookFile } from '../../../learning';
import { h } from '../../dom';
import { addBlock, previewFile, reportOf, saveBlock } from '../learning-text';
import type { PageContext } from '../panel';
import { button, card, para, statusLine } from '../widgets';

/**
 * What the card for keeping a copy of the Spell Book gives the page: the card, and a way to refresh
 * it when what it depends on changes.
 */
export interface CopyCard {
  node: HTMLElement;
  paint(): void;
}

/**
 * Saves the player's Spell Book as a file, and adds a saved one to it. Adding puts the two together
 * and never takes a word or a star away, so it needs no confirming. It also takes the copy put
 * aside under Recovery when a new book was started, so that book can be brought back.
 */
export function copyCard(ctx: PageContext): CopyCard {
  const { learning: controls, visit } = ctx.services;
  const slot = h('div', { class: 'choice-result', role: 'status' });
  const input = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    'aria-label': 'Choose a saved Spell Book file',
  });
  const saveReason = h('p', { class: 'note', id: 'save-copy-reason', hidden: true });
  const addReason = h('p', { class: 'note', id: 'add-copy-reason', hidden: true });
  const save = button('Save a copy', () => void keep(), 'quiet', { 'aria-describedby': 'save-copy-reason' });
  const add = button('Add a saved Spell Book…', () => void choose(), 'quiet', {
    'aria-describedby': 'add-copy-reason',
  });
  const node = card(
    'Keep a copy',
    para(
      'Saves the Spell Book as a file, to keep or to move to another device. Adding a saved one puts it together with the one on this device, and never takes a word or a star away.',
    ),
    h('div', { class: 'actions' }, save, add),
    saveReason,
    addReason,
    input,
    slot,
  );

  const found = (): number => reportOf(controls.book.get(), ctx.services.now()).found;
  const addBlocked = (): string | null => addBlock(controls.keeping(), visit);

  function paint(): void {
    const saveBlocked = saveBlock(found());
    const addNow = addBlocked();
    save.setAttribute('aria-disabled', String(saveBlocked !== null));
    saveReason.hidden = saveBlocked === null;
    saveReason.textContent = saveBlocked ?? '';
    add.setAttribute('aria-disabled', String(addNow !== null));
    addReason.hidden = addNow === null;
    addReason.textContent = addNow ?? '';
  }

  function keep(): void {
    if (saveBlock(found()) !== null) return;
    ctx.services.download(controls.save());
    ctx.say('The Spell Book was downloaded. Keep it somewhere safe.', 'good');
  }

  function choose(): void {
    if (addBlocked() === null) input.click();
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    // The same file can be chosen again.
    input.value = '';
    if (file) void read(file);
  });

  const clear = (): void => {
    slot.replaceChildren();
    add.focus({ preventScroll: true });
  };

  function refuse(reason: string): void {
    slot.replaceChildren(
      statusLine({ tone: 'bad', title: 'That file cannot be used', detail: reason }),
      h('div', { class: 'actions' }, button('Choose a different file…', choose, 'quiet')),
    );
  }

  async function read(file: File): Promise<void> {
    if (file.size > MAX_BOOK_CHARS) return refuse('That file is too big to be a Spell Book.');
    let text: string;
    try {
      text = await file.text();
    } catch {
      return refuse('That file could not be opened.');
    }
    const parsed = parseBookFile(text);
    if (!parsed.ok) return refuse(parsed.reason);
    show(parsed);
  }

  function show(file: Extract<BookFile, { ok: true }>): void {
    const preview = previewFile(controls.book.get(), file, ctx.services.now());
    slot.replaceChildren(
      statusLine(preview),
      h(
        'div',
        { class: 'actions' },
        ...(preview.adds
          ? [button('Add to the Spell Book', () => put(file)), button('Cancel', clear, 'quiet')]
          : [button('Choose a different file…', choose, 'quiet'), button('Close', clear, 'quiet')]),
      ),
    );
  }

  function put(file: Extract<BookFile, { ok: true }>): void {
    // What the page showed may be out of date: the book can have become one that is not kept while
    // the file was being looked at.
    const blocked = addBlocked();
    if (blocked !== null) {
      slot.replaceChildren(
        statusLine({ tone: 'warn', title: 'The file was not added', detail: blocked }),
        h('div', { class: 'actions' }, button('Close', clear, 'quiet')),
      );
      paint();
      return;
    }
    controls.add(file.profile);
    const report = reportOf(controls.book.get(), ctx.services.now());
    clear();
    ctx.say(`Added. The Spell Book now has ${report.found} of ${report.total} words.`, 'good');
  }

  paint();
  return { node, paint };
}
