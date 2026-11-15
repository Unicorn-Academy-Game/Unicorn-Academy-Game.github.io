import { describe, expect, it } from 'vitest';
import {
  ARCH_PIECES,
  type ArchGroup,
  type ArchPiece,
  DISSOLVE,
  dissolveFront,
  dissolveStart,
  PAINT,
  PAINTED,
  PIECES_PER_SIDE,
  paintFront,
  paintStart,
  pieceId,
  pieceSprite,
  RAINBOW,
  SHIMMER,
  shimmerCrest,
  shimmerWave,
} from '../../src/content/fountain-rainbow';
import { PROP_DEFS } from '../../src/content/props';
import { ARCH_BIAS, archAlphaOf, drawProp, type Picture, type PropFacts } from '../../src/render/prop-visuals';

const TOTAL: number = RAINBOW.life;
/** The arch stands from the moment the last piece is whole until the fade begins. */
const STANDS = { from: PAINTED + SHIMMER.settle, to: TOTAL - RAINBOW.fade };
const NOT_DRAWN = 0.004;

const along = (group: ArchGroup): ArchPiece[] =>
  Array.from({ length: PIECES_PER_SIDE }, (_, index) => ({ group, index }));
const alphas = (seconds: number, total = TOTAL): number[] => ARCH_PIECES.map((p) => archAlphaOf(p, seconds, total));
const moments = (from: number, to: number, step = 0.01): number[] =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

const facts = (piece: ArchPiece | undefined, moment?: { kind: string; seconds: number; total: number }): PropFacts => ({
  definitionId: 'fountain-rainbow',
  instanceId: `palace-garden/rainbow-${piece ? pieceId(piece) : 'none'}`,
  look: piece && pieceId(piece),
  state: undefined,
  moment,
});
const drawn = (piece: ArchPiece, seconds: number, total = TOTAL, kind = 'light-rainbow'): Picture =>
  drawProp(facts(piece, { kind, seconds, total }));
const nothing: Picture = { body: null, overlay: null };

/** The most that `f` changes anywhere in the window in a tenth of a second. */
const fastest = (from: number, to: number, f: (seconds: number) => number): number =>
  Math.max(...moments(from, to - 0.1).map((t) => Math.abs(f(t + 0.1) - f(t))));

describe('the rainbow over the fountain, as drawn', () => {
  describe('the prop that draws it', () => {
    it('is drawn by the game, with a look for each piece of the arch', () => {
      expect(PROP_DEFS['fountain-rainbow']!.invisible).toBeUndefined();
      expect(PROP_DEFS['fountain-rainbow']!.looks).toEqual(ARCH_PIECES.map(pieceId));
    });

    it('draws nothing while there is no rainbow, or for any other reaction', () => {
      for (const p of ARCH_PIECES) {
        expect(drawProp(facts(p)), pieceId(p)).toEqual(nothing);
        expect(drawn(p, 2.5, TOTAL, 'glow-ornament'), pieceId(p)).toEqual(nothing);
      }
      expect(drawProp(facts(undefined, { kind: 'light-rainbow', seconds: 2.5, total: TOTAL }))).toEqual(nothing);
    });

    it('draws a piece as its left half in the body and its right half in the overlay, as stills with the same light', () => {
      for (const p of ARCH_PIECES) {
        const picture = drawn(p, 2.5);
        const alpha = archAlphaOf(p, 2.5, TOTAL);
        expect(picture.body, pieceId(p)).toEqual({
          sprite: pieceSprite(p, 'left'),
          show: { kind: 'frame', index: 0 },
          alpha,
          bias: ARCH_BIAS,
        });
        expect(picture.overlay, pieceId(p)).toEqual({
          sprite: pieceSprite(p, 'right'),
          show: { kind: 'frame', index: 0 },
          alpha,
          bias: ARCH_BIAS,
        });
      }
    });

    it('draws nothing for a piece that is not yet in, and nothing for any piece once the fade is over', () => {
      expect(drawn({ group: 'inner', index: PIECES_PER_SIDE - 1 }, 0.5)).toEqual(nothing);
      for (const p of ARCH_PIECES) {
        expect(drawn(p, 0), pieceId(p)).toEqual(nothing);
        expect(drawn(p, TOTAL), pieceId(p)).toEqual(nothing);
      }
    });
  });

  describe('painting on', () => {
    it('brings the pieces in from the horns to the apex, the outer red before the inner violet', () => {
      for (const t of moments(0, PAINTED)) {
        for (const group of ['outer', 'inner'] as const) {
          const a = along(group).map((p) => archAlphaOf(p, t, TOTAL));
          for (let i = 1; i < a.length; i++)
            expect(a[i]!, `${group} ${i} at ${t.toFixed(2)}`).toBeLessThanOrEqual(a[i - 1]! + 1e-12);
        }
        for (const [i, p] of along('inner').entries())
          expect(archAlphaOf(p, t, TOTAL), `inner ${i} at ${t.toFixed(2)}`).toBeLessThanOrEqual(
            archAlphaOf({ group: 'outer', index: i }, t, TOTAL) + 1e-12,
          );
      }
    });

    it('never takes a piece back once it is coming in, and has it whole when the last piece is in', () => {
      for (const p of ARCH_PIECES) {
        let last = 0;
        for (const t of moments(0, PAINTED)) {
          const a = archAlphaOf(p, t, TOTAL);
          expect(a, `${pieceId(p)} at ${t.toFixed(2)}`).toBeGreaterThanOrEqual(last - 1e-12);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThanOrEqual(1);
          last = a;
        }
      }
      for (const a of alphas(PAINTED)) expect(a).toBeCloseTo(1, 9);
    });

    it('begins at the horns, after the horns have lit, and is whole inside the time the content gives to forming', () => {
      expect(paintStart({ group: 'outer', index: 0 })).toBe(PAINT.begin);
      expect(PAINT.begin).toBeGreaterThan(0);
      expect(PAINTED).toBeLessThanOrEqual(RAINBOW.form);
    });
  });

  describe('standing', () => {
    it('is a soft wave of light that stays between its bounds and is never more than a quarter brighter than it dims to', () => {
      const all = moments(STANDS.from, STANDS.to, 0.02).flatMap((t) => alphas(t));
      expect(Math.max(...all)).toBeLessThanOrEqual(1);
      expect(Math.min(...all)).toBeGreaterThanOrEqual(1 - SHIMMER.depth - 1e-9);
      expect(Math.max(...all) / Math.min(...all) - 1).toBeLessThanOrEqual(0.25);
      expect(SHIMMER.period).toBeGreaterThanOrEqual(1.2);
    });

    it('does not dim or brighten a piece by more than 15% in a tenth of a second', () => {
      for (const p of ARCH_PIECES)
        expect(
          fastest(PAINTED, STANDS.to, (t) => archAlphaOf(p, t, TOTAL)),
          pieceId(p),
        ).toBeLessThanOrEqual(0.15);
    });

    it('runs from the horns to the apex, one crest on each side', () => {
      const crest = (t: number): number => {
        const a = along('outer').map((p) => archAlphaOf(p, t, TOTAL));
        return a.indexOf(Math.max(...a));
      };
      for (const t of moments(STANDS.from, STANDS.to - 0.2, 0.1)) {
        const moved = (((crest(t + 0.2) - crest(t)) % PIECES_PER_SIDE) + PIECES_PER_SIDE) % PIECES_PER_SIDE;
        expect(moved, `from ${t.toFixed(2)}`).toBeGreaterThanOrEqual(1);
        expect(moved, `from ${t.toFixed(2)}`).toBeLessThanOrEqual(2);
      }
    });

    it('is the same for the left and the right, which are drawn with one light', () => {
      for (const p of ARCH_PIECES) expect(drawn(p, 3).body!.alpha).toBe(drawn(p, 3).overlay!.alpha);
    });
  });

  describe('coming off', () => {
    const fade = moments(STANDS.to, TOTAL);
    /**
     * When the piece first shows less than `level`, well below the least the wave dims it to, so
     * the fade and not the wave says when.
     */
    const below = (p: ArchPiece, level: number): number =>
      fade.find((t) => archAlphaOf(p, t, TOTAL) < level) ?? Infinity;

    it('takes the pieces off from the apex to the horns, the inner violet before the outer red', () => {
      for (const group of ['outer', 'inner'] as const) {
        const t = along(group).map((p) => below(p, 0.5));
        for (let i = 1; i < t.length; i++) expect(t[i]!, `${group} ${i}`).toBeLessThan(t[i - 1]!);
      }
      for (const [i, p] of along('inner').entries())
        expect(below(p, 0.5), `inner ${i}`).toBeLessThan(below({ group: 'outer', index: i }, 0.5));
    });

    it('has every piece there when the fade begins and none of them drawn when it is over', () => {
      for (const a of alphas(STANDS.to)) expect(a).toBeGreaterThanOrEqual(1 - SHIMMER.depth - 1e-9);
      for (const a of alphas(TOTAL)) expect(a).toBeLessThan(NOT_DRAWN);
    });

    it('takes every piece off for good: once one is not drawn it is not drawn again', () => {
      for (const p of ARCH_PIECES) {
        let hidden = false;
        for (const t of fade) {
          const a = archAlphaOf(p, t, TOTAL);
          if (hidden) expect(a, `${pieceId(p)} at ${t.toFixed(2)}`).toBeLessThan(NOT_DRAWN);
          hidden ||= a < NOT_DRAWN;
        }
        expect(hidden, pieceId(p)).toBe(true);
      }
    });

    it('takes the time the content gives to the fade, to the last piece', () => {
      expect(DISSOLVE.span + DISSOLVE.lead + DISSOLVE.ramp).toBeCloseTo(RAINBOW.fade, 9);
    });
  });

  describe('as a whole', () => {
    it('does not brighten or dim by more than 15% of its full light in a tenth of a second, painting on, standing or coming off', () => {
      expect(fastest(0, TOTAL, (t) => mean(alphas(t)))).toBeLessThanOrEqual(0.15);
    });

    it('looks the same, up to the time it would have faded, when the rainbow is given more time', () => {
      for (const total of [7.2, RAINBOW.cap]) {
        for (const t of moments(0, STANDS.to, 0.05))
          expect(alphas(t, total), `${total} at ${t.toFixed(2)}`).toEqual(alphas(t, TOTAL));
      }
    });

    it('fades for the same time at the end of a rainbow that was given more time', () => {
      for (const total of [7.2, RAINBOW.cap]) {
        for (const a of alphas(total - RAINBOW.fade, total)) expect(a).toBeGreaterThanOrEqual(1 - SHIMMER.depth - 1e-9);
        for (const a of alphas(total, total)) expect(a).toBeLessThan(NOT_DRAWN);
      }
    });
  });

  describe('where its light is, which the sparkles are put at', () => {
    const outer = along('outer');
    const placeOf = (p: ArchPiece): number => (p.index + 0.5) / PIECES_PER_SIDE;
    /**
     * How far apart two places along a side are, when the wave that runs from the horn to the apex
     * starts again at the horn.
     */
    const apart = (a: number, b: number): number => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

    it('has the crest of the wave at the place where the arch is brightest, as the wave runs from the horns to the apex', () => {
      for (const t of moments(STANDS.from, STANDS.to, 0.17)) {
        const crest = shimmerCrest(t);
        expect(crest, `at ${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
        expect(crest, `at ${t.toFixed(2)}`).toBeLessThan(1);
        const brightest = outer.reduce((best, p) =>
          archAlphaOf(p, t, TOTAL) > archAlphaOf(best, t, TOTAL) ? p : best,
        );
        expect(apart(placeOf(brightest), crest), `at ${t.toFixed(2)}`).toBeLessThanOrEqual(
          0.5 / PIECES_PER_SIDE + 1e-9,
        );
        expect(shimmerWave(crest, t), `at ${t.toFixed(2)}`).toBeCloseTo(1, 9);
      }
      const runs = moments(2, 2 + SHIMMER.period * 2, 0.05).map(shimmerCrest);
      for (let i = 1; i < runs.length; i++)
        expect((runs[i]! - runs[i - 1]! + 1) % 1, 'it moves on toward the apex at the speed of the wave').toBeCloseTo(
          0.05 / SHIMMER.period,
          9,
        );
    });

    it('has the front of the paint at the far end of the piece that has just begun to come in', () => {
      for (const p of outer)
        expect(paintFront(paintStart(p)), pieceId(p)).toBeCloseTo((p.index + 1) / PIECES_PER_SIDE, 9);
      expect(paintFront(0)).toBe(0);
      expect(paintFront(PAINT.begin + PAINT.span + 1)).toBe(1);
      const fronts = moments(0, 1.2, 0.02).map(paintFront);
      for (let i = 1; i < fronts.length; i++) expect(fronts[i]!).toBeGreaterThanOrEqual(fronts[i - 1]!);
    });

    it('has the front of the dissolve at the near end of the last piece that has begun to go, for a rainbow of any length', () => {
      for (const total of [TOTAL, 7.2, RAINBOW.cap]) {
        for (const p of outer)
          expect(dissolveFront(dissolveStart(p, total), total), `${total}: ${pieceId(p)}`).toBeCloseTo(
            p.index / PIECES_PER_SIDE,
            9,
          );
        expect(dissolveFront(total - RAINBOW.fade - 1, total), 'before the fade it is at the apex').toBe(1);
        expect(dissolveFront(total, total), 'at the end it is at the horn').toBe(0);
        const fronts = moments(total - RAINBOW.fade, total, 0.02).map((t) => dissolveFront(t, total));
        for (let i = 1; i < fronts.length; i++) expect(fronts[i]!).toBeLessThanOrEqual(fronts[i - 1]!);
      }
    });
  });
});
