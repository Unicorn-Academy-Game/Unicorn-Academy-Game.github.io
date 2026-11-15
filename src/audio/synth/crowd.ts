import type { FxName, VoiceName } from '../../wonder/sound';

/**
 * How much of the mix each sound takes, where 1 is the biggest thing there is (a firework going
 * off). Light sounds such as a twinkle or a tap hardly count, so a hundred of them can fall like
 * rain, and heavy ones fill the room quickly.
 */
export const WEIGHTS: Readonly<Record<FxName | VoiceName, number>> = {
  launch: 0.5,
  boom: 1,
  crackle: 0.15,
  pop: 0.35,
  snap: 0.3,
  boing: 0.4,
  whoosh: 0.5,
  splash: 0.6,
  star: 0.9,
  twinkle: 0.12,
  swell: 0.7,
  tap: 0.2,
  cheer: 0.8,
  gear: 0.4,
  ding: 0.5,
  poof: 0.35,
  whistle: 0.4,
  rumble: 0.5,
  wind: 0.3,
  coin: 0.4,
  thud: 0.6,
  bell: 0.25,
  glass: 0.25,
  pluck: 0.25,
  marimba: 0.25,
  harp: 0.2,
  pad: 0.3,
  bass: 0.35,
  chime: 0.2,
  flute: 0.3,
  ping: 0.02,
  kick: 0.5,
  snare: 0.35,
  hat: 0.1,
  // The tone matrix's own parts: as light as its melody, because the game turns a crowd of its
  // notes down itself.
  sub: 0.02,
  kit: 0.02,
};

/**
 * Keeps a pile of sounds from becoming a wall. It counts how much sound has just been started, lets
 * that fade away as the sounds do, and gives a new sound only the room that is left. The first few
 * sounds of a burst go in at full strength, so a crescendo keeps its start; once the pile is full,
 * the rest are turned down to their floor, which for a light sound is nothing. Measured in a
 * browser, a show of fourteen shells at once stays near -10 LUFS and a hundred sounds in a second
 * near -12, where the quietest sound of the world's own is -15 and a single firework is -17.
 */
export class Crowd {
  private load = 0;
  private at = Number.NEGATIVE_INFINITY;

  constructor(
    /** How much weight may be sounding before there is no room left. About three fireworks. */
    private readonly capacity = 3.2,
    /** Seconds for half of what is sounding to have died away. */
    private readonly halfLife = 0.4,
  ) {}

  /**
   * What a sound of `weight` that starts at `t` is multiplied by, between `floor` and 1, and it is
   * counted in at the level it is played at. Times may be given a little out of order, as when
   * sounds are scheduled ahead; a sound earlier than the last is judged by the pile as the last
   * left it, which can only make it quieter.
   */
  admit(t: number, weight: number, floor = 0.3): number {
    if (t > this.at) {
      if (Number.isFinite(this.at)) this.load *= 0.5 ** ((t - this.at) / this.halfLife);
      this.at = t;
    }
    const room = this.capacity - this.load;
    const gain = weight <= room ? 1 : Math.max(floor, room / weight);
    this.load += weight * gain;
    return gain;
  }

  /** What is sounding now, for tests. */
  get weight(): number {
    return this.load;
  }
}
