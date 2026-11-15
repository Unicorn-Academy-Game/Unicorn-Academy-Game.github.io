/**
 * How a rider looked at one moment, for a friend who follows her to look the same a little later.
 */
export interface Pose {
  x: number;
  y: number;
  /** Turn of her body, in radians. */
  rot: number;
  /** How stretched she is across and up, for a leap and a landing. */
  sx: number;
  sy: number;
  /** Whether she is off the rainbow. */
  air: boolean;
  /**
   * How far her legs have run along the rainbow, so they move as far as she goes and her hooves do
   * not slide. It stands still in the air.
   */
  dist: number;
  /**
   * How far she has come along her way, through the air and all. A friend who is a hundred units
   * behind her is at the place she was when this was a hundred less.
   */
  s: number;
}

export const newPose = (): Pose => ({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, air: false, dist: 0, s: 0 });

/**
 * What the leader did over the last few seconds. A friend behind her is the leader as she was a
 * little way back along her path, so the line of friends goes up every hill and leaps every leap
 * one after another with nothing to work out, and stays the same distance apart however fast she
 * goes. She only ever goes forward, so every place she has been is on the list once.
 */
export class History {
  private readonly poses: Pose[];
  private head = -1;
  private size = 0;

  constructor(readonly capacity = 480) {
    this.poses = Array.from({ length: capacity }, newPose);
  }

  get length(): number {
    return this.size;
  }

  clear(): void {
    this.head = -1;
    this.size = 0;
  }

  /** Writes down how she looks now. How far she has come (`s`) must not go down. */
  push(pose: Pose): void {
    this.head = (this.head + 1) % this.capacity;
    copy(pose, this.poses[this.head]!);
    this.size = Math.min(this.size + 1, this.capacity);
  }

  /**
   * How she looked when she had come `s` along her way, found between the two moments written down
   * around it. Before the first it is the first, and after the last it is the last.
   */
  at(s: number, out: Pose = newPose()): Pose {
    if (this.size === 0) return out;
    const newest = this.head;
    if (this.poses[newest]!.s <= s) return copy(this.poses[newest]!, out);
    // Walk back from the newest to the first moment that is behind the place asked for. A few
    // steps, since friends are close behind.
    for (let n = 1; n < this.size; n++) {
      const i = (newest - n + this.capacity) % this.capacity;
      const before = this.poses[i]!;
      if (before.s <= s) return blend(before, this.poses[(i + 1) % this.capacity]!, s, out);
    }
    const oldest = (newest - this.size + 1 + this.capacity) % this.capacity;
    return copy(this.poses[oldest]!, out);
  }
}

function copy(a: Pose, out: Pose): Pose {
  out.x = a.x;
  out.y = a.y;
  out.rot = a.rot;
  out.sx = a.sx;
  out.sy = a.sy;
  out.air = a.air;
  out.dist = a.dist;
  out.s = a.s;
  return out;
}

function blend(a: Pose, b: Pose, s: number, out: Pose): Pose {
  const u = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.rot = a.rot + (b.rot - a.rot) * u;
  out.sx = a.sx + (b.sx - a.sx) * u;
  out.sy = a.sy + (b.sy - a.sy) * u;
  // What she was doing does not blend: it is what she was doing at the earlier moment.
  out.air = a.air;
  out.dist = a.dist + (b.dist - a.dist) * u;
  out.s = s;
  return out;
}
