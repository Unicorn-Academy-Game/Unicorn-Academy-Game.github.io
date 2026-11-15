import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, styleSheets } from './source';

/**
 * The one sheet that may use a viewport unit, and the sizes it uses. It makes `--vh` out of one,
 * gives the stage the height of the page (the `100vh` is for a browser that does not know `dvh`),
 * and lets the confetti fall past the bottom of the page.
 */
const MAY = { file: 'src/ui/style.css', tokens: ['1vh', '1dvh', '100vh', '100dvh', '-5vh', '112vh'] };

describe('the sizes in the stylesheets', () => {
  it('are never in vh, which on a phone is the page with the browser bars gone and so taller than the page the player sees', () => {
    // A card sized in vh is made for a page taller than the one on the screen, and its bottom row
    // of keys is under the bars. `--vh` is one percent of the page that is there, so a size in it
    // is right however much of the screen the browser keeps.
    const stray = styleSheets('src').flatMap((file) => {
      const bare = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const found = [...bare.matchAll(/-?\d*\.?\d+(?:vh|svh|lvh|dvh)\b/g)].map((m) => m[0]);
      const allowed = file === MAY.file ? MAY.tokens : [];
      return found.filter((token) => !allowed.includes(token)).map((token) => `${token} in ${file}`);
    });
    expect(
      stray,
      'write the size as calc(N * var(--vh)), which is N percent of the page that is on the screen',
    ).toEqual([]);
  });
});
