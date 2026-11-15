import { h } from '../../dom';
import type { Page } from '../panel';
import { deviceLine, visitLine } from '../text';
import { button, card, pageTitle, statusLine } from '../widgets';
import { downloadCopy } from './common';

/** Where progress is kept, and whether it is safe. */
export const saving: Page = (ctx) => {
  const { services } = ctx;
  const title = pageTitle('Saving', 'Where progress is kept, and whether it is safe.');
  // A visit that starts from the beginning, or a look around, does not touch the saved world, so
  // there is nothing to report on it.
  const visiting = visitLine(services.visit);
  if (visiting)
    return h(
      'div',
      { class: 'page' },
      title,
      card(
        'This visit',
        statusLine(visiting),
        services.visit === 'fresh'
          ? h(
              'div',
              { class: 'actions' },
              button('Change this under Play', () => ctx.go('play'), 'quiet'),
            )
          : null,
      ),
    );
  const device = h('div');
  const page = h('div', { class: 'page' }, title, device);

  const paint = (): void => {
    const line = deviceLine(services.saves.get(), services.now());
    device.replaceChildren(
      card(
        'On this device',
        statusLine(line),
        line.offerDownload
          ? h(
              'div',
              { class: 'actions' },
              button('Download a copy', () => void downloadCopy(ctx)),
            )
          : null,
      ),
    );
  };

  paint();
  ctx.onLeave(services.saves.subscribe(paint));
  // "Saved 2 minutes ago" goes stale on its own, so the words are refreshed while the page is open.
  const tick = window.setInterval(paint, 15_000);
  ctx.onLeave(() => window.clearInterval(tick));
  return page;
};
