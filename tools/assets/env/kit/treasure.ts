import { GEM_TABLES, type GemTable, tableOf } from '../../../../src/content/props';
import { type RisingGem, renderRisingGem, renderTrayTable, type TrayGem } from '../../../art/world/gem-tables';
import {
  BARREL_CANVAS,
  CHEST_CANVAS,
  CRATE_CANVAS,
  DIAMOND_CANVAS,
  FLOAT_CANVAS,
  FLOAT_FRAMES,
  LAMP_CANVAS,
  MAKER_CANVAS,
  NOTES_CANVAS,
  PILE_CANVAS,
  renderBanknoteDesk,
  renderBarrel,
  renderChest,
  renderCrate,
  renderDiamondStand,
  renderFloatGem,
  renderGoldPile,
  renderLamp,
  renderRainMaker,
  renderUrn,
  TABLE_CANVAS,
  URN_CANVAS,
  URN_GLAZES,
} from '../../../art/world/treasure';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/treasure.ts',
  'art/world/treasure.ts',
  'art/world/gem-tables.ts',
  'art/world/gems.ts',
  'art/world/glow.ts',
  'art/world/arch.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

const CHEST_OPENING = 6;
const FLOAT = { frames: FLOAT_FRAMES, fps: 10, loop: true } as const;
const gem = (color: Parameters<typeof renderFloatGem>[0]): Recipe => ({
  id: `float-${color}`,
  bundle: 'treasure-house',
  canvas: FLOAT_CANVAS,
  anim: FLOAT,
  render: (f) => renderFloatGem(color, f),
  source: SRC,
});
const rising = (name: RisingGem): Recipe => ({
  id: `float-${name}`,
  bundle: 'treasure-house',
  canvas: FLOAT_CANVAS,
  anim: FLOAT,
  render: (f) => renderRisingGem(name, f),
  source: SRC,
});
const TABLE_SHADOW = { rx: 44, ry: 13, dx: 6, dy: 2, a: 0.3 } as const;
/**
 * A gem's table is drawn as the sprite of its own name, and the stone that rises from it is
 * `float-` and the gem's name.
 */
const table = (name: TrayGem): Recipe => ({
  id: tableOf(name),
  bundle: 'treasure-house',
  canvas: TABLE_CANVAS,
  render: () => renderTrayTable(name),
  source: SRC,
  shadow: TABLE_SHADOW,
  footprint: { r: 34 },
});
const isTray = (name: GemTable): name is TrayGem => name !== 'diamond';

/** Everything the treasure house holds. */
export const TREASURE_RECIPES: Recipe[] = [
  {
    id: 'chest-closed',
    bundle: 'treasure-house',
    canvas: CHEST_CANVAS,
    render: () => renderChest(0),
    source: SRC,
    shadow: { rx: 86, ry: 24, dx: 10, dy: 4, a: 0.3 },
    footprint: { r: 48 },
  },
  {
    id: 'chest-opening',
    bundle: 'treasure-house',
    canvas: CHEST_CANVAS,
    anim: { frames: CHEST_OPENING, fps: 8, loop: false },
    render: (f) => renderChest((f + 1) / CHEST_OPENING),
    source: SRC,
    shadow: { rx: 86, ry: 24, dx: 10, dy: 4, a: 0.3 },
  },
  {
    id: 'chest-open',
    bundle: 'treasure-house',
    canvas: CHEST_CANVAS,
    render: () => renderChest(1),
    source: SRC,
    shadow: { rx: 86, ry: 24, dx: 10, dy: 4, a: 0.3 },
    footprint: { r: 48 },
  },
  // The three heaps of gold, each its own thing: the coins, the bars and the sacks.
  ...(['coin-pile', 'gold-bars', 'sack-pile'] as const).map(
    (id, v): Recipe => ({
      id,
      bundle: 'treasure-house',
      canvas: PILE_CANVAS,
      render: () => renderGoldPile(v as 0 | 1 | 2),
      source: SRC,
      shadow: { rx: 72, ry: 20, dx: 8, dy: 3, a: 0.28 },
      footprint: { r: 52 },
    }),
  ),
  // The tables of the gem room, in the order of the book.
  ...GEM_TABLES.map(
    (name): Recipe =>
      isTray(name)
        ? table(name)
        : {
            id: tableOf(name),
            bundle: 'treasure-house',
            canvas: DIAMOND_CANVAS,
            render: () => renderDiamondStand(),
            source: SRC,
            shadow: { rx: 40, ry: 12, dx: 6, dy: 2, a: 0.3 },
            footprint: { r: 34 },
          },
  ),
  {
    id: 'money-desk',
    bundle: 'treasure-house',
    canvas: NOTES_CANVAS,
    render: () => renderBanknoteDesk('money'),
    source: SRC,
    shadow: { rx: 68, ry: 18, dx: 8, dy: 3, a: 0.28 },
    footprint: { r: 48 },
  },
  {
    id: 'cash-desk',
    bundle: 'treasure-house',
    canvas: NOTES_CANVAS,
    render: () => renderBanknoteDesk('cash'),
    source: SRC,
    shadow: { rx: 68, ry: 18, dx: 8, dy: 3, a: 0.28 },
    footprint: { r: 48 },
  },
  {
    id: 'tr-rain-maker',
    bundle: 'treasure-house',
    canvas: MAKER_CANVAS,
    render: () => renderRainMaker(),
    source: SRC,
    shadow: { rx: 54, ry: 16, dx: 8, dy: 3, a: 0.3 },
    footprint: { r: 46 },
  },
  // The gem that rises from each table and turns in the air.
  gem('ruby'),
  gem('sapphire'),
  gem('emerald'),
  gem('amethyst'),
  gem('topaz'),
  gem('diamond'),
  rising('opal'),
  rising('pearl'),
  rising('jade'),
  rising('onyx'),
  rising('crystal'),
  rising('ring'),
  {
    id: 'tr-urn-teal',
    bundle: 'treasure-house',
    canvas: URN_CANVAS,
    render: () => renderUrn(URN_GLAZES.teal, 5),
    source: SRC,
    shadow: { rx: 36, ry: 11, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 30 },
  },
  {
    id: 'tr-urn-rose',
    bundle: 'treasure-house',
    canvas: URN_CANVAS,
    render: () => renderUrn(URN_GLAZES.rose, 6),
    source: SRC,
    shadow: { rx: 36, ry: 11, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 30 },
  },
  {
    id: 'tr-lamp',
    bundle: 'treasure-house',
    canvas: LAMP_CANVAS,
    render: () => renderLamp(),
    source: SRC,
    shadow: { rx: 30, ry: 9, dx: 6, dy: 2, a: 0.26 },
    footprint: { r: 22 },
  },
  {
    id: 'barrel-coins',
    bundle: 'treasure-house',
    canvas: BARREL_CANVAS,
    render: () => renderBarrel(),
    source: SRC,
    shadow: { rx: 44, ry: 13, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 36 },
  },
  {
    id: 'crate-gems',
    bundle: 'treasure-house',
    canvas: CRATE_CANVAS,
    render: () => renderCrate(),
    source: SRC,
    shadow: { rx: 60, ry: 17, dx: 8, dy: 3, a: 0.28 },
    footprint: { r: 46 },
  },
];
