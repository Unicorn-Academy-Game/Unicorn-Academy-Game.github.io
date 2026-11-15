import { REACTIONS } from '../../src/content/magic';
import { PROP_DEFS, type PropDef } from '../../src/content/props';
import { drawProp, type Layer, type Moment, type PropFacts } from '../../src/render/prop-visuals';
import type { SavedPropState } from '../../src/shared/save';

const KINDS = [
  'door-opening',
  'chest-opening',
  'chest-closing',
  'treasure-float',
  'treasure-bounce',
  'palace-welcome',
  'cup-fill',
  'brushing',
  'delight',
  ...REACTIONS.map((r) => r.id),
];
/**
 * How old the world is, early and late, for the crystals that go through their colours as it goes.
 */
const AGES = [0, 2.9, 7.3];
/** Whether she has the crown on, for the stand it comes from. */
const WORN = [false, true];

/**
 * Every picture a prop can show: every look, saved state and moment of a definition, early, middle
 * and late.
 */
export function picturesOf(
  def: PropDef,
  looks: readonly (string | undefined)[] = def.looks ?? [undefined],
): { facts: PropFacts; layers: Layer[] }[] {
  const states: (SavedPropState | undefined)[] = [
    undefined,
    def.initial,
    ...REACTIONS.filter((r) => r.targets.includes(def.id)).map((r) => r.persist),
  ];
  if (def.tap === 'chest') states.push({ kind: 'chest', open: true });
  const moments: (Moment | undefined)[] = [
    undefined,
    ...KINDS.flatMap((kind) => [0, 1.2, 2.39].map((seconds) => ({ kind, seconds, total: 2.4 }))),
  ];
  const out: { facts: PropFacts; layers: Layer[] }[] = [];
  for (const look of looks) {
    for (const state of states) {
      for (const moment of moments) {
        for (const now of AGES) {
          for (const worn of def.crown ? WORN : [false]) {
            const facts: PropFacts = {
              definitionId: def.id,
              instanceId: `map/${def.id}-1`,
              look,
              state,
              moment,
              now,
              worn,
            };
            const p = drawProp(facts);
            out.push({ facts, layers: [p.under ?? null, p.body, p.overlay].filter((l): l is Layer => l !== null) });
          }
        }
      }
    }
  }
  return out;
}

export const everyPicture = (): { facts: PropFacts; layers: Layer[] }[] =>
  Object.values(PROP_DEFS).flatMap((def) => picturesOf(def));
