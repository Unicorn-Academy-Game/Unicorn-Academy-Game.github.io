import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { facingOfCardinal } from '../../src/shared/compass';
import { FACINGS } from '../../src/shared/ids';
import { type ActorAsset, type Clip, type FrameRef, facingKey, type ShadowSpec } from '../../src/shared/manifest';
import { NPC_IDS, type NpcId } from '../../src/shared/npc';
import { contactSheet, type Rgba, writePng } from '../art/core/image';
import { FRAME, ORIGIN } from '../art/human/frame';
import { CAST } from '../art/human/index';
import { allNpcJobs, jobKey } from '../art/human/jobs';
import { decodePng } from '../lib/png';
import { packAtlas } from './lib/atlas';
import { hashTree, shortHash } from './lib/hash';
import { encodeSheet, SHEET_EXTENSION } from './lib/sheet';

/**
 * Files whose content changes what a grown-up looks like. Scripts that only view frames are
 * excluded.
 */
const RENDER_INPUTS = /^(core\/.*|world\/(palette|prims|scene|arch|paint)\.ts|human\/(?!dev-|preview)[^/]+\.ts)$/;

/**
 * What the art reads from `src/shared/ids.ts`, and nothing else in it, so that adding a map does
 * not draw every frame again.
 */
export const humanArtVersion = (): string =>
  shortHash(hashTree('tools/art', (rel) => RENDER_INPUTS.test(rel)) + JSON.stringify(FACINGS));

/**
 * The soft ground shadow under a grown-up: a small, flat ellipse pushed to the lower right, like
 * the unicorns'.
 */
const NPC_SHADOW: ShadowSpec = { rx: 24, ry: 8, dx: 3, dy: 1, a: 0.3 };

const readRgba = (path: string): Rgba => {
  const png = decodePng(new Uint8Array(readFileSync(path)));
  return { width: png.width, height: png.height, data: png.data };
};

async function renderMissing(frameDir: string): Promise<void> {
  const missing = allNpcJobs().filter((j) => !existsSync(join(frameDir, `${jobKey(j)}.png`)));
  if (missing.length === 0) return;
  const workers = Math.max(1, Math.min(cpus().length - 1, 9, missing.length));
  console.log(`npcs: drawing ${missing.length} frames on ${workers} processes`);
  await Promise.all(
    Array.from(
      { length: workers },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ['--import', 'tsx', 'tools/art/human/render-chunk.ts', frameDir, String(i), String(workers)],
            { stdio: ['ignore', 'inherit', 'inherit'] },
          );
          child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`npc render chunk ${i} exited with ${code}`)),
          );
        }),
    ),
  );
}

/** Draws (resumably), packs and writes one atlas per grown-up. Returns the manifest section. */
export async function buildNpcs(publicDir: string): Promise<Record<NpcId, ActorAsset>> {
  const version = humanArtVersion();
  const frameRoot = 'assets/source/npc-frames';
  const frameDir = join(frameRoot, version);
  mkdirSync(frameDir, { recursive: true });
  for (const name of readdirSync(frameRoot))
    if (name !== version) rmSync(join(frameRoot, name), { recursive: true, force: true });
  await renderMissing(frameDir);

  const outDir = join(publicDir, 'npcs');
  mkdirSync(outDir, { recursive: true });
  const previewDir = 'assets/source/previews';
  mkdirSync(previewDir, { recursive: true });
  const assets = {} as Record<NpcId, ActorAsset>;

  for (const id of NPC_IDS) {
    const member = CAST[id];
    if (!member) throw new Error(`no art for ${id}`);
    const jobs = allNpcJobs([id]);
    const inputs = jobs.map((job) => ({ key: jobKey(job), image: readRgba(join(frameDir, `${jobKey(job)}.png`)) }));
    const atlas = packAtlas(inputs, { maxSize: 2048, padding: 2, extrude: 1 });
    const sheet = encodeSheet(`${id}'s sheet`, { width: atlas.width, height: atlas.height, data: atlas.image.data });
    const file = `npcs/${id}.${shortHash(sheet)}.${SHEET_EXTENSION}`;
    for (const old of readdirSync(outDir))
      if (old.startsWith(`${id}.`) && `npcs/${old}` !== file) rmSync(join(outDir, old));
    writeFileSync(join(publicDir, file), sheet);

    const clips: ActorAsset['clips'] = {};
    for (const [name, spec] of Object.entries(member.clips)) {
      const byFacing: ActorAsset['clips'][string] = {};
      for (const facing of FACINGS) {
        const frames: FrameRef[] = Array.from({ length: spec.frames }, (_, frame) => ({
          rect: atlas.rectOf.get(jobKey({ npc: id, clip: name, facing, frame }))!,
          ms: Math.round(1000 / spec.fps),
        }));
        const clip: Clip = { fps: spec.fps, loop: spec.loop, frames };
        if (spec.stride !== undefined) clip.strideDistance = Math.round(spec.stride * 10) / 10;
        byFacing[facingKey(facingOfCardinal(facing))] = clip;
      }
      clips[name] = byFacing;
    }
    assets[id] = {
      atlas: { file, width: atlas.width, height: atlas.height, rects: atlas.rects },
      origin: [ORIGIN.x, ORIGIN.y],
      shadow: NPC_SHADOW,
      clips,
    };
    writePreview(previewDir, id, frameDir, jobs);
    console.log(
      `npcs: ${id} packed ${atlas.rects.length} unique of ${jobs.length} frames into ${atlas.width}x${atlas.height}`,
    );
  }
  return assets;
}

/**
 * One sheet per grown-up: a row per clip and facing, a column per frame, at native size, for
 * review.
 */
function writePreview(dir: string, id: NpcId, frameDir: string, jobs: ReturnType<typeof allNpcJobs>): void {
  const member = CAST[id]!;
  const cols = Math.max(...Object.values(member.clips).map((c) => c.frames));
  const frames: Rgba[] = [];
  for (const [name, spec] of Object.entries(member.clips)) {
    for (const facing of FACINGS) {
      for (let c = 0; c < cols; c++) {
        const job = jobs.find((j) => j.clip === name && j.facing === facing && j.frame === c);
        frames.push(
          job && c < spec.frames
            ? readRgba(join(frameDir, `${jobKey(job)}.png`))
            : { width: FRAME.w, height: FRAME.h, data: new Uint8Array(FRAME.w * FRAME.h * 4) },
        );
      }
    }
  }
  writePng(join(dir, `npc-${id}.png`), contactSheet(frames, { cols, scale: 1, bg: [112, 168, 110, 255], gap: 2 }));
}
