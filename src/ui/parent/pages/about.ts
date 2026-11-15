import { FAN_GAME_NOTICE } from '../../../shared/brand';
import { h } from '../../dom';
import type { Page } from '../panel';
import { describeCaught } from '../text';
import { button, card, fact, pageTitle, para } from '../widgets';

/**
 * The text of the notices of the works in the game, which is only fetched when a parent asks to
 * read it.
 */
const notices = async (): Promise<string> => (await import('../../../../THIRD_PARTY_NOTICES.md?raw')).default;

function noticesCard(): HTMLElement {
  const body = h('div', { class: 'notices-body' });
  const show = button(
    'Show the notices',
    () => {
      show.disabled = true;
      notices().then(
        (text) => {
          show.remove();
          body.append(h('pre', { class: 'notices', tabindex: 0 }, text));
        },
        () => {
          show.disabled = false;
          body.replaceChildren(
            para('The notices could not be loaded. They are in the file THIRD_PARTY_NOTICES.md of the source.'),
          );
        },
      );
    },
    'quiet',
  );
  return card(
    'Notices of the works in this game',
    para(
      'The engine, the typeface and the piano of lights are the work of other people. Their notices are kept here, as their licences ask.',
    ),
    show,
    body,
  );
}

/**
 * What this copy of the game is, who made the parts it borrowed, and what to say when asking for
 * help.
 */
export const about: Page = (ctx) => {
  const { about: info } = ctx.services;
  return h(
    'div',
    { class: 'page' },
    pageTitle(info.name),
    card(
      null,
      h(
        'dl',
        { class: 'facts' },
        fact('Version', info.version),
        fact('Content', info.contentVersion),
        fact('Put right', describeCaught(info.caught())),
      ),
    ),
    para(FAN_GAME_NOTICE),
    para(
      'The game is free software under the GNU Affero General Public License, version 3. ',
      info.source
        ? h(
            'span',
            {},
            'Its source code is at ',
            h('a', { href: info.source, target: '_blank', rel: 'noopener noreferrer' }, info.source),
            '. ',
          )
        : null,
      'Made with love for unicorn friends everywhere.',
    ),
    para(
      'The piano of lights, the game at the piano by the palace, is adapted from ToneMatrix Redux by Wolfy, which is free software under the GNU General Public License, version 3.',
    ),
    noticesCard(),
  );
};
