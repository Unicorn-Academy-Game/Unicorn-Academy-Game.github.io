import type { Screen } from './chrome';
import { viewOf } from './painter';

/**
 * The screens a game has to fit, as the page gives them to it: CSS pixels wide and high. A test
 * lays a game out on every one.
 */
const PAGES = [
  { name: 'a phone held sideways', width: 863, height: 360 },
  { name: 'an iPhone held sideways', width: 852, height: 393 },
  { name: 'a phone held upright', width: 360, height: 780 },
  { name: 'a tall phone held upright', width: 390, height: 844 },
  { name: 'a laptop', width: 1280, height: 720 },
  { name: 'a Fire HD 10 held sideways', width: 1280, height: 800 },
  { name: 'a tablet held upright', width: 768, height: 1024 },
  { name: 'a small window', width: 640, height: 360 },
] as const;

/** A page as a game sees it: its size in units, and how many CSS pixels one unit is. */
export interface Named extends Screen {
  readonly name: string;
}

export const SCREENS: readonly Named[] = PAGES.map((p) => {
  const v = viewOf(p.width, p.height);
  return { name: p.name, w: v.w, h: v.h, unit: v.unit };
});
