import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/domain/rng';
import { ARRIVALS, Guests } from '../../src/wonder/games/party/guests';
import { planOf } from '../../src/wonder/games/party/layout';

const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as {
  bundles: { life: { sprites: Record<string, unknown> } };
};

describe('the guests at the party', () => {
  it('are drawn from sprites the life bundle has, whatever they are doing', () => {
    const names = Object.keys(manifest.bundles.life.sprites);
    const guests = new Guests(new Rng(3));
    guests.place(planOf(863, 360));
    guests.ensure(ARRIVALS.length, 0);
    for (const g of guests.list) {
      for (const now of [0, 0.5, 1.5, 3, 7.3, 20]) {
        for (const beat of [0, 1, 2, 3]) guests.onBeat(beat, now);
        expect(names, `${g.kind} ${g.tone} at ${now}`).toContain(guests.pose(g, now).sprite);
        expect(names, `${g.kind} ${g.tone} marching at ${now}`).toContain(guests.pose(g, now, true).sprite);
      }
      guests.cheer(400, 1, 5);
      expect(names).toContain(guests.pose(g, 5.2).sprite);
    }
  });
});
