import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCH, ARCH_TOP, archPoint, bandOffset, HORN_TIPS } from '../../src/content/fountain-horns';
import { ARCH_PIECES, PIECES_PER_SIDE, pieceSprite } from '../../src/content/fountain-rainbow';
import { Manifest } from '../../src/shared/manifest';
import { FX_SPRITES } from '../../tools/art/fx/sprites';
import { ARCH_CANVAS, archPieces, renderArch, renderArchPiece } from '../../tools/art/world/fountain-rainbow';
import { readPicture } from '../../tools/lib/picture';
import { hasWebp } from '../../tools/lib/webp';

const { w, h, ox, oy } = ARCH_CANVAS;
type Pixel = [number, number, number, number];
const at = (img: { width: number; data: Uint8Array }, x: number, y: number): Pixel => {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
};
/** The pixel of the arch's canvas that a point measured from the host falls in. */
const pixelAt = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x + ox), Math.floor(p.y + oy)];
const same = (a: Pixel, b: Pixel): boolean => a.every((v, i) => v === b[i]);

describe('the arch of the rainbow, painted', () => {
  const whole = renderArch();

  it('is cut into pieces that tile it: every painted pixel is in one piece and no pixel is in two', () => {
    expect(archPieces()).toHaveLength(ARCH_PIECES.length * 2);
    const owners = new Uint8Array(w * h);
    const wrong: string[] = [];
    for (const { piece, side } of archPieces()) {
      const img = renderArchPiece(piece, side);
      let painted = 0;
      for (let i = 0; i < w * h; i++) {
        if (img.data[i * 4 + 3] === 0) continue;
        painted++;
        owners[i]!++;
        const x = i % w;
        const y = Math.floor(i / w);
        if (!same(at(img, x, y), at(whole, x, y)))
          wrong.push(`${pieceSprite(piece, side)} is not as the whole is at ${x}, ${y}`);
      }
      if (painted === 0) wrong.push(`${pieceSprite(piece, side)} has no pixels`);
    }
    for (let i = 0; i < w * h; i++) {
      const want = whole.data[i * 4 + 3]! > 0 ? 1 : 0;
      if (owners[i] !== want)
        wrong.push(`pixel ${i % w}, ${Math.floor(i / w)} is in ${owners[i]} pieces and should be in ${want}`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('reaches as high over the line between the horns as the camera is told it does, to make room for it', () => {
    const painted = (row: number): boolean =>
      Array.from({ length: w }, (_, x) => whole.data[(row * w + x) * 4 + 3]!).some((a) => a > 0);
    let top = 0;
    while (!painted(top)) top++;
    expect(oy - top).toBe(ARCH_TOP);
  });

  describe('in its pieces', () => {
    const all = archPieces();
    const owner = new Int16Array(w * h).fill(-1);
    all.forEach(({ piece, side }, n) => {
      const img = renderArchPiece(piece, side);
      for (let i = 0; i < w * h; i++) if (img.data[i * 4 + 3] !== 0) owner[i] = n;
    });

    it('is cut along one row or one column of pixels wherever two pieces of a group meet, never slanted, so each cut is on the edge of a frame', () => {
      // The game smooths the edge of every sprite. A cut that is not on the edge of its frame is
      // blended with the transparent pixels beside it, and the ground shows through as a thin line.
      const cuts = new Map<string, Set<string>>();
      const meet = (a: number, b: number, where: string): void => {
        if (a < 0 || b < 0 || a === b || all[a]!.piece.group !== all[b]!.piece.group) return;
        const pair = `${pieceSprite(all[Math.min(a, b)]!.piece, all[Math.min(a, b)]!.side)} and ${pieceSprite(all[Math.max(a, b)]!.piece, all[Math.max(a, b)]!.side)}`;
        cuts.set(pair, (cuts.get(pair) ?? new Set()).add(where));
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (x + 1 < w) meet(owner[y * w + x]!, owner[y * w + x + 1]!, `column ${x + 1}`);
          if (y + 1 < h) meet(owner[y * w + x]!, owner[(y + 1) * w + x]!, `row ${y + 1}`);
        }
      }
      expect(cuts.size, 'pieces that meet').toBeGreaterThan(ARCH_PIECES.length);
      const slanted = [...cuts]
        .filter(([, where]) => where.size > 1)
        .map(([pair, where]) => `${pair} meet along ${[...where].slice(0, 4).join(', ')}`);
      expect(slanted.slice(0, 5)).toEqual([]);
    });

    it('runs the pieces in order from each horn to the middle: the middle of the bands at the middle of a piece is in that piece', () => {
      const wrong: string[] = [];
      for (const [n, { piece, side }] of all.entries()) {
        if (piece.group !== 'outer') continue;
        const along = (piece.index + 0.5) / (2 * PIECES_PER_SIDE);
        const [x, y] = pixelAt(archPoint(side === 'left' ? along : 1 - along, 0));
        const found = owner[y * w + x]!;
        if (found !== n)
          wrong.push(
            `${pieceSprite(piece, side)} should hold the middle of the bands at ${along.toFixed(3)} along, ${found < 0 ? 'nothing is there' : `${pieceSprite(all[found]!.piece, all[found]!.side)} holds it`}`,
          );
      }
      expect(wrong).toEqual([]);
    });
  });

  it('is painted in the seven colors of the small rainbow the palace door makes, the outermost first', () => {
    const small = FX_SPRITES.find((s) => s.id === 'fx-rainbow')!.render(0);
    // The small rainbow's bands are five pixels thick and run from y 8, straight up from its
    // middle.
    const door = Array.from({ length: ARCH.bands }, (_, i) => at(small, 96, 10 + 5 * i));
    const arch = Array.from({ length: ARCH.bands }, (_, i) => at(whole, ...pixelAt(archPoint(0.5, bandOffset(i)))));
    expect(arch).toEqual(door);
    expect(new Set(arch.map((c) => c.join())).size, 'seven colors that are not alike').toBe(ARCH.bands);
  });

  it('puts every band on the curve archPoint gives for it, all the way round, so what rides the arch rides the bands', () => {
    const colors = Array.from({ length: ARCH.bands }, (_, i) => at(whole, ...pixelAt(archPoint(0.5, bandOffset(i)))));
    const wrong: string[] = [];
    for (let step = 3; step <= 17; step++) {
      for (let band = 0; band < ARCH.bands; band++) {
        const along = step / 20;
        const [x, y] = pixelAt(archPoint(along, bandOffset(band)));
        if (!same(at(whole, x, y), colors[band]!)) wrong.push(`band ${band} at ${along} along, pixel ${x}, ${y}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('is the same on both sides of the middle', () => {
    const wrong: string[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w / 2; x++) {
        const [l, r] = [at(whole, x, y), at(whole, w - 1 - x, y)];
        if (l[3] === 0 && r[3] === 0) continue;
        if (!same([l[0], l[1], l[2], 0], [r[0], r[1], r[2], 0]) || Math.abs(l[3] - r[3]) > 1)
          wrong.push(`${x}, ${y}: ${l.join()} against ${r.join()}`);
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('stands on the horns and fades out into them, solid again a little way up', () => {
    for (const side of ['left', 'right'] as const) {
      const tip = HORN_TIPS[side].x;
      // Low down the bands still run straight up, so the arch is as wide as the bands are thick,
      // centred on the tip.
      const xs = Array.from({ length: w }, (_, x) => x).filter(
        (x) => x < ox === (side === 'left') && at(whole, x, oy - 8)[3] > 0,
      );
      const middle = (xs[0]! + xs[xs.length - 1]! + 1) / 2 - ox;
      expect(Math.abs(middle - tip), `${side} foot is centred ${middle} from the host`).toBeLessThanOrEqual(1);
      const alpha = (above: number): number => at(whole, ox + tip, oy - above)[3];
      expect(alpha(1), `${side}: next to the tip`).toBeLessThan(20);
      for (let above = 2; above <= 30; above++)
        expect(alpha(above), `${side}: ${above} up`).toBeGreaterThanOrEqual(alpha(above - 1));
      expect(alpha(40), `${side}: 40 up`).toBe(255);
    }
  });

  it('rises about as high above the horn line as the arch is meant to, with the bands inside the canvas', () => {
    const top = Array.from({ length: h }, (_, y) => y).find((y) =>
      Array.from({ length: w }, (_, x) => at(whole, x, y)[3]).some((a) => a > 0),
    )!;
    expect(oy - top, 'rows above the horn line').toBeGreaterThanOrEqual(ARCH.rise + (ARCH.bands * ARCH.band) / 2);
    expect(top, 'the outline touches the top of the canvas').toBeLessThanOrEqual(1);
    expect(h - oy, 'the canvas stops just under the horn line').toBeLessThanOrEqual(2);
  });
});

describe('the arch in the garden bundle', () => {
  const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
  const garden = manifest.bundles.garden!;

  it('has every piece, anchored at the host, which stays in one place on the arch', () => {
    for (const { piece, side } of archPieces()) {
      const sprite = garden.sprites[pieceSprite(piece, side)];
      expect(sprite, pieceSprite(piece, side)).toBeDefined();
      expect(sprite!.origin).toEqual([ox, oy]);
      expect(sprite!.frames).toHaveLength(1);
    }
  });

  it.skipIf(!hasWebp())(
    'holds the pieces exactly as they are drawn: put back where the manifest says, they are the arch',
    () => {
      const pages = garden.pages.map((p) => readPicture(`public/assets/${p.file}`));
      const wrong: string[] = [];
      for (const { piece, side } of archPieces()) {
        const name = pieceSprite(piece, side);
        const frame = garden.sprites[name]!.frames[0]!;
        const rect = garden.pages[frame.page]!.rects[frame.rect]!;
        const page = pages[frame.page]!;
        const drawn = renderArchPiece(piece, side);
        if (rect.sw !== w || rect.sh !== h) wrong.push(`${name} is stored for a canvas of ${rect.sw}x${rect.sh}`);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const inside = x >= rect.ox && x < rect.ox + rect.w && y >= rect.oy && y < rect.oy + rect.h;
            const stored: Pixel = inside ? at(page, rect.x + x - rect.ox, rect.y + y - rect.oy) : [0, 0, 0, 0];
            const want = at(drawn, x, y);
            if (want[3] === 0 ? stored[3] !== 0 : !same(stored, want))
              wrong.push(`${name} at ${x}, ${y} is ${stored.join()} and should be ${want.join()}`);
          }
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
    },
  );
});
