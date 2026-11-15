import { LIFE } from '../../../content/life';
import { drawPic, type SpriteBank } from '../../engine/bank';
import { Spring } from '../../engine/ease';
import type { Painter } from '../../engine/painter';
import type { Plan } from './layout';
import { creatureSprite } from './looks';
import { type Layer, Resident, type World } from './residents';

/**
 * A bird of the garden. It flies from its bubble to a perch, the top of the machine, the tree, the
 * bush or the rock by the pond, sits there, and sings now and then. What it sings is the game's to
 * say: the bird only says that it did (`sing`), so the song can be in the key the music is in.
 * Every so often it flies to a perch that is free.
 */

const SIZE = 0.9;
/** How long a bird sits before it looks for another perch, in seconds. */
const STAY: readonly [number, number] = [14, 26];
/** How long between songs. */
const SONG_EVERY: readonly [number, number] = [2.4, 5.5];
/** Seconds a song's pose is held, with the beak open. */
const SONG_SECONDS = 0.8;

export class Bird extends Resident {
  readonly prize = 'bird' as const;
  readonly layer: Layer = 'air';
  private perch = 0;
  private song = 0;
  private sings: number;
  private stays: number;
  private peck = 0;
  private faceLeft = false;
  private readonly hop = new Spring(0, 0, 300, 12);

  constructor(look: number, from: { readonly x: number; readonly y: number }, phase: number, w: World) {
    super(look, from.x, from.y, phase);
    this.sings = 0.5;
    this.stays = w.rng.range(...STAY);
    this.flyTo(w, w.claimPerch(null) ?? 0);
  }

  /** Takes off for a perch of the plan, in an arc. */
  private flyTo(w: World, perch: number): void {
    const at = w.plan.perches[perch];
    if (!at) return;
    const d = Math.hypot(at.x - this.x, at.y - this.y);
    this.perch = perch;
    this.faceLeft = at.x < this.x;
    this.fall(at.x, at.y, Math.min(2.2, 0.55 + d / 150), 16 + d * 0.12);
  }

  protected override landed(w: World): void {
    if (this.leaving) {
      this.gone = true;
      return;
    }
    this.hop.kick(-110);
    this.sings = 0.35;
    this.stays = w.rng.range(...STAY);
  }

  protected live(dt: number, w: World): void {
    this.hop.step(dt);
    this.song = Math.max(0, this.song - dt);
    this.peck = Math.max(0, this.peck - dt);
    this.sings -= dt;
    this.stays -= dt;
    if (this.sings <= 0) this.sing(w);
    if (this.stays <= 0) {
      const next = w.claimPerch(this.perch);
      this.stays = w.rng.range(...STAY);
      if (next !== null) {
        w.releasePerch(this.perch);
        this.flyTo(w, next);
        return;
      }
    }
    if (this.song <= 0 && this.peck <= 0 && w.rng.next() < dt * 0.12) this.peck = 0.5;
    if (w.rng.next() < dt * 0.1) this.faceLeft = !this.faceLeft;
  }

  private sing(w: World): void {
    this.song = SONG_SECONDS;
    this.hop.kick(160);
    this.sings = w.rng.range(...SONG_EVERY);
    w.hear({ is: 'sing', x: this.x + (this.faceLeft ? -12 : 12), y: this.y - 24, look: this.look });
  }

  protected override parted(w: World): void {
    w.releasePerch(this.perch);
    const side = this.x < w.plan.w / 2 ? -1 : 1;
    this.fall(side < 0 ? -80 : w.plan.w + 80, this.y - 70, 1.4, 30);
    this.faceLeft = side < 0;
  }

  poke(w: World): void {
    if (this.drop || this.leaving) return;
    // A bird that is touched answers with a song at once, and a hop.
    this.sing(w);
    w.hear({ is: 'poke', prize: 'bird', x: this.x, y: this.y - 20, look: this.look });
  }

  hit(x: number, y: number): boolean {
    if (this.leaving) return false;
    const b = LIFE.bird.body;
    const dx = (x - this.x) / (b.rx * SIZE + 8);
    const dy = (y - (this.y - b.cy * SIZE)) / (b.ry * SIZE + 8);
    return dx * dx + dy * dy < 1;
  }

  fit(_from: Plan, to: Plan): void {
    const at = to.perches[this.perch];
    if (!at) return;
    this.drop = null;
    this.x = at.x;
    this.y = at.y;
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const clip = this.drop ? 'fly' : this.peck > 0 ? 'peck' : 'idle';
    const name = creatureSprite('bird', this.look, clip);
    // On a perch it holds still with its beak shut, and opens it for a song.
    const pic =
      clip === 'idle'
        ? bank?.spriteFrame('life', name, this.song > 0 ? 1 : 0)
        : bank?.sprite('life', name, this.age + this.phase);
    if (!pic) return;
    const rise = Math.max(0, this.hop.x);
    const press = Math.min(0, this.hop.x) * 0.012;
    drawPic(p.ctx, pic, this.x, this.y - rise, {
      scale: SIZE,
      sy: 1 + press,
      sx: 1 - press * 0.6,
      flip: this.faceLeft,
      alpha: this.alpha,
    });
  }
}
