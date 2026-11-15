import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../content/props';
import type { World } from '../domain';
import type { CrownAsset, CrownRef } from '../shared/manifest';
import { crownOn, type Seating, seated, seatOf } from './actor-view';

describe('how she is drawn as she sits down', () => {
  const ANCHOR = 156;
  const FEET = 380;
  const SEAT: Seating = { edge: 341, rise: 22 };
  /** The world y of the line she is drawn above. */
  const cutAt = (settled: number, feet = FEET, seat = SEAT): number => {
    const { lift, rows } = seated(settled, feet, seat, ANCHOR);
    return feet - lift - (ANCHOR - rows);
  };

  it('is all of her, where she stands, while she stands', () => {
    expect(seated(0, FEET, SEAT, ANCHOR)).toEqual({ lift: 0, rows: ANCHOR });
  });

  it('ends carried up onto the seat and drawn down to its front edge and no lower', () => {
    expect(seated(1, FEET, SEAT, ANCHOR).lift).toBe(SEAT.rise);
    expect(cutAt(1)).toBeCloseTo(SEAT.edge, 9);
  });

  it('begins with the line at her feet and brings it up to the seat in one sweep', () => {
    expect(cutAt(0)).toBe(FEET);
    let last = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const cut = cutAt(t);
      expect(cut).toBeLessThanOrEqual(last);
      last = cut;
    }
  });

  it('carries her up and takes her legs, and never gives either back on the way down', () => {
    let lift = -Infinity;
    let rows = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const now = seated(t, FEET, SEAT, ANCHOR);
      expect(now.lift).toBeGreaterThanOrEqual(lift);
      expect(now.rows).toBeLessThanOrEqual(rows);
      lift = now.lift;
      rows = now.rows;
    }
  });

  it('settles gently, at both ends', () => {
    const whole = SEAT.rise;
    expect(seated(0.1, FEET, SEAT, ANCHOR).lift).toBeLessThan(whole * 0.1);
    expect(seated(0.9, FEET, SEAT, ANCHOR).lift).toBeGreaterThan(whole * 0.9);
  });

  it('takes nothing of her when the seat is lower than her feet, and never more than she has', () => {
    expect(seated(1, FEET, { edge: FEET + 20, rise: 0 }, ANCHOR).rows).toBe(ANCHOR);
    expect(seated(1, FEET, { edge: FEET - 500, rise: 0 }, ANCHOR).rows).toBe(0);
    expect(seated(5, FEET, SEAT, ANCHOR)).toEqual(seated(1, FEET, SEAT, ANCHOR));
    expect(seated(-1, FEET, SEAT, ANCHOR)).toEqual(seated(0, FEET, SEAT, ANCHOR));
  });

  it('shows her head and chest when she is sat in the throne, which is what makes it a seat and not a hiding place', () => {
    const throne = PROP_DEFS.throne!.seat!;
    const edge = 344 - throne.edge;
    const { rows } = seated(1, 380, { edge, rise: throne.rise }, ANCHOR);
    // The picture of her facing the room runs from row 68 to the ground at row 156. She is drawn
    // from the top down to `rows`.
    expect(rows - 68).toBeGreaterThan(55);
  });
});

describe('the seat she is drawn in', () => {
  const throne = { instanceId: 'hall/throne', definitionId: 'throne', pos: { x: 1280, y: 344 } };
  const harp = { instanceId: 'hall/harp', definitionId: 'harp', pos: { x: 900, y: 400 } };
  const bed = { instanceId: 'room/nap-bed-1', definitionId: 'nap-bed', pos: { x: 700, y: 720 } };
  const worldWith = (seat: string | null): World =>
    ({
      leader: { seat },
      interactables: new Map([throne, harp, bed].map((i) => [i.instanceId, i])),
    }) as unknown as World;

  it('has its front edge a little above the ground point of the throne, and lifts her by the height of its seat', () => {
    const def = PROP_DEFS.throne!.seat!;
    expect(seatOf(worldWith('hall/throne'))).toEqual({ edge: 344 - def.edge, rise: def.rise });
  });

  it('says she lies down to sleep when the seat is a bed, and not when it is a throne', () => {
    const def = PROP_DEFS['nap-bed']!.seat!;
    expect(seatOf(worldWith('room/nap-bed-1'))).toEqual({ edge: 720 - def.edge, rise: def.rise, asleep: true });
    expect(seatOf(worldWith('hall/throne'))!.asleep).toBeUndefined();
  });

  it('is none when she is not in one, or is in something that is not a seat', () => {
    expect(seatOf(worldWith(null))).toBeNull();
    expect(seatOf(worldWith('hall/harp'))).toBeNull();
    expect(seatOf(worldWith('hall/gone'))).toBeNull();
  });
});

describe('where her crown is laid', () => {
  const crown: CrownAsset = {
    atlas: {
      file: 'c.png',
      width: 64,
      height: 64,
      rects: [{ x: 0, y: 0, w: 20, h: 20, ox: 0, oy: 0, sw: 40, sh: 36 }],
    },
    origin: [20, 26],
    views: Array.from({ length: 32 }, (_, facing) => 100 + facing),
  };
  const ref: CrownRef = { at: [146.5, 70.4], tilt: 0.66, view: 3 };
  const ORIGIN = [96, 156] as const;

  it('stands on the point of her head that the picture names, wherever she is drawn', () => {
    expect(crownOn(ref, crown, ORIGIN, 1000, 500)).toMatchObject({ x: 1000 + 146.5 - 96, y: 500 + 70.4 - 156 });
    expect(crownOn(ref, crown, ORIGIN, 0, 0)).toMatchObject({ x: 50.5, y: -85.6 });
  });

  it('leans as far as the picture says, and is the view of the facing the picture is drawn for', () => {
    const at = crownOn(ref, crown, ORIGIN, 0, 0);
    expect(at.rotation).toBe(0.66);
    expect(at.frame).toBe('103');
  });

  it('is turned over only when the picture says it is', () => {
    expect(crownOn(ref, crown, ORIGIN, 0, 0).flip).toBe(false);
    expect(crownOn({ ...ref, flip: true }, crown, ORIGIN, 0, 0).flip).toBe(true);
  });

  it('goes up with her when a seat carries her up', () => {
    const standing = crownOn(ref, crown, ORIGIN, 600, 800);
    const sleeping = crownOn(ref, crown, ORIGIN, 600, 800 - 64);
    expect(standing.y - sleeping.y).toBe(64);
    expect(sleeping.x).toBe(standing.x);
  });
});
