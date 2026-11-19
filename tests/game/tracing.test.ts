import { describe, expect, it } from 'vitest';
import { glyphOf, type Point, symbolsOf, WRITE_KINDS, type WriteKind } from '../../src/content/letters';
import { along, type Step, Tracer } from '../../src/game/tracing';

const REACH = 18;
const every = WRITE_KINDS.flatMap((kase) => symbolsOf(kase).map((letter) => ({ kase, letter })));

const glyph = (letter: string, kase: WriteKind = 'upper') => {
  const found = glyphOf(letter, kase);
  if (!found) throw new Error(`no ${letter}`);
  return found;
};

/** A finger that goes along `points`, a little off the line to one side and then the other. */
function drag(tracer: Tracer, points: readonly Point[], off = 0): Step[] {
  return points.map(([x, y], i): Step => tracer.touch([x + (i % 2 ? off : -off), y + (i % 2 ? -off : off)]));
}

describe('the points of a stroke', () => {
  it('start and end where the stroke does, a little way apart', () => {
    const points = along([
      [0, 0],
      [10, 0],
      [10, 3],
    ]);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([10, 3]);
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1]!;
      const [bx, by] = points[i]!;
      expect(Math.hypot(bx - ax, by - ay)).toBeLessThanOrEqual(2.5 + 1e-9);
    }
  });

  it('are spread evenly along a line', () => {
    expect(
      along([
        [0, 0],
        [10, 0],
      ]),
    ).toEqual([
      [0, 0],
      [2.5, 0],
      [5, 0],
      [7.5, 0],
      [10, 0],
    ]);
  });

  it('are nothing for a stroke that is nothing', () => {
    expect(along([])).toEqual([]);
  });
});

describe('writing a letter', () => {
  it('is done when every stroke has been followed in turn', () => {
    const tracer = new Tracer(glyph('h'), REACH);
    const finished = glyph('h').strokes.map((stroke) =>
      drag(tracer, along(stroke)).filter((step) => step === 'stroke' || step === 'letter'),
    );
    expect(finished).toEqual([['stroke'], ['stroke'], ['letter']]);
    expect(tracer.done).toBe(true);
    expect(tracer.stroke).toBeNull();
  });

  it.each(every)('can be done for $letter in $kase by following the strokes', ({ letter, kase }) => {
    const tracer = new Tracer(glyph(letter, kase), REACH);
    const steps = glyph(letter, kase).strokes.flatMap((stroke) => drag(tracer, along(stroke)));
    expect(steps.filter((step) => step === 'letter')).toHaveLength(1);
    expect(tracer.done).toBe(true);
  });

  it.each(every)('can be done for $letter in $kase with a finger half the reach off', ({ letter, kase }) => {
    const tracer = new Tracer(glyph(letter, kase), REACH);
    for (const stroke of glyph(letter, kase).strokes) drag(tracer, along(stroke), REACH / 2);
    expect(tracer.done).toBe(true);
  });

  it.each(every)('is not done for $letter in $kase by a finger that goes backwards', ({ letter, kase }) => {
    const tracer = new Tracer(glyph(letter, kase), REACH);
    const [first] = glyph(letter, kase).strokes;
    const steps = drag(tracer, along(first!).reverse());
    expect(steps).not.toContain('stroke');
    expect(steps).not.toContain('letter');
  });

  it('does not count the strokes that are not next', () => {
    const tracer = new Tracer(glyph('h'), REACH);
    const [, , bar] = glyph('h').strokes;
    expect(drag(tracer, along(bar!))).not.toContain('more');
    expect(tracer.stroke).toBe(0);
    expect(tracer.progress(0)).toBe(0);
  });

  it('does not count a finger that cuts across the curve', () => {
    const tracer = new Tracer(glyph('c'), REACH);
    const [curve] = glyph('c').strokes;
    const [from, to] = [curve![0]!, curve!.at(-1)!];
    const across: Point[] = Array.from({ length: 30 }, (_, i) => [
      from[0] + ((to[0] - from[0]) * i) / 29,
      from[1] + ((to[1] - from[1]) * i) / 29,
    ]);
    expect(drag(tracer, across)).not.toContain('letter');
    expect(tracer.progress(0)).toBeLessThan(0.5);
  });

  it('waits where it got to when the finger lifts, and goes on from there', () => {
    const tracer = new Tracer(glyph('l'), REACH);
    const [stem, foot] = glyph('l').strokes;
    const points = along(stem!);
    drag(tracer, points.slice(0, points.length / 2));
    const half = tracer.progress(0);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.6);
    expect(tracer.touch([200, 200])).toBe('none');
    expect(tracer.progress(0)).toBe(half);
    drag(tracer, points.slice(points.length / 2));
    expect(tracer.progress(0)).toBe(1);
    drag(tracer, along(foot!));
    expect(tracer.done).toBe(true);
  });

  it('is finished by touching the dot of an i', () => {
    const tracer = new Tracer(glyph('i', 'lower'), REACH);
    const [stem, dot] = glyph('i', 'lower').strokes;
    expect(drag(tracer, along(stem!))).toContain('stroke');
    expect(tracer.touch(dot![0]!)).toBe('letter');
  });

  it('says how much of each stroke is written', () => {
    const tracer = new Tracer(glyph('t'), REACH);
    const [bar, stem] = glyph('t').strokes;
    expect(tracer.progress(0)).toBe(0);
    drag(tracer, along(bar!).slice(0, 14));
    expect(tracer.progress(0)).toBeGreaterThan(0);
    expect(tracer.progress(0)).toBeLessThan(1);
    expect(tracer.progress(1)).toBe(0);
    drag(tracer, along(bar!));
    expect(tracer.progress(0)).toBe(1);
    expect(tracer.progress(1)).toBe(0);
    expect(tracer.stroke).toBe(1);
    drag(tracer, along(stem!));
    expect(tracer.progress(1)).toBe(1);
  });

  it('keeps what is left of the stroke to show the way', () => {
    const tracer = new Tracer(glyph('l'), REACH);
    const [stem] = glyph('l').strokes;
    const all = along(stem!);
    expect(tracer.rest()).toEqual(all);
    drag(tracer, all.slice(0, 10));
    expect(tracer.rest().length).toBeLessThan(all.length);
    expect(tracer.rest().at(-1)).toEqual(all.at(-1));
    for (const stroke of glyph('l').strokes) drag(tracer, along(stroke));
    expect(tracer.rest()).toEqual([]);
  });

  it('starts again when cleared', () => {
    const tracer = new Tracer(glyph('v'), REACH);
    for (const stroke of glyph('v').strokes) drag(tracer, along(stroke));
    expect(tracer.done).toBe(true);
    tracer.clear();
    expect(tracer.done).toBe(false);
    expect(tracer.stroke).toBe(0);
    expect(tracer.progress(0)).toBe(0);
  });

  it('goes on being done when it is touched after it is', () => {
    const tracer = new Tracer(glyph('l'), REACH);
    for (const stroke of glyph('l').strokes) drag(tracer, along(stroke));
    expect(tracer.touch([0, 0])).toBe('none');
    expect(tracer.done).toBe(true);
  });
});
