import type { Bundle } from '../../shared/manifest';
import type { Cell, Role } from './pixels';
import { roleOf } from './roles';

/**
 * The pictures on one page of a bundle, each with what it is. A picture that two sprites share
 * takes the more particular of their roles, and a picture that no sprite names is a prop.
 */
export function cellsOfPage(bundle: Bundle, page: number): Cell[] {
  const atlas = bundle.pages[page];
  if (!atlas) throw new Error(`the bundle has no page ${page}`);
  const roles = new Map<number, Role>();
  for (const [name, sprite] of Object.entries(bundle.sprites)) {
    const role = roleOf(name);
    for (const frame of sprite.frames) {
      if (frame.page !== page) continue;
      const known = roles.get(frame.rect);
      if (known === undefined || known === 'prop') roles.set(frame.rect, role);
    }
  }
  return atlas.rects.map((r, i) => ({ x: r.x, y: r.y, w: r.w, h: r.h, role: roles.get(i) ?? 'prop' }));
}
