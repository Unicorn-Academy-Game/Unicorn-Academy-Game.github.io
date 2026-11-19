import { describe, expect, it } from 'vitest';
import {
  centreOf,
  Drawing,
  INKS,
  inkAt,
  MAX_MARKS,
  MAX_POINTS,
  penWidth,
  rubberWidth,
  STAMPS,
  stampParts,
  stampSize,
} from '../../src/game/doodle';

const at = (x: number, y: number) => ({ x, y });

describe('drawing a line', () => {
  it('starts with a dot, so a tap leaves a mark', () => {
    const drawing = new Drawing(640, 300);
    expect(drawing.begin(at(100, 50), 'red', 8)).toBe(true);
    drawing.end();
    expect(drawing.count).toBe(1);
    expect(drawing.marks[0]).toMatchObject({ kind: 'line', ink: 'red', width: 8, points: [at(100, 50)] });
  });

  it('grows as the finger goes, and leaves out a finger that has not moved', () => {
    const drawing = new Drawing(640, 300);
    drawing.begin(at(10, 10), 'blue', 8);
    expect(drawing.extend(at(10.4, 10.4))).toBe(false);
    expect(drawing.extend(at(20, 10))).toBe(true);
    expect(drawing.extend(at(30, 20))).toBe(true);
    expect(drawing.live?.points).toEqual([at(10, 10), at(20, 10), at(30, 20)]);
  });

  it('stays on the picture however far the finger goes', () => {
    const drawing = new Drawing(640, 300);
    drawing.begin(at(-30, 400), 'green', 8);
    drawing.extend(at(900, -50));
    expect(drawing.live?.points).toEqual([at(0, 300), at(640, 0)]);
  });

  it('goes nowhere once the finger is up, and the next touch is a new line', () => {
    const drawing = new Drawing(640, 300);
    drawing.begin(at(10, 10), 'pink', 8);
    drawing.end();
    expect(drawing.live).toBeNull();
    expect(drawing.extend(at(200, 200))).toBe(false);
    drawing.begin(at(50, 50), 'pink', 8);
    expect(drawing.count).toBe(2);
  });

  it('stops growing a line that has gone on very long', () => {
    const drawing = new Drawing(100_000, 300);
    drawing.begin(at(0, 0), 'rainbow', 8);
    let grown = 0;
    for (let x = 5; x < 100_000 && grown < MAX_POINTS + 10; x += 5) if (drawing.extend(at(x, 0))) grown += 1;
    expect(drawing.live?.points.length).toBe(MAX_POINTS);
  });
});

describe('stamps', () => {
  it('press where the finger is, and slide along with it until it lifts', () => {
    const drawing = new Drawing(640, 300);
    expect(drawing.stamp('star', at(100, 100), 'yellow', 30)).toBe(true);
    expect(drawing.slide(at(150, 120))).toBe(true);
    drawing.end();
    expect(drawing.slide(at(300, 200))).toBe(false);
    expect(drawing.marks).toEqual([{ kind: 'stamp', shape: 'star', ink: 'yellow', size: 30, at: at(150, 120) }]);
  });

  it('stay on the picture when they are slid off it', () => {
    const drawing = new Drawing(640, 300);
    drawing.stamp('heart', at(10, 10), 'pink', 30);
    drawing.slide(at(5000, 5000));
    expect(drawing.marks[0]).toMatchObject({ at: at(640, 300) });
  });

  it('are made of outlines that stay inside the circle of their size, whatever the shape', () => {
    for (const shape of STAMPS) {
      const parts = stampParts(shape, 40);
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) {
        expect(part.points.length).toBeGreaterThanOrEqual(3);
        for (const p of part.points) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(40.001);
      }
      const all = parts.flatMap((part) => part.points);
      const top = Math.min(...all.map((p) => p.y));
      const bottom = Math.max(...all.map((p) => p.y));
      expect(Math.abs(top + bottom)).toBeLessThan(40 * 0.25);
      const left = Math.min(...all.map((p) => p.x));
      const right = Math.max(...all.map((p) => p.x));
      expect(Math.abs(left + right)).toBeLessThan(40 * 0.02);
    }
  });

  it('give a flower a middle that is not its own colour', () => {
    expect(stampParts('flower', 40).filter((part) => part.fill === 'centre')).toHaveLength(1);
    for (const ink of INKS) expect(centreOf(ink)).not.toBe(inkAt(ink, 0));
  });
});

describe('the rubber', () => {
  it('draws a line like a crayon, which paints the picture back and not a colour', () => {
    const drawing = new Drawing(640, 300);
    expect(drawing.begin(at(10, 10), 'rubber', 20)).toBe(true);
    drawing.extend(at(80, 40));
    expect(drawing.marks).toEqual([{ kind: 'line', ink: 'rubber', width: 20, points: [at(10, 10), at(80, 40)] }]);
  });

  it('is wider than the crayon, and takes the small and the big size with it', () => {
    expect(rubberWidth('fine', 720, 330)).toBeGreaterThan(penWidth('bold', 720, 330));
    expect(rubberWidth('bold', 720, 330)).toBeGreaterThan(rubberWidth('fine', 720, 330));
  });
});

describe('the sun and the moon', () => {
  const area = (points: readonly { x: number; y: number }[]): number =>
    Math.abs(
      points.reduce(
        (sum, p, i) => sum + p.x * points[(i + 1) % points.length]!.y - points[(i + 1) % points.length]!.x * p.y,
        0,
      ),
    ) / 2;

  it('are a disc with rays, and a crescent that is part of a circle and not the whole of one', () => {
    const sun = stampParts('sun', 40);
    expect(sun.filter((part) => part.fill === 'ink')).toHaveLength(8);
    expect(sun.filter((part) => part.fill === 'centre')).toHaveLength(1);
    const [moon, ...rest] = stampParts('moon', 40);
    expect(rest).toEqual([]);
    expect(area(moon!.points)).toBeGreaterThan(Math.PI * 40 * 40 * 0.12);
    expect(area(moon!.points)).toBeLessThan(Math.PI * 40 * 40 * 0.55);
  });

  it('give the moon a crescent that opens towards the upper right, so it reads as a moon', () => {
    const [moon] = stampParts('moon', 40);
    const points = moon!.points;
    const inside = (x: number, y: number): boolean => {
      // A point of the crescent's own plane is inside when an even number of edges lie to its right.
      let crossings = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) crossings += 1;
      }
      return crossings % 2 === 1;
    };
    expect(inside(-30, 4), 'the thick body is on the left').toBe(true);
    expect(inside(24, -12), 'and the bite is on the right').toBe(false);
  });
});

describe('undo', () => {
  it('takes marks off one at a time, the last first, and then has none to take', () => {
    const drawing = new Drawing(640, 300);
    drawing.begin(at(1, 1), 'red', 8);
    drawing.stamp('star', at(50, 50), 'blue', 30);
    drawing.begin(at(9, 9), 'green', 8);
    expect(drawing.undo()).toBe(true);
    expect(drawing.marks.map((m) => (m.kind === 'line' ? m.ink : m.shape))).toEqual(['red', 'star']);
    expect(drawing.live).toBeNull();
    expect(drawing.undo()).toBe(true);
    expect(drawing.undo()).toBe(true);
    expect(drawing.undo()).toBe(false);
    expect(drawing.count).toBe(0);
  });

  it('lets the player go on drawing after the picture was full', () => {
    const drawing = new Drawing(640, 300);
    for (let i = 0; i < MAX_MARKS; i += 1) expect(drawing.begin(at(i, 5), 'red', 8)).toBe(true);
    expect(drawing.begin(at(1, 1), 'red', 8)).toBe(false);
    expect(drawing.stamp('star', at(1, 1), 'red', 8)).toBe(false);
    expect(drawing.count).toBe(MAX_MARKS);
    drawing.undo();
    expect(drawing.begin(at(1, 1), 'red', 8)).toBe(true);
  });
});

describe('colours and sizes', () => {
  it('give each plain crayon its own colour, and the rainbow a colour that changes along the line', () => {
    const plain = INKS.filter((ink) => ink !== 'rainbow');
    expect(new Set(plain.map((ink) => inkAt(ink, 0))).size).toBe(plain.length);
    for (const ink of plain) expect(inkAt(ink, 0)).toBe(inkAt(ink, 999));
    expect(inkAt('rainbow', 0)).not.toBe(inkAt('rainbow', 140));
    expect(inkAt('rainbow', 0)).toBe(inkAt('rainbow', 420));
  });

  it('scale the pen and the stamps with the picture, and make the bold ones bigger', () => {
    expect(penWidth('bold', 720, 330)).toBeGreaterThan(penWidth('fine', 720, 330));
    expect(stampSize('bold', 720, 330)).toBeGreaterThan(stampSize('fine', 720, 330));
    expect(penWidth('fine', 720, 330)).toBe(penWidth('fine', 330, 720));
    expect(penWidth('fine', 1440, 660)).toBeCloseTo(penWidth('fine', 720, 330) * 2, 6);
    expect(penWidth('fine', 720, 330)).toBeGreaterThanOrEqual(4);
  });
});
