import { describe, expect, it } from 'vitest';
import { EXIT_LOOKS, EXIT_SPRITE } from '../../src/content/exits';
import { MAP_IDS } from '../../src/shared/ids';
import { EXIT_ICONS } from '../../src/ui/icons';
import { FX_SPRITES } from '../../tools/art/fx/sprites';

describe('the look of a way out', () => {
  it('is given for every map there is, because a way out is dressed for where it leads', () => {
    expect(Object.keys(EXIT_LOOKS).sort()).toEqual([...MAP_IDS].sort());
  });

  it('gives every place its own word, content id and colour, so two ways out are never taken for each other', () => {
    const looks = MAP_IDS.map((id) => EXIT_LOOKS[id]);
    for (const key of ['id', 'word', 'tint'] as const)
      expect(new Set(looks.map((l) => l[key])).size, key).toBe(looks.length);
    for (const l of looks) expect(l.id).toMatch(/^exit\.[a-z-]+$/);
  });

  it('draws every icon it names', () => {
    for (const id of MAP_IDS) expect(EXIT_ICONS[EXIT_LOOKS[id].icon], id).toContain('<svg');
  });

  it('is drawn with pictures that the art has', () => {
    const drawn = new Set(FX_SPRITES.map((s) => s.id));
    for (const id of Object.values(EXIT_SPRITE)) expect(drawn.has(id), id).toBe(true);
  });
});
