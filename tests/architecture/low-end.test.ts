import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, styleSheets } from './source';

interface Rule {
  selector: string;
  body: string;
}

/** The rules of a stylesheet, with comments taken out. These sheets have no nested rules. */
function rulesOf(css: string): Rule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim().replace(/\s+/g, ' '),
    body: m[2]!,
  }));
}

const LOW_END = 'src/ui/low-end.css';

/** What the low-end sheet names inside `:is(...)`, which is where it lists the surfaces. */
function switchedOff(css: string): Set<string> {
  const names = rulesOf(css)
    .filter((rule) => /backdrop-filter\s*:\s*none/.test(rule.body))
    .flatMap((rule) =>
      [...rule.selector.matchAll(/:is\(([^)]*)\)/g)].flatMap((list) => list[1]!.split(',').map((name) => name.trim())),
    );
  return new Set(names);
}

describe('low-end mode', () => {
  it('switches off the blur behind every surface that has one, so a new surface cannot leave it on', () => {
    // A surface that blurs what is behind it has the browser blur the game's picture again behind
    // it on every frame. Low-end mode takes the blur away.
    const blurring = styleSheets('src/ui')
      .filter((file) => file !== LOW_END)
      .flatMap((file) =>
        rulesOf(readFileSync(join(ROOT, file), 'utf8'))
          .filter((rule) => /backdrop-filter\s*:\s*blur/.test(rule.body))
          .flatMap((rule) => rule.selector.split(',').map((selector) => ({ file, selector: selector.trim() }))),
      );
    expect(blurring.length, 'the sheets still have surfaces that blur').toBeGreaterThan(0);

    const off = switchedOff(readFileSync(join(ROOT, LOW_END), 'utf8'));
    expect(off.size, 'the low-end sheet still lists surfaces').toBeGreaterThan(0);
    const forgotten = blurring
      .filter(({ selector }) => !off.has(selector))
      .map(({ file, selector }) => `${selector} in ${file}`);
    expect(forgotten, `add these to the backdrop-filter rule in ${LOW_END}`).toEqual([]);
  });
});
