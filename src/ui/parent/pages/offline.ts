import type { OfflineStatus } from '../../../offline/status';
import { GAME_NAME } from '../../../shared/brand';
import type { Voice } from '../../../shared/offline';
import { fill, h } from '../../dom';
import type { Page, PageContext } from '../panel';
import type { OfflineControls } from '../services';
import type { Line } from '../text';
import { button, card, note, pageTitle, para, statusLine } from '../widgets';

const SHARE_ICON =
  '<svg class="inline-icon" viewBox="0 0 24 24" role="img" aria-label="the Share button"><path d="M12 15V4M8.5 7.5L12 4l3.5 3.5"/><path d="M7 11H5.5v9h13v-9H17"/></svg>';

const lineFor = (status: OfflineStatus | null): Line => {
  if (!status || status.kind === 'unsupported') {
    return {
      tone: 'info',
      title: 'Offline play is not available here',
      detail: 'This browser is not keeping the game for offline use. Opening it from the Home Screen often fixes that.',
    };
  }
  switch (status.kind) {
    case 'preparing':
      return {
        tone: 'info',
        title: 'Getting ready for offline play…',
        detail:
          status.total === 0
            ? 'The game can be played while this finishes.'
            : `${status.done} of ${status.total} parts are on this device. The game can be played while this finishes.`,
      };
    case 'ready':
      return {
        tone: 'good',
        title: 'Ready offline',
        detail: 'The game is kept on this device, so it can be played with no connection.',
      };
    case 'update-ready':
      return {
        tone: 'info',
        title: 'A newer version is ready',
        detail: 'It is used the next time the game is opened. You can switch to it now. Progress is saved first.',
      };
    case 'trouble':
      return { tone: 'warn', title: 'Offline play ran into trouble', detail: status.detail };
  }
};

const MIB = 1024 * 1024;

const spokenLine = (spoken: Voice): Line => {
  if (spoken.keeping)
    return {
      tone: 'info',
      title: 'Keeping the spoken lessons…',
      detail: `${spoken.done} of ${spoken.total} are on this device. The game can be played while this finishes.`,
    };
  if (spoken.done >= spoken.total)
    return {
      tone: 'good',
      title: 'Every spoken lesson is kept',
      detail: 'Every word and sentence can be heard with no connection.',
    };
  if (spoken.failed)
    return {
      tone: 'warn',
      title: 'Some spoken lessons could not be kept',
      detail: 'Check the connection and try again.',
    };
  return {
    tone: 'info',
    title: 'Spoken lessons are kept as they are heard',
    detail: `${spoken.done} of ${spoken.total} are on this device. One that has not been heard yet needs a connection, unless all of them are kept now.`,
  };
};

/**
 * Whether the game can be played with no connection, how to put it on the Home Screen, and how to
 * switch to a newer version.
 */
export const offline: Page = (ctx) => {
  const controls = ctx.services.offline;
  const status = h('div');

  const paint = (value: OfflineStatus | null): void => {
    const line = lineFor(value);
    fill(
      status,
      statusLine(line),
      value?.kind === 'preparing'
        ? h('progress', {
            class: 'meter',
            max: Math.max(1, value.total),
            value: value.done,
            'aria-label': 'Offline preparation',
          })
        : null,
      value?.kind === 'update-ready' && controls
        ? h(
            'div',
            { class: 'actions' },
            button('Update now', () => void update(ctx, controls)),
          )
        : null,
      value?.kind === 'trouble' && controls
        ? h(
            'div',
            { class: 'actions' },
            button('Try again', () => controls.retry()),
            button('Start the offline copy over…', () => void startOver(ctx, controls), 'quiet'),
          )
        : null,
    );
  };

  const spokenCard = h('div');
  const paintSpoken = (value: OfflineStatus | null): void => {
    const spoken = value?.kind === 'ready' ? value.spoken : null;
    if (!spoken || spoken.total === 0 || !controls) {
      fill(spokenCard);
      return;
    }
    const everything = spoken.done >= spoken.total;
    fill(
      spokenCard,
      card(
        'Spoken lessons',
        statusLine(spokenLine(spoken)),
        spoken.keeping
          ? h('progress', {
              class: 'meter',
              max: Math.max(1, spoken.total),
              value: spoken.done,
              'aria-label': 'Spoken lessons kept',
            })
          : null,
        spoken.keeping || everything
          ? null
          : h(
              'div',
              { class: 'actions' },
              button(`Keep all spoken lessons (${Math.max(1, Math.round(spoken.bytes / MIB))} MiB)`, () =>
                controls.keepSpoken(),
              ),
            ),
      ),
    );
  };

  const show = (value: OfflineStatus | null): void => {
    paint(value);
    paintSpoken(value);
  };
  show(controls?.status.get() ?? null);
  if (controls) ctx.onLeave(controls.status.subscribe(show));

  const steps = (items: (string | HTMLElement)[][]): HTMLElement =>
    h('ol', { class: 'steps' }, ...items.map((parts) => h('li', {}, ...parts)));
  const shareStep = h('span');
  shareStep.innerHTML = `Tap the Share button ${SHARE_ICON} in Safari’s toolbar.`;

  return h(
    'div',
    { class: 'page' },
    pageTitle('Offline play', 'Once it is ready, the game can be played with no connection.'),
    card('Offline status', status),
    spokenCard,
    card(
      'Put it on the Home Screen',
      para(
        `Open ${GAME_NAME} once while online so everything can download. Then add it to the Home Screen so it opens like any other app.`,
      ),
      h('h5', {}, 'iPhone and iPad (Safari)'),
      steps([
        [shareStep],
        ['Scroll down and tap ', h('strong', {}, 'Add to Home Screen'), '.'],
        ['Tap ', h('strong', {}, 'Add'), '. From then on, open the game from its icon.'],
      ]),
      h('h5', {}, 'Android (Chrome)'),
      steps([
        ['Tap the menu (three dots) at the top right.'],
        ['Tap ', h('strong', {}, 'Install app'), ' or ', h('strong', {}, 'Add to Home screen'), '.'],
      ]),
      note('Orientation is not locked. The game works held either way.'),
    ),
  );
};

async function update(ctx: PageContext, controls: OfflineControls): Promise<void> {
  const yes = await ctx.confirm({
    title: 'Switch to the newer version?',
    body: [para('Progress is saved first. Then the game restarts using the newer version.')],
    confirm: 'Update now',
  });
  if (!yes) return;
  ctx.busy('Updating…');
  await controls.update();
}

async function startOver(ctx: PageContext, controls: OfflineControls): Promise<void> {
  const yes = await ctx.confirm({
    title: 'Start the offline copy over?',
    body: [
      para(
        'This removes the copy kept on this device and downloads it again. It needs a connection. Progress is saved first and is not lost.',
      ),
    ],
    confirm: 'Start over',
  });
  if (!yes) return;
  const done = ctx.busy('Starting over…');
  try {
    await controls.repair();
  } catch {
    done();
    ctx.say('That did not work. Check the connection and try again.', 'bad');
  }
}
