import { CHAPTERS, chapterAt, STAGE_COUNT, STAGES } from '../../../content/reading';
import { raiseFloor } from '../../../learning';
import { currentStage, finished, totals, trickiest } from '../../../learning/reading';
import { fill, h } from '../../dom';
import type { PageContext } from '../../parent/panel';
import { button, card, fact, note, para, statusLine } from '../../parent/widgets';
import './parent.css';

/**
 * What a parent sees about the reading computer, on the Learning page: how far the player has got,
 * the words they needed the most help with, a way to start them further on, and how it works. It is
 * a chunk of its own with the course, and the page shows it when it has loaded.
 */

let serial = 0;

/** What a parent is told about how a word is read, and who says it is read. */
const HOW_IT_WORKS = [
  'Your child touches the pieces of a word in order, and each one says its sound. Then they say the whole word out loud and tap the tick. A sentence is read the same way, a word at a time and then all together.',
  'The game cannot hear your child, so the tick is their word, and nobody has to hold anything or wait. It is nice to sit beside them and listen, and Once more is there when they want to hear it again.',
] as const;

export function readingCards(ctx: PageContext): HTMLElement {
  const { settings, learning } = ctx.services;
  const pick = `stage-pick-${++serial}`;
  let chosen: number | null = null;

  // How far the player has got
  const learningOff = h('div');
  const facts = h('dl', { class: 'facts' });
  const hardest = h('div');
  const progress = card('Reading at the computer', learningOff, facts, hardest);

  // Starting the player further on
  const picker = h('select', { id: pick, class: 'picker' });
  const go = button('Start here', () => void ahead(), 'primary', { 'aria-describedby': `${pick}-reason` });
  const reason = h('p', { class: 'note', id: `${pick}-reason` }, 'Choose a stage first.');
  const further = card(
    'Start further on',
    para(
      'If your child already reads well, start at a later stage. Every stage before it counts as done. Nothing that was read is taken away, and nothing is locked, so any level can be chosen at any time from the levels on the computer.',
    ),
    h('div', { class: 'row pick-row' }, h('label', { for: pick }, 'Start at'), picker),
    h('div', { class: 'actions' }, go),
    reason,
  );

  // How it works
  const approving = card(
    'How it works',
    ...HOW_IT_WORKS.map((line) => para(line)),
    note(
      'A word can be skipped, and it comes round again later. The voice follows the switch for saying words and letters aloud.',
    ),
  );

  const root = h('div', { class: 'reading-cards' }, progress, further, approving);

  const paint = (): void => {
    const book = learning.book.get();
    const read = totals(book);
    const here = currentStage(book);
    const done = finished(book);
    const stage = STAGES[here - 1]!;
    const on = settings.get().learning.on;
    // A book that has never read, with learning off, has nothing to say, as the Spell Book does
    // not.
    root.hidden = !on && read.words === 0 && read.lines === 0 && here === 1;
    fill(
      learningOff,
      !on &&
        statusLine({
          tone: 'info',
          title: 'Learning mode is off',
          detail: 'The computer by the palace lights up when it is tapped, and nothing opens.',
        }),
    );
    fill(
      facts,
      fact('Now at', done ? 'Every stage is done' : `Stage ${here} of ${STAGE_COUNT}, ${stage.title}`),
      fact('Chapter', chapterAt(here).title),
      fact('Words met', String(read.words)),
      fact('Words read alone', String(read.reads)),
      fact('Sentences read', String(read.lines)),
    );
    const hard = trickiest(book);
    fill(
      hardest,
      hard.length > 0 && h('h5', {}, 'Needed the most help'),
      hard.length > 0 && h('ul', { class: 'chips' }, ...hard.map((word) => h('li', { class: 'chip' }, word.id))),
      hard.length > 0 && note('Help was needed most often with these words.'),
    );

    // Only a stage after the one the player is on is worth picking, since a stage cannot be taken
    // back.
    further.hidden = done || here >= STAGE_COUNT;
    if (chosen !== null && chosen <= here) chosen = null;
    fill(
      picker,
      h('option', { value: '' }, 'Choose a stage'),
      ...CHAPTERS.map((chapter) => {
        const stages = STAGES.filter((s) => s.chapter === chapter.id && s.n > here);
        return stages.length === 0
          ? null
          : h(
              'optgroup',
              { label: chapter.title },
              ...stages.map((s) => h('option', { value: String(s.n) }, `Stage ${s.n}: ${s.title}`)),
            );
      }),
    );
    picker.value = chosen === null ? '' : String(chosen);
    go.setAttribute('aria-disabled', String(chosen === null));
    reason.hidden = chosen !== null;
  };

  picker.addEventListener('change', () => {
    chosen = picker.value === '' ? null : Number(picker.value);
    go.setAttribute('aria-disabled', String(chosen === null));
    reason.hidden = chosen !== null;
  });

  async function ahead(): Promise<void> {
    const n = chosen;
    if (n === null) return;
    const stage = STAGES[n - 1]!;
    const yes = await ctx.confirm({
      title: `Start at stage ${n}?`,
      body: [
        para(
          `Stage ${n} is ${stage.title}, in ${chapterAt(n).title}. ${n === 2 ? 'Stage 1 counts' : `Stages 1 to ${n - 1} count`} as done, and any of them can still be played from the level map.`,
        ),
        para('Nothing that was read is taken away. It stays this way until a new Spell Book is started.'),
      ],
      confirm: 'Start there',
    });
    if (!yes) return;
    learning.change((book) => raiseFloor(book, n));
    chosen = null;
    ctx.say(`Starting at stage ${n} now.`, 'good');
  }

  paint();
  ctx.onLeave(settings.subscribe(paint));
  ctx.onLeave(learning.book.subscribe(paint));
  return root;
}
