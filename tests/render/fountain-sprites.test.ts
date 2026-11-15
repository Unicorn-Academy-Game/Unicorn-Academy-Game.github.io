import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNICORN_IDS } from '../../src/shared/ids';
import { FOUNTAIN_SPRITES } from '../../src/wonder/games/fountain/art';
import { JET_COUNT } from '../../src/wonder/games/fountain/layout';
import { FRIEND_JET, JEWELS } from '../../src/wonder/games/fountain/recipes';

const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as {
  bundles: Record<string, { sprites: Record<string, unknown> }>;
};

describe('the fountain that plays jewels', () => {
  it('is drawn from sprites the playground bundle has: the fountain, the trees, the bushes and the flowers', () => {
    const playground = Object.keys(manifest.bundles.playground!.sprites);
    for (const sprite of FOUNTAIN_SPRITES) expect(playground, sprite).toContain(sprite);
  });

  it('has a jewel for each jet, going up the scale in order, and a jet for every friend', () => {
    expect(JEWELS).toHaveLength(JET_COUNT);
    expect(JEWELS.map((j) => j.step)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(JEWELS.map((j) => j.id)).size, 'seven jewels that are not alike').toBe(JET_COUNT);
    for (const id of UNICORN_IDS) {
      expect(FRIEND_JET[id], `${id}'s jet`).toBeGreaterThanOrEqual(0);
      expect(FRIEND_JET[id], `${id}'s jet`).toBeLessThan(JET_COUNT);
    }
    expect(new Set(UNICORN_IDS.map((id) => FRIEND_JET[id])).size, 'no two friends share a jet').toBe(
      UNICORN_IDS.length,
    );
  });
});
