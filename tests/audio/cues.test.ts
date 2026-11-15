import { describe, expect, it } from 'vitest';
import { type Cue, cuesFor } from '../../src/audio/cues';
import { ACTIVITY_IDS, type ActivityId } from '../../src/content/activities';
import { REACTIONS } from '../../src/content/magic';
import type { NpcClip, NpcId } from '../../src/content/npcs';
import { PROP_DEFS } from '../../src/content/props';
import type { DomainEvent, PropActivity } from '../../src/domain';
import { SOUND_FAMILIES, type SoundFamilyId } from '../../src/shared/audio';
import { UNICORN_IDS, type UnicornId } from '../../src/shared/ids';
import { LIFE_KINDS } from '../../src/shared/life';
import { LogicMap } from '../../src/shared/map';
import { ALL, garden, makeWorld, meadow, stable } from '../domain/fixtures';

const world = makeWorld({ recruited: ALL.filter((id) => id !== 'wildstar') });
const sounds = (cues: Cue[]): SoundFamilyId[] => cues.map((c) => c.sound);

describe('what happening sounds like', () => {
  it('answers a tap with a soft pop where the finger landed, and a refused tap with a low note', () => {
    expect(
      cuesFor([{ type: 'command-accepted', commandId: 'c1', command: 'move', at: { x: 10, y: 20 } }], world),
    ).toEqual([{ sound: 'tap', at: { x: 10, y: 20 }, gain: 0.8 }]);
    expect(cuesFor([{ type: 'command-refused', commandId: 'c2', at: { x: 30, y: 40 } }], world)).toEqual([
      { sound: 'refusal', at: { x: 30, y: 40 } },
    ]);
  });

  it('gives each unicorn the spell of its own magic', () => {
    const expected: Record<UnicornId, SoundFamilyId> = {
      wildstar: 'spell-light',
      leaf: 'spell-nature',
      glacier: 'spell-ice',
      river: 'spell-water',
      cinder: 'spell-fire',
      storm: 'spell-lightning',
    };
    for (const id of UNICORN_IDS) {
      const at = world.unicorns[id]!.pos;
      expect(cuesFor([{ type: 'cast-released', castId: 'x', unicornId: id, at }], world)).toEqual([
        { sound: expected[id], at },
      ]);
    }
  });

  it("greets with the unicorn's own voice, a moment after the greeting begins", () => {
    for (const id of UNICORN_IDS) {
      const out = cuesFor([{ type: 'greeting-started', unicornId: id, at: { x: 5, y: 6 } }], world);
      expect(out).toEqual([{ sound: `voice-${id}`, at: { x: 5, y: 6 }, delay: 0.35 }]);
    }
  });

  it("plays a new friend's fanfare once and keeps the hearts that come with it quiet", () => {
    const batch: DomainEvent[] = [
      { type: 'friend-recruited', unicornId: 'leaf' },
      { type: 'effect', effect: 'hearts', at: { x: 1, y: 1 }, seconds: 1.5 },
    ];
    expect(sounds(cuesFor(batch, world))).toEqual(['recruit']);
    expect(sounds(cuesFor([batch[1]!], world))).toEqual(['hearts']);
  });

  it('gives every kind of creature a sound of its own when it is tapped, where it is', () => {
    for (const kind of LIFE_KINDS) {
      const at = { x: 40, y: 50 };
      const out = cuesFor([{ type: 'critter-poked', critterId: `${kind}-1`, kind, look: 'x', at, z: 12 }], world);
      expect(out).toHaveLength(1);
      expect(out[0]!.at).toEqual(at);
      expect(out[0]!.gain).toBeGreaterThan(0);
      expect(out[0]!.gain).toBeLessThanOrEqual(1);
      expect(SOUND_FAMILIES).toHaveProperty(out[0]!.sound);
    }
  });

  it('plays the same sound at the same moment only once', () => {
    const flash: DomainEvent = { type: 'effect', effect: 'relocate', at: { x: 1, y: 1 }, seconds: 0.5 };
    expect(sounds(cuesFor([flash, flash, { ...flash, at: { x: 9, y: 9 } }], world))).toEqual(['relocate']);
  });

  it('plays nothing for an effect that is only a picture', () => {
    for (const effect of [
      'tap',
      'sparkle',
      'refusal',
      'bloom',
      'mote',
      'ice-flower',
      'embers',
      'grow-flower',
      'light-burst',
      'door-glow',
    ] as const) {
      expect(cuesFor([{ type: 'effect', effect, at: { x: 1, y: 1 }, seconds: 1 }], world)).toEqual([]);
    }
  });

  it("plays the rainbow's shimmer when the palace door welcomes the herd", () => {
    expect(
      sounds(cuesFor([{ type: 'effect', effect: 'rainbow-arc', at: { x: 1, y: 1 }, seconds: 2.4 }], world)),
    ).toEqual(['fx-rainbow']);
  });
});

describe('what props sound like', () => {
  it('gives every reaction in the game a sound, at the prop that reacted', () => {
    expect(REACTIONS.length).toBeGreaterThan(0);
    const lantern = world.interactables.get('forest/lantern-1')!;
    for (const r of REACTIONS) {
      const out = cuesFor(
        [{ type: 'prop-reacted', instanceId: lantern.instanceId, reaction: r.id, seconds: 3 }],
        world,
      );
      expect(out, r.id).toHaveLength(1);
      expect(out[0]!.at).toEqual(lantern.pos);
      expect(out[0]!.sound in SOUND_FAMILIES).toBe(true);
    }
  });

  it('decides every prop activity, and says which ones are silent', () => {
    const expected: Record<PropActivity, SoundFamilyId[]> = {
      'door-opening': ['door-open'],
      'chest-opening': ['chest-open'],
      'chest-closing': ['chest-close'],
      'treasure-bounce': ['treasure-bounce'],
      'treasure-float': ['treasure-float'],
      'palace-welcome': ['palace-welcome'],
      'cup-fill': ['cup-fill'],
      brushing: [],
      // Her spell is heard as she casts, and the chime comes when a piece is gathered, so the
      // harvest itself says nothing.
      harvest: [],
      // A delight is voiced by its own definition, and a door has none, so here it says nothing.
      delight: [],
    };
    const door = world.interactables.get('forest/door-1')!;
    for (const [activity, want] of Object.entries(expected) as [PropActivity, SoundFamilyId[]][]) {
      const out = cuesFor([{ type: 'prop-activity', instanceId: door.instanceId, activity, seconds: 2 }], world);
      expect(sounds(out), activity).toEqual(want);
      for (const cue of out) expect(cue.at).toEqual(door.pos);
    }
  });

  it('voices a thing to enjoy with the sound its own definition names', () => {
    const base = meadow();
    const harp = makeWorld({
      map: LogicMap.parse({
        ...base,
        interactables: [
          ...base.interactables,
          {
            instanceId: 'forest/harp-1',
            definitionId: 'harp',
            pos: { x: 700, y: 1200 },
            hit: { x: 620, y: 1120, w: 160, h: 160 },
            approach: [{ pos: { x: 700, y: 1290 }, facing: 'north' }],
          },
        ],
      }),
    });
    const out = cuesFor(
      [{ type: 'prop-activity', instanceId: 'forest/harp-1', activity: 'delight', seconds: 2.4 }],
      harp,
    );
    expect(out).toEqual([{ sound: PROP_DEFS.harp!.delight!.sound, at: { x: 700, y: 1200 } }]);
  });

  it('rings a chime where a piece of fruit or a vegetable is gathered, and is quiet when one only falls', () => {
    const at = { x: 40, y: 50 };
    expect(
      cuesFor([{ type: 'produce-collected', pickupId: 'pickup-1', produce: 'apple', at, by: 'wildstar' }], world),
    ).toEqual([{ sound: 'gem', at, gain: 0.7 }]);
    expect(cuesFor([{ type: 'produce-dropped', produce: 'apple', from: at, to: at }], world)).toEqual([]);
  });

  it('closes a door behind the herd as it goes through, a little after it opened', () => {
    const out = cuesFor(
      [{ type: 'portal-entered', portalId: 'to-garden', to: { mapId: 'palace-garden', spawnId: 'door' } }],
      world,
    );
    expect(sounds(out)).toEqual(['transition', 'door-close']);
    expect(out[1]!.delay).toBeGreaterThan(0.3);
    expect(out[1]!.at).toEqual(world.interactables.get('forest/door-1')!.pos);
  });

  it('only plays a transition for a way through that has no door', () => {
    const open = makeWorld({ map: garden() });
    expect(
      sounds(
        cuesFor([{ type: 'portal-entered', portalId: 'nowhere', to: { mapId: 'forest', spawnId: 'start' } }], open),
      ),
    ).toEqual(['transition']);
  });
});

describe('what the herd does on its own', () => {
  const started = (id: UnicornId, activityId: ActivityId): Cue[] =>
    cuesFor([{ type: 'activity-started', actorId: id, activityId }], world);

  it('drinks and stamps in time with the animation', () => {
    expect(started('river', 'drink')).toEqual([{ sound: 'drink', at: world.unicorns.river!.pos, delay: 0.5 }]);
    expect(started('cinder', 'hoof-stamp')).toEqual([{ sound: 'stomp', at: world.unicorns.cinder!.pos, delay: 0.7 }]);
  });

  it("gives a nuzzle and a mane toss the unicorn's own nicker, softly", () => {
    for (const activity of ['nuzzle', 'mane-toss'] as const) {
      const [cue] = started('glacier', activity);
      expect(cue!.sound).toBe('nicker-glacier');
      expect(cue!.gain).toBeLessThan(1);
    }
  });

  it('says which activities are silent, so a new one is never forgotten', () => {
    const silent: ActivityId[] = [
      'stand',
      'look-around',
      'rest',
      'stretch',
      'graze',
      'mote-gaze',
      'flower-sniff',
      'splash',
      'hop',
      'groom',
    ];
    const voiced: ActivityId[] = ['drink', 'hoof-stamp', 'nuzzle', 'mane-toss'];
    expect([...silent, ...voiced].sort()).toEqual([...ACTIVITY_IDS].sort());
    for (const a of silent) expect(started('storm', a), a).toEqual([]);
  });
});

describe('what grown-ups at work sound like', () => {
  const gardener = makeWorld({ map: garden() });
  const worker = makeWorld({ map: stable() });
  const work = (w: typeof gardener, id: NpcId, activityId: NpcClip): Cue[] =>
    cuesFor([{ type: 'activity-started', actorId: id, activityId }], w);

  it("puts each job's sounds where the grown-up stands, spaced like the strokes of the job", () => {
    const at = gardener.npcs[0]!.pos;
    expect(work(gardener, 'gardener', 'water')).toEqual([{ sound: 'water-pour', at, delay: 0.5 }]);
    expect(work(gardener, 'gardener', 'trim').map((c) => [c.sound, c.delay])).toEqual([
      ['shears', 0.6],
      ['shears', 1.9],
    ]);
    const there = worker.npcs[0]!.pos;
    for (const [clip, sound, strokes] of [
      ['sweep', 'broom', 3],
      ['brush', 'brush', 3],
      ['pickup', 'hay', 1],
      ['putdown', 'hay', 1],
    ] as const) {
      const out = work(worker, 'stable-worker', clip);
      expect(sounds(out), clip).toEqual(Array(strokes).fill(sound));
      for (const cue of out) expect(cue.at).toEqual(there);
      const delays = out.map((c) => c.delay!);
      expect(delays).toEqual([...delays].sort((a, b) => a - b));
      expect(new Set(delays).size).toBe(delays.length);
    }
  });

  it('is silent for the quiet parts of a job', () => {
    for (const clip of ['idle', 'walk', 'inspect', 'carry', 'wave'] as const)
      expect(work(gardener, 'gardener', clip), clip).toEqual([]);
  });

  it('answers a friendly wave with a small greeting from where the grown-up stands', () => {
    const g = gardener.npcs[0]!;
    expect(cuesFor([{ type: 'npc-waved', npcId: 'gardener' }], gardener)).toEqual([{ sound: 'hello', at: g.pos }]);
  });

  it('stays quiet about a grown-up who is not on this map', () => {
    expect(cuesFor([{ type: 'npc-waved', npcId: 'stable-worker' }], makeWorld({ map: meadow() }))).toEqual([
      { sound: 'hello', at: undefined },
    ]);
  });
});

describe('every sound that exists is wired to something', () => {
  it('has a cue that can produce each family, apart from the ones the settings panel, footsteps, the code pad and the lift play', () => {
    // Collect what every event in this file can produce, plus the families played by other code.
    const produced = new Set<SoundFamilyId>(['hoof-grass', 'hoof-hard', 'confirm', 'lift-ding', 'code-success']);
    const w = makeWorld({ map: stable(), recruited: ALL.filter((id) => id !== 'wildstar') });
    const probes: DomainEvent[] = [
      { type: 'command-accepted', commandId: 'a', command: 'move', at: { x: 1, y: 1 } },
      { type: 'command-refused', commandId: 'b', at: { x: 1, y: 1 } },
      { type: 'friend-recruited', unicornId: 'leaf' },
      { type: 'effect', effect: 'hearts', at: { x: 1, y: 1 }, seconds: 1 },
      { type: 'effect', effect: 'treasure-sparkle', at: { x: 1, y: 1 }, seconds: 1 },
      { type: 'effect', effect: 'relocate', at: { x: 1, y: 1 }, seconds: 1 },
      { type: 'effect', effect: 'bubbles', at: { x: 1, y: 1 }, seconds: 1 },
      { type: 'effect', effect: 'cloud', at: { x: 1, y: 1 }, seconds: 1 },
      { type: 'effect', effect: 'rainbow-arc', at: { x: 1, y: 1 }, seconds: 1 },
      { type: 'npc-waved', npcId: 'stable-worker' },
      { type: 'portal-entered', portalId: 'to-garden', to: { mapId: 'palace-garden', spawnId: 'door' } },
    ];
    for (const id of UNICORN_IDS) {
      probes.push(
        { type: 'greeting-started', unicornId: id, at: { x: 1, y: 1 } },
        { type: 'cast-released', castId: id, unicornId: id, at: { x: 1, y: 1 } },
      );
      for (const activityId of ACTIVITY_IDS) probes.push({ type: 'activity-started', actorId: id, activityId });
    }
    for (const clip of ['water', 'trim', 'sweep', 'pickup', 'putdown', 'brush'] as const)
      probes.push({ type: 'activity-started', actorId: 'stable-worker', activityId: clip });
    for (const r of REACTIONS) probes.push({ type: 'prop-reacted', instanceId: 'x', reaction: r.id, seconds: 1 });
    for (const activity of [
      'door-opening',
      'chest-opening',
      'chest-closing',
      'treasure-bounce',
      'treasure-float',
      'palace-welcome',
      'cup-fill',
    ] as const)
      probes.push({ type: 'prop-activity', instanceId: 'x', activity, seconds: 1 });
    // One at a time, so what one event leaves out for another's sake does not hide what it can do
    // alone.
    for (const probe of probes) for (const cue of cuesFor([probe], w)) produced.add(cue.sound);
    // The meadow's way through has a door and the stable's has none.
    for (const cue of cuesFor(
      [{ type: 'portal-entered', portalId: 'to-garden', to: { mapId: 'palace-garden', spawnId: 'door' } }],
      makeWorld(),
    ))
      produced.add(cue.sound);

    // A thing to enjoy is voiced by its own definition, which the test of the harp above reads, so
    // what its definitions name is wired.
    for (const def of Object.values(PROP_DEFS)) if (def.delight) produced.add(def.delight.sound);

    const forgotten = (Object.keys(SOUND_FAMILIES) as SoundFamilyId[]).filter((f) => !produced.has(f));
    expect(forgotten).toEqual([]);
  });
});
