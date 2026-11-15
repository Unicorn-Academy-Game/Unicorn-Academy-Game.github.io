import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import type { Rgba } from '../../art/core/image';
import { decodePng, encodePngRgba } from '../../lib/png';
import { hashTree, shortHash } from '../lib/hash';
import { frameCount, RECIPES } from './registry';
import type { Recipe } from './types';

const CACHE_DIR = 'assets/source/env-cache';

const CORE = /^(core\/.*|world\/(palette|prims|scene|noise)\.ts)$/;
let coreHash: string | null = null;
const fileHashes = new Map<string, string>();

const sourceHash = (path: string): string => {
  let h = fileHashes.get(path);
  if (!h) {
    h = shortHash(readFileSync(join('tools', path)));
    fileHashes.set(path, h);
  }
  return h;
};

/**
 * Hash of everything that decides one sprite's pixels. A sprite is redrawn only when this changes.
 */
function recipeHash(r: Recipe): string {
  coreHash ??= hashTree('tools/art', (rel) => CORE.test(rel));
  return shortHash(
    [coreHash, JSON.stringify(r.canvas), JSON.stringify(r.anim ?? null), ...r.source.map(sourceHash)].join('|'),
  );
}

export const cacheFile = (r: Recipe, frame: number): string => join(CACHE_DIR, `${r.id}@${frame}.${recipeHash(r)}.png`);

export const readCached = (r: Recipe, frame: number): Rgba => {
  const png = decodePng(new Uint8Array(readFileSync(cacheFile(r, frame))));
  return { width: png.width, height: png.height, data: png.data };
};

/** Every frame of every recipe, in a fixed order that does not depend on what is already drawn. */
export function allFrames(recipes: readonly Recipe[]): { recipe: Recipe; frame: number }[] {
  return recipes.flatMap((recipe) => Array.from({ length: frameCount(recipe) }, (_, frame) => ({ recipe, frame })));
}

function pending(recipes: readonly Recipe[]): { recipe: Recipe; frame: number }[] {
  return allFrames(recipes).filter(({ recipe, frame }) => !existsSync(cacheFile(recipe, frame)));
}

export function renderOne(recipe: Recipe, frame: number): void {
  const img = recipe.render(frame);
  if (img.width !== recipe.canvas.w || img.height !== recipe.canvas.h)
    throw new Error(
      `${recipe.id}: rendered ${img.width}x${img.height}, expected ${recipe.canvas.w}x${recipe.canvas.h}`,
    );
  writeFileSync(cacheFile(recipe, frame), encodePngRgba({ width: img.width, height: img.height, data: img.data }));
}

/**
 * Draws every missing sprite on child processes and removes cache files nothing refers to anymore.
 */
export async function renderMissing(recipes: readonly Recipe[] = RECIPES): Promise<number> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const todo = pending(recipes);
  const live = new Set<string>();
  for (const r of recipes)
    for (let f = 0; f < frameCount(r); f++) live.add(cacheFile(r, f).slice(CACHE_DIR.length + 1));
  for (const name of readdirSync(CACHE_DIR)) if (!live.has(name)) rmSync(join(CACHE_DIR, name));
  if (todo.length === 0) return 0;
  const workers = Math.max(1, Math.min(cpus().length - 1, 9, todo.length));
  console.log(`env: drawing ${todo.length} sprite frames on ${workers} processes`);
  await Promise.all(
    Array.from(
      { length: workers },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ['--import', 'tsx', 'tools/assets/env/render-chunk.ts', String(i), String(workers)],
            { stdio: ['ignore', 'inherit', 'inherit'] },
          );
          child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`env render chunk ${i} exited with ${code}`)),
          );
        }),
    ),
  );
  return todo.length;
}
