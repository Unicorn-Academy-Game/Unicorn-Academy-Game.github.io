import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { shownFacings } from '../../src/shared/clips';
import { mirrorOf, type UnicornFacing } from '../../src/shared/compass';
import { CLIP_NAMES, type ClipName, FACINGS, type UnicornId } from '../../src/shared/ids';
import { type Clip, type CrownRef, type FrameRef, facingKey, type UnicornAsset } from '../../src/shared/manifest';
import { contactSheet, type Rgba, writePng } from '../art/core/image';
import { CLIPS, clipPose } from '../art/unicorn/anims';
import { UNICORN_IDS, UNICORNS } from '../art/unicorn/characters';
import { CROWN_CANVAS, CROWN_VIEWS, crownPlacement, renderCrownView } from '../art/unicorn/crown';
import { FRAME, ORIGIN_X, ORIGIN_Y } from '../art/unicorn/frame';
import { allJobs, baseJobs, type FrameJob, fineJobs, jobKey } from '../art/unicorn/jobs';
import { decodePng } from '../lib/png';
import { type PackInput, packAtlas, packPages } from './lib/atlas';
import { hashTree, shortHash } from './lib/hash';
import { encodeSheet, SHEET_EXTENSION } from './lib/sheet';

/**
 * Files whose content changes what a unicorn frame looks like. Tool scripts that only view frames
 * are excluded.
 */
const RENDER_INPUTS =
  /^(core\/.*|unicorn\/(anims|frame|glyphs|jobs|kit|markings|model|parts|pose|skeleton|spec|stamps)\.ts|unicorn\/characters\/.*)$/;

/**
 * What the art reads from `src/shared/ids.ts`, and nothing else in it, so that adding a map does
 * not draw every frame again.
 */
const artVersion = (): string =>
  shortHash(
    hashTree('tools/art', (rel) => RENDER_INPUTS.test(rel)) + JSON.stringify([UNICORN_IDS, CLIP_NAMES, FACINGS]),
  );

const readRgba = (path: string): Rgba => {
  const png = decodePng(new Uint8Array(readFileSync(path)));
  return { width: png.width, height: png.height, data: png.data };
};

async function renderMissing(frameDir: string, ids: readonly UnicornId[]): Promise<void> {
  const missing = allJobs(ids).filter((j) => !existsSync(join(frameDir, `${jobKey(j)}.json`)));
  if (missing.length === 0) return;
  const workers = Math.max(1, Math.min(cpus().length - 1, 9));
  console.log(`unicorns: rendering ${missing.length} frames on ${workers} processes`);
  await Promise.all(
    Array.from(
      { length: workers },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ['--import', 'tsx', 'tools/art/unicorn/render-chunk.ts', frameDir, String(i), String(workers)],
            { stdio: ['ignore', 'inherit', 'inherit'] },
          );
          child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`render chunk ${i} exited with ${code}`)),
          );
        }),
    ),
  );
}

/** A drawn frame and the points on it that things attach to, as the renderer left them. */
interface Rendered {
  image: Rgba;
  anchors: Record<string, [number, number]>;
}

const loadFrame = (frameDir: string, job: FrameJob): Rendered => ({
  image: readRgba(join(frameDir, `${jobKey(job)}.png`)),
  anchors: JSON.parse(readFileSync(join(frameDir, `${jobKey(job)}.json`), 'utf8')) as Record<string, [number, number]>,
});

/** Who wears a crown. */
const CROWNED: readonly UnicornId[] = ['wildstar'];

/**
 * Where her crown is laid over the picture of a frame, from the rig that drew it, in the view of
 * the facing the picture is drawn for.
 */
function crownOf(id: UnicornId, name: ClipName, facing: UnicornFacing, frame: number): CrownRef {
  const spec = UNICORNS[id];
  const { at, tilt } = crownPlacement(spec, clipPose(spec, name, frame, facing), facing);
  return { at: round1(at), tilt: Math.round(tilt * 1000) / 1000, view: facing };
}

/**
 * The frames of one clip in one facing, as the manifest lists them, with each picture's rect found
 * by `rectOf`.
 */
function framesOf(
  id: UnicornId,
  name: ClipName,
  facing: UnicornFacing,
  rendered: ReadonlyMap<string, Rendered>,
  rectOf: (key: string) => number,
): FrameRef[] {
  const def = CLIPS[name];
  return Array.from({ length: def.frames }, (_, frame) => {
    const key = jobKey({ unicorn: id, clip: name, facing, frame });
    const a = rendered.get(key)!.anchors;
    return {
      rect: rectOf(key),
      ms: def.holdMs?.[frame] ?? Math.round(1000 / def.fps),
      anchors: { horn: round1(a.horn!), muzzle: round1(a.muzzle!), back: round1(a.back!) },
      ...(CROWNED.includes(id) ? { crown: crownOf(id, name, facing, frame) } : {}),
    };
  });
}

const clipOf = (name: ClipName, frames: FrameRef[]): Clip => {
  const def = CLIPS[name];
  const clip: Clip = { fps: def.fps, loop: def.loop, frames };
  if (def.strideDistance !== undefined) clip.strideDistance = def.strideDistance;
  if (def.releaseFrame !== undefined) clip.releaseFrame = def.releaseFrame;
  return clip;
};

/**
 * Writes a sheet as a lossless WebP that has been read back and holds every visible pixel of the
 * sheet. Returns the file's path under the assets directory.
 */
function writeSheet(
  publicDir: string,
  id: UnicornId,
  part: 'first' | 'crown' | `fine-${number}`,
  image: Rgba,
  width: number,
  height: number,
): string {
  const name = part === 'first' ? id : `${id}.${part}`;
  const bytes = encodeSheet(`${id}: the ${part} sheet`, { width, height, data: image.data });
  const file = `unicorns/${name}.${shortHash(bytes)}.${SHEET_EXTENSION}`;
  writeFileSync(join(publicDir, file), bytes);
  return file;
}

/**
 * The most a fine sheet is wide and high. A sheet is put into the graphics chip in one piece, on
 * the thread that draws, and a device that is slow at it stops drawing for as long as it takes. At
 * 2048 a sheet was 16 MiB, and in a browser that draws in software one of them held the page for 2
 * seconds. At 1024 it is a fourth of that, and a unicorn's fine sheets come as five or six, one
 * after the other.
 */
const FINE_SHEET_MAX = 1024;

/**
 * Renders (resumably), packs and writes the sheets of every unicorn: one for the first download and
 * the fine ones for later. Returns the manifest section.
 */
export async function buildUnicorns(
  publicDir: string,
  ids: readonly UnicornId[] = UNICORN_IDS,
): Promise<Record<UnicornId, UnicornAsset>> {
  const version = artVersion();
  const frameRoot = 'assets/source/frames';
  const frameDir = join(frameRoot, version);
  mkdirSync(frameDir, { recursive: true });
  // Frames from older art versions are stale by definition.
  for (const name of readdirSync(frameRoot))
    if (name !== version) rmSync(join(frameRoot, name), { recursive: true, force: true });
  await renderMissing(frameDir, ids);

  const outDir = join(publicDir, 'unicorns');
  mkdirSync(outDir, { recursive: true });
  const previewDir = 'assets/source/previews';
  mkdirSync(previewDir, { recursive: true });
  const assets = {} as Record<UnicornId, UnicornAsset>;

  for (const id of ids) {
    const written = new Set<string>();
    const base = baseJobs([id]);
    const fine = fineJobs([id]);
    const rendered = new Map<string, Rendered>();
    for (const job of [...base, ...fine]) rendered.set(jobKey(job), loadFrame(frameDir, job));

    const atlas = packAtlas(
      base.map((job) => ({ key: jobKey(job), image: rendered.get(jobKey(job))!.image })),
      { maxSize: 2048, padding: 2, extrude: 1 },
    );
    const file = writeSheet(publicDir, id, 'first', atlas.image, atlas.width, atlas.height);
    written.add(file);

    const clips = {} as UnicornAsset['clips'];
    for (const name of CLIP_NAMES) {
      const def = CLIPS[name];
      const byFacing: UnicornAsset['clips'][ClipName] = {};
      for (const facing of def.facings)
        byFacing[facingKey(facing)] = clipOf(
          name,
          framesOf(id, name, facing, rendered, (key) => atlas.rectOf.get(key)!),
        );
      for (const facing of def.mirrored ?? [])
        byFacing[facingKey(facing)] = flippedClip(byFacing[facingKey(mirrorOf(facing))]!);
      clips[name] = byFacing;
    }
    const asset: UnicornAsset = {
      atlas: { file, width: atlas.width, height: atlas.height, rects: atlas.rects },
      origin: [ORIGIN_X, ORIGIN_Y],
      shadow: UNICORN_SHADOW,
      clips,
    };

    if (CROWNED.includes(id)) {
      const views = Array.from({ length: CROWN_VIEWS }, (_, i) => ({ key: String(i), image: renderCrownView(i) }));
      const packed = packAtlas(views, { maxSize: 256, padding: 2, extrude: 1 });
      const crownFile = writeSheet(publicDir, id, 'crown', packed.image, packed.width, packed.height);
      written.add(crownFile);
      asset.crown = {
        atlas: { file: crownFile, width: packed.width, height: packed.height, rects: packed.rects },
        origin: [CROWN_CANVAS.ox, CROWN_CANVAS.oy],
        views: views.map((v) => packed.rectOf.get(v.key)!),
      };
    }

    if (fine.length > 0) {
      // A clip in one facing is drawn from one page, so a page that has not arrived never leaves
      // half a clip.
      const inputs: PackInput[] = fine.map((job) => ({
        key: jobKey(job),
        image: rendered.get(jobKey(job))!.image,
        group: `${job.clip}-${job.facing}`,
      }));
      const packed = packPages(inputs, { maxSize: FINE_SHEET_MAX, padding: 2, extrude: 1 });
      const atlases = packed.pages.map((page, n) => {
        const pageFile = writeSheet(publicDir, id, `fine-${n}`, page.image, page.width, page.height);
        written.add(pageFile);
        return { file: pageFile, width: page.width, height: page.height, rects: page.rects };
      });
      const fineClips: NonNullable<UnicornAsset['fine']>['clips'] = {};
      for (const name of CLIP_NAMES) {
        const def = CLIPS[name];
        if (!def.fine) continue;
        const byFacing: Record<string, Clip & { page: number }> = {};
        for (const facing of def.fine) {
          const frames = framesOf(id, name, facing, rendered, (key) => packed.place.get(key)!.rect);
          const pages = new Set(
            Array.from(
              { length: def.frames },
              (_, frame) => packed.place.get(jobKey({ unicorn: id, clip: name, facing, frame }))!.page,
            ),
          );
          if (pages.size !== 1)
            throw new Error(`${id} ${name} facing ${facing} was split over ${pages.size} fine sheets`);
          byFacing[facingKey(facing)] = { ...clipOf(name, frames), page: [...pages][0]! };
        }
        fineClips[name] = byFacing;
      }
      asset.fine = { atlases, clips: fineClips };
    }
    assets[id] = asset;

    for (const old of readdirSync(outDir))
      if (old.startsWith(`${id}.`) && !written.has(`unicorns/${old}`)) rmSync(join(outDir, old));
    writePreview(previewDir, id, frameDir, base);
    const bytes = (f: string): number => statSync(join(publicDir, f)).size;
    const finePart = asset.fine
      ? `, and ${asset.fine.atlases.length} fine sheets of ${asset.fine.atlases.map((a) => `${a.width}x${a.height}`).join(' and ')} for ${fine.length} more frames (${(asset.fine.atlases.reduce((sum, a) => sum + bytes(a.file), 0) / 1024).toFixed(0)} KiB)`
      : '';
    console.log(
      `unicorns: ${id} packed ${atlas.rects.length} unique of ${base.length} frames into ${atlas.width}x${atlas.height} (${(bytes(file) / 1024).toFixed(0)} KiB)${finePart}`,
    );
  }
  return assets;
}

/**
 * The soft ground shadow under every unicorn, from the upper-left light: wide, flat and pushed to
 * the lower right.
 */
const UNICORN_SHADOW = { rx: 52, ry: 13, dx: 8, dy: 2, a: 0.32 } as const;

const round1 = (p: [number, number]): [number, number] => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

/**
 * A clip shown by flipping the pictures of another: the same rects and timing, marked to be turned
 * left to right, with the attachment points turned about the ground anchor to follow. The sprite
 * canvas is centered on that anchor, which is what lets Phaser flip a trimmed frame in place.
 */
export function flippedClip(of: Clip): Clip {
  const turn = (p: [number, number]): [number, number] => round1([2 * ORIGIN_X - p[0], p[1]]);
  // Her crown leans the other way and is turned over with the picture.
  const turnCrown = (crown: CrownRef): CrownRef => ({
    ...crown,
    at: turn(crown.at),
    tilt: -crown.tilt || 0,
    flip: true,
  });
  const frames: FrameRef[] = of.frames.map((f) => ({
    ...f,
    ...(f.anchors
      ? { anchors: Object.fromEntries(Object.entries(f.anchors).map(([name, p]) => [name, turn(p)])) }
      : {}),
    ...(f.crown ? { crown: turnCrown(f.crown) } : {}),
  }));
  return { ...of, frames, flip: true };
}

const turnedAround = (src: Rgba): Rgba => {
  const data = new Uint8Array(src.data.length);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const from = (y * src.width + (src.width - 1 - x)) * 4;
      data.set(src.data.subarray(from, from + 4), (y * src.width + x) * 4);
    }
  }
  return { width: src.width, height: src.height, data };
};

/**
 * One sheet per unicorn: a row per clip and facing, a column per frame, at native size, for review.
 * A mirrored facing is shown flipped, as the game shows it.
 */
function writePreview(dir: string, id: UnicornId, frameDir: string, jobs: readonly FrameJob[]): void {
  const frames: Rgba[] = [];
  const cols = Math.max(...CLIP_NAMES.map((n) => CLIPS[n].frames));
  const rows: [ClipName, UnicornFacing][] = [];
  for (const name of CLIP_NAMES) for (const f of shownFacings(name)) rows.push([name, f]);
  for (const [name, facing] of rows) {
    const drawn = CLIPS[name].facings.includes(facing);
    for (let c = 0; c < cols; c++) {
      const job = jobs.find(
        (j) => j.clip === name && j.facing === (drawn ? facing : mirrorOf(facing)) && j.frame === c,
      );
      const frame = job
        ? readRgba(join(frameDir, `${jobKey(job)}.png`))
        : { width: FRAME, height: FRAME, data: new Uint8Array(FRAME * FRAME * 4) };
      frames.push(drawn ? frame : turnedAround(frame));
    }
  }
  writePng(
    join(dir, `${id}.png`),
    contactSheet(frames, { cols, scale: 1, bg: [112, 168, 110, 255], gap: 2, grid: false }),
  );
}
