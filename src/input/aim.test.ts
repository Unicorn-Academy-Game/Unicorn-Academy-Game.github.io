import { describe, expect, it } from 'vitest';
import { AIM_START, AIM_STOP, Aim } from './aim';

const BODY = { x: 400, y: 300 };

describe('Aim', () => {
  it('leads her toward the finger, as a direction of length one', () => {
    const aim = new Aim();
    const h = aim.aim({ x: BODY.x + 300, y: BODY.y - 400 }, null, BODY)!;
    expect(h.x).toBeCloseTo(0.6, 6);
    expect(h.y).toBeCloseTo(-0.8, 6);
    expect(Math.hypot(h.x, h.y)).toBeCloseTo(1, 9);
  });

  it('does not care how far the finger is, only which way', () => {
    const aim = new Aim();
    const near = aim.aim({ x: BODY.x + AIM_START + 1, y: BODY.y }, null, BODY)!;
    const far = aim.aim({ x: BODY.x + 900, y: BODY.y }, null, BODY)!;
    expect(near).toEqual(far);
  });

  it('stands still while the finger is on her, and starts when it leaves her', () => {
    const aim = new Aim();
    expect(aim.aim({ x: BODY.x + AIM_START - 1, y: BODY.y }, null, BODY)).toBeNull();
    expect(aim.aim({ x: BODY.x + AIM_START, y: BODY.y }, null, BODY)).not.toBeNull();
  });

  it('keeps going until the finger is well inside, so a finger at the edge does not make her stutter', () => {
    const aim = new Aim();
    expect(aim.aim({ x: BODY.x + AIM_START + 5, y: BODY.y }, null, BODY)).not.toBeNull();
    // Between the two radii she keeps doing what she was doing.
    for (let d = AIM_START; d >= AIM_STOP; d -= 2)
      expect(aim.aim({ x: BODY.x + d, y: BODY.y }, null, BODY)).not.toBeNull();
    expect(aim.aim({ x: BODY.x + AIM_STOP - 1, y: BODY.y }, null, BODY)).toBeNull();
    // And she has to be led out to the start radius again before she goes.
    expect(aim.aim({ x: BODY.x + AIM_START - 1, y: BODY.y }, null, BODY)).toBeNull();
  });

  it('follows the finger round her body without ever stopping', () => {
    const aim = new Aim();
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const h = aim.aim({ x: BODY.x + Math.cos(a) * 120, y: BODY.y + Math.sin(a) * 120 }, null, BODY)!;
      expect(h.x).toBeCloseTo(Math.cos(a), 6);
      expect(h.y).toBeCloseTo(Math.sin(a), 6);
    }
  });

  it('leads with the keys when there is no finger, and the finger wins when there is one', () => {
    const aim = new Aim();
    expect(aim.aim(null, { x: 1, y: 0 }, BODY)).toEqual({ x: 1, y: 0 });
    expect(aim.aim(null, null, BODY)).toBeNull();
    expect(aim.aim({ x: BODY.x, y: BODY.y + 200 }, { x: 1, y: 0 }, BODY)).toEqual({ x: 0, y: 1 });
    // A finger on her stands her still, even with a key down.
    expect(new Aim().aim({ x: BODY.x + 3, y: BODY.y }, { x: 1, y: 0 }, BODY)).toBeNull();
  });

  it('forgets that she was following when the finger lifts or is reset', () => {
    const aim = new Aim();
    aim.aim({ x: BODY.x + 200, y: BODY.y }, null, BODY);
    aim.aim(null, null, BODY);
    // A finger that comes down in the middle zone is not following.
    expect(aim.aim({ x: BODY.x + (AIM_START + AIM_STOP) / 2, y: BODY.y }, null, BODY)).toBeNull();
    aim.aim({ x: BODY.x + 200, y: BODY.y }, null, BODY);
    aim.reset();
    expect(aim.aim({ x: BODY.x + (AIM_START + AIM_STOP) / 2, y: BODY.y }, null, BODY)).toBeNull();
  });
});
