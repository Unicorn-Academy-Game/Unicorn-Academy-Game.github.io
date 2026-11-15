import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POND_LIFE, POND_SPRITES } from '../../src/wonder/games/lily/art';

const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as {
  bundles: Record<string, { sprites: Record<string, unknown> }>;
};
const names = (bundle: string): string[] => Object.keys(manifest.bundles[bundle]!.sprites);

describe('the pond of the frog and the lily pads', () => {
  it('is drawn from sprites the playground bundle has: the trees, the reeds, the bushes, the flowers and the rocks', () => {
    const playground = names('playground');
    for (const sprite of POND_SPRITES) expect(playground, sprite).toContain(sprite);
  });

  it('keeps frogs, ducks, fish and dragonflies from the life bundle, in every pose it draws them in', () => {
    const life = names('life');
    for (const sprite of POND_LIFE) expect(life, sprite).toContain(sprite);
  });

  it('has the toy that opens it in the playground bundle, a frog on her pad', () => {
    expect(names('playground')).toContain('pg-frog-lily');
  });
});
