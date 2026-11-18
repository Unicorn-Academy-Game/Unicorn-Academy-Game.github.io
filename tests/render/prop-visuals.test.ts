import { describe, expect, it } from 'vitest';
import { PRODUCE } from '../../src/content/produce';
import { GEM_TABLES, PROP_DEFS, tableOf } from '../../src/content/props';
import {
  balloonsOf,
  bounceOf,
  drawProp,
  floatOf,
  jetOf,
  type Moment,
  type PropFacts,
  QUILT_BIAS,
  variantOf,
} from '../../src/render/prop-visuals';
import { RECIPES } from '../../tools/assets/env/registry';
import { everyPicture } from './pictures';

const facts = (definitionId: string, extra: Partial<PropFacts> = {}): PropFacts => ({
  definitionId,
  instanceId: `map/${definitionId}-1`,
  look: undefined,
  state: undefined,
  moment: undefined,
  ...extra,
});
const moment = (kind: string, seconds: number, total: number): Moment => ({ kind, seconds, total });
const recipeOf = (id: string) => RECIPES.find((r) => r.id === id);

describe('every picture a prop can show', () => {
  const all = everyPicture();

  it('is a sprite that is drawn by a recipe', () => {
    const missing = new Set<string>();
    for (const { layers } of all) for (const l of layers) if (!recipeOf(l.sprite)) missing.add(l.sprite);
    expect([...missing]).toEqual([]);
  });

  it('plays the animation the sprite has', () => {
    const wrong = new Set<string>();
    for (const { layers } of all) {
      for (const l of layers) {
        const anim = recipeOf(l.sprite)?.anim;
        if (l.show.kind === 'loop' && !anim?.loop) wrong.add(`${l.sprite} loops but is not a loop`);
        if (l.show.kind === 'time' && !anim) wrong.add(`${l.sprite} is played over time but has one frame`);
        if (l.show.kind === 'fraction' && !anim)
          wrong.add(`${l.sprite} is played to a share of its length but has one frame`);
        if (l.show.kind === 'frame' && l.show.index >= (anim?.frames ?? 1))
          wrong.add(`${l.sprite} frame ${l.show.index} does not exist`);
      }
    }
    expect([...wrong]).toEqual([]);
  });

  it('draws something for every prop a map can hold, except those that are only a place to tap', () => {
    const blank = new Set(Object.keys(PROP_DEFS));
    for (const { facts: f, layers } of all) if (layers.length > 0) blank.delete(f.definitionId);
    // The palace door is part of the palace picture, and a window or a wall of flowers is part of
    // the room's.
    const mapDraws = Object.values(PROP_DEFS)
      .filter((d) => d.invisible)
      .map((d) => d.id);
    expect([...blank].sort()).toEqual(['palace-door', ...mapDraws].sort());
  });
});

describe('doors', () => {
  it('show the first frame of their sprite while shut, because the building leaves its doorway dark', () => {
    for (const look of PROP_DEFS.door!.looks!) {
      const picture = drawProp(facts('door', { look }));
      expect(picture.body).toBeNull();
      expect(picture.overlay?.show).toEqual({ kind: 'frame', index: 0 });
    }
  });

  it('wear the same sprite shut as they swing with, so nothing pops when a swing begins or ends', () => {
    for (const look of PROP_DEFS.door!.looks!) {
      const shut = drawProp(facts('door', { look })).overlay!;
      const swinging = drawProp(facts('door', { look, moment: moment('door-opening', 0.3, 1.2) })).overlay!;
      expect(shut.sprite).toBe(swinging.sprite);
      expect(shut.bias).toBe(swinging.bias);
    }
  });

  it('swing from the first frame in step with time, and wear the look they were given', () => {
    const early = drawProp(facts('door', { look: 'stable-in', moment: moment('door-opening', 0.2, 1.2) })).overlay!;
    expect(early.sprite).toBe('door-stable-in');
    expect(early.show).toEqual({ kind: 'time', ms: 200 });
    expect(
      drawProp(facts('door', { look: 'treasure-out', moment: moment('door-opening', 0.1, 1.2) })).overlay!.sprite,
    ).toBe('door-treasure');
  });

  it('draw over their wall, not behind it', () => {
    for (const look of PROP_DEFS.door!.looks!)
      expect(drawProp(facts('door', { look, moment: moment('door-opening', 0.3, 1.2) })).overlay!.bias).toBeGreaterThan(
        0,
      );
  });
});

describe('chests', () => {
  it('stay open or shut as saved', () => {
    expect(drawProp(facts('chest', { state: { kind: 'chest', open: false } })).body!.sprite).toBe('chest-closed');
    expect(drawProp(facts('chest', { state: { kind: 'chest', open: true } })).body!.sprite).toBe('chest-open');
    expect(drawProp(facts('chest')).body!.sprite).toBe('chest-closed');
  });

  it('swing open forwards and shut backwards', () => {
    const opening = drawProp(
      facts('chest', { state: { kind: 'chest', open: true }, moment: moment('chest-opening', 0.3, 0.8) }),
    ).body!;
    const closing = drawProp(
      facts('chest', { state: { kind: 'chest', open: false }, moment: moment('chest-closing', 0.3, 0.8) }),
    ).body!;
    expect(opening.sprite).toBe('chest-opening');
    expect(opening.show).toEqual({ kind: 'time', ms: 300, reverse: false });
    expect(closing.sprite).toBe('chest-opening');
    expect(closing.show).toEqual({ kind: 'time', ms: 300, reverse: true });
  });

  it('take as long to swing as the chest sprite takes to play', () => {
    const r = recipeOf('chest-opening')!.anim!;
    expect(r.frames / r.fps).toBeLessThanOrEqual(0.8);
  });
});

describe('cups and the fountain', () => {
  it('keep their water: a cup is always full, and dips only while someone drinks from it', () => {
    expect(drawProp(facts('cup')).body).toMatchObject({ sprite: 'cup-full', show: { kind: 'loop' } });
    expect(drawProp(facts('cup', { moment: moment('cup-fill', 1, 4) })).body).toMatchObject({
      sprite: 'cup-sip',
      show: { kind: 'loop' },
    });
    expect(drawProp(facts('cup', { moment: moment('cup-fill', 9, 40) })).body!.sprite).toBe('cup-sip');
    for (const id of ['cup-full', 'cup-sip']) expect(recipeOf(id)!.anim!.loop).toBe(true);
  });

  it('let the fountain flow from the top all the time, whether or not the water spell is on', () => {
    const resting = drawProp(facts('fountain-spout'));
    expect(resting.overlay).toMatchObject({ sprite: 'fountain-jet', show: { kind: 'loop' } });
    expect(resting.overlay!.alpha ?? 1).toBe(1);
    expect(drawProp(facts('fountain-spout', { moment: moment('spout', 2, 6) })).overlay).toMatchObject({
      sprite: 'fountain-jet',
    });
  });
});

describe('treasure', () => {
  it('lifts a copy of a gem off its table and brings it back, visible only while it is away', () => {
    const at = (s: number) => drawProp(facts('ruby-table', { moment: moment('treasure-float', s, 2.6) }));
    expect(at(0).overlay!.alpha).toBe(0);
    const top = at(1.2).overlay!;
    expect(top.dy!).toBeLessThan(at(0.1).overlay!.dy!);
    expect(top.alpha).toBeGreaterThan(0.95);
    expect(at(2.6).overlay!.alpha).toBeCloseTo(0, 5);
    expect(at(1.2).body!.sprite).toBe('ruby-table');
  });

  it('lifts the gem that lies on the table and no other, for every table', () => {
    for (const gem of GEM_TABLES) {
      const lifted = drawProp(facts(tableOf(gem), { moment: moment('treasure-float', 1, 2.6) }));
      expect(lifted.body!.sprite, gem).toBe(tableOf(gem));
      expect(lifted.overlay!.sprite, gem).toBe(`float-${gem}`);
    }
  });

  it('bounces coins and notes on the spot, with no gem', () => {
    for (const id of ['coin-pile', 'gold-bars', 'sack-pile', 'money-desk', 'cash-desk']) {
      const hop = drawProp(facts(id, { moment: moment('treasure-bounce', 0.15, 1) }));
      expect(hop.overlay, id).toBeNull();
      expect(hop.body!.sprite, id).toBe(id);
      expect(hop.body!.dy!, id).toBeLessThan(0);
      expect(drawProp(facts(id, { moment: moment('treasure-bounce', 1, 1) })).body!.dy, id).toBeCloseTo(0, 5);
    }
  });

  it('draws every pile, desk and table as the sprite of its own name', () => {
    const treasures = Object.values(PROP_DEFS).filter((def) => def.tap === 'treasure');
    expect(treasures.length).toBeGreaterThan(0);
    for (const def of treasures) expect(drawProp(facts(def.id)).body!.sprite, def.id).toBe(def.id);
  });

  it('keeps the float and the hop smooth at their ends', () => {
    expect(floatOf(0, 2.6).lift).toBe(0);
    expect(Math.abs(floatOf(2.6, 2.6).lift)).toBeLessThan(1e-9);
    expect(bounceOf(0, 1)).toBe(0);
    expect(bounceOf(1, 1)).toBeCloseTo(0, 9);
    for (let t = 0; t <= 1; t += 0.05) expect(bounceOf(t, 1)).toBeGreaterThanOrEqual(0);
  });
});

describe('the garden', () => {
  it('shows a bed by its shape and its state', () => {
    const sprite = (look: string, state: 'leafy' | 'flowering') =>
      drawProp(facts('flowerbed', { look, state: { kind: 'flowerbed', state } })).body!.sprite;
    expect(sprite('long', 'leafy')).toBe('bed-leafy-1');
    expect(sprite('square', 'flowering')).toBe('bed-flowering-2');
    expect(sprite('round', 'flowering')).toBe('bed-flowering-3');
  });

  it('lights lanterns and braziers and animates them only while lit', () => {
    expect(drawProp(facts('lantern')).body!.show).toEqual({ kind: 'frame', index: 0 });
    expect(drawProp(facts('lantern', { state: { kind: 'lantern', lit: true } })).body).toMatchObject({
      sprite: 'lantern-on',
      show: { kind: 'loop' },
    });
    expect(drawProp(facts('brazier', { state: { kind: 'brazier', lit: true } })).body).toMatchObject({
      sprite: 'brazier-lit',
      show: { kind: 'loop' },
    });
    expect(drawProp(facts('brazier')).body!.sprite).toBe('brazier-unlit');
  });

  it('turns the pinwheel, glows the ornament and freezes the display only for the length of their reaction', () => {
    expect(drawProp(facts('pinwheel')).body!.sprite).toBe('pinwheel-still');
    expect(drawProp(facts('pinwheel', { moment: moment('spin-pinwheel', 2, 7) })).body!.sprite).toBe('pinwheel-spin');
    expect(drawProp(facts('weather-ornament', { moment: moment('glow-ornament', 2, 5) })).body!.sprite).toBe(
      'ornament-glow',
    );
    expect(drawProp(facts('ice-display', { moment: moment('ice-ornament', 2, 9) })).body!.sprite).toBe(
      'ice-display-frozen',
    );
    expect(drawProp(facts('ice-display')).body!.sprite).toBe('ice-display-idle');
  });

  it('keeps a crystal the same crystal', () => {
    const a = drawProp(facts('crystal', { instanceId: 'forest/crystal-7' })).body!.sprite;
    expect(drawProp(facts('crystal', { instanceId: 'forest/crystal-7' })).body!.sprite).toBe(a);
    expect(
      drawProp(facts('crystal', { instanceId: 'forest/crystal-7', state: { kind: 'lantern', lit: true } })).body!
        .sprite,
    ).toMatch(/lit/);
    expect(variantOf('forest/crystal-7', 2)).toBeLessThan(2);
  });
});

describe('the farm and the orchard', () => {
  const harvest = Object.values(PROP_DEFS).filter(
    (d) => d.tap === 'harvest' && d.harvest!.produce.every((p) => ['tree', 'bed'].includes(PRODUCE[p].grows)),
  );

  it('draws every harvest prop, still, with a picture of what it gives', () => {
    expect(harvest.length).toBe(8);
    for (const def of harvest) {
      const picture = drawProp(facts(def.id));
      expect(picture.body, def.id).not.toBeNull();
      expect(picture.body!.show).toEqual({ kind: 'frame', index: 0 });
      expect(picture.overlay).toBeNull();
    }
  });

  it('gives each fruit tree one of two looks and keeps it for the same instance', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const look = drawProp(facts('apple-tree', { instanceId: `garden/apple-${i}` })).body!.sprite;
      expect(look).toMatch(/^g-tree-apple-[12]$/);
      expect(drawProp(facts('apple-tree', { instanceId: `garden/apple-${i}` })).body!.sprite).toBe(look);
      seen.add(look);
    }
    expect([...seen].sort()).toEqual(['g-tree-apple-1', 'g-tree-apple-2']);
    expect(drawProp(facts('berry-tree')).body!.sprite).toMatch(/^g-tree-berry-[12]$/);
  });

  it('shows a bed of the crop it grows', () => {
    expect(drawProp(facts('carrot-bed')).body!.sprite).toBe('g-bed-carrot');
    expect(drawProp(facts('berry-bed')).body!.sprite).toBe('g-bed-berry');
    expect(drawProp(facts('pumpkin-bed')).body!.sprite).toBe('g-bed-pumpkin');
  });

  it('has a recipe for the scarecrow, the crates and the fences that maps place as scenery', () => {
    for (const id of [
      'g-scarecrow',
      'g-crate-apples',
      'g-crate-carrots',
      'g-crate-berries',
      'g-crate-pumpkins',
      'g-fence-x',
      'g-fence-y',
    ])
      expect(recipeOf(id), id).toBeDefined();
  });
});

describe('the boxed unicorns', () => {
  const looks = PROP_DEFS['boxed-unicorn']!.looks!;

  it('stand in six different coats, each with a sprite of its own', () => {
    expect(new Set(looks).size).toBe(6);
    for (const look of looks) {
      const sprite = drawProp(facts('boxed-unicorn', { look })).body!.sprite;
      expect(sprite).toBe(`boxed-${look}`);
      expect(recipeOf(sprite)?.anim?.loop, sprite).toBe(true);
    }
  });

  it('breathe all the time and hop while they are being nuzzled, then settle exactly where they were', () => {
    const still = drawProp(facts('boxed-unicorn', { look: 'mint' })).body!;
    const mid = drawProp(facts('boxed-unicorn', { look: 'mint', moment: moment('delight', 0.5, 2) })).body!;
    const end = drawProp(facts('boxed-unicorn', { look: 'mint', moment: moment('delight', 0, 2) })).body!;
    expect(mid.sprite).toBe(still.sprite);
    expect(mid.dy ?? 0).toBeLessThan(still.dy ?? 0);
    expect(end.dy ?? 0).toBeCloseTo(still.dy ?? 0, 5);
  });
});

describe('the playground toys', () => {
  const toys = [
    'gem-fountain',
    'rainbow-slide',
    'bouncy-mushroom',
    'firework-launcher',
    'spell-cannon',
    'morph-machine',
    'frog-pond',
    'bubble-machine',
    'balloon-stand',
    'confetti-popper',
  ];

  it('are all drawn, at rest and in the middle of their reaction, by sprites from the playground', () => {
    for (const id of toys) {
      const looks = PROP_DEFS[id]!.looks ?? [undefined];
      for (const look of looks) {
        for (const m of [undefined, moment('delight', 0.4, PROP_DEFS[id]!.delight!.seconds)]) {
          const layers = [
            drawProp(facts(id, { look, moment: m })).body,
            drawProp(facts(id, { look, moment: m })).overlay,
          ].filter((l) => l != null);
          expect(layers.length, `${id} ${look} ${m?.kind}`).toBeGreaterThan(0);
          for (const l of layers) expect(l!.sprite, id).toMatch(/^pg-/);
        }
      }
    }
  });

  it('show the first frame of a mushroom and a morph machine at rest, and play them from the tap', () => {
    for (const [id, look] of [
      ['bouncy-mushroom', 'red'],
      ['morph-machine', 'apple-gem'],
    ] as const) {
      const rest = drawProp(facts(id, { look })).body!;
      const playing = drawProp(facts(id, { look, moment: moment('delight', 0.3, 1) })).body!;
      expect(rest.show, id).toEqual({ kind: 'frame', index: 0 });
      expect(playing.show.kind, id).toBe('time');
      expect(playing.sprite, id).toBe(rest.sprite);
    }
  });

  it('send balloons up and away, then bring a fresh bunch back that fades in and is fully there at the end', () => {
    expect(balloonsOf(0, 3)).toEqual({ lift: 0, alpha: 1 });
    let last = -1;
    for (let t = 0; t <= 1.8; t += 0.1) {
      const { lift } = balloonsOf(t, 3);
      expect(lift).toBeGreaterThanOrEqual(last);
      last = lift;
    }
    expect(balloonsOf(1.8, 3).alpha).toBeLessThan(0.01);
    expect(balloonsOf(2.4, 3).lift).toBe(0);
    expect(balloonsOf(2.4, 3).alpha).toBeLessThan(0.5);
    expect(balloonsOf(3, 3)).toEqual({ lift: 0, alpha: 1 });
    const mid = drawProp(facts('balloon-stand', { look: 'party', moment: moment('delight', 1, 3.2) })).overlay!;
    expect(mid.dy).toBeLessThan(0);
  });

  it('lets the fountain throw its jewels in and out gently, and never a jet when nothing is playing', () => {
    expect(jetOf(0, 2.4)).toBe(0);
    expect(jetOf(2.4, 2.4)).toBe(0);
    expect(jetOf(1.2, 2.4)).toBe(1);
    const rest = drawProp(facts('gem-fountain'));
    expect(rest.overlay?.alpha ?? 0).toBe(0);
  });

  it('hops a cannon, a launcher and a popper only while they go off, and settles them exactly where they were', () => {
    for (const id of ['spell-cannon', 'firework-launcher', 'confetti-popper']) {
      const rest = drawProp(facts(id, { look: PROP_DEFS[id]!.looks?.[0] })).body!;
      const mid = drawProp(
        facts(id, { look: PROP_DEFS[id]!.looks?.[0], moment: moment('delight', 0.1, PROP_DEFS[id]!.delight!.seconds) }),
      ).body!;
      const end = drawProp(
        facts(id, { look: PROP_DEFS[id]!.looks?.[0], moment: moment('delight', 0, PROP_DEFS[id]!.delight!.seconds) }),
      ).body!;
      expect(mid.sprite).toBe(rest.sprite);
      expect(end.dy ?? 0).toBeCloseTo(rest.dy ?? 0, 5);
    }
  });
});

describe('the stage lights', () => {
  const looks = PROP_DEFS['disco-light']!.looks!;
  const total = PROP_DEFS['disco-light']!.delight!.seconds;
  const draw = (look: string, extra: Partial<PropFacts> = {}) =>
    drawProp(facts('disco-light', { look, now: 3, ...extra }));

  it('are a glowing pad with a column of light over it, from the playground, added to the floor behind them, and nothing that could hide a unicorn', () => {
    for (const look of looks) {
      const pic = draw(look);
      expect(pic.body, look).toBeNull();
      expect(pic.under?.sprite, look).toBe('pg-stage-pad');
      expect(pic.overlay?.sprite, look).toBe('pg-stage-beam');
      expect(pic.under?.glow, look).toBe(true);
      expect(pic.overlay?.glow, look).toBe(true);
    }
  });

  it('wear the colour of their look, and the rainbow one goes through the colours as time goes by', () => {
    expect(new Set(looks.filter((look) => look !== 'rainbow').map((look) => draw(look).under?.tint)).size).toBe(
      looks.length - 1,
    );
    expect(new Set([0, 1, 2, 3, 4, 5].map((now) => draw('rainbow', { now }).under?.tint)).size).toBeGreaterThan(3);
  });

  it('flare when she touches them and settle back to just as bright as they were, so nothing blinks', () => {
    const rest = draw('gold').overlay!.alpha!;
    const flare = draw('gold', { moment: moment('delight', 1, total) }).overlay!.alpha!;
    const after = draw('gold', { moment: moment('delight', total, total) }).overlay!.alpha!;
    expect(flare).toBeGreaterThan(rest + 0.2);
    expect(after).toBeCloseTo(rest, 5);
  });

  it('breathe: a light is not the same brightness a moment later', () => {
    expect(new Set([0, 0.5, 1, 1.5].map((now) => draw('cyan', { now }).under?.alpha)).size).toBeGreaterThan(1);
  });

  it('keep their own rhythm, so two lights side by side do not breathe together', () => {
    const a = drawProp(facts('disco-light', { look: 'pink', now: 1, instanceId: 'dance-floor/disco-light-1' })).under!
      .alpha;
    const b = drawProp(facts('disco-light', { look: 'pink', now: 1, instanceId: 'dance-floor/disco-light-2' })).under!
      .alpha;
    expect(a).not.toBe(b);
  });
});

describe('the rooms of the palace', () => {
  it('keeps the crown on its stand until she takes it, and leaves the cushion bare after', () => {
    expect(drawProp(facts('crown-stand')).body!.sprite).toBe('ph-crown');
    expect(drawProp(facts('crown-stand', { worn: true })).body!.sprite).toBe('ph-crown-empty');
    for (const worn of [false, true])
      expect(recipeOf(drawProp(facts('crown-stand', { worn })).body!.sprite), `worn ${worn}`).toBeDefined();
  });

  it('draws every vase in the look it was placed with, each look as a picture of its own, and a vase without one as the first', () => {
    for (const id of ['flower-vase', 'diamond-vase']) {
      const looks = PROP_DEFS[id]!.looks!;
      const sprites = looks.map((look) => drawProp(facts(id, { look })).body!.sprite);
      expect(new Set(sprites).size, id).toBe(looks.length);
      for (const sprite of sprites) expect(recipeOf(sprite), sprite).toBeDefined();
      expect(drawProp(facts(id)).body!.sprite).toBe(sprites[0]);
    }
  });

  it('lays the quilt over the bed and over her, which is why she is drawn lying in it with only her head out', () => {
    const picture = drawProp(facts('nap-bed'));
    expect(picture.body!.sprite).toBe('ph-nap-bed');
    expect(picture.overlay!.sprite).toBe('ph-nap-quilt');
    expect(picture.body!.bias ?? 0).toBeLessThanOrEqual(0);
    expect(picture.overlay!.bias).toBe(QUILT_BIAS);
    // The bed and the quilt are cut from one canvas, so one lies exactly over the other.
    expect(recipeOf('ph-nap-quilt')!.canvas).toEqual(recipeOf('ph-nap-bed')!.canvas);
  });
});
