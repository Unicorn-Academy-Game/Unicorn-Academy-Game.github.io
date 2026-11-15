import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ARCH, archPoint, bandOffset, HORN_TIPS, LANDING, WATER, waterPoint } from '../../src/content/fountain-horns';
import { CompiledMap } from '../../src/shared/compiled-map';
import { Manifest } from '../../src/shared/manifest';
import type { Rgba } from '../../tools/art/core/image';
import { FOUNTAIN, renderBasin } from '../../tools/art/world/fountain';
import { hornFromAnchor } from '../../tools/art/world/fountain-horns';
import { PAL } from '../../tools/art/world/palette';
import { renderStatue } from '../../tools/art/world/statue';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const garden = CompiledMap.parse(
  JSON.parse(readFileSync(`public/assets/${manifest.maps['palace-garden']!.file}`, 'utf8')),
);

const STATUES = [
  { sprite: 'fountain-statue-east', facing: 'east', side: 'left' },
  { sprite: 'fountain-statue-west', facing: 'west', side: 'right' },
] as const;

const placed = (sprite: string) => garden.render.decor.find((d) => d.sprite === sprite)!;

/**
 * Where a statue's horn tip is in the world: the art's tip, from the anchor the map puts the statue
 * at.
 */
const worldTip = (s: (typeof STATUES)[number]): { x: number; y: number } => {
  const at = placed(s.sprite);
  const tip = hornFromAnchor(s.facing);
  return { x: at.x + tip.x, y: at.y + tip.y };
};

describe('the horns of the two fountain statues', () => {
  it('stand at the world points the rainbow is built on, as the art and the map put them', () => {
    expect(worldTip(STATUES[0])).toEqual({ x: 2168, y: 1400 });
    expect(worldTip(STATUES[1])).toEqual({ x: 2632, y: 1400 });
  });

  it('are the tips the content gives, measured from the host the map puts between them', () => {
    const [left, right] = [worldTip(STATUES[0]), worldTip(STATUES[1])];
    const hosts = garden.logic.interactables.filter((i) => i.definitionId === 'fountain-rainbow');
    expect(hosts.length, 'the garden has hosts for the pieces of the rainbow').toBeGreaterThan(0);
    expect(new Set(hosts.map((h) => `${h.pos.x},${h.pos.y}`)).size, 'and they all stand in one place').toBe(1);
    const host = hosts[0]!.pos;
    expect(host).toEqual({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 });
    expect(host).toEqual({ x: 2400, y: 1400 });
    expect({ x: left.x - host.x, y: left.y - host.y }).toEqual(HORN_TIPS.left);
    expect({ x: right.x - host.x, y: right.y - host.y }).toEqual(HORN_TIPS.right);
  });

  describe('as drawn', () => {
    const pictures: Record<string, Rgba> = {};
    beforeAll(() => {
      for (const s of STATUES) pictures[s.facing] = renderStatue(s.facing);
    }, 180_000);

    it('end where the picture of the statue ends: a painted pixel at the tip and nothing painted higher beside it', () => {
      for (const s of STATUES) {
        const img = pictures[s.facing]!;
        const tip = hornFromAnchor(s.facing);
        // The sprite's ground anchor is (140, 222) on its canvas.
        const [tx, ty] = [140 + tip.x, 222 + tip.y];
        const painted = (x: number, y: number): boolean => img.data[(y * img.width + x) * 4 + 3]! > 0;
        let near = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near ||= painted(tx + dx, ty + dy);
        expect(near, `${s.facing}: nothing is painted at its tip (${tx}, ${ty})`).toBe(true);
        for (let x = tx - 3; x <= tx + 3; x++)
          for (let y = 0; y < ty - 1; y++)
            expect(painted(x, y), `${s.facing}: paint at (${x}, ${y}) is higher than its tip (${tx}, ${ty})`).toBe(
              false,
            );
      }
    });
  });
});

describe('the water of the basin', () => {
  const TILT = (27 * Math.PI) / 180;
  const basin = placed('fountain-basin');
  const host = { x: 2400, y: 1400 };

  it('is the water the basin is drawn with, as the map places the basin', () => {
    expect(WATER.rx).toBe(FOUNTAIN.waterR);
    expect(WATER.ry).toBe(Math.round(FOUNTAIN.waterR * Math.sin(TILT)));
    expect({ x: basin.x - host.x, y: basin.y - host.y - Math.round(FOUNTAIN.waterZ * Math.cos(TILT)) }).toEqual({
      x: WATER.x,
      y: WATER.y,
    });
  });

  it("is water in the basin's picture at every place the glitter comes down on", () => {
    const picture = renderBasin().rgba;
    const colors = new Set(PAL.water.map((c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])));
    const notWater: string[] = [];
    const [a0, a1] = LANDING.angle;
    const [s0, s1] = LANDING.share;
    for (let i = 0; i <= 24; i++) {
      for (let j = 0; j <= 6; j++) {
        const p = waterPoint(a0 + ((a1 - a0) * i) / 24, s0 + ((s1 - s0) * j) / 6);
        // The picture has the basin's anchor at (210, 218).
        const x = Math.floor(210 + host.x + p.x - basin.x);
        const y = Math.floor(218 + host.y + p.y - basin.y);
        const at = (y * picture.width + x) * 4;
        const color = (picture.data[at]! << 16) | (picture.data[at + 1]! << 8) | picture.data[at + 2]!;
        if (picture.data[at + 3] !== 255 || !colors.has(color)) notWater.push(`(${x}, ${y}) at ${i}, ${j}`);
      }
    }
    expect(notWater.slice(0, 5)).toEqual([]);
  });
});

describe('the arch', () => {
  it('stands on the two horn tips and peaks between them', () => {
    const start = archPoint(0);
    expect(start.x).toBeCloseTo(HORN_TIPS.left.x, 9);
    expect(start.y).toBeCloseTo(HORN_TIPS.left.y, 9);
    const end = archPoint(1);
    expect(end.x).toBeCloseTo(HORN_TIPS.right.x, 9);
    expect(end.y).toBeCloseTo(HORN_TIPS.right.y, 9);
    const top = archPoint(0.5);
    expect(top.x).toBeCloseTo(0, 9);
    expect(top.y).toBeCloseTo(-ARCH.rise, 9);
  });

  it('is the same on both sides of the middle, and rises all the way to it', () => {
    let last = 0;
    for (let i = 0; i <= 20; i++) {
      const along = i / 20;
      const a = archPoint(along);
      const b = archPoint(1 - along);
      expect(a.x).toBeCloseTo(-b.x, 9);
      expect(a.y).toBeCloseTo(b.y, 9);
      if (along <= 0.5) {
        expect(-a.y).toBeGreaterThanOrEqual(last - 1e-9);
        last = -a.y;
      }
    }
  });

  it('puts a point out from the bands where the normal says: straight up at the top and straight out at a horn', () => {
    expect(archPoint(0.5, 10).y).toBeCloseTo(-ARCH.rise - 10, 9);
    expect(archPoint(0.5, 10).x).toBeCloseTo(0, 9);
    expect(archPoint(0, 10).x).toBeCloseTo(HORN_TIPS.left.x - 10, 9);
    expect(archPoint(1, -10).x).toBeCloseTo(HORN_TIPS.right.x - 10, 9);
  });

  it('has seven bands of the same thickness side by side, outermost first', () => {
    expect(ARCH.bands).toBe(7);
    const offsets = Array.from({ length: ARCH.bands }, (_, i) => bandOffset(i));
    expect(offsets[3]).toBe(0);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i - 1]! - offsets[i]!).toBe(ARCH.band);
  });

  it('tops out about 185 units over the horn line and leaves room under it for the jet of the fountain', () => {
    const outerTop = ARCH.rise + (ARCH.bands * ARCH.band) / 2;
    const innerTop = ARCH.rise - (ARCH.bands * ARCH.band) / 2;
    // The horn line is at y 1400 in the garden, the arch's outer edge reaches about y 1215, and the
    // jet's plume tops out at about y 1311.
    expect(1400 - outerTop).toBeGreaterThanOrEqual(1210);
    expect(1400 - outerTop).toBeLessThanOrEqual(1220);
    expect(1400 - innerTop).toBeLessThan(1311 - 24);
  });
});
