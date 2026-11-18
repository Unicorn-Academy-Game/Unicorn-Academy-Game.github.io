import { STARS_PER_WORD, type Stars } from '../../../learning';
import { ASK_RATES, KEYBOARD_LAYOUTS, LETTER_CASES, type LearningSettings, START_HELP } from '../../../shared/learning';
import { fill, h } from '../../dom';
import {
  ASK_LABELS,
  askDescription,
  CASE_LABELS,
  factsOf,
  HELP_LABELS,
  helpDescription,
  KEYBOARD_LABELS,
  keepingLine,
  type PageReport,
  reportOf,
  startNewBlock,
  startNewSaid,
  trickyNote,
} from '../learning-text';
import type { Page } from '../panel';
import type { StartNewResult } from '../services';
import { bookNeedsAttention, count } from '../text';
import { button, card, choice, fact, note, pageTitle, para, statusLine, toggle } from '../widgets';
import { copyCard } from './learning-copy';

const options = <T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
): { value: T; label: string }[] => values.map((value) => ({ value, label: labels[value] }));

/** Small stars, as many of them lit as the player has earned. */
const stars = (earned: Stars): HTMLElement =>
  h(
    'span',
    { class: 'stars', role: 'img', 'aria-label': `${earned} of ${STARS_PER_WORD} stars` },
    ...Array.from({ length: STARS_PER_WORD }, (_, i) => h('i', { class: i < earned ? 'on' : '' })),
  );

const wordsOf = (page: PageReport): HTMLElement[] =>
  page.words.length === 0
    ? []
    : [
        h('h5', {}, `${page.title}, ${page.found} of ${page.total}`),
        h(
          'ul',
          { class: 'word-rows' },
          ...page.words.map((row) =>
            h(
              'li',
              { class: 'word-row' },
              h('strong', {}, row.word),
              stars(row.stars),
              h('span', { class: 'word-level' }, row.level),
              h('span', { class: 'muted' }, row.again),
            ),
          ),
        ),
      ];

/**
 * Spelling a thing's name to collect it: the switch for the whole game, how it asks and looks, and
 * how far the player has got.
 */
export const learning: Page = (ctx) => {
  const { settings, visit, learning: controls } = ctx.services;
  const change = (patch: Partial<LearningSettings>): void =>
    settings.update({ learning: { ...settings.get().learning, ...patch } });
  const start = settings.get().learning;
  const remembered =
    visit === 'incognito'
      ? 'You are in an incognito visit, so these choices are not remembered.'
      : 'A change takes effect at once.';

  const on = toggle(
    'Learning mode',
    'Tapping a creature, a gem, a fruit tree or a friend can bring up a card where your child spells its name on an on-screen keyboard, and the computer by the palace teaches reading. Nothing is marked wrong, and either can be closed at any moment. Off, no card comes up and nothing is said aloud. The computer by the palace and the memory and maths tables still open when your child taps them, and play on without the voice.',
    start.on,
    (value) => change({ on: value }),
  );

  const ask = choice('How often it asks', askDescription(), options(ASK_RATES, ASK_LABELS), start.ask, (value) =>
    change({ ask: value }),
  );
  const friends = toggle(
    'Friends join when their name is spelled',
    'When your child walks up to a friend who has not been found yet, the card asks for the name to be spelled, and the friend joins once it is spelled. Off, a friend joins as soon as they walk up.',
    start.friends,
    (value) => change({ friends: value }),
  );
  const help = choice(
    'Help with a new word',
    helpDescription(),
    options(START_HELP, HELP_LABELS),
    start.help,
    (value) => change({ help: value }),
  );
  const keyboard = choice(
    'Keyboard',
    'ABC puts the letters in the order of the alphabet, which is the easiest to find a letter in. QWERTY is the layout of a computer keyboard.',
    options(KEYBOARD_LAYOUTS, KEYBOARD_LABELS),
    start.keyboard,
    (value) => change({ keyboard: value }),
  );
  const letters = choice(
    'Letters',
    'Capitals or small letters, on the keys and in the word. Capitals are usually learned first.',
    options(LETTER_CASES, CASE_LABELS),
    start.letters,
    (value) => change({ letters: value }),
  );
  const say = toggle(
    'Say words and letters aloud',
    'Says the word when a card opens, when it is finished and when the speaker is tapped, and says the sound of each letter pressed (buh for b, not bee), on a card and on the manor door. The voice is recorded and ships with the game, so it is the same on every device. It follows the sound level and mute of the game.',
    start.say,
    (value) => change({ say: value }),
  );

  const more = h(
    'div',
    {},
    card('When it asks', ask.node, friends.node),
    card('How a card looks and sounds', help.node, keyboard.node, letters.node, say.node),
  );

  // The player's Spell Book. The parts that change are filled again in place, so a button or a list
  // that is open keeps its place and its focus.
  const status = h('div');
  // When the player's book is going nowhere, the line is the first thing on the page, because that
  // is why the dot sent a parent here.
  const heads = card(null);
  const facts = h('dl', { class: 'facts' });
  const trickiest = note('');
  const summary = h('summary', {});
  const list = h('div', { class: 'words-list' });
  const words = h('details', { class: 'words' }, summary, list);
  const reason = h('p', { class: 'note', id: 'start-new-reason', hidden: true });
  const startNew = button('Start a new Spell Book', () => void begin(), 'danger', {
    'aria-describedby': 'start-new-reason',
  });
  const book = card('Spell Book', status, facts, trickiest, words);
  const copy = copyCard(ctx);
  const fresh = card(
    'Start a new Spell Book',
    para(
      `Begins an empty book, and every word is asked again from the beginning. The current book is put away on this device first. It can be downloaded under Recovery, and added back here with Add a saved Spell Book. What was earned at the memory and maths tables starts again too, and is not put away.`,
    ),
    h('div', { class: 'actions' }, startNew),
    reason,
  );
  const mine = [book, copy.node, fresh];

  const paint = (): void => {
    const report = reportOf(controls.book.get(), ctx.services.now());
    const keeping = controls.keeping();
    const blocked = startNewBlock(keeping, visit, report.found);
    // A book the player has not started, with learning off, has nothing to say.
    const away = !settings.get().learning.on && report.found === 0;
    for (const node of mine) node.hidden = away;
    copy.paint();
    const device = h('div', { class: 'book-line' }, statusLine(keepingLine(keeping, visit, controls.durable.get())));
    const worry = bookNeedsAttention(keeping, visit, settings.get().learning.on);
    heads.hidden = !worry;
    fill(heads, worry && device);
    fill(status, !worry && device);
    fill(facts, ...factsOf(report).map((f) => fact(f.label, f.value)));
    const meaning = trickyNote(report);
    trickiest.hidden = meaning === null;
    trickiest.textContent = meaning ?? '';
    words.hidden = report.found === 0;
    summary.textContent = `Every word found (${report.found})`;
    fill(list, ...report.pages.flatMap(wordsOf));
    startNew.setAttribute('aria-disabled', String(blocked !== null));
    reason.hidden = blocked === null;
    reason.textContent = blocked ?? '';
  };

  async function begin(): Promise<void> {
    const report = reportOf(controls.book.get(), ctx.services.now());
    const keeping = controls.keeping();
    if (startNewBlock(keeping, visit, report.found) !== null) return;
    const yes = await ctx.confirm({
      title: 'Start a new Spell Book?',
      body: [
        para(
          keeping === 'device'
            ? `The ${count(report.found, 'word', 'words')} and ${count(report.stars, 'star', 'stars')} are put away on this device first, so nothing is lost.${visit === 'kept' ? ' They stay under Recovery, where they can be downloaded.' : ''}`
            : `The ${count(report.found, 'word', 'words')} and ${count(report.stars, 'star', 'stars')} are only held until the page closes, so they cannot be put away and will be gone.`,
        ),
        para(
          'The new book starts empty, and every word is asked again from the beginning. The stars earned at the memory and maths tables start again too, and are not put away.',
        ),
      ],
      confirm: 'Start a new book',
      tone: 'danger',
    });
    if (!yes) return;
    const done = ctx.busy('Putting the book away…');
    let result: StartNewResult = 'refused';
    try {
      result = await controls.startNew();
    } finally {
      done();
    }
    const said = startNewSaid(result);
    ctx.say(said.text, said.tone);
  }

  // The reading computer's cards come with the course, which is a chunk of its own, so they are put
  // in once it has loaded.
  const reading = h('div', { class: 'reading-slot' });
  let left = false;
  ctx.onLeave(() => {
    left = true;
  });
  import('../../learning/reading/parent').then(
    ({ readingCards }) => {
      if (!left) fill(reading, readingCards(ctx));
    },
    (error: unknown) => {
      console.error(error);
      if (!left)
        fill(
          reading,
          card('Reading at the computer', note('This part did not load. Close the controls and open them again.')),
        );
    },
  );

  const page = h(
    'div',
    { class: 'page' },
    pageTitle(
      'Learning',
      'Your child spells the names of things to collect them, and reads at the computer by the palace.',
    ),
    heads,
    card('Learning mode', on.node, note(remembered)),
    more,
    reading,
    ...mine,
  );

  const sync = (s: LearningSettings): void => {
    on.set(s.on);
    ask.set(s.ask);
    friends.set(s.friends);
    help.set(s.help);
    keyboard.set(s.keyboard);
    letters.set(s.letters);
    say.set(s.say);
    more.hidden = !s.on;
    paint();
  };
  sync(start);
  ctx.onLeave(settings.subscribe((s) => sync(s.learning)));
  ctx.onLeave(controls.book.subscribe(paint));
  ctx.onLeave(controls.durable.subscribe(paint));
  // What the browser says about keeping the player's book is read when a parent looks, and the line
  // is painted again when it is known.
  void controls.durable.check();
  // "Asked again in 10 minutes" goes stale on its own, so the words are refreshed while the page is
  // open.
  const tick = window.setInterval(paint, 30_000);
  ctx.onLeave(() => window.clearInterval(tick));
  return page;
};
