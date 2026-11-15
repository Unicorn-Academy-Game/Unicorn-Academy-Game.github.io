import { readdirSync, readFileSync } from 'node:fs';
import { LIFE } from '../../src/content/life';
import { CompiledMap } from '../../src/shared/compiled-map';
import { type Bundle, Manifest } from '../../src/shared/manifest';
import { blit, createRgba, crop, type Rgba, writePng } from '../art/core/image';
import { args, flag } from '../lib/args';
import { readPicture } from '../lib/picture';

/**
 * Draws a compiled map from the built assets for layout review, without a browser: ground tiles,
 * scenery in depth order, and optionally the collision, anchors, encounters and portals on top.
 * Usage: tsx tools/maps/overview.ts <map> [--scale 4] [--overlay] [--crop x,y,w,h] [--out path]
 */
const mapId = args[0] ?? 'forest';
const scale = Number(flag('scale', '4'));
const overlay = args.includes('--overlay');
const cropArg = flag('crop', '');
const outPath = flag('out', `assets/source/_scratch/overview-${mapId}.png`);

const read = (path: string): Rgba => {
  const p = readPicture(path);
  return { width: p.width, height: p.height, data: p.data };
};

/** Box-filter downscale by an integer factor, averaging in premultiplied alpha. */
function down(src: Rgba, k: number): Rgba {
  if (k === 1) return src;
  const w = Math.max(1, Math.floor(src.width / k)),
    h = Math.max(1, Math.floor(src.height / k));
  const out = createRgba(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let dy = 0; dy < k; dy++) {
        for (let dx = 0; dx < k; dx++) {
          const i = ((y * k + dy) * src.width + (x * k + dx)) * 4;
          const al = src.data[i + 3]!;
          r += src.data[i]! * al;
          g += src.data[i + 1]! * al;
          b += src.data[i + 2]! * al;
          a += al;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) out.data.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / (k * k))], o);
    }
  }
  return out;
}

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const file = readdirSync('public/assets/maps').find((f) => f.startsWith(`${mapId}.`) && f.endsWith('.json'));
if (!file) throw new Error(`no compiled ${mapId}; run tools/maps/build-maps.ts`);
const map = CompiledMap.parse(JSON.parse(readFileSync(`public/assets/maps/${file}`, 'utf8')));
const { widthTiles: W, heightTiles: H } = map.logic;
const tileset = manifest.tilesets[map.render.tileset]!;
const sheet = read(`public/assets/${tileset.file}`);
const bundle: Bundle = manifest.bundles[map.render.bundle]!;
const pages = bundle.pages.map((p) => read(`public/assets/${p.file}`));

// Ground at full resolution then reduced once, so tile edges are averaged correctly.
const full = createRgba(W * 64, H * 64, [24, 40, 30, 255]);
const putTile = (id: number, col: number, row: number): void => {
  const cell = tileset.tileSize + tileset.spacing;
  const sx = tileset.margin + (id % tileset.columns) * cell,
    sy = tileset.margin + Math.floor(id / tileset.columns) * cell;
  blit(full, crop(sheet, sx, sy, 64, 64), col * 64, row * 64);
};
for (const layer of [map.render.ground, map.render.water])
  layer.forEach((id, i) => {
    id >= 0 && putTile(id, i % W, Math.floor(i / W));
  });
const view = down(full, scale);

const cache = new Map<string, Rgba>();
const sprite = (id: string): { img: Rgba; ox: number; oy: number } | null => {
  const s = bundle.sprites[id]!;
  const f = s.frames[0]!;
  const rect = bundle.pages[f.page]!.rects[f.rect]!;
  const key = `${id}`;
  let img = cache.get(key);
  if (!img) {
    img = down(crop(pages[f.page]!, rect.x, rect.y, rect.w, rect.h), scale);
    cache.set(key, img);
  }
  return { img, ox: (s.origin[0] - rect.ox) / scale, oy: (s.origin[1] - rect.oy) / scale };
};
const layerRank = { backdrop: 0, 'ground-detail': 1, 'object-bases': 2, foreground: 3 } as const;
const decor = [...map.render.decor].sort(
  (a, b) => layerRank[a.layer] - layerRank[b.layer] || a.y + (a.depthBias ?? 0) - (b.y + (b.depthBias ?? 0)),
);
for (const d of decor) {
  const s = bundle.sprites[d.sprite]!;
  if (s.shadow && d.layer !== 'ground-detail') {
    const sh = s.shadow;
    const cx = (d.x + sh.dx) / scale,
      cy = (d.y + sh.dy) / scale,
      rx = sh.rx / scale,
      ry = sh.ry / scale;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= view.width || y >= view.height) continue;
        const dd = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (dd >= 1) continue;
        const a = sh.a * Math.min(1, (1 - dd) * 3);
        const i = (y * view.width + x) * 4;
        view.data[i] = Math.round(view.data[i]! * (1 - a) + 38 * a);
        view.data[i + 1] = Math.round(view.data[i + 1]! * (1 - a) + 44 * a);
        view.data[i + 2] = Math.round(view.data[i + 2]! * (1 - a) + 78 * a);
      }
    }
  }
  const sp = sprite(d.sprite);
  if (sp) blit(view, sp.img, Math.round(d.x / scale - sp.ox), Math.round(d.y / scale - sp.oy));
}

if (overlay) {
  const dot = (x: number, y: number, r: number, c: readonly [number, number, number]): void => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = Math.round(x / scale) + dx,
          py = Math.round(y / scale) + dy;
        if (px < 0 || py < 0 || px >= view.width || py >= view.height) continue;
        view.data.set([c[0], c[1], c[2], 255], (py * view.width + px) * 4);
      }
    }
  };
  const tint = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let y = Math.max(0, Math.floor(y0 / scale)); y < Math.min(view.height, Math.ceil(y1 / scale)); y++) {
      for (let x = Math.max(0, Math.floor(x0 / scale)); x < Math.min(view.width, Math.ceil(x1 / scale)); x++) {
        const i = (y * view.width + x) * 4;
        view.data[i] = Math.round(view.data[i]! * 0.55 + 230 * 0.45);
        view.data[i + 1] = Math.round(view.data[i + 1]! * 0.55);
        view.data[i + 2] = Math.round(view.data[i + 2]! * 0.55);
      }
    }
  };
  for (const o of map.logic.obstacles) {
    if (o.kind === 'rect') tint(o.x, o.y, o.x + o.w, o.y + o.h);
    else if (o.kind === 'circle') tint(o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r);
  }
  for (const a of map.logic.anchors) {
    dot(a.pos.x, a.pos.y, Math.max(2, 5 / scale + 1), [40, 80, 255]);
    for (const p of a.approach) dot(p.pos.x, p.pos.y, 2, [120, 200, 255]);
  }
  for (const e of map.logic.encounters) dot(e.home.x, e.home.y, 5, [255, 0, 200]);
  for (const s of map.logic.spawns)
    s.points.forEach((p, i) => {
      dot(p.x, p.y, i === 0 ? 5 : 3, [255, 255, 0]);
    });
  for (const i of map.logic.interactables) dot(i.pos.x, i.pos.y, 4, [0, 255, 160]);
  for (const p of map.logic.portals) tint(p.bounds.x, p.bounds.y, p.bounds.x + p.bounds.w, p.bounds.y + p.bounds.h);
  // Where creatures live: yellow for the ground, cyan for the water and white for the air,
  // outlined.
  for (const z of map.logic.life) {
    const home = LIFE[z.kind].home;
    const c: readonly [number, number, number] =
      home === 'ground' ? [255, 230, 60] : home === 'water' ? [60, 230, 255] : [255, 255, 255];
    const { x, y, w, h } = z.area;
    const steps = Math.max(24, Math.round((w + h) / scale / 1.5));
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      if (z.shape === 'ellipse') dot(x + w / 2 + (Math.cos(t) * w) / 2, y + h / 2 + (Math.sin(t) * h) / 2, 0, c);
      else {
        const u = i / steps;
        const [px, py] =
          u < 0.25
            ? [x + w * (u * 4), y]
            : u < 0.5
              ? [x + w, y + h * ((u - 0.25) * 4)]
              : u < 0.75
                ? [x + w * (1 - (u - 0.5) * 4), y + h]
                : [x, y + h * (1 - (u - 0.75) * 4)];
        dot(px!, py!, 0, c);
      }
    }
  }
}

if (cropArg) {
  const [x, y, w, h] = cropArg.split(',').map(Number) as [number, number, number, number];
  writePng(
    outPath,
    crop(view, Math.round(x / scale), Math.round(y / scale), Math.round(w / scale), Math.round(h / scale)),
  );
} else writePng(outPath, view);
console.log(`wrote ${outPath} (${view.width}x${view.height})`);
