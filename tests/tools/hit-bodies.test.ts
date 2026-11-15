import { describe, expect, it } from 'vitest';
import { hitTest } from '../../src/input/hit';
import { UNICORN_BODY_ROWS } from '../../src/input/unicorn-bodies';
import { COMPASS_EIGHT, nearestAmong, UNICORN_FACINGS, type UnicornFacing } from '../../src/shared/compass';
import { type Body, COVER, drawnMass, fitBodies, holds, type Mass, type Sheets } from '../../tools/assets/hit-bodies';
import { canvasOf, pictureOf, shippedManifest, silhouette } from '../../tools/lib/unicorn-pictures';
import { makeWorld } from '../domain/fixtures';

/**
 * The ellipses a tap on a unicorn is tested against are checked against what is drawn, as a person
 * would: all of her is inside one, not much more than her is, and the one for a facing is the shape
 * of the facing beside it, nearly. A table that is the eight of before, repeated four times each,
 * or has two facings swapped, fails these, and the table the tool makes from the sheets passes
 * them.
 */
const manifest = shippedManifest();
type Id = keyof typeof manifest.unicorns;
const IDS = Object.keys(manifest.unicorns) as Id[];
const ALL = Object.values(manifest.unicorns);
const BODIES: Body[] = UNICORN_BODY_ROWS.map(([rx, ry, cy]) => ({ rx, ry, cy }));
const masses = new Map<string, Mass>();
const massOf = (id: Id | null, facing: UnicornFacing, sheets: Sheets = 'fine'): Mass => {
  const key = `${id}/${facing}/${sheets}`;
  let m = masses.get(key);
  if (!m) {
    m = drawnMass(id === null ? ALL : [manifest.unicorns[id]], facing, sheets);
    masses.set(key, m);
  }
  return m;
};

const worst = (bodies: readonly Body[], of: (facing: UnicornFacing, body: Body) => number): number =>
  Math.min(...UNICORN_FACINGS.map((f) => of(f, bodies[f]!)));
const heldWorst = (bodies: readonly Body[], id: Id | null = null, sheets: Sheets = 'fine'): number =>
  worst(bodies, (f, b) => holds(massOf(id, f, sheets), b));

/**
 * The eight ellipses the game had before, for the facings it had, each used for the four facings
 * nearest to it.
 */
const BEFORE: Record<number, Body> = {
  0: { rx: 74, ry: 62, cy: 52 },
  4: { rx: 63, ry: 62, cy: 50 },
  8: { rx: 44, ry: 62, cy: 50 },
  12: { rx: 63, ry: 62, cy: 50 },
  16: { rx: 74, ry: 62, cy: 52 },
  20: { rx: 63, ry: 77, cy: 63 },
  24: { rx: 44, ry: 84, cy: 68 },
  28: { rx: 63, ry: 77, cy: 63 },
};

describe('the ellipse a tap on a unicorn is tested against', () => {
  it('is what the tool makes from the sheets, to a unit, and `tsx tools/qa/hit-bodies.ts --write` makes it again when the pictures change', () => {
    const made = fitBodies(ALL);
    UNICORN_FACINGS.forEach((f) => {
      for (const part of ['rx', 'ry', 'cy'] as const)
        expect(Math.abs(BODIES[f]![part] - made[f]![part]), `facing ${f} ${part}`).toBeLessThanOrEqual(1);
    });
  });

  it('holds nearly all of what she is drawn with at every facing: the pixels of every frame of walking and standing, for the six of them together and for each alone', () => {
    expect(heldWorst(BODIES)).toBeGreaterThanOrEqual(COVER);
    for (const id of IDS) expect(heldWorst(BODIES, id), id).toBeGreaterThan(COVER - 0.01);
  });

  it('holds most of her where only the first sheet is loaded and the nearest of eight pictures stands in for the facing, but less at the four facings between a diagonal and a front or back view, where the diagonal stands in', () => {
    const between: UnicornFacing[] = [6, 10, 22, 26];
    for (const f of UNICORN_FACINGS)
      expect(holds(massOf(null, f, 'first'), BODIES[f]!), `facing ${f}`).toBeGreaterThan(
        between.includes(f) ? 0.88 : 0.97,
      );
  });

  it('holds her muzzle and her back at every facing, so a tap on her face or her side is a tap on her', () => {
    const world = makeWorld();
    const wildstar = world.unicorns.wildstar!;
    wildstar.pos = { x: 1000, y: 800 };
    const asset = manifest.unicorns.wildstar!;
    for (const facing of UNICORN_FACINGS) {
      wildstar.anim = { clip: 'idle', facing, startedAt: 0 };
      for (const name of ['walk', 'idle'] as const) {
        pictureOf(asset, name, facing).clip.frames.forEach((frame, i) => {
          for (const point of ['muzzle', 'back'] as const) {
            const [ax, ay] = frame.anchors![point]!;
            const at = { x: wildstar.pos.x + ax - asset.origin[0], y: wildstar.pos.y + ay - asset.origin[1] };
            expect(hitTest(world, at, 0), `${name} frame ${i} ${point} facing ${facing}`).toEqual({
              kind: 'unicorn',
              id: 'wildstar',
            });
          }
        });
      }
    }
  });

  it('is no larger than three and a half times what she is drawn as, so that a tap beside her is still a tap beside her', () => {
    for (const f of UNICORN_FACINGS) {
      const b = BODIES[f]!;
      expect((Math.PI * b.rx * b.ry) / massOf(null, f).total, `facing ${f}`).toBeLessThan(3.5);
    }
  });

  it('changes from one facing to the next by no more than her picture does, all the way round', () => {
    const step = (part: keyof Body): number =>
      Math.max(...UNICORN_FACINGS.map((f) => Math.abs(BODIES[f]![part] - BODIES[(f + 1) % 32]![part])));
    expect(step('rx')).toBeLessThanOrEqual(17);
    expect(step('ry')).toBeLessThanOrEqual(7);
    expect(step('cy')).toBeLessThanOrEqual(3);
  });

  it('is told from a table of the eight it was before, which let her out of it at the facings between', () => {
    const before = UNICORN_FACINGS.map((f) => BEFORE[nearestAmong(COMPASS_EIGHT, f)]!);
    expect(heldWorst(before)).toBeLessThan(COVER - 0.03);
  });

  it('is told from one with north and south swapped', () => {
    const swapped = BODIES.map((_, f) => BODIES[f === 8 ? 24 : f === 24 ? 8 : f]!);
    expect(heldWorst(swapped)).toBeLessThan(COVER - 0.05);
  });
});

describe('taps where two unicorns are drawn over each other', () => {
  /**
   * Wildstar stands with Leaf `gap` nearer the camera and `dx` along, both at `facing`, so Leaf is
   * drawn over her. A tap is put on every fourth pixel either is drawn with, as a finger would find
   * them, and the share that reach the unicorn drawn there is counted: for Wildstar over what Leaf
   * leaves of her showing, and for Leaf over all of her.
   */
  function reached(facing: UnicornFacing, dx: number, gap: number): { behind: number; inFront: number } {
    const world = makeWorld({ recruited: ['leaf'] });
    const behind = world.unicorns.wildstar!;
    const inFront = world.unicorns.leaf!;
    behind.pos = { x: 1000, y: 800 };
    inFront.pos = { x: 1000 + dx, y: 800 + gap };
    behind.anim = inFront.anim = { clip: 'idle', facing, startedAt: 0 };
    const [ox, oy] = manifest.unicorns.wildstar.origin;
    const { width, height } = canvasOf(manifest.unicorns.wildstar);
    const drawnBehind = silhouette(pictureOf(manifest.unicorns.wildstar, 'idle', facing), 0);
    const drawnInFront = silhouette(pictureOf(manifest.unicorns.leaf, 'idle', facing), 0);
    const idAt = (col: number, row: number): string | null => {
      const hit = hitTest(world, { x: behind.pos.x + col + 0.5 - ox, y: behind.pos.y + row + 0.5 - oy }, 0);
      return hit.kind === 'unicorn' ? hit.id : null;
    };
    const tally = { behind: { right: 0, all: 0 }, inFront: { right: 0, all: 0 } };
    for (let row = 0; row < height; row += 4) {
      for (let col = 0; col < width; col += 4) {
        if (drawnBehind[row * width + col]) {
          const [c, r] = [col - dx, row - gap];
          const coveredByFront = c >= 0 && c < width && r >= 0 && r < height && drawnInFront[r * width + c] === 1;
          if (!coveredByFront) {
            tally.behind.all += 1;
            if (idAt(col, row) === 'wildstar') tally.behind.right += 1;
          }
        }
        if (drawnInFront[row * width + col]) {
          tally.inFront.all += 1;
          if (idAt(col + dx, row + gap) === 'leaf') tally.inFront.right += 1;
        }
      }
    }
    return { behind: tally.behind.right / tally.behind.all, inFront: tally.inFront.right / tally.inFront.all };
  }

  const FACINGS: UnicornFacing[] = [0, 2, 4, 8, 14, 16, 24, 28];
  const ARRANGEMENTS = [
    { name: 'side by side', dx: 58, gap: 2 },
    { name: 'nearly side by side', dx: 58, gap: 16 },
    { name: 'trailing one another', dx: 30, gap: 40 },
    { name: 'one right behind the other', dx: 10, gap: 40 },
    { name: 'on a diagonal', dx: 58, gap: 32 },
  ];

  it.each(ARRANGEMENTS)(
    'reach the one drawn there nearly always, with two unicorns $name, at every facing and on either side',
    ({ dx, gap }) => {
      const runs = FACINGS.flatMap((facing) => [dx, -dx].map((along) => reached(facing, along, gap)));
      const mean = (of: (r: (typeof runs)[number]) => number): number =>
        runs.reduce((sum, r) => sum + of(r), 0) / runs.length;
      expect(mean((r) => r.behind)).toBeGreaterThan(0.85);
      expect(mean((r) => r.inFront)).toBeGreaterThan(0.78);
      expect(Math.min(...runs.map((r) => r.behind))).toBeGreaterThan(0.55);
      expect(Math.min(...runs.map((r) => r.inFront))).toBeGreaterThan(0.7);
    },
  );
});
