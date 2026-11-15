import type Phaser from 'phaser';
import { PROP_DEFS } from '../content/props';
import { CONFIG, type World } from '../domain';
import { angleOf, facingOfCardinal, type UnicornFacing } from '../shared/compass';
import type { Facing, Vec2 } from '../shared/ids';
import type { ActorAsset, CrownAsset, CrownRef } from '../shared/manifest';
import { frameAt, resolveClip, walkFrame } from './clips';
import { standingDepth } from './depth';
import { crownPage, finePage } from './keys';
import { makeShadow, placeShadow } from './shadow';

/**
 * A jump this long between two simulation steps is a relocation, which is shown as it happened and
 * not as a slide.
 */
const TELEPORT = 240;

/** Where something is drawn between its last two simulation positions. */
function interpolate(prev: Vec2, pos: Vec2, alpha: number): Vec2 {
  if (Math.hypot(pos.x - prev.x, pos.y - prev.y) > TELEPORT) return { x: pos.x, y: pos.y };
  return { x: prev.x + (pos.x - prev.x) * alpha, y: prev.y + (pos.y - prev.y) * alpha };
}

/**
 * How long a unicorn takes to settle into a seat, and to rise out of it, and how long to lie down
 * in a bed.
 */
const SETTLE_SECONDS = 0.35;
const LIE_DOWN_SECONDS = 0.9;

/**
 * A seat as it is drawn: the world y of its front edge, how far a unicorn is carried up onto it,
 * and whether she lies down to sleep in it.
 */
export interface Seating {
  edge: number;
  rise: number;
  asleep?: true;
}

/**
 * How a unicorn is drawn when she has settled `settled` of the way into a seat: carried up by
 * `lift`, and only the top `rows` rows of her picture. She is drawn only above a line that rises
 * from her feet to the front edge of the seat, so the seat in front of her takes her legs and she
 * is sunk into it. `anchor` is the row of the picture that her feet are on.
 */
export function seated(settled: number, feetY: number, seat: Seating, anchor: number): { lift: number; rows: number } {
  const t = Math.min(1, Math.max(0, settled));
  const eased = t * t * (3 - 2 * t);
  const hidden = Math.max(0, feetY - seat.rise - seat.edge);
  return { lift: eased * seat.rise, rows: Math.max(0, anchor - eased * hidden) };
}

/**
 * Where her crown is laid for one picture of her drawn with her ground anchor at (x, y): the point
 * it stands on, how it leans, and which view of it to show, turned over or not.
 */
export function crownOn(
  ref: CrownRef,
  crown: CrownAsset,
  origin: readonly [number, number],
  x: number,
  y: number,
): { x: number; y: number; rotation: number; flip: boolean; frame: string } {
  return {
    x: x + ref.at[0] - origin[0],
    y: y + ref.at[1] - origin[1],
    rotation: ref.tilt,
    flip: ref.flip === true,
    frame: String(crown.views[ref.view]),
  };
}

/** The seat Wildstar sits in, or null when she is not in one. */
export function seatOf(world: World): Seating | null {
  const inst = world.leader.seat === null ? undefined : world.interactables.get(world.leader.seat);
  const seat = inst && PROP_DEFS[inst.definitionId]?.seat;
  return inst && seat
    ? { edge: inst.pos.y - seat.edge, rise: seat.rise, ...(seat.nap ? { asleep: true as const } : {}) }
    : null;
}

/**
 * What a view needs from an actor in the simulation: where it is, how fast it moves, and which clip
 * it is in.
 */
export interface Animated {
  pos: Vec2;
  prev: Vec2;
  speed: number;
  /** A unicorn faces one of her 32 ways and a grown-up one of four. */
  anim: { clip: string; facing: UnicornFacing | Facing; startedAt: number };
}

/**
 * One character on screen, a unicorn or a grown-up: a body image and a shadow, driven entirely from
 * the simulation's state. A clip that carries a stride distance plays by distance walked, so feet
 * stay planted at any speed.
 */
export class ActorView {
  private readonly image: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  /** Her crown, made the first time she wears it, and the view of it now shown. */
  private crown: Phaser.GameObjects.Image | null = null;
  private crownShown = '';
  private lastClip = '';
  private phase = 0;
  /** The sheet and picture on the body now, so it is told to change only when they do. */
  private sheet: string;
  private shown = '';
  /** The key of each fine sheet, made once. */
  private readonly fineKeys: string[] = [];
  /**
   * How far into a seat she has settled, from 0 standing to 1 seated, and the seat she rises out of
   * as she gets up.
   */
  private settled = 0;
  private seat: Seating = { edge: 0, rise: 0 };
  /**
   * Where the body was drawn last frame, for the camera and for effects that follow a character.
   */
  readonly at: Vec2 = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly texture: string,
    private asset: ActorAsset,
  ) {
    const canvas = asset.atlas.rects[0]!;
    this.sheet = texture;
    this.image = scene.add
      .image(0, 0, texture, '0')
      .setOrigin(asset.origin[0] / canvas.sw, asset.origin[1] / canvas.sh);
    this.shadow = makeShadow(scene, asset.shadow, 0, 0);
  }

  /**
   * Draws from a fuller set of pictures of the same character from now on, such as one that has her
   * fine facings.
   */
  upgrade(asset: ActorAsset): void {
    this.asset = asset;
    this.shown = '';
  }

  /**
   * `seat` is the seat she sits in, when she sits in one, and `crowned` is whether she has her
   * crown on.
   */
  update(
    actor: Animated,
    worldTime: number,
    alpha: number,
    dtMs: number,
    seat: Seating | null = null,
    crowned = false,
  ): void {
    const p = interpolate(actor.prev, actor.pos, alpha);
    this.at.x = p.x;
    this.at.y = p.y;
    const anim = actor.anim;
    const clip = resolveClip(
      this.asset,
      anim.clip,
      typeof anim.facing === 'string' ? facingOfCardinal(anim.facing) : anim.facing,
    );
    if (anim.clip !== this.lastClip) {
      this.lastClip = anim.clip;
      this.phase = 0;
    }
    let index: number;
    if (clip.strideDistance) {
      this.phase += (actor.speed * (dtMs / 1000)) / clip.strideDistance;
      index = walkFrame(clip, this.phase);
    } else {
      index = frameAt(clip, (worldTime + alpha * CONFIG.step - anim.startedAt) * 1000);
    }
    let sheet = this.texture;
    if (clip.page !== undefined) {
      this.fineKeys[clip.page] ??= finePage(this.texture, clip.page);
      sheet = this.fineKeys[clip.page]!;
    }
    const rect = String(clip.frames[index]!.rect);
    if (sheet !== this.sheet) {
      this.sheet = sheet;
      this.shown = rect;
      this.image.setTexture(sheet, rect);
    } else if (rect !== this.shown) {
      this.shown = rect;
      this.image.setFrame(rect);
    }
    // A flipped clip shares its pictures with the facing that mirrors it, and Phaser turns a
    // trimmed frame about the middle of its source canvas, which is where the ground anchor is.
    this.image.setFlipX(clip.flip === true);
    const lift = this.settle(p.y, seat, dtMs);
    this.image.setPosition(p.x, p.y - lift).setDepth(standingDepth(p.y));
    // A unicorn's shadow turns with her. A grown-up's is round on the ground and the same from
    // every side.
    placeShadow(
      this.shadow,
      this.asset.shadow,
      p.x,
      p.y,
      typeof anim.facing === 'number' ? angleOf(anim.facing) : undefined,
    );
    // In a bed she is lifted well off the floor, so the shadow she would throw on it goes as she
    // lies down.
    this.shadow.setVisible(!(this.seat.asleep && this.settled > 0));
    this.layCrown(crowned ? clip.frames[index]!.crown : undefined, p.x, p.y - lift);
  }

  /**
   * Lays her crown over her head for the picture now shown, and takes it off the screen when she
   * has none on.
   */
  private layCrown(ref: CrownRef | undefined, x: number, y: number): void {
    const asset = this.asset.crown;
    if (!ref || !asset) {
      this.crown?.setVisible(false);
      return;
    }
    const at = crownOn(ref, asset, this.asset.origin, x, y);
    const canvas = asset.atlas.rects[0]!;
    this.crown ??= this.scene.add
      .image(0, 0, crownPage(this.texture), at.frame)
      .setOrigin(asset.origin[0] / canvas.sw, asset.origin[1] / canvas.sh);
    const crown = this.crown;
    if (at.frame !== this.crownShown) {
      this.crownShown = at.frame;
      crown.setFrame(at.frame);
    }
    crown
      .setPosition(at.x, at.y)
      .setRotation(at.rotation)
      .setFlipX(at.flip)
      .setDepth(this.image.depth + 0.01)
      .setVisible(true);
  }

  /**
   * Carries her up onto her seat and draws her only above its front, by how far she has settled
   * into it, and says how far up she is. The crop is set again each frame, since a change of
   * picture or of flip would leave the old one wrong.
   */
  private settle(feetY: number, seat: Seating | null, dtMs: number): number {
    if (seat) this.seat = seat;
    const step = dtMs / 1000 / (this.seat.asleep ? LIE_DOWN_SECONDS : SETTLE_SECONDS);
    this.settled = seat ? Math.min(1, this.settled + step) : Math.max(0, this.settled - step);
    if (this.settled === 0) {
      if (this.image.isCropped) this.image.setCrop();
      return 0;
    }
    const { lift, rows } = seated(this.settled, feetY, this.seat, this.asset.origin[1]);
    this.image.setCrop(0, 0, this.asset.atlas.rects[0]!.sw, rows);
    return lift;
  }

  destroy(): void {
    this.crown?.destroy();
    this.image.destroy();
    this.shadow.destroy();
  }
}
