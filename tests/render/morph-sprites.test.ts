import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNICORN_IDS } from '../../src/shared/ids';
import { CREATURES, FRIEND_FRUIT, FRUIT_IDS, FRUITS } from '../../src/wonder/games/morph/recipes';
import { BUSHES, FLOWERS, TREES } from '../../src/wonder/games/morph/scene-art';

const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as {
  bundles: Record<string, { sprites: Record<string, unknown> }>;
};
const names = (bundle: string): string[] => Object.keys(manifest.bundles[bundle]!.sprites);

describe('the magic changing machine', () => {
  it('is drawn from sprites that the bundles have: the produce, the creatures, and the meadow of the playground', () => {
    const produce = names('produce');
    for (const id of FRUIT_IDS) expect(produce, `the ${id}`).toContain(FRUITS[id].sprite);
    const life = names('life');
    for (const list of Object.values(CREATURES)) for (const c of list) expect(life, c.sprite).toContain(c.sprite);
    const playground = names('playground');
    for (const sprite of [...TREES, ...BUSHES, ...FLOWERS]) expect(playground, sprite).toContain(sprite);
  });

  it('gives every friend a fruit of her own, and every fruit one step of the scale going up the rainbow', () => {
    for (const id of UNICORN_IDS) expect(FRUIT_IDS, `${id}'s fruit`).toContain(FRIEND_FRUIT[id]);
    expect(FRUIT_IDS.map((id) => FRUITS[id].step)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(FRUIT_IDS.map((id) => FRUITS[id].bloom)).size, 'seven flowers that are not alike').toBe(7);
  });
});
