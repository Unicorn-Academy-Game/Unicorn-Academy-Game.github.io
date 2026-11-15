import { describe, expect, it } from 'vitest';
import { blend, turn, wheel } from '../../src/render/rainbow';

const channels = (colour: number): [number, number, number] => [
  (colour >> 16) & 255,
  (colour >> 8) & 255,
  colour & 255,
];

describe('the colour wheel', () => {
  it('goes round red, yellow, green, cyan, blue and magenta, sixty degrees apart, in the fullest colours', () => {
    expect([0, 60, 120, 180, 240, 300].map((degrees) => wheel(degrees, 0))).toEqual([
      0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff,
    ]);
  });

  it('lands between two colours halfway between their angles', () => {
    expect(channels(wheel(30, 0))).toEqual([255, 128, 0]);
    expect(channels(wheel(210, 0))).toEqual([0, 128, 255]);
  });

  it('comes back to where it began after a whole turn, and the same going backwards', () => {
    expect(wheel(360, 0)).toBe(wheel(0, 0));
    expect(wheel(-60, 0)).toBe(wheel(300, 0));
    expect(wheel(725, 0.2)).toBe(wheel(5, 0.2));
    expect(wheel(-355, 0.2)).toBe(wheel(5, 0.2));
  });

  it('mixes in the share of white it is given, up to all of it', () => {
    expect(wheel(0, 1)).toBe(0xffffff);
    expect(channels(wheel(0, 0.5))).toEqual([255, 128, 128]);
  });

  it('stays light the whole way round when it is given white, so a picture drawn in white never goes dark when it takes the colour', () => {
    for (let degrees = 0; degrees < 360; degrees += 3) {
      expect(Math.min(...channels(wheel(degrees, 0.4))), `${degrees} degrees`).toBeGreaterThanOrEqual(102);
      expect(Math.max(...channels(wheel(degrees, 0.4))), `${degrees} degrees`).toBe(255);
    }
  });

  it('never gives a number that is not a colour', () => {
    for (let degrees = -720; degrees <= 720; degrees += 11) {
      for (const soft of [0, 0.2, 0.62, 1]) {
        expect(wheel(degrees, soft)).toBeGreaterThanOrEqual(0);
        expect(wheel(degrees, soft)).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});

describe('going round the wheel with time', () => {
  it('goes once round in the period it is given, from where it starts', () => {
    expect(turn(0, 10)).toBe(0);
    expect(turn(2.5, 10)).toBe(90);
    expect(turn(5, 10)).toBe(180);
    expect(turn(10, 10)).toBe(0);
    expect(turn(12.5, 10)).toBe(90);
  });

  it('starts part of the way round when it is given a start, so two side by side are never the same colour', () => {
    expect(turn(0, 10, 0.5)).toBe(180);
    expect(turn(2.5, 10, 0.5)).toBe(270);
    expect(turn(5, 10, 0.5)).toBe(0);
  });

  it('is never a negative angle, and never a whole turn', () => {
    for (let seconds = -30; seconds <= 30; seconds += 0.7) {
      const degrees = turn(seconds, 7, 0.3);
      expect(degrees).toBeGreaterThanOrEqual(0);
      expect(degrees).toBeLessThan(360);
    }
    expect(turn(-2.5, 10)).toBe(270);
  });

  it('two that go at different speeds are in different places a moment later', () => {
    expect(turn(3, 7)).not.toBe(turn(3, 22));
  });
});

describe('blending two colours', () => {
  it('is the first at none of the way and the second at all of it', () => {
    expect(blend(0x102030, 0xf0e0d0, 0)).toBe(0x102030);
    expect(blend(0x102030, 0xf0e0d0, 1)).toBe(0xf0e0d0);
  });

  it('takes each of the three colours part of the way by itself', () => {
    expect(blend(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(blend(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(channels(blend(0x00ff00, 0xff0000, 0.25))).toEqual([64, 191, 0]);
  });

  it('is no further than the two ends, whatever it is asked', () => {
    expect(blend(0x336699, 0x99ccff, -3)).toBe(0x336699);
    expect(blend(0x336699, 0x99ccff, 7)).toBe(0x99ccff);
  });

  it('moves steadily from one to the other', () => {
    let last = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const [r] = channels(blend(0x000000, 0xff8000, t));
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });
});
