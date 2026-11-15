import type { Rng } from '../../../domain/rng';
import type { Facing, UnicornId } from '../../../shared/ids';
import { Bag } from '../../engine/bag';
import { drawPic, type SpriteBank } from '../../engine/bank';
import type { RGB } from '../../engine/color';
import { css } from '../../engine/color';
import type { Painter } from '../../engine/painter';
import { Relight } from '../../engine/relight';
import { type BurstLight, type Lit, newLit } from './light';

/** One friend on the shore: where she stands, what she is doing, and since when. */
export interface Member {
  readonly id: UnicornId;
  x: number;
  y: number;
  scale: number;
  facing: Facing;
  clip: string;
  since: number;
  /** When she next does something of her own. */
  nextOwn: number;
  /** When her last hop began, and how high it goes. */
  hopAt: number;
  hopPower: number;
  /**
   * How far above the ground she is held up by something else than a hop of her own, in units: a
   * bubble, for one. Her shadow stays on the ground.
   */
  lift: number;
}

/** How the friends stand, when it is not the usual way: half either side of the middle. */
export interface Standing {
  /** `right`: all of them to the right of the middle, facing it. */
  readonly side?: 'both' | 'right';
  /** The most they may be scaled to. Their usual largest is 0.88. */
  readonly maxScale?: number;
  /**
   * How far apart they may stand, at most, from one to the next. Usually this is a good deal more
   * than they are wide.
   */
  readonly step?: number;
}

const HOP_SECONDS = 0.5;
/** Clips she does when nothing is happening, and how long she is left alone between them. */
const OWN_CLIPS = ['drink', 'signature-idle', 'stretch', 'drink'] as const;

/**
 * The friends on the shore. They stand and watch, now and then do something of their own, hop for a
 * big burst, and a touch on one of them makes her throw her own magic into the sky. They are lit by
 * what bursts, so the night looks like one place.
 */
export class Audience {
  members: Member[] = [];
  private readonly lit: Lit = newLit();
  private readonly relight = new Relight();
  private readonly own: Bag<(typeof OWN_CLIPS)[number]>;

  constructor(
    private readonly bank: SpriteBank | null,
    private readonly rng: Rng,
    /** What her colours are multiplied by to put her in the dark. */
    private readonly dark: RGB,
  ) {
    this.own = new Bag(OWN_CLIPS, rng);
  }

  /**
   * Stands the friends along the shore either side of `centre`, leaving room for what stands there.
   * The first is on the left, the next on the right, and so on outward. On a narrow screen they
   * stand in two rows. With `side: 'right'` they all stand to the right of it, facing it, nearest
   * first, and `maxScale` keeps them small if what they watch needs the room.
   */
  stand(
    ids: readonly UnicornId[],
    width: number,
    centre: number,
    feet: number,
    gap: number,
    now: number,
    how: Standing = {},
  ): void {
    const one = how.side === 'right';
    const ranks = Math.max(1, one ? ids.length : Math.ceil(ids.length / 2));
    const room = Math.max(40, one ? width - centre - gap - 24 : width / 2 - gap - 32);
    const biggest = how.maxScale ?? 0.88;
    const step = Math.min(how.step ?? (112 * biggest) / 0.88, room / ranks);
    const rows = step < 72 * (biggest / 0.88) ? 2 : 1;
    const scale = Math.max(0.5 * Math.min(1, biggest / 0.88), Math.min(biggest, (step * rows) / 132));
    this.members = ids.map((id, i) => {
      const side = one ? 1 : i % 2 === 0 ? -1 : 1;
      const rank = one ? i : Math.floor(i / 2);
      const back = rows === 2 && rank % 2 === 1;
      return {
        id,
        x: centre + side * (gap + step * (rank + 0.5)),
        y: feet - (back ? 15 * scale : 0),
        scale: back ? scale * 0.92 : scale,
        facing: side < 0 ? 'east' : 'west',
        clip: 'idle',
        since: now,
        nextOwn: now + this.rng.range(3, 9),
        hopAt: -10,
        hopPower: 0,
        lift: 0,
      };
    });
  }

  reset(now: number): void {
    for (const m of this.members) {
      m.clip = 'idle';
      m.since = now;
      m.nextOwn = now + this.rng.range(3, 9);
      m.hopAt = -10;
      m.lift = 0;
    }
  }

  update(now: number): void {
    for (const m of this.members) {
      // One who is held up is doing what whatever holds her has her do.
      if (m.lift > 2) continue;
      if (m.clip !== 'idle') {
        const span = this.bank ? this.bank.clipSeconds(m.id, m.clip, m.facing) : 1;
        if (now - m.since >= span) {
          m.clip = 'idle';
          m.since = now;
          m.nextOwn = now + this.rng.range(5, 11);
        }
      } else if (now >= m.nextOwn) {
        m.clip = this.own.next();
        m.since = now;
      }
    }
  }

  /**
   * The friend standing at a point, or nothing. The point is in units. One who is held up off the
   * ground is not standing there.
   */
  at(x: number, y: number): Member | null {
    for (const m of this.members) {
      if (m.lift > 2) continue;
      if (Math.abs(x - m.x) < 50 * m.scale + 8 && y > m.y - 112 * m.scale - 8 && y < m.y + 12) return m;
    }
    return null;
  }

  /** Where her horn is as her magic leaves her, and how long after she starts. */
  cast(m: Member, now: number): { x: number; y: number; after: number } {
    m.clip = 'cast';
    m.since = now;
    const after = this.bank ? this.bank.releaseSeconds(m.id, 'cast', m.facing) : 0.2;
    // Her horn, where her picture says it is. The side views already face the way they point, so
    // there is nothing to flip.
    const horn = this.bank?.unicorn(m.id, 'cast', m.facing, after)?.anchors.horn;
    const at = horn ? { x: m.x + horn[0] * m.scale, y: m.y + horn[1] * m.scale } : { x: m.x, y: m.y - 100 * m.scale };
    return { ...at, after };
  }

  /** A big burst: friends near it hop, and some do their happy move. */
  cheer(x: number, power: number, now: number, width: number): void {
    for (const m of this.members) {
      if (m.clip === 'cast' || m.lift > 2) continue;
      const near = 1 - Math.min(1, Math.abs(m.x - x) / width);
      if (power > 0.85 && now - m.hopAt > HOP_SECONDS * 1.2 && this.rng.next() < 0.1 + near * 0.3) {
        m.hopAt = now;
        m.hopPower = Math.min(1.2, power * 0.8);
      }
      if (power > 1 && m.clip === 'idle' && this.rng.next() < 0.1 + near * 0.35) {
        m.clip = 'signature-idle';
        m.since = now;
      }
    }
  }

  /** Everyone's happy move, at once, a little apart. */
  celebrate(now: number): void {
    for (const m of this.members) {
      if (m.clip === 'cast' || m.lift > 2) continue;
      m.clip = 'signature-idle';
      m.since = now + this.rng.range(0, 0.35);
      m.hopAt = now + this.rng.range(0, 0.4);
      m.hopPower = 1;
    }
  }

  paint(p: Painter, light: BurstLight, now: number): void {
    const bank = this.bank;
    if (!bank) return;
    const g = p.ctx;
    for (const m of this.members) {
      const frame = bank.unicorn(m.id, m.clip, m.facing, Math.max(0, now - m.since));
      if (!frame) continue;
      const hop = this.hopOf(m, now);
      const up = hop.lift + m.lift;
      // A soft shadow under her hooves, smaller and fainter when she is in the air.
      g.fillStyle = css([0, 0, 0], 0.28 * Math.max(0.25, 1 - up * 0.02));
      g.beginPath();
      g.ellipse(m.x, m.y + 1, 38 * m.scale * Math.max(0.3, 1 - up * 0.015), 5 * m.scale, 0, 0, Math.PI * 2);
      g.fill();
      const y = m.y - up;
      drawPic(g, bank.shaded(frame.pic, this.dark), m.x, y, { scale: m.scale, sy: hop.squash });
      const lit = light.at(m.x, m.y - m.lift - 44 * m.scale, this.lit);
      // Her own colours times the colour of the light, added onto her, so a burst lights her and
      // she keeps her colours.
      if (lit.level > 0.03)
        this.relight.draw(g, frame.pic, m.x, y, [lit.r, lit.g, lit.b], lit.level * 0.9, {
          scale: m.scale,
          sy: hop.squash,
        });
    }
  }

  /**
   * How high she is off the ground, and how squashed. A hop goes up, comes down, and squashes a
   * little on landing.
   */
  private hopOf(m: Member, now: number): { lift: number; squash: number } {
    const u = (now - m.hopAt) / HOP_SECONDS;
    if (u < 0 || u > 1.15) return { lift: 0, squash: 1 };
    if (u > 1) return { lift: 0, squash: 1 - 0.08 * Math.sin(((u - 1) / 0.15) * Math.PI) * m.hopPower };
    return { lift: Math.sin(u * Math.PI) * 17 * m.hopPower, squash: 1 + 0.03 * m.hopPower * Math.sin(u * Math.PI) };
  }
}
