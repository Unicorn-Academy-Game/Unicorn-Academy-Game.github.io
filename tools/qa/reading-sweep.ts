import type { Page } from '@playwright/test';
import { type Metrics, measure, type Scene, type Size, show, stopped, type Walk } from './reading-lab';

/**
 * Looks at the reading computer's screen at every size, in every state it is laid out differently
 * in. It is what `reading-fit.ts` prints as a table and what `tests/e2e/reading-layout.spec.ts`
 * holds to zero problems, so the two cannot disagree about what a problem is. Each scene is looked
 * at twice, because a screen gets its size two ways and they are not the same road: it is built at
 * the size the screen has (`new`, which is every thing the player is asked to read, and where a
 * word is measured while the screen is still coming on), and it is built at one size and then the
 * screen is turned or resized (`resized`, where what was laid out has to be laid out again).
 */

export type Pass = 'new' | 'resized';

/** What was found at one size, in one scene, by one of the two roads. */
export interface Seen {
  scene: Scene;
  size: Size;
  pass: Pass;
  metrics: Metrics;
}

export interface Sweep {
  scenes: readonly Scene[];
  sizes: readonly Size[];
  seen: Seen[];
}

export interface SweepOptions {
  /** The size the page is at, and is left at. */
  base: { width: number; height: number };
  passes?: readonly Pass[];
  log?: (line: string) => void;
}

/** Puts each scene up at each size and measures it. */
export async function sweepScenes(
  page: Page,
  scenes: readonly Scene[],
  sizes: readonly Size[],
  { base, passes = ['new', 'resized'], log = () => undefined }: SweepOptions,
): Promise<Sweep> {
  const seen: Seen[] = [];
  const began = Date.now();
  const took = (): string => `${Math.round((Date.now() - began) / 1000)}s in`;

  if (passes.includes('new')) {
    for (const size of sizes) {
      await page.setViewportSize({ width: size[0], height: size[1] });
      await page.waitForTimeout(120);
      for (const scene of scenes) {
        await show(page, scene);
        seen.push({ scene, size, pass: 'new', metrics: await measure(page) });
      }
      log(`  new at ${size[0]}x${size[1]}: ${scenes.length} scenes, ${took()}`);
    }
    await page.setViewportSize(base);
  }

  if (passes.includes('resized')) {
    for (const scene of scenes) {
      await page.setViewportSize(base);
      await show(page, scene);
      await stopped(page);
      for (const size of sizes) {
        await page.setViewportSize({ width: size[0], height: size[1] });
        await page.waitForTimeout(120);
        seen.push({ scene, size, pass: 'resized', metrics: await measure(page) });
      }
      log(`  resized ${scene.name}: ${sizes.length} sizes, ${took()}`);
    }
    await page.setViewportSize(base);
  }
  return { scenes, sizes, seen };
}

/**
 * Each thing found, with the places it was found at. A problem and a warning are told apart by the
 * word that starts the line.
 */
export function findingsIn({ seen }: Sweep): Map<string, string[]> {
  const lines = new Map<string, string[]>();
  const add = (kind: string, text: string, where: string): void => {
    const key = `${kind} ${text}`;
    lines.set(key, [...(lines.get(key) ?? []), where]);
  };
  for (const s of seen) {
    const where = `${s.size[0]}x${s.size[1]} ${s.scene.name} (${s.pass})`;
    for (const p of s.metrics.problems) add('PROBLEM', p, where);
    for (const w of s.metrics.warnings) add('warning', w, where);
  }
  return lines;
}

const SHAPE = /^(.*) (\d+(?:\.\d+)?)px in (\d+)$/;

/**
 * Whether two looks at a word are the same word in the same rows at a size within a pixel, since
 * the page gives a stage's height to whole pixels and a layout is told the room that is left.
 */
function alike(a: string, b: string): boolean {
  const [, whatA, sizeA, rowsA] = SHAPE.exec(a) ?? [];
  const [, whatB, sizeB, rowsB] = SHAPE.exec(b) ?? [];
  if (whatA === undefined || whatB === undefined) return a === b;
  return whatA === whatB && rowsA === rowsB && Math.abs(Number(sizeA) - Number(sizeB)) <= 1;
}

/**
 * Where a word was written at a size that depends on how it came to be on the screen. A word is
 * laid out from its room and nothing else, so the same word in the same room is the same size
 * whether the screen was built at that size or was turned to it.
 */
export function disagreements({ seen }: Sweep): string[] {
  const found: string[] = [];
  for (const a of seen) {
    if (a.pass !== 'new' || !a.metrics.shape.includes(' in ')) continue;
    const b = seen.find((s) => s.pass === 'resized' && s.scene === a.scene && s.size === a.size);
    if (b && !alike(a.metrics.shape, b.metrics.shape))
      found.push(
        `${a.size[0]}x${a.size[1]} ${a.scene.name}: built there it is ${a.metrics.shape}, turned to it ${b.metrics.shape}`,
      );
  }
  return found;
}

/**
 * Walks each thing to read through touching, saying and found at each size, on the one pane, as the
 * session does, and reports a thing that is written bigger in a later phase than in an earlier one.
 * The buttons under it change with the phase, so the room it has changes, and it must not jump in
 * size as the player goes. A smaller size in a later phase is the room getting smaller, and is
 * allowed.
 */
export async function walkPhases(
  page: Page,
  walks: readonly Walk[],
  sizes: readonly Size[],
  base: { width: number; height: number },
  log: (line: string) => void = () => undefined,
): Promise<string[]> {
  const found: string[] = [];
  for (const size of sizes) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.waitForTimeout(120);
    for (const walk of walks) {
      await page.evaluate(() => (window as unknown as { lab: { close(): void } }).lab.close());
      const written: number[] = [];
      for (const phase of ['touching', 'saying', 'found'] as const) {
        await page.evaluate((scene) => {
          const lab = (
            window as unknown as { lab: { show(view: unknown): void; views: { item: (scene: unknown) => unknown } } }
          ).lab;
          lab.show(lab.views.item(scene));
        }, walk.scene(phase));
        await stopped(page);
        written.push(
          await page.evaluate(() =>
            Number.parseFloat(getComputedStyle(document.querySelector('.read-pieces')!).fontSize),
          ),
        );
      }
      const [touching = 0, saying = 0, done = 0] = written;
      if (saying > touching + 1 || done > saying + 1)
        found.push(
          `${size[0]}x${size[1]} ${walk.name}: it is written at ${written.join('px, ')}px as she touches it, says it and finds it, and it grows`,
        );
    }
    log(`  walked ${walks.length} things at ${size[0]}x${size[1]}`);
  }
  await page.setViewportSize(base);
  return found;
}
