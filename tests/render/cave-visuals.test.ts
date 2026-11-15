import { describe, expect, it } from 'vitest';
import { POOL } from '../../src/content/cave';
import { MAGIC_COLOR, MAGICS, reactionOf } from '../../src/content/magic';
import { GEM_IDS, PRODUCE, PRODUCE_IDS } from '../../src/content/produce';
import { clusterOf, PROP_DEFS } from '../../src/content/props';
import {
  doorwayOf,
  drawProp,
  GLOW_ACROSS,
  type Layer,
  type Moment,
  type Picture,
  type PropFacts,
  swellOf,
  variantOf,
} from '../../src/render/prop-visuals';
import { RECIPES } from '../../tools/assets/env/registry';

const facts = (definitionId: string, extra: Partial<PropFacts> = {}): PropFacts => ({
  definitionId,
  instanceId: `crystal-cave/${definitionId}-1`,
  look: undefined,
  state: undefined,
  moment: undefined,
  ...extra,
});
const moment = (kind: string, seconds: number, total: number): Moment => ({ kind, seconds, total });
const channels = (colour: number): [number, number, number] => [
  (colour >> 16) & 255,
  (colour >> 8) & 255,
  colour & 255,
];
/** The glow laid on the floor behind a picture, or nothing. */
const glowOf = (p: Picture): Layer | null => p.under ?? null;
const alphaOf = (layer: Layer | null | undefined): number => layer?.alpha ?? 0;

describe('how a reaction of the cave comes and goes', () => {
  it('is not there at the start or at the end, and is there in full across the middle', () => {
    for (const total of [2.4, 4, 7, 9]) {
      expect(swellOf(0, total), `${total}`).toBe(0);
      expect(swellOf(total, total), `${total}`).toBe(0);
      expect(swellOf(total / 2, total), `${total}`).toBe(1);
    }
  });

  it('comes up in half a second and fades over a second and a bit, so it never blinks on or off', () => {
    expect(swellOf(0.5, 7)).toBe(1);
    expect(swellOf(7 - 1.2, 7)).toBe(1);
    expect(swellOf(7 - 0.6, 7)).toBeCloseTo(0.5, 6);
    for (const total of [2.4, 4, 7, 9]) {
      let last = swellOf(0, total);
      for (let t = 0.05; t <= total + 1e-9; t += 0.05) {
        const now = swellOf(t, total);
        expect(now).toBeGreaterThanOrEqual(0);
        expect(now).toBeLessThanOrEqual(1);
        expect(Math.abs(now - last), `${total} at ${t.toFixed(2)}`).toBeLessThan(0.16);
        last = now;
      }
    }
  });

  it('swings the hut door open, holds it, and swings it shut', () => {
    expect(doorwayOf(0, 3)).toBe(0);
    expect(doorwayOf(0.7, 3)).toBe(1);
    expect(doorwayOf(1.5, 3)).toBe(1);
    expect(doorwayOf(2.3, 3)).toBe(1);
    expect(doorwayOf(3, 3)).toBe(0);
    let last = 0;
    for (let t = 0; t <= 0.7; t += 0.05) {
      expect(doorwayOf(t, 3)).toBeGreaterThanOrEqual(last);
      last = doorwayOf(t, 3);
    }
  });
});

describe('the glow that lies behind what shines', () => {
  it('is drawn as wide as the picture that is made for it, so the size asked for is the size seen', () => {
    const recipe = RECIPES.find((r) => r.id === 'cc-halo')!;
    expect(recipe.canvas.w).toBe(GLOW_ACROSS);
    expect(recipe.canvas.h).toBe(GLOW_ACROSS);
  });

  it('adds its light to the floor, and lies on the floor under everything that stands', () => {
    for (const id of [
      'heart-crystal',
      'storm-pillar',
      'crystal-ball',
      'cave-chimes',
      'ruby-cluster',
      'rainbow-cluster',
    ]) {
      const glow = glowOf(drawProp(facts(id, { now: 1 })));
      expect(glow, id).not.toBeNull();
      expect(glow!.glow, id).toBe(true);
      expect(glow!.sprite, id).toBe('cc-halo');
      expect(glow!.tint, id).toBeDefined();
    }
  });
});

describe('the Heart Crystal', () => {
  const heart = (extra: Partial<PropFacts> = {}) => drawProp(facts('heart-crystal', extra));

  it('goes slowly round every colour of the rainbow, with its glow the colour of the crystal', () => {
    const tints = [0, 3.5, 7, 10.5].map((now) => heart({ now }).overlay!.tint!);
    expect(new Set(tints).size).toBe(4);
    for (const now of [0, 3.5, 7]) expect(glowOf(heart({ now }))!.tint).toBe(heart({ now }).overlay!.tint);
  });

  it("takes the colour of whichever friend's magic reaches it, in full, and each friend has a colour of her own", () => {
    const seen = new Set<number>();
    for (const magic of MAGICS) {
      const reacting = heart({ now: 5, moment: moment(reactionOf('heart', magic), 3.5, 7) });
      expect(reacting.overlay!.tint, magic).toBe(MAGIC_COLOR[magic]);
      expect(glowOf(reacting)!.tint, magic).toBe(MAGIC_COLOR[magic]);
      seen.add(reacting.overlay!.tint!);
    }
    expect(seen.size).toBe(MAGICS.length);
  });

  it('flares while it reacts, and goes back to the rainbow from where it was when the reaction is over', () => {
    const resting = heart({ now: 5 });
    const reacting = heart({ now: 5, moment: moment(reactionOf('heart', 'fire'), 3.5, 7) });
    expect(alphaOf(glowOf(reacting))).toBeGreaterThan(alphaOf(glowOf(resting)));
    expect(glowOf(reacting)!.scale!).toBeGreaterThan(glowOf(resting)!.scale!);
    const over = heart({ now: 5, moment: moment(reactionOf('heart', 'fire'), 7, 7) });
    expect(over.overlay!.tint).toBe(resting.overlay!.tint);
    expect(alphaOf(glowOf(over))).toBeCloseTo(alphaOf(glowOf(resting)), 6);
  });

  it('eases into her colour from the rainbow and out again, without a jump', () => {
    const at = (s: number) => heart({ now: 5, moment: moment(reactionOf('heart', 'ice'), s, 7) }).overlay!.tint!;
    const [r0, g0, b0] = channels(at(0));
    const [r1, g1, b1] = channels(at(0.25));
    const [r2, g2, b2] = channels(at(0.5));
    const toward = (a: number, b: number, c: number): boolean => (a <= b && b <= c) || (a >= b && b >= c);
    expect(toward(r0, r1, r2) && toward(g0, g1, g2) && toward(b0, b1, b2)).toBe(true);
    expect(at(0)).toBe(heart({ now: 5 }).overlay!.tint);
    expect(at(0.5)).toBe(MAGIC_COLOR.ice);
  });

  it('is not changed by what is cast at something else', () => {
    const resting = heart({ now: 5 }).overlay!.tint;
    for (const kind of ['wake-fire', 'charge-pillar', 'freeze-pool', 'delight'])
      expect(heart({ now: 5, moment: moment(kind, 3, 7) }).overlay!.tint, kind).toBe(resting);
  });
});

describe('the crystals that sleep', () => {
  const sleepers = (extra: Partial<PropFacts> = {}) => drawProp(facts('sleeping-crystals', extra));
  const look = (instanceId: string): number => variantOf(instanceId, 2) + 1;

  it('lie grey and dim, with one point of light that blinks, and no glow', () => {
    for (const instanceId of [
      'crystal-cave/sleepers-1',
      'crystal-cave/sleepers-2',
      'crystal-cave/sleepers-3',
      'crystal-cave/sleepers-4',
    ]) {
      const asleep = sleepers({ instanceId });
      expect(asleep.body, instanceId).toMatchObject({ sprite: `cc-sleep-${look(instanceId)}`, show: { kind: 'loop' } });
      expect(asleep.overlay, instanceId).toBeNull();
      expect(glowOf(asleep), instanceId).toBeNull();
    }
    expect(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => look(`crystal-cave/sleepers-${n}`))).size,
      'both looks are used',
    ).toBe(2);
  });

  it('wake in the colour of the magic that reached them, with a glow of the same colour, and keep the same look', () => {
    for (const magic of MAGICS) {
      const instanceId = 'crystal-cave/sleepers-7';
      const woken = sleepers({ instanceId, moment: moment(reactionOf('wake', magic), 4, 8) });
      expect(woken.overlay, magic).toMatchObject({
        sprite: `cc-awake-${look(instanceId)}`,
        tint: MAGIC_COLOR[magic],
        alpha: 1,
      });
      expect(glowOf(woken)!.tint, magic).toBe(MAGIC_COLOR[magic]);
      expect(alphaOf(glowOf(woken)), magic).toBeGreaterThan(0.5);
      expect(woken.body!.sprite, magic).toBe(`cc-sleep-${look(instanceId)}`);
    }
  });

  it('wake gently and fall asleep again gently, and are asleep once more at the end', () => {
    const at = (s: number) => alphaOf(sleepers({ moment: moment(reactionOf('wake', 'light'), s, 8) }).overlay);
    expect(at(0)).toBe(0);
    expect(at(0.1)).toBeGreaterThan(0);
    expect(at(0.1)).toBeLessThan(at(0.5));
    expect(at(4)).toBe(1);
    expect(at(7.6)).toBeLessThan(at(6.8));
    const over = sleepers({ moment: moment(reactionOf('wake', 'light'), 8, 8) });
    expect(over.overlay).toBeNull();
    expect(glowOf(over)).toBeNull();
  });

  it('are not woken by what is cast at something else', () => {
    for (const kind of ['heart-fire', 'charge-pillar', 'delight'])
      expect(sleepers({ moment: moment(kind, 3, 8) }).overlay, kind).toBeNull();
  });
});

describe('the pillars that wait for the storm', () => {
  const pillar = (extra: Partial<PropFacts> = {}) => drawProp(facts('storm-pillar', extra));

  it('glow a pale colour that drifts, and no two of the four are the same colour at once', () => {
    const tints = [1, 2, 3, 4].map((n) => pillar({ instanceId: `crystal-cave/pillar-${n}`, now: 2 }).overlay!.tint!);
    expect(new Set(tints).size).toBe(4);
    expect(pillar({ now: 0 }).overlay!.tint).not.toBe(pillar({ now: 6 }).overlay!.tint);
  });

  it('are charged by lightning: they turn bright, glow wider and flicker, and then go back to how they were', () => {
    for (const now of [0, 0.013, 0.05, 0.4, 1.7]) {
      const resting = pillar({ now });
      const charged = pillar({ now, moment: moment('charge-pillar', 3.5, 7) });
      expect(alphaOf(glowOf(charged)), `${now}`).toBeGreaterThan(alphaOf(glowOf(resting)) + 0.3);
      expect(glowOf(charged)!.scale!, `${now}`).toBeGreaterThan(glowOf(resting)!.scale!);
      expect(charged.overlay!.tint, `${now}`).not.toBe(resting.overlay!.tint);
    }
    const resting = pillar({ now: 3 });
    const over = pillar({ now: 3, moment: moment('charge-pillar', 7, 7) });
    expect(over.overlay!.tint).toBe(resting.overlay!.tint);
    expect(alphaOf(glowOf(over))).toBeCloseTo(alphaOf(glowOf(resting)), 6);
  });

  it('never go dark while the storm is in them', () => {
    for (let s = 0; s <= 7; s += 0.1) {
      const [r, g, b] = channels(pillar({ now: s, moment: moment('charge-pillar', s, 7) }).overlay!.tint!);
      expect(Math.min(r, g, b), `${s.toFixed(1)}`).toBeGreaterThan(90);
    }
  });
});

describe('the pool', () => {
  const pool = (extra: Partial<PropFacts> = {}) => drawProp(facts('glow-pool', extra));

  it('is tiles, so nothing is drawn for it while the water is free', () => {
    const calm = pool();
    expect(calm.body).toBeNull();
    expect(calm.overlay).toBeNull();
    expect(glowOf(calm)).toBeNull();
  });

  it('has a sheet of ice laid over it from its south shore to its middle while the cold is on it, and it melts away', () => {
    const frozen = pool({ moment: moment('freeze-pool', 4.5, 9) });
    expect(glowOf(frozen)).toMatchObject({ sprite: 'cc-pool-ice', dy: -POOL.pointRise });
    expect(alphaOf(glowOf(frozen))).toBeGreaterThan(0.9);
    expect(frozen.body).toBeNull();
    expect(alphaOf(glowOf(pool({ moment: moment('freeze-pool', 0, 9) })))).toBe(0);
    expect(alphaOf(glowOf(pool({ moment: moment('freeze-pool', 9, 9) })))).toBe(0);
    expect(alphaOf(glowOf(pool({ moment: moment('freeze-pool', 8.4, 9) })))).toBeLessThan(
      alphaOf(glowOf(pool({ moment: moment('freeze-pool', 7.4, 9) }))),
    );
  });

  it('is only rippled by the water spell, which is all spray and nothing the picture has to add', () => {
    const rippling = pool({ moment: moment('ripple-pool', 2, 4) });
    expect(rippling.body).toBeNull();
    expect(rippling.overlay).toBeNull();
    expect(glowOf(rippling)).toBeNull();
  });
});

describe('the door of the hut', () => {
  const doorOf = (extra: Partial<PropFacts> = {}) => drawProp(facts('hut-door', extra));
  const share = (p: Picture): number => {
    const show = p.overlay!.show;
    if (show.kind !== 'fraction') throw new Error('the door is drawn to a share of its swing');
    return show.at;
  };

  it('is shut at rest, and the hut leaves the doorway for it', () => {
    const shut = doorOf();
    expect(shut.body).toBeNull();
    expect(shut.overlay).toMatchObject({ sprite: 'cc-hut-door' });
    expect(share(shut)).toBe(0);
    expect(glowOf(shut)).toBeNull();
  });

  it('swings open when she touches it, stays open a moment and swings shut', () => {
    const total = PROP_DEFS['hut-door']!.delight!.seconds;
    expect(share(doorOf({ moment: moment('delight', 0, total) }))).toBe(0);
    expect(share(doorOf({ moment: moment('delight', 0.35, total) }))).toBeGreaterThan(0.1);
    expect(share(doorOf({ moment: moment('delight', 0.35, total) }))).toBeLessThan(0.9);
    expect(share(doorOf({ moment: moment('delight', total / 2, total) }))).toBe(1);
    expect(share(doorOf({ moment: moment('delight', total, total) }))).toBe(0);
  });

  it('lights the floor in front of it while it is open, because she stands in front of it and hides the doorway', () => {
    const total = PROP_DEFS['hut-door']!.delight!.seconds;
    const open = doorOf({ moment: moment('delight', total / 2, total) });
    const light = glowOf(open)!;
    expect(light).toMatchObject({ sprite: 'cc-halo', glow: true });
    expect(light.dy!, 'in front of the door, not behind the hut').toBeGreaterThan(0);
    expect(alphaOf(light)).toBeGreaterThan(0.5);
    const [r, g, b] = channels(light.tint!);
    expect(g).toBe(255);
    expect(r).toBeGreaterThan(b);
    expect(glowOf(doorOf({ moment: moment('delight', total, total) }))).toBeNull();
  });

  it('is only opened by a touch', () => {
    for (const kind of ['freeze-pool', 'stoke-cauldron', 'door-opening'])
      expect(share(doorOf({ moment: moment(kind, 1.5, 3) })), kind).toBe(0);
  });
});

describe('the crystal ball, the chimes and the cauldron', () => {
  it('has a ball that goes through the colours, and goes through them faster while she touches it, and is back where it was after', () => {
    const ball = (extra: Partial<PropFacts> = {}) => drawProp(facts('crystal-ball', extra));
    expect(ball({ now: 0 }).overlay!.tint).not.toBe(ball({ now: 3 }).overlay!.tint);
    const resting = ball({ now: 5 });
    expect(ball({ now: 5, moment: moment('delight', 0.6, 2.4) }).overlay!.tint).not.toBe(resting.overlay!.tint);
    expect(ball({ now: 5, moment: moment('delight', 2.4, 2.4) }).overlay!.tint).toBe(resting.overlay!.tint);
    expect(alphaOf(glowOf(ball({ now: 5, moment: moment('delight', 1.2, 2.4) })))).toBeGreaterThan(
      alphaOf(glowOf(resting)),
    );
  });

  it('has chimes that hang still, and hop and light up when she touches them or the storm does', () => {
    const chimes = (extra: Partial<PropFacts> = {}) => drawProp(facts('cave-chimes', extra));
    const resting = chimes({ now: 2 });
    expect(resting.body!.dy ?? 0).toBe(0);
    for (const kind of ['delight', 'ring-chimes']) {
      const ringing = chimes({ now: 2, moment: moment(kind, 0.6, 2.4) });
      expect(ringing.body!.dy!, kind).toBeLessThan(0);
      expect(alphaOf(glowOf(ringing)), kind).toBeGreaterThan(alphaOf(glowOf(resting)));
    }
    expect(chimes({ now: 2, moment: moment('ring-chimes', 2.4, 2.4) }).body!.dy ?? 0).toBeCloseTo(0, 6);
  });

  it('has a cauldron that bubbles all the time, and bubbles faster in a red-gold light when the fire stokes it', () => {
    const cauldron = (extra: Partial<PropFacts> = {}) => drawProp(facts('witch-cauldron', extra));
    expect(cauldron().body).toMatchObject({ sprite: 'cc-cauldron', show: { kind: 'loop' } });
    expect(glowOf(cauldron())).toBeNull();
    const stoked = cauldron({ now: 1, moment: moment('stoke-cauldron', 3, 6) });
    expect(stoked.body).toMatchObject({ sprite: 'cc-cauldron', show: { kind: 'time' } });
    const [r, g, b] = channels(glowOf(stoked)!.tint!);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(alphaOf(glowOf(stoked))).toBeGreaterThan(0.5);
    expect(glowOf(cauldron({ moment: moment('stoke-cauldron', 6, 6) }))!.alpha).toBe(0);
  });
});

describe('the beds', () => {
  const bed = (look: string | undefined, state?: 'leafy' | 'flowering') =>
    drawProp(facts('cave-bed', { look, state: state ? { kind: 'flowerbed', state } : undefined })).body!;

  it("are leafy until nature's magic opens the flowers, in the shape they were made in", () => {
    for (const look of PROP_DEFS['cave-bed']!.looks!) {
      expect(bed(look).sprite).toBe(`cc-bed-leafy-${look}`);
      expect(bed(look, 'leafy').sprite).toBe(`cc-bed-leafy-${look}`);
      expect(bed(look, 'flowering')).toMatchObject({ sprite: `cc-bed-flowering-${look}`, show: { kind: 'loop' } });
    }
    expect(bed(undefined).sprite).toBe('cc-bed-leafy-long');
  });
});

describe('the clusters of gems', () => {
  it("has a picture for every gem, a faint glow of the gem's own colour round its foot, and nothing laid over it", () => {
    for (const gem of GEM_IDS.filter((g) => g !== 'rainbow')) {
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const instanceId = `crystal-cave/${gem}-cluster-${n}`;
        const picture = drawProp(facts(clusterOf(gem), { instanceId }));
        expect(picture.body, instanceId).toMatchObject({
          sprite: `cc-${gem}-${variantOf(instanceId, 2) + 1}`,
          show: { kind: 'frame', index: 0 },
        });
        expect(picture.overlay, instanceId).toBeNull();
        expect(glowOf(picture)!.tint, instanceId).toBe(PRODUCE[gem].tint);
      }
    }
  });

  it('shows both of the two looks of a gem, so the two clusters of it are not twins', () => {
    for (const gem of GEM_IDS.filter((g) => g !== 'rainbow')) {
      const seen = new Set<string>();
      for (let n = 1; n <= 12; n++)
        seen.add(drawProp(facts(clusterOf(gem), { instanceId: `crystal-cave/${gem}-cluster-${n}` })).body!.sprite);
      expect(seen.size, gem).toBe(2);
    }
  });

  it('has a rainbow cluster that is alive with colour, and a glow that goes through them all', () => {
    const rainbow = (now: number, n = 1) =>
      drawProp(facts(clusterOf('rainbow'), { instanceId: `crystal-cave/rainbow-cluster-${n}`, now }));
    expect(rainbow(0).body).toMatchObject({ sprite: 'cc-rainbow-1', show: { kind: 'loop' } });
    expect(new Set([0, 2, 4, 6].map((now) => glowOf(rainbow(now))!.tint)).size).toBe(4);
    expect(glowOf(rainbow(3, 1))!.tint, 'the two clusters of it are not in step').not.toBe(glowOf(rainbow(3, 2))!.tint);
  });

  it('is drawn for every gem there is, from a sprite that a recipe draws', () => {
    for (const gem of GEM_IDS) {
      const sprites = [1, 2].map(
        (n) => drawProp(facts(clusterOf(gem), { instanceId: `crystal-cave/${gem}-cluster-${n}` })).body!.sprite,
      );
      for (const sprite of sprites)
        expect(
          RECIPES.find((r) => r.id === sprite && r.bundle === 'cave'),
          `${gem}: ${sprite}`,
        ).toBeDefined();
    }
  });

  it('lies on the floor and sits in the basket as a picture that the produce bundle holds, for everything she can gather', () => {
    for (const id of PRODUCE_IDS)
      expect(
        RECIPES.find((r) => r.id === PRODUCE[id].sprite && r.bundle === 'produce'),
        `${id}: ${PRODUCE[id].sprite}`,
      ).toBeDefined();
  });
});
