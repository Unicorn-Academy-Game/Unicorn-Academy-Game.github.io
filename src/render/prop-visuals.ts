import { POOL } from '../content/cave';
import {
  type ArchPiece,
  type ArchSide,
  DISSOLVE,
  dissolveStart,
  PAINT,
  PAINTED,
  PIECES_PER_SIDE,
  paintStart,
  pieceOf,
  pieceSprite,
  SHIMMER,
  shimmerWave,
} from '../content/fountain-rainbow';
import { MAGIC_COLOR, magicOfReaction } from '../content/magic';
import { GEM_IDS, type GemId, PRODUCE } from '../content/produce';
import { clusterOf, DOOR_REVEAL_SECONDS, GEM_TABLES, type GemTable, gemOn, PROP_DEFS, tableOf } from '../content/props';
import type { MagicKind } from '../shared/ids';
import type { SavedPropState } from '../shared/save';
import { blend, turn, wheel } from './rainbow';

/**
 * What each interactive prop looks like. The map places only a prop's collision; its picture comes
 * from here, drawn from the definition, the instance's `look`, its saved state and what it is doing
 * for a moment (a door swinging, a cup filling). Everything here is a pure function of those facts,
 * so it is tested without a graphics context.
 */

/**
 * How a sprite is shown: its own looping animation, one frame, its animation played from a given
 * moment, or played to a given share of its length.
 */
type Show =
  | { kind: 'loop' }
  | { kind: 'frame'; index: number }
  | { kind: 'time'; ms: number; reverse?: boolean }
  | { kind: 'fraction'; at: number };

export interface Layer {
  sprite: string;
  show: Show;
  /** Pixels the layer is lifted by. Negative is up. */
  dy?: number;
  alpha?: number;
  /** In front of (positive) or behind (negative) things standing at the same y. */
  bias?: number;
  /**
   * Multiplies every colour of the picture by this one, as 0xRRGGBB, so a picture drawn in white
   * takes on any colour.
   */
  tint?: number;
  /**
   * Adds the picture's light to what is behind it, so a glow brightens the floor and never hides
   * it.
   */
  glow?: true;
  /** How many times bigger than drawn. */
  scale?: number;
}

/**
 * A prop is its body, which stands on the ground and casts the shadow, and at most one overlay laid
 * over it. What shines on the floor under it, a glow or a sheet of ice, is `under`: it lies on the
 * ground and everything that stands is drawn over it.
 */
export interface Picture {
  under?: Layer | null;
  body: Layer | null;
  overlay: Layer | null;
}

export interface Moment {
  kind: string;
  /** Seconds since it began. */
  seconds: number;
  total: number;
}

export interface PropFacts {
  definitionId: string;
  instanceId: string;
  look: string | undefined;
  state: SavedPropState | undefined;
  moment: Moment | undefined;
  /** The door is open for the game, by a word or a clue. Only doors that start shut have it. */
  unlocked?: boolean;
  /**
   * How old the world is, in seconds, for the crystals that go through their colours as it goes.
   */
  now?: number;
  /** She has the crown on, so the stand that held it stands empty. */
  worn?: boolean;
}

const NOTHING: Picture = { body: null, overlay: null };
const still = (sprite: string, extra: Partial<Layer> = {}): Layer => ({
  sprite,
  show: { kind: 'frame', index: 0 },
  ...extra,
});
const loop = (sprite: string, extra: Partial<Layer> = {}): Layer => ({ sprite, show: { kind: 'loop' }, ...extra });
const body = (layer: Layer): Picture => ({ body: layer, overlay: null });

/**
 * A small stable number from an id, so a prop keeps its look across reloads and map transitions.
 */
export function variantOf(instanceId: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < instanceId.length; i++) h = Math.imul(h ^ instanceId.charCodeAt(i), 16777619);
  return (h >>> 0) % Math.max(1, count);
}

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const isLit = (state: SavedPropState | undefined): boolean =>
  (state?.kind === 'lantern' || state?.kind === 'brazier') && state.lit;
const during = (f: PropFacts, ...kinds: string[]): Moment | undefined =>
  f.moment && kinds.includes(f.moment.kind) ? f.moment : undefined;

const FLOAT_LIFT = 74;

/**
 * A gem rises from its tray, hangs there turning and settles back. Returns pixels up and how
 * visible it is.
 */
export function floatOf(seconds: number, total: number): { lift: number; alpha: number } {
  const envelope = smooth(seconds / 0.6) * smooth((total - seconds) / 0.7);
  return {
    lift: FLOAT_LIFT * envelope + Math.sin(seconds * Math.PI * 2 * 1.3) * 3 * envelope,
    alpha: Math.sqrt(envelope),
  };
}

/** Coins and notes hop three times, smaller each time. Returns pixels up. */
export function bounceOf(seconds: number, total: number): number {
  const t = Math.min(1, seconds / total);
  return Math.abs(Math.sin(Math.PI * 3 * t)) * 16 * (1 - t) * (1 - t);
}

/**
 * Where a gem lies on its table, in pixels above the table's ground point, so the copy that rises
 * starts there. The diamond's table is a pedestal, taller than a tray.
 */
const restOf = (gem: GemTable): number => (gem === 'diamond' ? 62 : 37);

/**
 * A pile, a desk or a table is drawn as the sprite of its own name. A gem table also lifts a copy
 * of its own gem, so the stone that turns in the air is the one that lies on the table and the one
 * the player is asked to spell.
 */
function treasure(f: PropFacts): Picture {
  const hop = during(f, 'treasure-bounce');
  const standing = still(f.definitionId, hop ? { dy: -bounceOf(hop.seconds, hop.total) } : {});
  const rise = during(f, 'treasure-float');
  const gem = gemOn(f.definitionId);
  if (!rise || !gem) return body(standing);
  const { lift, alpha } = floatOf(rise.seconds, rise.total);
  return { body: standing, overlay: loop(`float-${gem}`, { dy: -(restOf(gem) + lift), alpha, bias: 1 }) };
}

function chest(f: PropFacts): Picture {
  const open = f.state?.kind === 'chest' && f.state.open;
  const swing = during(f, 'chest-opening', 'chest-closing');
  if (swing)
    return body({
      sprite: 'chest-opening',
      show: { kind: 'time', ms: swing.seconds * 1000, reverse: swing.kind === 'chest-closing' },
    });
  return body(still(open ? 'chest-open' : 'chest-closed'));
}

/**
 * A door's overlay sits over the building or wall piece that holds it. Walls are placed 20 behind
 * their feet, buildings 1.
 */
const DOORS: Readonly<Record<string, { sprite: string; bias: number }>> = {
  'treasure-out': { sprite: 'door-treasure', bias: 0.5 },
  'stable-out': { sprite: 'door-stable', bias: 0.5 },
  'palace-in': { sprite: 'door-palace-in', bias: 1 },
  'palace-room': { sprite: 'door-palace-room', bias: 1 },
  'treasure-in': { sprite: 'door-treasure-in', bias: 1 },
  'stable-in': { sprite: 'door-stable-in', bias: 1 },
  'manor-out': { sprite: 'door-manor-out', bias: 0.5 },
  'manor-in': { sprite: 'door-manor-in', bias: 1 },
  'magic-in': { sprite: 'door-magic-in', bias: 1 },
  'hut-in': { sprite: 'door-hut-in', bias: 1 },
  'cabin-in': { sprite: 'door-cabin-in', bias: 1 },
};

/**
 * The building leaves its doorway dark and the door sprite fills it. Frame 0 is the door shut, so
 * that is what shows at rest.
 */
function door(f: PropFacts): Picture {
  const d = DOORS[f.look ?? ''];
  if (!d) return NOTHING;
  const swing = during(f, 'door-opening');
  const show: Show = swing ? { kind: 'time', ms: swing.seconds * 1000 } : { kind: 'frame', index: 0 };
  return { body: null, overlay: { sprite: d.sprite, show, bias: d.bias } };
}

/**
 * A lift door slides. Once a clue or a ride has opened it, it rests open. Only the slide that the
 * clue itself starts is played, so a door that was already open does not shut and open again when
 * she walks in.
 */
const liftDoor =
  (sprite: string) =>
  (f: PropFacts): Picture => {
    const swing = during(f, 'door-opening');
    const reveal = swing && (!f.unlocked || swing.total <= DOOR_REVEAL_SECONDS);
    const show: Show = reveal
      ? { kind: 'time', ms: swing.seconds * 1000 }
      : f.unlocked
        ? { kind: 'time', ms: 0, reverse: true }
        : { kind: 'frame', index: 0 };
    return { body: null, overlay: { sprite, show, bias: 1 } };
  };

/**
 * A cup always holds water. While someone drinks from it the level dips and comes back, sip after
 * sip.
 */
function cup(f: PropFacts): Picture {
  return body(during(f, 'cup-fill') ? loop('cup-sip') : loop('cup-full'));
}

const BED_OF: Readonly<Record<string, number>> = { long: 1, square: 2, round: 3 };

function flowerbed(f: PropFacts): Picture {
  const state = f.state?.kind === 'flowerbed' ? f.state.state : 'leafy';
  return body(still(`bed-${state}-${BED_OF[f.look ?? ''] ?? 1}`));
}

/**
 * The fountain flows from the top all the time. The water spell adds its spray on top of that and
 * does not switch it on.
 */
const fountain = (): Picture => ({ body: null, overlay: loop('fountain-jet', { bias: 2 }) });

const lantern = (f: PropFacts): Picture => body(isLit(f.state) ? loop('lantern-on') : still('lantern-off'));
const brazier = (f: PropFacts): Picture => body(isLit(f.state) ? loop('brazier-lit') : still('brazier-unlit'));
const pinwheel = (f: PropFacts): Picture =>
  body(during(f, 'spin-pinwheel') ? loop('pinwheel-spin') : still('pinwheel-still'));
const ornament = (f: PropFacts): Picture =>
  body(during(f, 'glow-ornament') ? loop('ornament-glow') : still('ornament-calm'));
const iceDisplay = (f: PropFacts): Picture =>
  body(during(f, 'ice-ornament') ? loop('ice-display-frozen') : still('ice-display-idle'));
const brushStation = (): Picture => body(still('brush-station'));
const crystal = (f: PropFacts): Picture =>
  body(still(`crystal-amethyst-${isLit(f.state) ? 'lit' : 'dim'}-${variantOf(f.instanceId, 2) + 1}`));

/** Each fruit tree has two looks, and an instance keeps the same one for good. */
const orchardTree =
  (kind: 'apple' | 'berry') =>
  (f: PropFacts): Picture =>
    body(still(`g-tree-${kind}-${variantOf(f.instanceId, 2) + 1}`));
const cropBed = (crop: string) => (): Picture => body(still(`g-bed-${crop}`));

/**
 * Pixels a delight is lifted by this long after it was tapped: it bounces twice and settles. Zero
 * for things that stay put.
 */
function delightHop(seconds: number, total: number, height: number): number {
  const t = Math.min(1, Math.max(0, seconds / Math.max(0.001, total)));
  return Math.abs(Math.sin(Math.PI * 2 * t)) * height * (1 - t);
}

/** A thing to enjoy is one picture that hops a little when it is tapped. */
const delighted =
  (sprite: string) =>
  (f: PropFacts): Picture => {
    const m = during(f, 'delight');
    const hop = PROP_DEFS[f.definitionId]?.delight?.hop ?? 0;
    return body(still(sprite, m && hop > 0 ? { dy: -delightHop(m.seconds, m.total, hop) } : {}));
  };

/**
 * The world's badge rises over a statue while it reacts, and sinks back. Returns how far it has
 * risen in pixels and how visible it is.
 */
function badgeOf(seconds: number, total: number): { rise: number; alpha: number } {
  const envelope = smooth(seconds / 0.4) * smooth((total - seconds) / 0.5);
  return { rise: 26 * envelope, alpha: envelope };
}

/** Where the badge floats above a statue's ground point, in pixels. */
const BADGE_HEIGHT = 292;

const statue = (f: PropFacts): Picture => {
  const name = f.definitionId.slice('statue-'.length);
  return hops(
    () => `mn-statue-${name}`,
    (_f, m) => {
      const b = badgeOf(m.seconds, m.total);
      return still(`mn-badge-${name}`, { dy: -(BADGE_HEIGHT + b.rise), alpha: b.alpha, bias: 1 });
    },
  )(f);
};

/**
 * The clue sits this far above the foot of the wall, so it has to be pulled this far forward to be
 * drawn over it.
 */
const CLUE_BIAS = 140;

const pumpkinOf = (f: PropFacts): string => `mn-pumpkin-${lookOf(f, 'big')}`;

/**
 * A toy that plays its own frames from the moment it is tapped, and rests on its first frame the
 * rest of the time.
 */
const plays =
  (sprite: (f: PropFacts) => string) =>
  (f: PropFacts): Picture => {
    const m = during(f, 'delight');
    return body(m ? { sprite: sprite(f), show: { kind: 'time', ms: m.seconds * 1000 } } : still(sprite(f)));
  };

/** A toy that hops a little and settles. */
const hops =
  (sprite: (f: PropFacts) => string, overlay?: (f: PropFacts, m: Moment) => Layer | null) =>
  (f: PropFacts): Picture => {
    const m = during(f, 'delight');
    const hop = PROP_DEFS[f.definitionId]?.delight?.hop ?? 0;
    return {
      body: still(sprite(f), m && hop > 0 ? { dy: -delightHop(m.seconds, m.total, hop) } : {}),
      overlay: m && overlay ? overlay(f, m) : null,
    };
  };

const lookOf = (f: PropFacts, fallback: string): string => f.look ?? fallback;

/** A vase of flowers or diamonds is one picture, named for what it holds. */
const vaseSprite = (look: string): string => `ph-vase-${look}`;

/**
 * She stands 52 in front of the bed's ground point to lie in it, and the quilt is drawn over her,
 * so it is drawn as if it stood just in front of that.
 */
export const QUILT_BIAS = 54;

/** The balloons rise and fade, are gone for a moment, then fade back in tied to their weight. */
export function balloonsOf(seconds: number, total: number): { lift: number; alpha: number } {
  const t = Math.min(1, Math.max(0, seconds / Math.max(0.001, total)));
  if (t < 0.6) return { lift: 300 * (t / 0.6) * (t / 0.6), alpha: 1 - smooth((t - 0.15) / 0.45) };
  return { lift: 0, alpha: smooth((t - 0.8) / 0.2) };
}

/** The gem fountain throws its jewels while she watches, thickest in the middle of the reaction. */
export function jetOf(seconds: number, total: number): number {
  return smooth(seconds / 0.3) * smooth((total - seconds) / 0.5);
}

/**
 * The arch is drawn as if it stood 100 units north of the line between the horns: in front of the
 * stable house and the lanterns beyond the court, and behind the statues, the basin and everything
 * that stands in the court.
 */
export const ARCH_BIAS = -100;

/**
 * How much of one piece of the arch shows, from 0 to 1, `seconds` after the rainbow was first cast
 * and when it lasts `total` seconds. The pieces come in one after another from the horns to the
 * apex, stand in a soft wave of light that runs the same way, and go from the apex to the horns, so
 * the arch is painted on and taken off and never blinks.
 */
export function archAlphaOf(piece: ArchPiece, seconds: number, total: number): number {
  const wave = shimmerWave((piece.index + 0.5) / PIECES_PER_SIDE, seconds);
  const lit = 1 - smooth((seconds - PAINTED) / SHIMMER.settle) * SHIMMER.depth * (1 - wave);
  return (
    smooth((seconds - paintStart(piece)) / PAINT.ramp) *
    lit *
    (1 - smooth((seconds - dissolveStart(piece, total)) / DISSOLVE.ramp))
  );
}

/**
 * A piece of the arch is two sprites, the left half in the body and the right half in the overlay,
 * so one host stands for both.
 */
function arch(f: PropFacts): Picture {
  const piece = pieceOf(f.look);
  const m = during(f, 'light-rainbow');
  if (!piece || !m) return NOTHING;
  const alpha = archAlphaOf(piece, m.seconds, m.total);
  if (alpha < 0.004) return NOTHING;
  const half = (side: ArchSide): Layer => still(pieceSprite(piece, side), { alpha, bias: ARCH_BIAS });
  return { body: half('left'), overlay: half('right') };
}

/**
 * How strongly a reaction shows `seconds` into its `total`: it comes up quickly, holds, and fades
 * slowly, so it never blinks on or off.
 */
export function swellOf(seconds: number, total: number): number {
  return smooth(seconds / 0.5) * smooth((total - seconds) / 1.2);
}

/**
 * How far the door of the hut is open, from 0 to 1, `seconds` after it was tapped: it swings wide
 * and stays open while the herd goes in.
 */
export function doorwayOf(seconds: number): number {
  return smooth(seconds / 0.6);
}

const GLOW = 'cc-halo';
/** The same glow, as the beach and the river have it in their own bundle. */
const SHORE_GLOW = 'sh-cc-halo';
/** How wide the glow picture is drawn, in pixels. */
export const GLOW_ACROSS = 128;

/**
 * The soft round glow that lies on the floor behind a thing that shines, `across` pixels wide, with
 * its middle `rise` pixels above the thing's ground point.
 */
const halo = (tint: number, across: number, rise: number, alpha: number, sprite = GLOW): Layer => ({
  sprite,
  show: { kind: 'frame', index: 0 },
  tint,
  glow: true,
  scale: across / GLOW_ACROSS,
  dy: -rise,
  alpha,
});

/**
 * A number from 0 to 1 that an instance keeps for good, so two crystals side by side do not go
 * through their colours together.
 */
const phaseOf = (f: PropFacts): number => variantOf(f.instanceId, 1000) / 1000;

/**
 * The friend's magic that a thing is reacting to, and how strongly, when it has one of the
 * reactions that come one for each magic.
 */
function reactingTo(f: PropFacts, prefix: string): { magic: MagicKind; swell: number } | undefined {
  const magic = magicOfReaction(prefix, f.moment?.kind);
  return magic && f.moment ? { magic, swell: swellOf(f.moment.seconds, f.moment.total) } : undefined;
}

/**
 * A cluster of crystals: its own picture, and a faint glow of its own colour round its foot. The
 * rainbow one goes through every colour.
 */
const cluster =
  (gem: GemId) =>
  (f: PropFacts): Picture => {
    if (gem === 'rainbow')
      return {
        under: halo(wheel(turn(f.now ?? 0, 8, phaseOf(f)), 0.2), 170, 46, 0.55),
        body: loop('cc-rainbow-1'),
        overlay: null,
      };
    const n = variantOf(f.instanceId, 2) + 1;
    return {
      under: halo(PRODUCE[gem].tint, n === 1 ? 140 : 110, 36, 0.3),
      body: still(`cc-${gem}-${n}`),
      overlay: null,
    };
  };

/** How high above the foot of the Heart its crystals are centred, in pixels. */
const HEART_RISE = 150;

/**
 * The Heart Crystal goes slowly round every colour of the rainbow. When a friend's magic reaches
 * it, it takes on her colour and flares, and then goes back to the rainbow from where it was.
 */
const heartCrystal = (f: PropFacts): Picture => {
  const now = f.now ?? 0;
  const resting = wheel(turn(now, 14, phaseOf(f)), 0.35);
  const reacting = reactingTo(f, 'heart');
  const swell = reacting?.swell ?? 0;
  const tint = reacting ? blend(resting, MAGIC_COLOR[reacting.magic], swell) : resting;
  const breath = 0.5 + 0.5 * Math.sin(now * 1.7);
  return {
    under: halo(tint, 380 + 70 * swell + 20 * breath, HEART_RISE, 0.5 + 0.35 * swell),
    body: still('cc-heart-dais'),
    overlay: still('cc-heart-crystal', { tint, bias: 0.5 }),
  };
};

/** How high above the foot of a pillar its crystal is centred, in pixels. */
const PILLAR_RISE = 166;

/**
 * A pillar glows a pale colour that drifts. Lightning charges it: it turns bright and flickers, and
 * never goes dark.
 */
const stormPillar = (f: PropFacts): Picture => {
  const now = f.now ?? 0;
  const resting = wheel(turn(now, 22, phaseOf(f)), 0.62);
  const m = during(f, 'charge-pillar');
  const swell = m ? swellOf(m.seconds, m.total) : 0;
  const flicker = swell > 0 ? 0.7 + 0.3 * Math.round(0.5 + 0.5 * Math.sin(now * 38)) : 1;
  const tint = blend(resting, 0xfff2a0, swell * flicker);
  return {
    under: halo(tint, 250 + 60 * swell, PILLAR_RISE, 0.3 + 0.55 * swell * flicker),
    body: still('cc-pillar-rock'),
    overlay: still('cc-pillar-crystal', { tint, bias: 0.5 }),
  };
};

/** How high above the foot of its stand the middle of the crystal ball is, in pixels. */
const ORB_RISE = 111;

/**
 * The crystal ball goes through the colours, and when the player touches it, twice round them in
 * the moment it takes.
 */
const crystalBall = (f: PropFacts): Picture => {
  const now = f.now ?? 0;
  const m = during(f, 'delight');
  const spin = m ? 2 * smooth(m.seconds / m.total) : 0;
  const swell = m ? swellOf(m.seconds, m.total) : 0;
  const tint = wheel(turn(now, 7, phaseOf(f) + spin), 0.2);
  return {
    under: halo(tint, 150 + 50 * swell, ORB_RISE, 0.55 + 0.3 * swell),
    body: still('cc-orb-stand'),
    overlay: still('cc-orb', { tint, bias: 0.5 }),
  };
};

/**
 * The chimes hang still, and ring when the player touches them or the storm does: they hop a little
 * and a light of the rainbow comes up behind them.
 */
const caveChimes = (f: PropFacts): Picture => {
  const m = during(f, 'delight', 'ring-chimes');
  const swell = m ? swellOf(m.seconds, m.total) : 0;
  const hop = PROP_DEFS['cave-chimes']!.delight!.hop;
  return {
    under: halo(wheel(turn(f.now ?? 0, 10, phaseOf(f)), 0.25), 170, 90, 0.15 + 0.5 * swell),
    body: still('cc-chimes', m ? { dy: -delightHop(m.seconds, m.total, hop) } : {}),
    overlay: null,
  };
};

/**
 * Crystals asleep: grey and dim, with one point of light in them that blinks. A friend's magic
 * wakes them in her colour: the white crystals come up over the dim ones, tinted, with a glow, and
 * fade away again.
 */
const sleepingCrystals = (f: PropFacts): Picture => {
  const n = variantOf(f.instanceId, 2) + 1;
  const woken = reactingTo(f, 'wake');
  const dim = loop(`cc-sleep-${n}`);
  if (!woken || woken.swell < 0.01) return body(dim);
  const flutter = 0.9 + 0.1 * Math.sin((f.now ?? 0) * 9);
  const tint = MAGIC_COLOR[woken.magic];
  return {
    under: halo(tint, 160, 52, 0.75 * woken.swell * flutter),
    body: dim,
    overlay: still(`cc-awake-${n}`, { tint, alpha: woken.swell, bias: 0.5 }),
  };
};

/** The witch's beds: leafy until nature's magic opens the flowers, which then breathe. */
function caveBed(f: PropFacts): Picture {
  const state = f.state?.kind === 'flowerbed' ? f.state.state : 'leafy';
  const look = f.look ?? 'long';
  return body(state === 'flowering' ? loop(`cc-bed-flowering-${look}`) : still(`cc-bed-leafy-${look}`));
}

/**
 * The brew bubbles all the time. Fire stokes it: the bubbles come faster and a red-gold light comes
 * up round it.
 */
const witchCauldron = (f: PropFacts): Picture => {
  const m = during(f, 'stoke-cauldron');
  if (!m) return body(loop('cc-cauldron'));
  return {
    under: halo(0xff9040, 230, 40, 0.75 * swellOf(m.seconds, m.total)),
    body: { sprite: 'cc-cauldron', show: { kind: 'time', ms: (f.now ?? 0) * 2400 } },
    overlay: null,
  };
};

/**
 * The green-gold of the light in the hut, and how far in front of the door's foot, in pixels, the
 * light on the floor is centred.
 */
const DOOR_LIGHT = 0xc4ff6a;
const DOOR_SPILL = 58;

/**
 * The door of the hut swings open when the player taps it, shows the light inside and takes her in.
 * Wildstar stands in front of it, so the light also lies on the floor round her feet. The hut
 * itself is scenery.
 */
const hutDoor = (f: PropFacts): Picture => {
  const m = during(f, 'door-opening');
  const open = m ? doorwayOf(m.seconds) : 0;
  return {
    under: open > 0 ? halo(DOOR_LIGHT, 280, -DOOR_SPILL, 0.9 * open) : null,
    body: null,
    overlay: { sprite: 'cc-hut-door', show: { kind: 'fraction', at: open }, bias: 0.5 },
  };
};

/**
 * The pool is tiles, so nothing is drawn for it until the ice spell freezes it: then a sheet of ice
 * lies over it, and melts away. The prop's point is on the south shore, so the sheet is drawn up
 * from it to the pool's middle.
 */
const glowPool = (f: PropFacts): Picture => {
  const m = during(f, 'freeze-pool');
  return m
    ? {
        under: still('cc-pool-ice', { alpha: 0.94 * swellOf(m.seconds, m.total), dy: -POOL.pointRise }),
        body: null,
        overlay: null,
      }
    : NOTHING;
};

/** The colour of each stage light that keeps one. The rainbow one goes through every colour. */
const STAGE_TINT: Readonly<Record<string, number>> = { pink: 0xff4fc3, cyan: 0x5fe8ff, gold: 0xffd24a };

/**
 * A stage light is a glowing place on the floor with a column of light standing on it, both added
 * to what is behind them so that the floor shows through. It breathes all the time and flares when
 * the player touches it. It is only light, so the herd walks through it.
 */
const stageLight = (f: PropFacts): Picture => {
  const now = f.now ?? 0;
  const m = during(f, 'delight');
  const swell = m ? swellOf(m.seconds, m.total) : 0;
  const look = lookOf(f, 'pink');
  const tint = look === 'rainbow' ? wheel(turn(now, 6, phaseOf(f)), 0.25) : (STAGE_TINT[look] ?? STAGE_TINT.pink!);
  const breath = 0.5 + 0.5 * Math.sin(now * 2.2 + phaseOf(f) * Math.PI * 2);
  return {
    under: still('pg-stage-pad', {
      tint,
      glow: true,
      scale: 0.8 + 0.35 * swell,
      alpha: 0.5 + 0.2 * breath + 0.3 * swell,
    }),
    body: null,
    overlay: still('pg-stage-beam', {
      tint,
      glow: true,
      scale: 1 + 0.25 * swell,
      alpha: 0.3 + 0.1 * breath + 0.45 * swell,
      bias: 0.5,
    }),
  };
};

/**
 * The clam lies shut until she taps it: then it opens on its pearl, which glows on the sand, and
 * shuts again as the pearl is gathered.
 */
const clam = (f: PropFacts): Picture => {
  const m = during(f, 'harvest');
  return {
    under: m ? halo(0xfff0ff, 150, 26, 0.85 * swellOf(m.seconds, m.total), SHORE_GLOW) : null,
    body: still(m ? 'sh-clam-open' : 'sh-clam-shut'),
    overlay: null,
  };
};

/** The lighthouse lamp is dark and lights while it is tapped, with a glow round the lamp. */
const lighthouse = (f: PropFacts): Picture => {
  const m = during(f, 'delight');
  return {
    under: m ? halo(0xfff3a8, 380, 392, 0.8 * swellOf(m.seconds, m.total), SHORE_GLOW) : null,
    body: still(m ? 'sh-lighthouse-lit' : 'sh-lighthouse-dark'),
    overlay: null,
  };
};

/** A castle site shows the stage it is at, and bounces a little as a new one goes up. */
const CASTLE_STAGES = ['sh-bucket-pink', 'sh-mound', 'sh-castle-small', 'sh-castle-grand'] as const;
const castleSite = (f: PropFacts): Picture => {
  const stage = f.state?.kind === 'castle' ? f.state.stage : 0;
  const m = during(f, 'build');
  return body(still(CASTLE_STAGES[stage]!, m ? { dy: -delightHop(m.seconds, m.total, 16) } : {}));
};

/** The glow in the grove's own bundle, and the tint of the lamp light in the snow. */
const GROVE_GLOW = 'xm-halo';
const CHRISTMAS_LIGHT = 0xffe7a0;

/**
 * A present is shut with its bow on until she taps it. Then the lid comes off, the toy light shines
 * out of it and the confetti flies.
 */
const present = (f: PropFacts): Picture => {
  const wrap = lookOf(f, 'red');
  const m = during(f, 'delight');
  if (!m) return body(still(`xm-present-${wrap}`));
  const hop = PROP_DEFS.present!.delight!.hop;
  return {
    under: halo(CHRISTMAS_LIGHT, 190, 40, 0.9 * swellOf(m.seconds, m.total), GROVE_GLOW),
    body: still(`xm-present-open-${wrap}`, { dy: -delightHop(m.seconds, m.total, hop) }),
    overlay: null,
  };
};

/**
 * A Christmas tree's lights run round it all the time, a third of the bulbs at a time, and a tap
 * makes them dazzle: faster, brighter, with a warm light over the floor round the foot of the tree.
 * `across` is how wide that light is, in pixels.
 */
const litTree =
  (tree: string, lights: string, across: number) =>
  (f: PropFacts): Picture => {
    const m = during(f, 'delight');
    const swell = m ? swellOf(m.seconds, m.total) : 0;
    const breath = 0.5 + 0.5 * Math.sin((f.now ?? 0) * 1.6 + phaseOf(f) * Math.PI * 2);
    return {
      under: m ? halo(CHRISTMAS_LIGHT, across, 40, 0.55 * swell, GROVE_GLOW) : null,
      body: still(tree),
      overlay: loop(lights, { glow: true, alpha: 0.55 + 0.15 * breath + 0.3 * swell, bias: 1 }),
    };
  };
const christmasTree = litTree('xm-tree', 'xm-tree-lights', 520);
/** The little tree in Santa's cabin. */
const roomTree = litTree('xw-tree', 'xw-tree-lights', 260);

/**
 * The fire in the cabin's hearth never goes out, and a tap makes it roar: the flames burn brighter
 * and a warm light fills the floor in front of the hearth.
 */
const hearthFire = (f: PropFacts): Picture => {
  const m = during(f, 'delight');
  const swell = m ? swellOf(m.seconds, m.total) : 0;
  const flicker = 0.5 + 0.5 * Math.sin((f.now ?? 0) * 7 + phaseOf(f) * 6);
  return {
    under: halo(CHRISTMAS_LIGHT, 440, -30, 0.2 + 0.08 * flicker + 0.55 * swell, GROVE_GLOW),
    body: still('xw-hearth'),
    overlay: loop('xw-fire', { glow: true, alpha: 0.85 + 0.15 * flicker, bias: 1 }),
  };
};

/**
 * The cabin's door glows warm as the herd goes in, and the light spills over the snow in front of
 * it. The cabin is scenery, and the lit doorway is drawn on its own anchor so it lines up.
 */
const CABIN_SPILL = 70;
const cabinDoor = (f: PropFacts): Picture => {
  const m = during(f, 'door-opening');
  const open = m ? doorwayOf(m.seconds) : 0;
  return {
    under: open > 0 ? halo(CHRISTMAS_LIGHT, 250, -CABIN_SPILL, 0.9 * open, GROVE_GLOW) : null,
    body: null,
    overlay: open > 0 ? { sprite: 'xm-cabin-lit', show: { kind: 'frame', index: 0 }, alpha: open, bias: 0.5 } : null,
  };
};

/** The sleigh shines while it is tapped, as if it had just landed. */
const sleigh = (f: PropFacts): Picture => {
  const m = during(f, 'delight');
  return {
    under: m ? halo(CHRISTMAS_LIGHT, 260, 60, 0.7 * swellOf(m.seconds, m.total), GROVE_GLOW) : null,
    body: still('xm-sleigh'),
    overlay: null,
  };
};

/** The lamp posts hold a lantern that glows warmer when it is tapped. */
const candyLamp = (f: PropFacts): Picture => {
  const m = during(f, 'delight');
  const look = lookOf(f, 'red');
  return {
    under: halo(CHRISTMAS_LIGHT, m ? 190 : 120, 120, m ? 0.85 * swellOf(m.seconds, m.total) : 0.28, GROVE_GLOW),
    body: still(`xm-lamp-${look}`),
    overlay: null,
  };
};

const DRAWN: Readonly<Record<string, (f: PropFacts) => Picture>> = {
  chest,
  door,
  cup,
  'brush-station': brushStation,
  'coin-pile': treasure,
  'gold-bars': treasure,
  'sack-pile': treasure,
  'money-desk': treasure,
  'cash-desk': treasure,
  ...Object.fromEntries(GEM_TABLES.map((gem) => [tableOf(gem), treasure])),
  lantern,
  crystal,
  flowerbed,
  brazier,
  pinwheel,
  'weather-ornament': ornament,
  'fountain-spout': fountain,
  'fountain-rainbow': arch,
  'ice-display': iceDisplay,
  'apple-tree': orchardTree('apple'),
  'berry-tree': orchardTree('berry'),
  'carrot-bed': cropBed('carrot'),
  'tomato-bed': cropBed('tomato'),
  'strawberry-bed': cropBed('strawberry'),
  'pumpkin-bed': cropBed('pumpkin'),
  'cabbage-bed': cropBed('cabbage'),
  'berry-bed': cropBed('berry'),
  'boxed-unicorn': (f) => {
    const m = during(f, 'delight');
    const hop = PROP_DEFS['boxed-unicorn']!.delight!.hop;
    return body(loop(`boxed-${f.look ?? 'mint'}`, m ? { dy: -delightHop(m.seconds, m.total, hop) } : {}));
  },
  'rain-maker': () => body(still('tr-rain-maker')),
  throne: delighted('ph-throne'),
  chandelier: delighted('ph-chandelier'),
  'banquet-table': delighted('ph-table'),
  bookcase: delighted('ph-bookcase'),
  harp: delighted('ph-harp'),
  'canopy-bed': delighted('ph-bed'),
  'crown-stand': (f) => delighted(f.worn ? 'ph-crown-empty' : 'ph-crown')(f),
  'flower-vase': hops((f) => vaseSprite(lookOf(f, 'rose'))),
  'diamond-vase': hops((f) => vaseSprite(lookOf(f, 'clear'))),
  // The quilt is drawn over her, so she lies tucked in with her head on the pillow.
  'nap-bed': () => ({ body: still('ph-nap-bed'), overlay: still('ph-nap-quilt', { bias: QUILT_BIAS }) }),
  'gem-fountain': hops(
    () => 'pg-gem-fountain',
    (_f, m) => loop('pg-gem-jet', { alpha: jetOf(m.seconds, m.total), bias: 2 }),
  ),
  'rainbow-slide': hops(
    () => 'pg-slide',
    (_f, m) => ({ sprite: 'pg-slide-ball', show: { kind: 'time', ms: m.seconds * 1000 }, bias: 1 }),
  ),
  'bouncy-mushroom': plays((f) => `pg-mushroom-${lookOf(f, 'red')}`),
  'firework-launcher': hops((f) => `pg-fireworks-${lookOf(f, 'red')}`),
  'spell-cannon': hops((f) => `pg-cannon-${lookOf(f, 'star')}`),
  'morph-machine': plays((f) => `pg-morph-${lookOf(f, 'apple-gem')}`),
  'frog-pond': hops(() => 'pg-frog-lily'),
  'bubble-machine': () => body(loop('pg-bubbles')),
  'balloon-stand': (f) => {
    const m = during(f, 'delight');
    const up = m ? balloonsOf(m.seconds, m.total) : { lift: 0, alpha: 1 };
    return {
      body: still('pg-balloon-weight'),
      overlay: still(`pg-balloons-${lookOf(f, 'party')}`, { dy: -up.lift, alpha: up.alpha, bias: 1 }),
    };
  },
  'confetti-popper': hops(() => 'pg-popper'),
  'disco-light': stageLight,
  piano: plays(() => 'g-piano'),
  computer: plays(() => 'g-computer'),
  'memory-table': delighted('g-memory-table'),
  abacus: delighted('g-abacus'),
  'manor-door': door,
  'elevator-door': liftDoor('door-lift-secret'),
  'lift-door': liftDoor('door-lift-gold'),
  // The butterfly rests on the wall, above the floor, so it is drawn in front of the wall that is
  // behind it.
  'elevator-clue': () => body(loop('mn-clue', { bias: CLUE_BIAS })),
  'manor-chandelier': delighted('mn-chandelier'),
  'jack-o-lantern': hops(pumpkinOf),
  'statue-star-whale': statue,
  'statue-crystal-fox': statue,
  'statue-moon-hare': statue,
  'statue-ember-drake': statue,
  'statue-coral-seahorse': statue,
  'statue-cloud-lion': statue,
  'statue-storm-bird': statue,
  'statue-glow-owl': statue,
  'sky-urn-gold': delighted('sg-urn-gold'),
  'sky-planter-jewel': delighted('sg-planter-jewel'),
  'sky-orchid': delighted('sg-orchid'),
  'sky-tulips-crystal': delighted('sg-tulips-crystal'),
  'sky-bonsai-jade': delighted('sg-bonsai-jade'),
  'sky-fountain-lotus': () => body(loop('sg-fountain-lotus')),
  'sky-hanging-garden': delighted('sg-hanging-garden'),
  ...Object.fromEntries(GEM_IDS.map((gem) => [clusterOf(gem), cluster(gem)])),
  'sleeping-crystals': sleepingCrystals,
  'heart-crystal': heartCrystal,
  'storm-pillar': stormPillar,
  'crystal-ball': crystalBall,
  'cave-chimes': caveChimes,
  'witch-cauldron': witchCauldron,
  'hut-door': hutDoor,
  'jar-shelf': delighted('cc-jars'),
  'cave-bed': caveBed,
  'glow-pool': glowPool,
  'dig-spot': () => body(still('sh-mound')),
  'castle-site': castleSite,
  'spell-book': (f) => body(loop(`mh-book-${lookOf(f, 'rose')}`)),
  'star-globe': () => body(loop('mh-globe')),
  'floating-candles': () => body(loop('mh-candles')),
  'hall-cauldron': () => body(loop('mh-cauldron')),
  'hall-fountain': () => body(loop('mh-fountain-lotus')),
  'hall-chandelier': delighted('mh-chandelier'),
  clam,
  'sand-castle': hops((f) => `sh-castle-${lookOf(f, 'grand')}`),
  seashell: hops((f) => `sh-shell-${lookOf(f, 'scallop-pink')}`),
  lighthouse,
  'glitter-plant': (f) => body(loop(`sh-gl-${lookOf(f, 'bush-1')}`)),
  'glitter-tree': () => body(loop('sh-gl-tree')),
  present,
  'xmas-tree': christmasTree,
  'cabin-door': cabinDoor,
  'cabin-hearth': hearthFire,
  armchair: delighted('xw-armchair'),
  'cookie-table': delighted('xw-cookies'),
  'santa-sack': delighted('xw-sack'),
  'toy-shelf': delighted('xw-toy-shelf'),
  'toy-bench': delighted('xw-bench'),
  'room-tree': roomTree,
  sleigh,
  'candy-lamp': candyLamp,
  snowman: hops((f) => `xm-snowman-${lookOf(f, 'red')}`),
  reindeer: hops(() => 'xm-reindeer'),
  'snow-pile': hops((f) => `xm-pile-${lookOf(f, '1')}`),
};

/**
 * What a prop shows right now. Definitions that draw nothing of their own, like the palace door,
 * give an empty picture.
 */
export function drawProp(f: PropFacts): Picture {
  return DRAWN[f.definitionId]?.(f) ?? NOTHING;
}
