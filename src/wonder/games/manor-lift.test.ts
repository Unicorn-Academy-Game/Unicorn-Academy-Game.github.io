import { describe, expect, it } from 'vitest';
import { Rng } from '../../domain/rng';
import { MAP_IDS } from '../../shared/ids';
import { viewOf } from '../engine/painter';
import { SILENT } from '../sound';
import type { WonderEnv } from '../wonder';
import { CLIMB_SECONDS, type Direction, FLOORS, ManorLift, SHUT_SECONDS } from './manor-lift';

const env = (look: Direction): WonderEnv => ({
  bank: null,
  rng: new Rng(11),
  calm: false,
  look,
  herd: [],
  sound: SILENT,
  from: { x: 0.5, y: 0.5 },
  onStar: () => undefined,
  onFinale: () => undefined,
  onAfter: () => undefined,
});

/**
 * Rides the lift on its own clock, from the doors shutting to the doors open, and lists the lamps
 * in the order they were lit.
 */
function lamps(direction: Direction): string[] {
  const lift = new ManorLift(env(direction), direction);
  lift.layout(viewOf(863, 360));
  lift.celebrate();
  const lit: string[] = [];
  for (let t = 0; t < SHUT_SECONDS + CLIMB_SECONDS + 2; t += 0.05) {
    lift.update(0.05);
    const { floor } = lift.inspect();
    if (lit.at(-1) !== floor) lit.push(floor);
  }
  return lit;
}

describe('the golden lift', () => {
  it('goes up from the ground to the floor above it, and stops there', () => {
    expect(lamps('up')).toEqual(['G', '1']);
  });

  it('comes down from that floor to the ground, with no other floor on the way', () => {
    expect(lamps('down')).toEqual(['1', 'G']);
  });

  it('has a lamp for each floor of the manor and none for a floor that is not there', () => {
    const floors = MAP_IDS.filter((id) => id.startsWith('manor-'));
    expect(floors, 'the hall and the sky garden').toEqual(['manor-hall', 'manor-upper']);
    expect(FLOORS).toHaveLength(floors.length);
  });
});
