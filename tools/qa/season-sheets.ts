import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cellsOfPage, dressCells, dressTiles } from '../../src/render/season';
import { Manifest } from '../../src/shared/manifest';
import { SEASON_IDS, type SeasonId } from '../../src/shared/seasons';
import { args, flag } from '../lib/args';
import { readPicture } from '../lib/picture';
import { encodePngRgba, type RgbaImage } from '../lib/png';

/**
 * Recolours the open-air pictures for a season and writes them out as they will look, so the
 * seasons can be looked at without a browser. The pictures come from the last build
 * (`public/assets`).
 *   tsx tools/qa/season-sheets.ts <season|all> [--bundle forest] [--tiles forest] [--out assets/source/_scratch/season]
 *     [--crop x,y,w,h] [--scale 2] [--page 0]
 * With `--crop` it writes only that part of one page, made bigger by `--scale`, for looking
 * closely.
 */
const asked = args[0] ?? 'winter';
const seasons: readonly SeasonId[] = asked === 'all' ? SEASON_IDS : SEASON_IDS.filter((id) => id === asked);
if (seasons.length === 0) throw new Error(`${asked} is not a season`);
const bundleName = flag('bundle', 'forest');
const tilesName = flag('tiles', bundleName === 'garden' || bundleName === 'playground' ? 'garden' : bundleName);
const out = flag('out', 'assets/source/_scratch/season');
const crop = flag('crop', '')
  .split(',')
  .filter((n) => n !== '')
  .map(Number);
const scale = Number(flag('scale', '2'));
const only = Number(flag('page', '0'));
mkdirSync(out, { recursive: true });

const root = 'public/assets';
const manifest = Manifest.parse(JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8')));
const read = (file: string): RgbaImage => readPicture(`${root}/${file}`);
const copy = (image: RgbaImage): RgbaImage => ({
  width: image.width,
  height: image.height,
  data: new Uint8Array(image.data),
});
const zoomed = (image: RgbaImage): RgbaImage => {
  const [cx = 0, cy = 0, cw = image.width, ch = image.height] = crop;
  const data = new Uint8Array(cw * scale * ch * scale * 4);
  for (let y = 0; y < ch * scale; y++) {
    for (let x = 0; x < cw * scale; x++) {
      const from = (((cy + Math.floor(y / scale)) * image.width + cx + Math.floor(x / scale)) * 4) | 0;
      data.set(image.data.subarray(from, from + 4), (y * cw * scale + x) * 4);
    }
  }
  return { width: cw * scale, height: ch * scale, data };
};
const write = (name: string, image: RgbaImage): void => {
  writeFileSync(`${out}/${name}.png`, encodePngRgba(crop.length === 4 ? zoomed(image) : image));
  console.log(`wrote ${out}/${name}.png`);
};

const bundle = manifest.bundles[bundleName];
if (!bundle) throw new Error(`no bundle ${bundleName}`);
const tileset = manifest.tilesets[tilesName];
if (!tileset) throw new Error(`no tileset ${tilesName}`);
for (const season of seasons) {
  const started = performance.now();
  bundle.pages.forEach((atlas, page) => {
    if (crop.length === 4 && page !== only) return;
    const image = copy(read(atlas.file));
    dressCells(image, cellsOfPage(bundle, page), season);
    write(`${bundleName}-${page}-${season}`, image);
  });
  if (crop.length === 4) continue;
  const tiles = copy(read(tileset.file));
  dressTiles(tiles, season);
  write(`tiles-${tilesName}-${season}`, tiles);
  console.log(`${season}: ${(performance.now() - started).toFixed(0)} ms`);
}
