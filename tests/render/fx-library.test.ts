import { describe, expect, it } from 'vitest';
import { EFFECT_IDS } from '../../src/content/activities';
import { playEffect } from '../../src/render/fx/library';
import type { Fx, Spec } from '../../src/render/fx/system';
import { FX_SPRITES } from '../../tools/art/fx/sprites';

const SPRITES = new Set(FX_SPRITES.map((s) => s.id));

/**
 * An effects system that only writes down what it is asked to draw, with a steady number in place
 * of chance.
 */
function recorder(rand = 0.5): { fx: Fx; specs: Spec[]; emitters: number; gaps: number[] } {
  const specs: Spec[] = [];
  const gaps: number[] = [];
  const state = { emitters: 0 };
  const fx = {
    rand: () => rand,
    spawn: (s: Spec) => void specs.push(s),
    emit: (seconds: number, every: number, spawn: (age: number, left: number) => void) => {
      state.emitters++;
      gaps.push(every);
      spawn(0, seconds);
    },
    // A source that is kept going is asked for what it spawns at the start, in the middle and near
    // the end of the time it was asked for.
    keep: (_key: string, seconds: number, every: number, spawn: (age: number, left: number) => void) => {
      state.emitters++;
      gaps.push(every);
      for (const age of [0, seconds / 2, seconds - 0.05]) spawn(age, seconds - age);
      return true;
    },
  } as unknown as Fx;
  return {
    fx,
    specs,
    gaps,
    get emitters() {
      return state.emitters;
    },
  };
}

const call = (id: (typeof EFFECT_IDS)[number], extra: { lift?: number } = {}) => ({
  id,
  at: { x: 100, y: 200 },
  seconds: 1.5,
  facing: 'east' as const,
  ...extra,
});

describe('every effect the world can ask for', () => {
  it('draws something, from pictures that exist, in a way that ends', () => {
    for (const id of EFFECT_IDS) {
      for (const reduced of [false, true]) {
        const r = recorder();
        playEffect(r.fx, call(id), reduced);
        expect(r.specs.length + r.emitters, `${id} draws nothing`).toBeGreaterThan(0);
        for (const s of r.specs) {
          expect(SPRITES.has(s.sprite), `${id} draws ${s.sprite}, which is not in the effects bundle`).toBe(true);
          expect(s.life, `${id} has a particle that never ends`).toBeGreaterThan(0);
          for (const v of [s.x, s.y, s.z ?? 0, s.vx ?? 0, s.vy ?? 0, s.vz ?? 0, s.delay ?? 0])
            expect(Number.isFinite(v), `${id} has a number that is not one`).toBe(true);
        }
      }
    }
  });

  it('shows no more when effects are reduced', () => {
    for (const id of EFFECT_IDS) {
      const full = recorder();
      const less = recorder();
      playEffect(full.fx, call(id), false);
      playEffect(less.fx, call(id), true);
      expect(less.specs.length, id).toBeLessThanOrEqual(full.specs.length);
    }
  });
});

describe('what a creature leaves when it is tapped', () => {
  const shimmers = ['pip-sparkle', 'pip-hearts', 'fairy-dust'] as const;

  it('starts at the height the creature is at, so a fairy in the air is not dusted from the ground', () => {
    for (const id of shimmers) {
      const low = recorder();
      const high = recorder();
      playEffect(low.fx, call(id), false);
      playEffect(high.fx, call(id, { lift: 60 }), false);
      expect(high.specs.length, id).toBe(low.specs.length);
      const lowest = (r: ReturnType<typeof recorder>) => Math.min(...r.specs.map((s) => s.z ?? 0));
      expect(lowest(high) - lowest(low), `${id} did not rise with the creature`).toBeGreaterThanOrEqual(59);
    }
  });

  it('keeps to the spot it happened at', () => {
    for (const id of shimmers) {
      const r = recorder();
      playEffect(r.fx, call(id), false);
      for (const s of r.specs) {
        expect(Math.abs(s.x - 100), `${id} starts far to the side`).toBeLessThan(80);
        expect(Math.abs(s.y - 200), `${id} starts far up or down`).toBeLessThan(40);
      }
    }
  });

  it('makes the fairy the richest of them', () => {
    const count = (id: (typeof shimmers)[number]) => {
      const r = recorder();
      playEffect(r.fx, call(id), false);
      return r.specs.length;
    };
    expect(count('fairy-dust')).toBeGreaterThan(count('pip-sparkle'));
    expect(count('fairy-dust')).toBeGreaterThan(count('pip-hearts'));
  });
});

describe('a profile that throws fewer sparkles', () => {
  const LOW = 0.6;
  const STEADY = ['water-spray', 'gem-burst', 'fountain-rainbow'] as const;
  const specsOf = (id: (typeof EFFECT_IDS)[number], reduced: boolean, sparkles: number) => {
    const r = recorder();
    playEffect(r.fx, call(id), reduced, sparkles);
    return r;
  };
  const total = (reduced: boolean, sparkles: number) =>
    EFFECT_IDS.reduce((sum, id) => sum + specsOf(id, reduced, sparkles).specs.length, 0);

  it('draws exactly what it always did when it throws them all', () => {
    // A particle may carry a function for what to do when it lands, and two runs make two
    // functions, so the numbers are compared.
    const drawn = (specs: Spec[]): string => JSON.stringify(specs);
    for (const id of EFFECT_IDS) {
      const usual = recorder();
      playEffect(usual.fx, call(id), false);
      expect(drawn(specsOf(id, false, 1).specs), id).toBe(drawn(usual.specs));
    }
  });

  it('still draws something of every effect', () => {
    for (const id of EFFECT_IDS) {
      const r = specsOf(id, false, LOW);
      expect(r.specs.length + r.emitters, `${id} draws nothing`).toBeGreaterThan(0);
    }
  });

  it('draws no more of any effect, and a good deal less in all', () => {
    for (const id of EFFECT_IDS)
      expect(specsOf(id, false, LOW).specs.length, id).toBeLessThanOrEqual(specsOf(id, false, 1).specs.length);
    expect(total(false, LOW) / total(false, 1)).toBeLessThan(0.85);
    expect(total(false, LOW) / total(false, 1)).toBeGreaterThan(0.4);
  });

  it('leaves reduced effects as sparse as they were, since they are sparser still', () => {
    for (const id of EFFECT_IDS)
      expect(specsOf(id, true, LOW).specs.length, id).toBe(specsOf(id, true, 1).specs.length);
  });

  it.each(STEADY)('spaces the sparks of %s further apart, by the share it throws', (id) => {
    const [usual] = specsOf(id, false, 1).gaps;
    const [fewer] = specsOf(id, false, LOW).gaps;
    expect(fewer! / usual!).toBeCloseTo(1 / LOW, 9);
  });

  it.each(STEADY)('keeps the calm spacing of %s when effects are reduced', (id) => {
    expect(specsOf(id, true, LOW).gaps).toEqual(specsOf(id, true, 1).gaps);
    expect(specsOf(id, true, 1).gaps[0]!).toBeGreaterThan(specsOf(id, false, 1).gaps[0]!);
  });
});

describe('a puff that is asked to throw a share of its sparks', () => {
  const SHARE = 0.3;
  const drawn = (id: (typeof EFFECT_IDS)[number], extra: { share?: number }, sparkles = 1) => {
    const r = recorder();
    playEffect(r.fx, { ...call(id), ...extra }, false, sparkles);
    return JSON.stringify(r.specs);
  };

  it('draws what a profile of that share draws', () => {
    for (const id of EFFECT_IDS) expect(drawn(id, { share: SHARE }), id).toBe(drawn(id, {}, SHARE));
  });

  it('draws what it always did when the share is all of it or not given', () => {
    for (const id of EFFECT_IDS) expect(drawn(id, { share: 1 }), id).toBe(drawn(id, {}));
  });

  it('adds to the share of the profile and does not replace it', () => {
    for (const id of EFFECT_IDS) expect(drawn(id, { share: 0.5 }, 0.6), id).toBe(drawn(id, {}, 0.3));
  });
});
