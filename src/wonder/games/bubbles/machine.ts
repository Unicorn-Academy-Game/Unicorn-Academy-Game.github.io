import { drawPic, type Pic, type SpriteBank } from '../../engine/bank';
import { damp, Spring, TAU } from '../../engine/ease';
import { glowAt } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { MACHINE, type Plan } from './layout';

/**
 * The bubble machine as the world draws it, with the ring, the stick and the box that turns a dial.
 * The world's picture also has bubbles floating above the ring, baked into every frame, so the part
 * of the picture above the ring is cut away and the bubbles here are the game's own.
 */
function machinePic(bank: SpriteBank | null, seconds: number): Pic | null {
  const pic = bank?.sprite('playground', 'pg-bubbles', seconds);
  if (!pic) return null;
  const cut = pic.ay - MACHINE.tall;
  return { ...pic, sy: pic.sy + cut, sh: pic.sh - cut, ay: MACHINE.tall };
}

export class Machine {
  /**
   * How much of its height it has: under 1 is squashed, over 1 is stretched. A spring settles it.
   */
  readonly squash = new Spring(1, 1, 230, 11);
  /** How hard it is working, from 0 to 1, which spins the dial and lights the ring. */
  work = 0;
  private spin = 0;

  update(dt: number): void {
    this.squash.step(dt);
    this.work = damp(this.work, 0, 2.2, dt);
    this.spin += dt * (1 + this.work * 3.5);
  }

  /** It blows: the box squashes and the ring lights. */
  puff(strength = 1): void {
    this.squash.kick(-9 * strength);
    this.work = Math.min(1, this.work + 0.5 * strength);
  }

  /**
   * Whether a touch at this point is on the machine, which includes the ring and a little round it.
   */
  hit(plan: Plan, x: number, y: number): boolean {
    const m = plan.machine;
    return Math.abs(x - m.x) < m.half + 8 && y > m.y - m.height - 10 && y < m.y + 14;
  }

  paint(p: Painter, plan: Plan, bank: SpriteBank | null, pulse: number): void {
    const g = p.ctx;
    const m = plan.machine;
    // A soft shadow on the grass.
    g.fillStyle = 'rgba(20,50,30,0.28)';
    g.beginPath();
    g.ellipse(m.x, m.y + 2, m.half * 1.15, 5.5 * m.scale, 0, 0, TAU);
    g.fill();
    if (this.work > 0.02)
      glowAt(p.light, m.mouth.x, m.mouth.y, 76 * m.scale * (0.9 + 0.25 * this.work), [255, 190, 232], 0.5 * this.work);
    const pic = machinePic(bank, this.spin);
    if (!pic) {
      g.fillStyle = '#7a5ad0';
      g.fillRect(m.x - m.half, m.y - 56 * m.scale, m.half * 2, 56 * m.scale);
      return;
    }
    const beat = pulse * 0.02;
    drawPic(g, pic, m.x, m.y, { scale: m.scale, sx: 1 + (1 - this.squash.x) * 0.5 + beat, sy: this.squash.x - beat });
  }
}
