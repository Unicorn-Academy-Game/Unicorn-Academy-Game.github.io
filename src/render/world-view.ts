import Phaser from 'phaser';
import { CONFIG, type World } from '../domain';
import type { CompiledMap, Decor } from '../shared/compiled-map';
import type { UnicornId, Vec2 } from '../shared/ids';
import type { Manifest } from '../shared/manifest';
import type { Interactable } from '../shared/map';
import type { SeasonId } from '../shared/seasons';
import { ActorView, seatOf } from './actor-view';
import { CanopyFader } from './canopy';
import { type Bounds, Culler } from './cull';
import { DEPTH, flatDepth, standingDepth } from './depth';
import { ExitView } from './exit-view';
import { fineDrawable, withFine } from './fine';
import { npcTexture, unicornTexture } from './keys';
import { LifeView } from './life-view';
import { PickupView } from './pickup-view';
import { drawProp, type Layer } from './prop-visuals';
import { outOfSeason } from './season';
import { makeShadow, placeShadow, shadowBounds } from './shadow';
import { SpriteSet } from './sprites';
import { createGround, type GroundLayers } from './tilemap';

interface AnimatedDecor {
  image: Phaser.GameObjects.Image;
  id: string;
  offsetMs: number;
  x: number;
  y: number;
}

interface LayerView {
  image: Phaser.GameObjects.Image;
  /** What the picture is tinted and blended with now, so it is only set when it changes. */
  tint: number | undefined;
  glow: boolean;
}

/**
 * What is on screen for one interactive prop: what lies on the floor under it, its body, the shadow
 * under that and an overlay that comes and goes.
 */
interface PropView {
  under: LayerView | null;
  body: LayerView | null;
  overlay: LayerView | null;
  shadow: Phaser.GameObjects.Image | null;
  /** The sprite the shadow was last placed for. */
  shadowFor: string;
  /** Whether the body is a tree whose crown fades, which then owns the body's alpha. */
  canopied: boolean;
}

const depthOf = (d: Decor): number => {
  const y = d.y + (d.depthBias ?? 0);
  switch (d.layer) {
    case 'backdrop':
      return flatDepth(DEPTH.backdrop, y);
    case 'ground-detail':
      return flatDepth(DEPTH.groundDetail, y);
    case 'object-bases':
      return standingDepth(d.y, d.depthBias ?? 0);
    case 'foreground':
      return DEPTH.foreground + y;
  }
};

/** A small stable number per position, so neighbouring animated flowers do not move in step. */
const phaseOf = (x: number, y: number): number =>
  Math.abs(Math.imul(Math.round(x), 73856093) ^ Math.imul(Math.round(y), 19349663)) % 1000;

/**
 * Everything on screen for one map: ground, scenery, props and unicorns. The simulation owns all
 * state. This only reads it, so a view can be thrown away and rebuilt (a lost graphics context, a
 * map change) without losing anything.
 */
export class WorldView {
  readonly sprites: SpriteSet;
  private readonly ground: GroundLayers;
  private readonly owned: Phaser.GameObjects.GameObject[] = [];
  private readonly animated: AnimatedDecor[] = [];
  private readonly canopy = new CanopyFader();
  private readonly unicorns = new Map<UnicornId, ActorView>();
  /** The unicorns who are drawn at all of their facings now. */
  private readonly fine = new Set<UnicornId>();
  private readonly npcs = new Map<string, ActorView>();
  private readonly props = new Map<string, PropView>();
  private readonly life: LifeView;
  private readonly pickups: PickupView;
  private readonly exits: ExitView;
  /**
   * Shows the scenery that is in view and hides the rest. Null when the profile draws all of it.
   */
  readonly culler: Culler | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly manifest: Manifest,
    compiled: CompiledMap,
    cull = false,
    /** A unicorn is on screen: the game may bring in her fine sheets. */
    private readonly wantFine: (id: UnicornId) => void = () => undefined,
    /**
     * The season the place is drawn in. The flowers of the scenery are out of it in winter, and
     * what is left is the same all year.
     */
    season: SeasonId = 'summer',
  ) {
    this.culler = cull ? new Culler() : null;
    const render = compiled.render;
    this.sprites = new SpriteSet(render.bundle, manifest.bundles[render.bundle]!);
    this.life = new LifeView(scene, new SpriteSet('life', manifest.bundles.life!));
    this.pickups = new PickupView(scene, new SpriteSet('produce', manifest.bundles.produce!));
    this.exits = new ExitView(scene, new SpriteSet('fx', manifest.bundles.fx!), compiled.logic.portals);
    this.ground = createGround(scene, compiled, manifest.tilesets[render.tileset]!);
    for (const d of render.decor) if (!outOfSeason(season, d.sprite)) this.addDecor(d);
  }

  private addDecor(d: Decor): void {
    const sprite = this.sprites.get(d.sprite);
    const image = this.sprites.make(this.scene, d.sprite, d.x, d.y).setDepth(depthOf(d));
    this.owned.push(image);
    this.culler?.add(image, this.sprites.reach(d.sprite, d.x, d.y));
    if (sprite.shadow) {
      const shadow = makeShadow(this.scene, sprite.shadow, d.x, d.y);
      this.owned.push(shadow);
      this.culler?.add(shadow, shadowBounds(sprite.shadow, d.x, d.y));
    }
    if (sprite.frames.length > 1 && sprite.loop)
      this.animated.push({ image, id: d.sprite, offsetMs: phaseOf(d.x, d.y), x: d.x, y: d.y });
    if (sprite.canopy && d.layer === 'object-bases') {
      const c = sprite.canopy;
      this.canopy.add(image, { x: d.x + c.x, y: d.y + c.y, w: c.w, h: c.h }, d.y + (d.depthBias ?? 0));
    }
  }

  /**
   * Draws only the scenery that touches `seen`, the world area the camera shows. Does nothing when
   * the profile draws all of it.
   */
  cull(seen: Bounds): void {
    this.culler?.update(seen);
  }

  /**
   * Brings the picture up to date with the simulation, `alpha` of the way from its last step to its
   * next.
   */
  update(world: World, alpha: number, dtMs: number, nowMs: number, calm = false): void {
    const time = world.time;
    const seat = seatOf(world);
    for (const actor of Object.values(world.unicorns)) {
      if (!actor) continue;
      let view = this.unicorns.get(actor.id);
      if (!view) {
        view = new ActorView(this.scene, unicornTexture(actor.id), this.manifest.unicorns[actor.id]);
        this.unicorns.set(actor.id, view);
        this.wantFine(actor.id);
      }
      this.drawFine(actor.id, view);
      view.update(
        actor,
        time,
        alpha,
        dtMs,
        actor.id === 'wildstar' ? seat : null,
        actor.id === 'wildstar' && world.crown.worn,
      );
      this.canopy.cover(view.at.x, view.at.y);
    }
    for (const npc of world.npcs) {
      let view = this.npcs.get(npc.instanceId);
      if (!view) {
        view = new ActorView(this.scene, npcTexture(npc.id), this.manifest.npcs[npc.id]);
        this.npcs.set(npc.instanceId, view);
      }
      view.update(npc, time, alpha, dtMs);
      this.canopy.cover(view.at.x, view.at.y);
    }
    this.canopy.apply(dtMs / 1000);
    this.life.update(world, alpha);
    this.pickups.update(world, alpha);
    this.exits.update(nowMs, calm);
    this.updateProps(world, time + alpha * CONFIG.step, nowMs);
    this.updateAnimatedDecor(nowMs);
  }

  /**
   * Once every fine sheet of a unicorn is in, she is drawn from them, at the frame the next draw
   * begins on.
   */
  private drawFine(id: UnicornId, view: ActorView): void {
    if (this.fine.has(id)) return;
    const asset = this.manifest.unicorns[id];
    if (!fineDrawable(this.scene.textures, unicornTexture(id), asset)) return;
    view.upgrade(withFine(asset));
    this.fine.add(id);
  }

  private updateProps(world: World, seconds: number, nowMs: number): void {
    for (const inst of world.map.interactables) {
      const t = world.transient.get(inst.instanceId);
      const picture = drawProp({
        definitionId: inst.definitionId,
        instanceId: inst.instanceId,
        look: inst.look,
        state: world.persistent.props[inst.instanceId],
        unlocked: world.unlocked.has(inst.instanceId),
        moment: t && { kind: t.kind, seconds: Math.max(0, seconds - t.since), total: t.until - t.since },
        now: seconds,
        worn: world.crown.worn,
      });
      let view = this.props.get(inst.instanceId);
      if (!view) {
        view = { under: null, body: null, overlay: null, shadow: null, shadowFor: '', canopied: false };
        this.props.set(inst.instanceId, view);
      }
      this.showLayer(view, 'under', picture.under ?? null, inst, nowMs);
      this.showLayer(view, 'body', picture.body, inst, nowMs);
      this.showLayer(view, 'overlay', picture.overlay, inst, nowMs);
      if (!picture.body) view.shadow?.setVisible(false);
    }
  }

  private showLayer(
    view: PropView,
    slot: 'under' | 'body' | 'overlay',
    layer: Layer | null,
    inst: Interactable,
    nowMs: number,
  ): void {
    const shown = view[slot];
    if (!layer || !this.sprites.has(layer.sprite)) {
      shown?.image.setVisible(false);
      return;
    }
    const { x, y } = inst.pos;
    const made = shown ?? { image: this.sprites.make(this.scene, layer.sprite, x, y), tint: undefined, glow: false };
    view[slot] = made;
    // A tree the herd can walk behind fades its crown like any other, once, when its picture is
    // first made.
    const canopy = slot === 'body' && !shown ? this.sprites.get(layer.sprite).canopy : undefined;
    if (canopy) {
      this.canopy.add(
        made.image,
        { x: x + canopy.x, y: y + canopy.y, w: canopy.w, h: canopy.h },
        y + (layer.bias ?? 0),
      );
      view.canopied = true;
    }
    this.sprites.show(made.image, layer.sprite, this.frameOf(layer, nowMs + phaseOf(x, y)));
    // What lies under a prop is on the floor, so everything that stands is drawn over it, wherever
    // it reaches up the screen.
    made.image
      .setVisible(true)
      .setPosition(x, y + (layer.dy ?? 0))
      .setDepth(slot === 'under' ? flatDepth(DEPTH.groundDetail, y) : standingDepth(y, layer.bias ?? 0))
      .setScale(layer.scale ?? 1);
    if (layer.tint !== made.tint) {
      if (layer.tint === undefined) made.image.clearTint();
      else made.image.setTint(layer.tint);
      made.tint = layer.tint;
    }
    if (!!layer.glow !== made.glow) {
      made.image.setBlendMode(layer.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      made.glow = !!layer.glow;
    }
    if (!(slot === 'body' && view.canopied)) made.image.setAlpha(layer.alpha ?? 1);
    if (slot === 'body') this.shadowUnder(view, layer.sprite, x, y);
  }

  /** The shadow stays on the ground when the body hops, and changes only when the sprite does. */
  private shadowUnder(view: PropView, sprite: string, x: number, y: number): void {
    const spec = this.sprites.get(sprite).shadow;
    if (!spec) {
      view.shadow?.setVisible(false);
      return;
    }
    if (!view.shadow) view.shadow = makeShadow(this.scene, spec, x, y);
    else if (view.shadowFor !== sprite) placeShadow(view.shadow, spec, x, y);
    view.shadow.setVisible(true);
    view.shadowFor = sprite;
  }

  private frameOf(layer: Layer, nowMs: number): number {
    const show = layer.show;
    switch (show.kind) {
      case 'frame':
        return show.index;
      case 'loop':
        return this.sprites.indexAt(layer.sprite, nowMs);
      case 'time':
        return this.sprites.indexAt(
          layer.sprite,
          show.reverse ? this.sprites.durationMs(layer.sprite) - show.ms : show.ms,
        );
      case 'fraction':
        return this.sprites.indexAt(layer.sprite, show.at * (this.sprites.durationMs(layer.sprite) - 1));
    }
  }

  private updateAnimatedDecor(nowMs: number): void {
    const view = this.scene.cameras.main.worldView;
    const margin = 200;
    for (const a of this.animated) {
      if (
        a.x < view.x - margin ||
        a.x > view.right + margin ||
        a.y < view.y - margin ||
        a.y > view.bottom + margin + 300
      )
        continue;
      this.sprites.show(a.image, a.id, this.sprites.indexAt(a.id, nowMs + a.offsetMs));
    }
  }

  /** Where a unicorn was drawn last frame, for the camera and for effects. */
  unicornAt(id: UnicornId): Vec2 | undefined {
    return this.unicorns.get(id)?.at;
  }

  /**
   * Where the middle of a creature was drawn last frame, for the camera's tests and for tapping one
   * in a test.
   */
  critterAt(id: string): Vec2 | undefined {
    return this.life.centreOf(id);
  }

  /** How many display objects this view holds, for the performance report. */
  get objectCount(): number {
    return (
      this.owned.length +
      (this.unicorns.size + this.npcs.size) * 2 +
      this.props.size * 4 +
      this.life.objectCount +
      this.pickups.objectCount +
      this.exits.objectCount
    );
  }

  destroy(): void {
    for (const o of this.owned) o.destroy();
    this.owned.length = 0;
    for (const u of this.unicorns.values()) u.destroy();
    this.unicorns.clear();
    this.fine.clear();
    for (const n of this.npcs.values()) n.destroy();
    this.npcs.clear();
    for (const p of this.props.values()) {
      p.under?.image.destroy();
      p.body?.image.destroy();
      p.overlay?.image.destroy();
      p.shadow?.destroy();
    }
    this.props.clear();
    this.life.destroy();
    this.pickups.destroy();
    this.exits.destroy();
    this.animated.length = 0;
    this.canopy.clear();
    this.ground.destroy();
  }
}
