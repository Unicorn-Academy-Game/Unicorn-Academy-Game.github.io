import type { UnicornId } from '../../../src/shared/ids';
import type { RampOpts } from '../core/color';
import type { V3 } from '../core/vec';

export type SignatureKind = 'mote-gaze' | 'flower-sniff' | 'hoof-stamp' | 'splash' | 'mane-toss' | 'hop';

/**
 * A coat surface test in unposed model space; matches paint a different palette entry over the
 * coat.
 */
export interface Decal {
  /** Palette key, resolved by the kit. */
  paint: string;
  /**
   * `rest` is the unposed model-space position. `head` is the same point in head-local space
   * divided by the head scale, and is null off the head and jaw, so head markings do not depend on
   * the build.
   */
  test: (rest: V3, part: number, head: V3 | null) => boolean;
}

export interface PaletteEntry {
  base: string;
  steps?: number;
  ramp?: RampOpts;
  /** Explicit ramp, darkest first. Overrides `base`/`ramp`. */
  colors?: readonly string[];
  outline?: string;
  outlineLit?: string;
  line?: string;
  priority?: number;
  protect?: boolean;
  flat?: number;
  emissive?: number;
  noOutline?: boolean;
  noLines?: boolean;
}

export interface Build {
  /** Barrel width multiplier. */
  bulk: number;
  /** Neck length multiplier. */
  neck: number;
  /** Head scale. */
  head: number;
}

export type CharmKind = 'flame' | 'spiral';

/** Halter parts. Every value is a palette key, resolved by the kit. */
export interface HalterSpec {
  strap: string;
  trim: string;
  gem: string;
  /** A differently colored noseband. */
  noseband?: string;
  /** Small studs along the straps. */
  studs?: string;
  /** A cheek plate. */
  plate?: string;
  /** Leaf clusters along the straps. */
  leaves?: string;
  /** An ornament on the cheek. */
  charm?: { kind: CharmKind; paint: string };
}

export interface ManeStyle {
  /** Locks per side along the crest. */
  locks: number;
  /** Lock length range. */
  length: [number, number];
  width: [number, number];
  /** Backward flow strength (wind), 0..1. */
  flow: number;
  forelock: number;
  /** Small flowers tucked into the mane, as palette keys for the petals and the heart. */
  flowers?: { petal: string; heart: string; count: number };
}

export interface TailStyle {
  locks: number;
  length: [number, number];
  width: [number, number];
}

export interface UnicornSpec {
  id: UnicornId;
  displayName: string;
  build: Build;
  palette: Record<string, PaletteEntry>;
  /** Palette keys cycled across mane and tail locks. */
  hair: string[];
  mane: ManeStyle;
  tail: TailStyle;
  halter: HalterSpec;
  decals: Decal[];
  /** Horn length in units and spiral turns. */
  horn: { length: number; turns: number; baseRadius: number };
  eye: { lash: boolean; size: number /** Upper lid drop, 0 open to 1 closed. */; lid?: number };
  /** Personality action for the signature-idle clip. */
  signature: SignatureKind;
}
