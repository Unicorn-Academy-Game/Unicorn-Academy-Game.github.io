import Phaser from 'phaser';
import { surfaceLookup } from '../audio/surface';
import type { EffectId } from '../content/activities';
import { EXIT_ARROW_HEIGHT, MAIN_WAYS } from '../content/exits';
import type { WordId } from '../content/lexicon';
import type { ProduceId } from '../content/produce';
import type { MinigameId } from '../content/props';
import { type Haze, OPEN_AIR, SEASON_FEEL, SKY_OVER } from '../content/seasons';
import { WAY_OUT } from '../content/way-out';
import type { Command, Crown, DomainEvent, LoadPlan, Rules, World } from '../domain';
import { CONFIG, createWorld, dispatch, drainEvents, step, toSave } from '../domain';
import { Aim } from '../input/aim';
import { hitTest, type TapTarget } from '../input/hit';
import { type Chart, chartOf } from '../learning';
import { BODY_RISE, CameraRig, clampCentre } from '../render/camera';
import type { Bounds } from '../render/cull';
import { EffectsLayer } from '../render/fx';
import { PROFILES, type Profile } from '../render/profile';
import { rainbowGlance } from '../render/rainbow-glance';
import { SpriteSet } from '../render/sprites';
import { Survey } from '../render/survey';
import { VistaLens } from '../render/vista';
import { WeatherView } from '../render/weather';
import { WorldView } from '../render/world-view';
import type { CompiledMap } from '../shared/compiled-map';
import type { Facing, MapId, UnicornId, Vec2 } from '../shared/ids';
import type { Manifest } from '../shared/manifest';
import { mapSize, portalMark } from '../shared/map';
import type { SeasonId } from '../shared/seasons';
import { fetchMap, locationOf, type Textures } from './assets';
import { faults } from './faults';
import type { FineSheets } from './fine-sheets';
import {
  type ExitArrow,
  type ExitSpot,
  exitArrows,
  type Inset,
  type Screen,
  type SeekBubble,
  type SurveyOffer,
  seekBubble,
  type WayOutOffer,
} from './guide';
import { LessonLink } from './lesson-link';
import { patiently, TOO_LONG } from './patience';
import {
  type AudioPlace,
  type AudioPort,
  forgetfulSaves,
  type LessonPort,
  type Place,
  type SavePort,
  silentAudio,
} from './ports';
import { goalFor } from './seeker';

/** The smallest a tap target may be on screen, in CSS pixels per side. */
const MIN_TARGET_CSS = 48;
const FADE_MS = 320;
const FADE_COLOR = [14, 28, 22] as const;
/**
 * A fade that has not ended this long after it should have is ended by hand, so a change of place
 * never waits on a picture that has stopped.
 */
const FADE_SLACK_MS = 800;
/**
 * How long a change of place waits for the device to finish writing where Wildstar was. A write
 * takes a few milliseconds. One that has not finished in this time is not going to, and the herd
 * must not stand at the door for it, with the world stopped and every tap dropped.
 */
const SAVE_PATIENCE_MS = 2500;
/**
 * How long the next place may take to arrive, in milliseconds, before the herd is taken back to the
 * door it came through.
 */
const LOAD_PATIENCE_MS = 45_000;
/**
 * How long a world may stand stopped while the game is in play before it is taken for one that was
 * left behind, in milliseconds. A change of place stops the world it leaves, and for as long as it
 * lasts the phase says so, so none is stopped in play for even a moment.
 */
const LEFT_BEHIND_MS = 1500;
/**
 * How many frames in a row the simulation may fail before the world is built again where Wildstar
 * stood.
 */
const FAILING_FRAMES = 30;
/**
 * The least time between one world being built again for trouble and the next, so that trouble
 * which comes straight back does not make the game flicker.
 */
const REBUILD_EVERY_MS = 5000;
const HINT_DISTANCE = 300;
/**
 * The button for looking at the whole of a place shows up a little beyond where the camera starts
 * to make room for it.
 */
const SURVEY_OFFER_REACH = 1.2;
const NO_ARROWS: readonly ExitArrow[] = [];
/**
 * World units added around the camera's view when scenery out of it is hidden, for the rounding of
 * the view's edge.
 */
const CULL_MARGIN = 24;
/**
 * How long the shimmer for a word the player has spelled lasts, as long as a friend's own magic
 * does.
 */
const CELEBRATE_SECONDS = 1.8;

export type Phase = 'title' | 'playing' | 'transferring';

export interface Viewport {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  zoom: number;
}

export interface Notice {
  kind: 'transfer-failed';
  retry: () => void;
}

export interface ControllerDeps {
  scene: Phaser.Scene;
  manifest: Manifest;
  textures: Textures;
  /**
   * Brings in the fine sheets of the unicorns who are out. Without it they keep the eight facings
   * of their first sheet.
   */
  fine?: FineSheets;
  /** How much the screen is asked to draw. Standard when left out. */
  profile?: Profile;
  save?: SavePort;
  audio?: AudioPort;
  onNotice?: (notice: Notice) => void;
  /**
   * The season the places out of doors are in to begin with. Summer, which is how they were drawn,
   * when left out.
   */
  season?: SeasonId;
  /**
   * The veil of colour over the picture is another now: the haze of the season on a place out of
   * doors, or none.
   */
  onSky?: (haze: Haze | null) => void;
  /** A friend has just joined the herd. `found` is everyone who has, including the newest. */
  onFriendFound?: (unicornId: UnicornId, found: readonly UnicornId[]) => void;
  /** A fruit or vegetable has just been gathered, from where it lay in the world. */
  onProduceGathered?: (produce: ProduceId, at: Vec2) => void;
  /**
   * The player tapped something that starts a little game, and it is time to put it on the screen.
   */
  onMinigame?: (site: MinigameSite) => void;
  /**
   * The herd is at a door that wants a word. Put the pad on the screen: it answers through
   * `tryCode`.
   */
  onCodeWanted?: (doorInstanceId: string) => void;
  /**
   * The herd is going up or down in a lift. The ride is on the screen from when the old place goes
   * dark until `leave` is called, once the new one is ready.
   */
  onRide?: (direction: 'up' | 'down') => Ride;
}

/** The toy that started a game, for a screen that opens the game from where the toy is. */
export interface MinigameSite {
  game: MinigameId;
  instanceId: string;
  /** Which of the toy's looks the player tapped. Nothing for a toy that has only one. */
  look: string | undefined;
  /**
   * What kind of thing the player tapped, for a game that several different things open, like the
   * eight statues and their postcard.
   */
  toy: string | undefined;
  /** The middle of the toy on the screen, in CSS pixels. */
  at: Vec2;
}

/** A ride in a lift, from the screen's side. */
export interface Ride {
  /**
   * The doors have shut and the lift has gone as far as it goes. The new place may be shown now.
   */
  arrived: Promise<void>;
  /** Opens the doors on the new place. */
  leave(): Promise<void>;
}

/**
 * The one world controller. It owns the simulation, the picture of it, the camera and the order
 * things happen in across a map change. Nothing else steps the world.
 */
export class GameController {
  phase: Phase = 'title';
  world!: World;
  view!: WorldView;
  compiled!: CompiledMap;

  private readonly scene: Phaser.Scene;
  private readonly manifest: Manifest;
  /** What stands in each place and how the places join up, for working out the road to a word. */
  private readonly chart: Chart;
  private readonly textures: Textures;
  private readonly fine: FineSheets | undefined;
  private readonly profile: Profile;
  private readonly save: SavePort;
  private readonly audio: AudioPort;
  /**
   * What the player may be asked to spell for what they touch. It asks nothing until a lesson is
   * given with `setLesson`.
   */
  private readonly lesson = new LessonLink(() => this.world);
  private readonly onNotice: (notice: Notice) => void;
  private readonly onSky: (haze: Haze | null) => void;
  private readonly onFriendFound: (unicornId: UnicornId, found: readonly UnicornId[]) => void;
  private readonly onProduceGathered: (produce: ProduceId, at: Vec2) => void;
  private readonly onMinigame: (site: MinigameSite) => void;
  private readonly onCodeWanted: (doorInstanceId: string) => void;
  private readonly onRide: ((direction: 'up' | 'down') => Ride) | undefined;
  /**
   * The doors opened by a word or a clue so far. One set for the whole game, handed to every world,
   * and never saved.
   */
  private readonly unlocked = new Set<string>();
  /**
   * How the game wants things to go. One object for every world, so a change is seen at once by the
   * one on the screen.
   */
  private readonly rules: Rules = { friends: 'walk-up' };
  /**
   * Whether Wildstar has the crown on. One object for the whole game, so it stays on through every
   * door, and it is never saved.
   */
  private readonly crown: Crown = { worn: false };
  private readonly effects: EffectsLayer;
  /** What falls from the sky over a place out of doors. */
  private readonly weather: WeatherView;
  /**
   * The season now, and the season the world and the picture of it on the screen were built for. A
   * place with a roof is built for summer.
   */
  private season: SeasonId;
  private built: SeasonId = 'summer';
  private readonly rig = new CameraRig();
  private readonly lens = new VistaLens();
  private readonly survey = new Survey();
  /**
   * Where each way out of this map hovers its marker, for pointing to the ones that are off the
   * screen.
   */
  private spots: readonly ExitSpot[] = [];
  private viewport: Viewport = { cssWidth: 1, cssHeight: 1, dpr: 1, zoom: 1 };
  /**
   * CSS pixels per world unit now: the player's zoom, pulled back a little while the herd is near a
   * vista.
   */
  private zoom = 1;
  /** Framebuffer pixels per world unit now. */
  private pixelsPerUnit = 0;
  private accumulator = 0;
  private commandSeq = 0;
  /**
   * How many changes of place have begun. One that is still finishing can tell by it whether
   * another has begun since.
   */
  private transfers = 0;
  /**
   * How long a change of place waits for the device and for the next place, in milliseconds. A test
   * shortens them.
   */
  private patience = { save: SAVE_PATIENCE_MS, load: LOAD_PATIENCE_MS };
  private hintAt: Vec2 | null = null;
  private frozen = false;
  /**
   * Whether the parent asked for calmer effects, which also keeps the exit markers from pulsing and
   * hopping.
   */
  private calm = false;
  /** Where the camera is held for a survey of the scenery, in place of the herd. Null in play. */
  private look: Vec2 | null = null;
  /**
   * The world point the camera is centred on, as last set. The engine works out its own view only
   * when it draws.
   */
  private centre: Vec2 = { x: 0, y: 0 };
  /** Where a finger that is leading Wildstar is on the screen, in CSS pixels. Null when none is. */
  private finger: Vec2 | null = null;
  /** The way the held keys point. */
  private keys: Vec2 | null = null;
  private readonly aim = new Aim();
  /**
   * The heading last given to the simulation, so a held finger that has not moved says nothing new.
   * Null when nothing is leading Wildstar.
   */
  private led: Vec2 | null = null;
  /**
   * Frame time added up, in milliseconds, for telling how long ago the world was last built again.
   */
  private clock = 0;
  private rebuiltAt = -REBUILD_EVERY_MS;
  /**
   * How long the world has stood stopped in play, and how many frames in a row the simulation has
   * failed.
   */
  private stoppedFor = 0;
  private failing = 0;

  constructor(deps: ControllerDeps) {
    this.scene = deps.scene;
    this.manifest = deps.manifest;
    this.chart = chartOf(deps.manifest.maps);
    this.textures = deps.textures;
    this.fine = deps.fine;
    this.profile = deps.profile ?? PROFILES.standard;
    this.save = deps.save ?? forgetfulSaves;
    this.audio = deps.audio ?? silentAudio;
    this.onNotice = deps.onNotice ?? (() => undefined);
    this.onSky = deps.onSky ?? (() => undefined);
    this.season = deps.season ?? 'summer';
    // Nothing is in yet to paint, so this only says which season the pictures that come in are
    // painted for.
    void deps.textures.setSeason(this.season);
    this.weather = new WeatherView(deps.scene, this.profile.sparkles);
    this.onFriendFound = deps.onFriendFound ?? (() => undefined);
    this.onProduceGathered = deps.onProduceGathered ?? (() => undefined);
    this.onMinigame = deps.onMinigame ?? (() => undefined);
    this.onCodeWanted = deps.onCodeWanted ?? (() => undefined);
    this.onRide = deps.onRide;
    const fx = deps.manifest.bundles.fx;
    if (!fx) throw new Error('the manifest has no effects bundle');
    this.effects = new EffectsLayer(deps.scene, new SpriteSet('fx', fx), this.profile);
  }

  /**
   * Loads a map's pictures and starts a world there. The textures for the unicorns must already be
   * loaded.
   */
  async start(plan: LoadPlan): Promise<void> {
    const compiled = await fetchMap(this.manifest, plan.mapId);
    await this.textures.loadLocation(this.manifest, locationOf(compiled));
    this.install(
      compiled,
      createWorld({
        map: this.mapFor(compiled),
        persistent: plan.persistent,
        seed: plan.seed,
        arrival: plan.arrival,
        unlocked: this.unlocked,
        rules: this.rules,
        crown: this.crown,
      }),
    );
    this.settleCamera();
    this.accumulator = 0;
  }

  /**
   * Puts the world on the title screen somewhere else, so the place the player is choosing to begin
   * at is the one on the screen behind the choice. The screen dims while the next place comes in,
   * as it does for a change of place, and the old world is taken down the same way. Only for the
   * title, and one at a time: the caller waits for one to finish before it asks for the next. If
   * the place cannot be had, the world on the screen is left as it was and this throws.
   */
  async restage(plan: LoadPlan): Promise<void> {
    if (this.phase !== 'title') throw new Error('a world is put somewhere else only before play begins');
    const left = this.compiled;
    const dimmed = this.fade(true);
    let compiled: CompiledMap | undefined;
    try {
      compiled = await fetchMap(this.manifest, plan.mapId);
      await this.textures.loadLocation(this.manifest, locationOf(compiled));
      await dimmed;
    } catch (error) {
      // What came in before the failure is not wanted: the world on the screen is the one that
      // stays.
      if (compiled) this.textures.releaseLocation(this.manifest, locationOf(compiled), locationOf(left));
      await dimmed;
      await this.fade(false);
      throw error;
    }
    const next = createWorld({
      map: this.mapFor(compiled),
      persistent: plan.persistent,
      seed: plan.seed,
      arrival: plan.arrival,
      unlocked: this.unlocked,
      rules: this.rules,
      crown: this.crown,
    });
    this.view.destroy();
    this.effects.clear();
    this.install(compiled, next);
    this.textures.releaseLocation(this.manifest, locationOf(left), locationOf(compiled));
    this.settleCamera();
    this.accumulator = 0;
    await this.fade(false);
  }

  private install(compiled: CompiledMap, world: World): void {
    // What the player touched and the friends who waited are in the place that is going.
    this.lesson.newPlace();
    this.compiled = compiled;
    this.world = world;
    this.built = this.seasonHere(compiled);
    this.view = new WorldView(
      this.scene,
      this.manifest,
      compiled,
      this.profile.cull,
      (id) => this.fine?.want(id),
      this.built,
    );
    this.weather.set(SEASON_FEEL[this.built].fall);
    this.onSky(SEASON_FEEL[this.built].haze);
    this.lens.reset(compiled.render.vista, world.unicorns.wildstar!.pos);
    this.survey.reset();
    this.spots = world.map.portals.map((p) => {
      const mark = portalMark(p);
      return {
        portalId: p.portalId,
        mapId: p.to.mapId,
        at: { x: mark.x, y: mark.y - EXIT_ARROW_HEIGHT },
        main: MAIN_WAYS.has(p.to.mapId),
      };
    });
    // A finger still down on a new map leads again from the first frame.
    this.led = null;
    this.aim.reset();
    this.handleEvents();
  }

  /**
   * The season a place is in: the one it keeps all year if it has one of its own, otherwise the one
   * showing if the sky is over it, and summer, which is how it was drawn, if it has a roof.
   */
  private seasonHere(compiled: CompiledMap = this.compiled): SeasonId {
    const id = compiled.logic.id;
    return SKY_OVER[id] ?? (OPEN_AIR[id] ? this.season : 'summer');
  }

  /**
   * The map as the season leaves it: the creatures that are asleep or gone for the season are not
   * in it.
   */
  private mapFor(compiled: CompiledMap): CompiledMap['logic'] {
    const away = SEASON_FEEL[this.seasonHere(compiled)].away;
    return away.length === 0
      ? compiled.logic
      : { ...compiled.logic, life: compiled.logic.life.filter((zone) => !away.includes(zone.kind)) };
  }

  /**
   * The season is another now. The pictures of the places that are out of doors are painted again,
   * and a place that is out of doors and on the screen is built again where Wildstar stands, with
   * the friends and what the player has done kept, for what each season does to it.
   */
  async setSeason(season: SeasonId): Promise<void> {
    if (season === this.season) return;
    this.season = season;
    await this.textures.setSeason(season);
    this.followSeason();
  }

  /**
   * Builds the world on the screen again if it was built for another season than this place has
   * now. A change of place that is on its way builds the place it brings for the season it finds,
   * and looks again when it has ended.
   */
  private followSeason(): void {
    if (!this.compiled || this.phase === 'transferring' || this.built === this.seasonHere()) return;
    this.rebuild();
  }

  /**
   * The season the place on the screen is drawn in, which is summer for a place with a roof. For
   * tests.
   */
  get seasonShown(): SeasonId {
    return this.built;
  }

  /** What is falling over the place, and how many of it are in the air. For tests. */
  debugWeather(): { fall: string | null; visible: number } {
    return { fall: SEASON_FEEL[this.built].fall, visible: this.weather.visible };
  }

  /**
   * Wakes the audio. Browsers allow it only inside a gesture, so the first tap on Play does this
   * before anything it waits for, and `begin` does it again for a game that is begun by other
   * means.
   */
  unlockAudio(): void {
    this.audio.unlock();
  }

  /**
   * The player's first tap on the title screen. Audio starts here because browsers require a
   * gesture.
   */
  begin(): void {
    this.audio.unlock();
    this.phase = 'playing';
    this.lesson.begun();
    this.showHint();
  }

  /**
   * The pulsing sparkle that shows a first-time player where to tap: a point along the way to the
   * nearest friend, as far from Wildstar as fits comfortably on screen, so it invites a tap without
   * needing the camera to move.
   */
  private showHint(): void {
    const leader = this.world.unicorns.wildstar;
    const friend = this.world.map.encounters[0];
    const fresh = this.world.persistent.recruited.length === 1 && this.world.persistent.visitedMaps.length === 1;
    if (!leader || !friend || !fresh) return;
    const path = this.world.nav.findPath(leader.pos, friend.greeting);
    if (!path || path.length === 0) return;
    const e = this.extent();
    const reachX = e.w * 0.36;
    const reachY = e.h * 0.34;
    let from: Vec2 = leader.pos;
    let best: Vec2 | null = null;
    for (const p of path) {
      const length = Math.hypot(p.x - from.x, p.y - from.y);
      const steps = Math.max(1, Math.ceil(length / 16));
      for (let i = 1; i <= steps; i++) {
        const q = { x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps };
        if (
          Math.abs(q.x - leader.pos.x) > reachX ||
          Math.abs(q.y - leader.pos.y) > reachY ||
          Math.hypot(q.x - leader.pos.x, q.y - leader.pos.y) > HINT_DISTANCE
        ) {
          this.placeHint(best);
          return;
        }
        best = q;
      }
      from = p;
    }
    this.placeHint(best);
  }

  private placeHint(at: Vec2 | null): void {
    if (!at) return;
    this.hintAt = at;
    this.effects.hint(at);
  }

  /** Runs once per rendered frame: whole simulation steps, then the picture, then the camera. */
  frame(dtMs: number, nowMs: number): void {
    if (this.frozen) return;
    this.advanceFrame(dtMs, nowMs);
  }

  /**
   * The picture, the camera and the sound each carry on when another of them fails, and so does the
   * simulation, since a frame that throws is a game that stops. Trouble that does not pass is seen
   * to in `mend`.
   */
  private advanceFrame(frameMs: number, nowMs: number): void {
    // A length that is not a number would stay in the clock, the accumulator and the camera, and
    // nothing would move again.
    const dtMs = Number.isNaN(frameMs) ? 0 : frameMs;
    const dt = Math.min(Math.max(dtMs, 0), 250) / 1000;
    this.clock += dt * 1000;
    this.mend(dt * 1000);
    try {
      this.driveSteering();
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= CONFIG.step && steps < CONFIG.maxStepsPerFrame) {
        step(this.world);
        this.accumulator -= CONFIG.step;
        steps += 1;
        this.handleEvents();
      }
      // Beyond the cap the simulation drops time rather than racing to catch up.
      if (this.accumulator >= CONFIG.step) this.accumulator = 0;
      this.failing = 0;
    } catch (error) {
      this.failing += 1;
      this.accumulator = 0;
      faults.report('simulation', error);
    }

    const alpha = this.accumulator / CONFIG.step;
    faults.carry('view', () => this.view.update(this.world, alpha, dtMs, nowMs, this.calm));
    faults.carry('effects', () => this.effects.update(dtMs));
    faults.carry('camera', () => this.moveCamera(dt, alpha));
    faults.carry('weather', () => this.weather.update(dtMs, this.viewed()));
    faults.carry('effects', () =>
      this.effects.steer(this.phase === 'playing' && this.finger ? this.toWorld(this.finger) : null),
    );
    if (this.phase === 'playing') {
      faults.carry('sound', () => {
        const seen = this.scene.cameras.main.worldView;
        this.audio.frame(this.world, { x: seen.x, y: seen.y, w: seen.width, h: seen.height }, dt);
      });
    }
  }

  /**
   * Sees to trouble that a frame cannot carry past. A world that was stopped for a change of place
   * that never came, or that cannot take a step, is no use to anyone: no tap is answered and
   * nothing moves. It is built again where Wildstar stood, with everyone found so far, which is all
   * the player would otherwise lose, and not more than once in a few seconds.
   */
  private mend(ms: number): void {
    this.stoppedFor = this.phase === 'playing' && this.world.paused ? this.stoppedFor + ms : 0;
    if (this.stoppedFor < LEFT_BEHIND_MS && this.failing < FAILING_FRAMES) return;
    if (this.clock - this.rebuiltAt < REBUILD_EVERY_MS) return;
    this.rebuiltAt = this.clock;
    faults.report(
      this.stoppedFor >= LEFT_BEHIND_MS ? 'world built again, left stopped' : 'world built again, cannot step',
      new Error('the world is built again where the player stood'),
    );
    faults.carry('rebuild', () => this.rebuild());
  }

  /**
   * Builds the world again on this place, where Wildstar stood. What the player has found and done
   * is in `persistent`, which is kept.
   */
  private rebuild(): void {
    const from = this.world;
    const at = toSave(from, '00000000-0000-4000-8000-000000000000').wildstar;
    faults.carry('view', () => this.view.destroy());
    this.effects.clear();
    this.install(
      this.compiled,
      createWorld({
        map: this.mapFor(this.compiled),
        persistent: from.persistent,
        seed: from.rng.state,
        arrival: { kind: 'saved', position: at.position, facing: at.facing },
        unlocked: this.unlocked,
        rules: this.rules,
        crown: this.crown,
      }),
    );
    this.settleCamera();
    this.accumulator = 0;
    this.stoppedFor = 0;
    this.failing = 0;
  }

  /**
   * What sound needs to know about the map the herd is on: its music and ambience, and what the
   * ground sounds like.
   */
  private place(): AudioPlace {
    const { logic, render } = this.compiled;
    const tileset = this.manifest.tilesets[render.tileset];
    return {
      mapId: logic.id,
      music: logic.audio.music,
      ambience: logic.audio.ambience,
      surfaceAt: tileset ? surfaceLookup(this.compiled, tileset) : () => 'soft',
    };
  }

  /**
   * Runs the simulation forward without drawing, for tests and for catching up after a long pause
   * on request.
   */
  advance(seconds: number): void {
    const steps = Math.round(seconds * CONFIG.stepHz);
    for (let i = 0; i < steps; i++) {
      step(this.world);
      this.handleEvents();
    }
  }

  /** A tap at a point in the world. One tap makes at most one command. */
  tap(at: Vec2): void {
    // Every tap in the game is a chance to wake audio that the system put to sleep, such as after a
    // phone call.
    if (this.phase !== 'title') this.audio.unlock();
    if (this.phase !== 'playing' || this.world.paused) return;
    // A touch while the camera stands back from the palace only brings it home. Where it landed
    // would be a place picked from far away.
    if (this.survey.wanted) {
      this.survey.end();
      return;
    }
    this.act(this.targetAt(at));
  }

  /**
   * What a tap on a thing makes the herd do. It is one command, and then whatever the lesson has to
   * say about it.
   */
  private act(target: TapTarget): void {
    const id = `c${++this.commandSeq}`;
    let command: Command;
    switch (target.kind) {
      case 'ground':
        command = { type: 'move', commandId: id, destination: target.at };
        break;
      case 'prop':
      case 'npc':
        command = { type: 'interact', commandId: id, instanceId: target.instanceId };
        break;
      case 'critter':
        command = { type: 'poke', commandId: id, critterId: target.id };
        break;
      case 'unicorn':
        command = this.world.persistent.recruited.includes(target.id)
          ? { type: 'cast', commandId: id, unicornId: target.id }
          : { type: 'greet', commandId: id, unicornId: target.id };
        break;
    }
    // A tap on fruit may wait for a word to be spelled. It is sent when the player has, and not at
    // all when they close the card.
    const sendLater = (): void => {
      if (this.phase === 'playing') this.send(command);
    };
    if (this.lesson.holds(command, sendLater)) return;
    this.send(command);
    this.lesson.tapped(command);
  }

  /** Gives the world a command from a tap, and shows what it answered in this frame. */
  private send(command: Command): void {
    dispatch(this.world, command);
    // A tap takes over from leading, so a key still held leads again from the next frame.
    this.led = null;
    // Feedback in the frame the finger lifted, not at the next simulation step.
    this.handleEvents();
  }

  /**
   * What a tap at a world point would land on, as small as a finger needs it to be at this zoom.
   */
  targetAt(at: Vec2): TapTarget {
    return hitTest(this.world, at, MIN_TARGET_CSS / 2 / this.zoom);
  }

  /**
   * Whether a press at a world point would land on a unicorn, a prop or a worker, and not on open
   * ground.
   */
  thingAt(at: Vec2): boolean {
    return this.phase === 'playing' && !this.world.paused && this.targetAt(at).kind !== 'ground';
  }

  /**
   * A finger is leading Wildstar. It is at this point on the screen, in CSS pixels, and she goes
   * toward it until it lifts.
   */
  lead(css: Vec2): void {
    this.survey.end();
    this.finger = { x: css.x, y: css.y };
  }

  /** The finger that was leading Wildstar has lifted. */
  release(): void {
    this.finger = null;
  }

  /** The keys that lead Wildstar point this way, or nowhere. */
  leadWithKeys(heading: Vec2 | null): void {
    if (heading) this.survey.end();
    this.keys = heading;
  }

  /**
   * The word typed at a door that wants one. True when it was the right one and the door is
   * opening.
   */
  tryCode(doorInstanceId: string, code: string): boolean {
    if (this.phase !== 'playing' || this.world.paused) return false;
    dispatch(this.world, { type: 'enter-code', commandId: `c${++this.commandSeq}`, instanceId: doorInstanceId, code });
    const opened = this.world.unlocked.has(doorInstanceId);
    this.handleEvents();
    return opened;
  }

  /**
   * The bubbles for the ways out that are off the screen, where each sits on its edge now. For the
   * layer that draws them. The way out that the bubble for a word stands at is left out, since that
   * bubble is its bubble, and so is any that would sit on it.
   */
  exitArrows(screen: Screen, inset: Inset, seek?: { bubble: SeekBubble; exit: string | null }): readonly ExitArrow[] {
    if (this.phase !== 'playing' || this.world.paused || this.survey.blend > 0.15) return NO_ARROWS;
    const spots = seek?.exit == null ? this.spots : this.spots.filter((s) => s.portalId !== seek.exit);
    return exitArrows(spots, (p) => this.toScreen(p), screen, inset, undefined, seek ? [seek.bubble] : []);
  }

  /**
   * Where the bubble for a word the player is looking for is on the screen now, and the way out it
   * stands at when the word is through one. Nothing while the world is not in play, or while the
   * camera is standing back.
   */
  seekBubble(word: WordId, screen: Screen, inset: Inset): { bubble: SeekBubble; exit: string | null } | null {
    if (this.phase !== 'playing' || this.world.paused || this.survey.blend > 0.15) return null;
    const goal = goalFor(this.world, this.chart, word);
    if (!goal) return null;
    return {
      bubble: seekBubble(goal.at, (p) => this.toScreen(p), screen, inset),
      exit: goal.kind === 'exit' ? goal.portalId : null,
    };
  }

  /**
   * Takes the herd a step of the way to a word, as a tap on what the bubble stands at would. That
   * is the thing that gives the word, or the way out the road begins with.
   */
  seekGo(word: WordId): void {
    if (this.phase !== 'playing' || this.world.paused) return;
    const goal = goalFor(this.world, this.chart, word);
    if (!goal) return;
    this.survey.end();
    if (goal.kind === 'exit') this.goToExit(goal.portalId);
    else this.act(goal.target);
  }

  /**
   * Walks to a way out as if its door had been tapped, which is what its bubble at the edge of the
   * screen says.
   */
  goToExit(portalId: string): void {
    if (this.phase !== 'playing' || this.world.paused) return;
    const portal = this.world.map.portals.find((p) => p.portalId === portalId);
    if (!portal) return;
    this.survey.end();
    dispatch(this.world, { type: 'move', commandId: `c${++this.commandSeq}`, destination: portalMark(portal) });
    this.led = null;
    this.handleEvents();
  }

  /**
   * The button for standing back to see all of the place beside the herd. Null while nothing near
   * has one.
   */
  surveyOffer(): SurveyOffer | null {
    const vista = this.compiled.render.vista;
    if (!vista?.whole || this.phase !== 'playing' || this.world.paused) return null;
    if (this.survey.wanted) return { word: vista.whole.word, active: true };
    const herd = this.world.unicorns.wildstar!.pos;
    return Math.hypot(herd.x - vista.stand.x, herd.y - vista.stand.y) <= vista.radius * SURVEY_OFFER_REACH
      ? { word: vista.whole.word, active: false }
      : null;
  }

  /**
   * The button that takes the herd out of where she is, in one tap. Null where there is no such
   * button, and while the world is not in play.
   */
  wayOutOffer(): WayOutOffer | null {
    if (this.phase !== 'playing' || this.world.paused) return null;
    const out = WAY_OUT[this.world.map.id];
    return out ? { label: out.label } : null;
  }

  /** Takes the herd out of where she is at once, as the button says. */
  wayOut(): void {
    if (this.phase !== 'playing' || this.world.paused) return;
    const out = WAY_OUT[this.world.map.id];
    if (!out) return;
    this.survey.end();
    void this.transfer(out.to);
  }

  /** Stands back to see all of the place beside the herd, or comes home from it. */
  toggleSurvey(): void {
    const whole = this.compiled.render.vista?.whole;
    if (!whole || this.phase !== 'playing' || this.world.paused) return;
    if (this.survey.wanted) this.survey.end();
    else this.survey.begin(whole.area);
  }

  /**
   * How far the camera has stood back to see the whole of a place, from 0 at home to 1. For tests.
   */
  get surveyed(): number {
    return this.survey.blend;
  }

  /**
   * Tells the simulation which way Wildstar is being led, once a frame and only when it has
   * changed. A finger on the screen leads Wildstar toward itself from where her body is drawn, so
   * the camera moving as she walks does not change what the finger means.
   */
  private driveSteering(): void {
    const ready = this.phase === 'playing' && !this.world.paused;
    const heading = ready ? this.aim.aim(this.finger, this.keys, this.bodyOnScreen()) : null;
    if (!ready) this.aim.reset();
    if (heading) {
      const last = this.led;
      if (last && Math.hypot(heading.x - last.x, heading.y - last.y) < 0.01) return;
      this.led = heading;
      dispatch(this.world, { type: 'steer', commandId: `c${++this.commandSeq}`, heading });
    } else if (this.led) {
      this.led = null;
      if (ready) dispatch(this.world, { type: 'halt', commandId: `c${++this.commandSeq}` });
    }
  }

  /** Where Wildstar's body is drawn on the screen, in CSS pixels. */
  private bodyOnScreen(): Vec2 {
    const at = this.view.unicornAt('wildstar') ?? this.world.unicorns.wildstar!.pos;
    return this.toScreen({ x: at.x, y: at.y - BODY_RISE });
  }

  /**
   * Lets the world rest while a game has the whole screen: nothing is stepped or drawn, and the
   * last picture stays under it.
   */
  sleep(): void {
    this.scene.game.loop.sleep();
  }

  /** Starts the world again where it stopped. The first frame drawn is the one that was left. */
  wake(): void {
    this.scene.game.loop.wake();
  }

  /**
   * Stops real time from driving the game, so a test can step it by hand and look at exact moments.
   */
  debugFreeze(on: boolean): void {
    this.frozen = on;
  }

  /** Advances a frozen game by `seconds`, in frames of about 33 ms, drawing as it goes. */
  debugStep(seconds: number): void {
    const frames = Math.max(1, Math.round(seconds * 30));
    for (let i = 0; i < frames; i++) this.advanceFrame((seconds * 1000) / frames, performance.now());
  }

  /**
   * Puts Wildstar somewhere without walking, with the herd following the new trail. For tests and
   * for looking at places.
   */
  debugTeleport(to: Vec2): void {
    const leader = this.world.unicorns.wildstar!;
    leader.pos = { ...to };
    leader.prev = { ...to };
    this.world.leader.seat = null;
    this.world.trail.seed([{ ...to }]);
    this.settleCamera({ x: to.x, y: to.y - BODY_RISE });
  }

  /**
   * Holds the camera on a place, or hands it back to the herd with null. For photographing a whole
   * map.
   */
  debugLook(at: Vec2 | null): void {
    this.look = at ? { ...at } : null;
    this.settleCamera();
  }

  /**
   * Goes through a door the way a portal does, without walking to it. For where a game leads on to,
   * and for tests and for looking at places.
   */
  travel(to: { mapId: MapId; spawnId: string }): Promise<void> {
    return this.transfer(to);
  }

  /**
   * Shortens how long a change of place waits for the device and for the next place, so a test of a
   * place that never arrives need not wait for the real time.
   */
  debugPatience(patience: Partial<{ save: number; load: number }>): void {
    this.patience = { ...this.patience, ...patience };
  }

  /** Drops every effect that is playing. */
  debugClearEffects(): void {
    this.effects.clear();
  }

  /** How many particles are alive now. For tests of the particle budget. */
  debugParticles(): number {
    return this.effects.live;
  }

  /**
   * Where the middle of a creature was drawn last frame, so a test can tap it where a child would
   * see it.
   */
  debugCritterAt(id: string): Vec2 | undefined {
    return this.view.critterAt(id);
  }

  /** Where a world point is on screen, in CSS pixels, with the camera where it was last put. */
  toScreen(p: Vec2): Vec2 {
    const e = this.extent();
    return {
      x: ((p.x - this.centre.x) / e.w + 0.5) * this.viewport.cssWidth,
      y: ((p.y - this.centre.y) / e.h + 0.5) * this.viewport.cssHeight,
    };
  }

  /**
   * Where a world point is on the screen, in CSS pixels, or null when it is off the screen. For
   * things that fly from a place in the world to the page.
   */
  onScreen(p: Vec2): Vec2 | null {
    const at = this.toScreen(p);
    const { cssWidth, cssHeight } = this.viewport;
    return at.x >= 0 && at.y >= 0 && at.x <= cssWidth && at.y <= cssHeight ? at : null;
  }

  /** Where a point on the screen, in CSS pixels, is in the world. */
  toWorld(css: Vec2): Vec2 {
    const e = this.extent();
    return {
      x: this.centre.x + (css.x / this.viewport.cssWidth - 0.5) * e.w,
      y: this.centre.y + (css.y / this.viewport.cssHeight - 0.5) * e.h,
    };
  }

  /** Plays an effect without the simulation asking for it. For tests and for looking at the art. */
  debugEffect(id: EffectId, at: Vec2, seconds = 2.4, facing?: Facing): void {
    this.effects.play({ id, at, seconds, facing });
  }

  /**
   * Each event is seen to on its own, so that a sound or a picture that cannot take one does not
   * lose the rest, among them the door the herd went through.
   */
  private handleEvents(): void {
    const events = drainEvents(this.world);
    if (events.length === 0) return;
    faults.carry('sound', () => this.audio.events(events, this.world));
    for (const e of events) faults.carry(`event ${e.type}`, () => this.onEvent(e));
  }

  private onEvent(e: DomainEvent): void {
    this.lesson.event(e);
    switch (e.type) {
      case 'command-accepted':
        this.effects.play({ id: 'tap', at: e.at, seconds: 0.4 });
        if (e.command === 'move' && this.hintAt) {
          this.hintAt = null;
          this.effects.hint(null);
        }
        break;
      case 'command-refused':
        this.effects.play({ id: 'refusal', at: e.at, seconds: 0.4 });
        break;
      case 'effect':
        this.effects.play({
          id: e.effect,
          at: e.at,
          seconds: e.seconds,
          facing: e.facing,
          lift: e.lift,
          share: e.share,
        });
        break;
      case 'map-entered':
        this.audio.enterMap(this.place());
        break;
      case 'save-needed':
        this.save.request(e.reason, this.world);
        break;
      case 'portal-entered':
        void this.transfer(e.to, e.ride);
        break;
      case 'code-wanted':
        this.onCodeWanted(e.instanceId);
        break;
      case 'friend-recruited':
        this.onFriendFound(e.unicornId, this.world.persistent.recruited);
        break;
      case 'produce-collected':
        // A small twinkle where it lay. Calm mode keeps the twinkle, which is small, and the basket
        // skips the flight.
        this.effects.play({ id: 'pip-sparkle', at: e.at, seconds: 0.7 });
        this.onProduceGathered(e.produce, e.at);
        break;
      case 'leader-reset':
        // Whatever held Wildstar was forgotten, so a finger or key that is still down says which
        // way again from the next frame.
        this.led = null;
        // Being set down on open ground, before a tap from where no route can begin, is the game
        // doing what it is meant to. Being stood down is not.
        if (e.why === 'stalled') faults.repair('freed');
        break;
      case 'minigame-started': {
        const toy = this.world.interactables.get(e.instanceId);
        const middle = toy ? { x: toy.hit.x + toy.hit.w / 2, y: toy.hit.y + toy.hit.h / 2 } : this.centre;
        this.onMinigame({
          game: e.game,
          instanceId: e.instanceId,
          look: toy?.look,
          toy: toy?.definitionId,
          at: this.toScreen(middle),
        });
        break;
      }
      default:
        break;
    }
  }

  /** From now on the player is asked to spell the names of what they touch. */
  setLesson(lesson: LessonPort): void {
    this.lesson.attach(lesson);
  }

  /**
   * How a friend who has not been found joins: when Wildstar walks up, or when the game says she
   * may.
   */
  setFriendRule(friends: Rules['friends']): void {
    this.rules.friends = friends;
  }

  /** Shimmers where the thing the player has spelled the name of stands. */
  celebrate(effect: EffectId, place: Place): void {
    this.effects.play({ id: effect, at: place.at, seconds: CELEBRATE_SECONDS, lift: place.lift });
  }

  /**
   * Save, pause, fade, load, arrive, resume, save. If anything fails the herd goes back to the door
   * it came through and a notice offers another try, so a bad connection never strands the game
   * between maps.
   */
  private async transfer(to: { mapId: MapId; spawnId: string }, ride?: 'up' | 'down'): Promise<void> {
    if (this.phase === 'transferring') return;
    this.phase = 'transferring';
    const mine = ++this.transfers;
    const from = this.world;
    const left = this.compiled;
    const camera = this.scene.cameras.main;
    let riding: Ride | null = null;
    try {
      // The old world is stopped by now, so what the device is asked to write is all there is to
      // lose, and it is given a moment.
      await patiently(this.save.flush(from), this.patience.save);
      await this.fade(true);
      // The lift's doors close over the dark, and the ride goes on while the next place is got
      // ready.
      riding = ride && this.onRide ? this.onRide(ride) : null;
      const compiled = await this.arrived(fetchMap(this.manifest, to.mapId), to.mapId);
      await this.arrived(this.textures.loadLocation(this.manifest, locationOf(compiled)), to.mapId);
      await riding?.arrived;
      const next = createWorld({
        map: this.mapFor(compiled),
        persistent: from.persistent,
        seed: from.rng.state,
        arrival: { kind: 'spawn', spawnId: to.spawnId },
        unlocked: this.unlocked,
        rules: this.rules,
        crown: this.crown,
      });
      this.view.destroy();
      this.effects.clear();
      this.install(compiled, next);
      this.textures.releaseLocation(this.manifest, locationOf(left), locationOf(compiled));
      this.settleCamera();
      this.accumulator = 0;
      this.phase = 'playing';
      if (riding) {
        // The new place is lit under the lift's shut doors, and they open on it.
        camera.resetFX();
        await riding.leave();
      } else await this.fade(false);
    } catch (error) {
      console.error('map transfer failed', error);
      void riding?.leave();
      await this.recover(from, left, to);
    } finally {
      // A lift takes its doors away after the new place is playing, so the next change of place may
      // have begun and be fading out by now. That fade is not this one's to clear.
      if (this.transfers === mine) {
        camera.resetFX();
        // However it ended, the game is not left between places: a world that was left stopped is
        // built again by `mend`.
        if (this.phase === 'transferring') this.phase = 'playing';
        this.followSeason();
      }
    }
  }

  /**
   * The pictures of a place, or a failure if they have not come in time: a connection that has
   * stopped is no different from one that is gone.
   */
  private async arrived<T>(work: Promise<T>, mapId: MapId): Promise<T> {
    const done = await patiently(work, this.patience.load);
    if (done === TOO_LONG) throw new Error(`${mapId} did not arrive in ${this.patience.load} ms`);
    return done;
  }

  /** Puts the herd back on the map it left, standing at the door, and offers a retry. */
  private async recover(from: World, left: CompiledMap, to: { mapId: MapId; spawnId: string }): Promise<void> {
    const at = toSave(from, '00000000-0000-4000-8000-000000000000').wildstar;
    this.view.destroy();
    this.effects.clear();
    // Its pictures are normally still here. If they are not and cannot be brought back, the herd is
    // put there all the same: a place with a few plain squares is better than a game that never
    // comes back.
    await this.arrived(this.textures.loadLocation(this.manifest, locationOf(left)), left.logic.id).catch(
      (error: unknown) => console.error('the place that was left could not be loaded again', error),
    );
    this.install(
      left,
      createWorld({
        map: this.mapFor(left),
        persistent: from.persistent,
        seed: from.rng.state,
        arrival: { kind: 'saved', position: at.position, facing: at.facing },
        unlocked: this.unlocked,
        rules: this.rules,
        crown: this.crown,
      }),
    );
    this.settleCamera();
    this.phase = 'playing';
    await this.fade(false);
    this.onNotice({ kind: 'transfer-failed', retry: () => void this.transfer(to) });
  }

  /**
   * Fades the screen out to the dark or back from it, and says when it has. Told by the clock as
   * well, so a stopped picture cannot hold it.
   */
  private fade(out: boolean): Promise<void> {
    const camera = this.scene.cameras.main;
    return new Promise((resolve) => {
      const event = out
        ? Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE
        : Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE;
      const done = (): void => {
        clearTimeout(late);
        camera.off(event, done);
        resolve();
      };
      const late = setTimeout(done, FADE_MS + FADE_SLACK_MS);
      camera.once(event, done);
      if (out) camera.fadeOut(FADE_MS, ...FADE_COLOR);
      else camera.fadeIn(FADE_MS, ...FADE_COLOR);
    });
  }

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    if (this.world) this.settleCamera();
    else this.setZoomScale(1);
  }

  /** Reduced effects keep the camera steady on the herd, with no pulling back to look up. */
  setReducedEffects(on: boolean): void {
    this.calm = on;
    this.lens.setCalm(on);
    this.effects.setReduced(on);
    this.weather.setCalm(on);
  }

  /**
   * The visible area in world units at the player's own zoom, before the camera pulls back for a
   * vista.
   */
  private baseExtent(): { w: number; h: number } {
    return { w: this.viewport.cssWidth / this.viewport.zoom, h: this.viewport.cssHeight / this.viewport.zoom };
  }

  /**
   * The visible area in world units at a zoom that is `scale` of the player's own: what the herd's
   * camera sees, apart from any survey.
   */
  private lensExtent(scale: number): { w: number; h: number } {
    return {
      w: this.viewport.cssWidth / (this.viewport.zoom * scale),
      h: this.viewport.cssHeight / (this.viewport.zoom * scale),
    };
  }

  /** The visible area in world units now. */
  private extent(): { w: number; h: number } {
    return { w: this.viewport.cssWidth / this.zoom, h: this.viewport.cssHeight / this.zoom };
  }

  private bounds(): { w: number; h: number } {
    return mapSize(this.world.map);
  }

  /**
   * Where the camera wants to look: Wildstar's body, not her feet. On the title screen of a wide
   * display she stands left of centre so the logo and the play button have the right side to
   * themselves.
   */
  private focus(): Vec2 {
    if (this.look) return this.look;
    const leader = this.view?.unicornAt('wildstar') ?? this.world.unicorns.wildstar!.pos;
    const e = this.extent();
    const shift = this.phase === 'title' && e.w > e.h ? e.w * 0.2 : 0;
    return { x: leader.x + shift, y: leader.y - BODY_RISE };
  }

  /**
   * Puts the camera on the herd at once, with no easing: for a new map, a new screen size, or a
   * jump.
   */
  private settleCamera(target: Vec2 = this.focus()): void {
    const leader = this.world.unicorns.wildstar!.pos;
    this.lens.snap(leader);
    const frame = this.lens.frame(this.baseExtent(), target.y, leader.y, rainbowGlance(this.world, this.world.time));
    this.setZoomScale(this.survey.scale(frame.zoomScale, this.baseExtent()));
    this.rig.snap(target, this.lensExtent(frame.zoomScale), this.bounds());
    this.applyCamera(frame.lift);
  }

  private moveCamera(dt: number, alpha: number): void {
    const leader = this.world.unicorns.wildstar!;
    const speed = Math.hypot(leader.pos.x - leader.prev.x, leader.pos.y - leader.prev.y) * CONFIG.stepHz;
    const heading =
      speed > 20
        ? {
            x: (leader.pos.x - leader.prev.x) / (speed / CONFIG.stepHz),
            y: (leader.pos.y - leader.prev.y) / (speed / CONFIG.stepHz),
          }
        : null;
    this.lens.update(dt, leader.pos);
    // The same moment the props are drawn at, so the camera makes room for a rainbow as the arch is
    // painted and not a step behind it.
    const frame = this.lens.frame(
      this.baseExtent(),
      this.rig.y,
      leader.pos.y,
      rainbowGlance(this.world, this.world.time + alpha * CONFIG.step),
    );
    this.survey.update(dt, this.calm);
    this.setZoomScale(this.survey.scale(frame.zoomScale, this.baseExtent()));
    // The rig keeps following the herd as the herd's own camera would, so standing back never drags
    // it off, and coming home is a glide to where it already is.
    this.rig.update(dt, this.focus(), heading, this.lensExtent(frame.zoomScale), this.bounds());
    this.applyCamera(frame.lift);
  }

  private setZoomScale(scale: number): void {
    this.zoom = this.viewport.zoom * scale;
    const k = this.zoom * this.viewport.dpr;
    if (Math.abs(k - this.pixelsPerUnit) < 1e-6) return;
    this.pixelsPerUnit = k;
    this.scene.cameras.main.setZoom(k);
    this.effects.setSnap(k);
  }

  private applyCamera(lift: number): void {
    // Snap to whole framebuffer pixels so static scenery does not shimmer as the camera glides.
    const k = this.pixelsPerUnit;
    const home = { x: this.rig.x, y: this.rig.y - lift * (1 - this.survey.blend) };
    const at = clampCentre(this.survey.centre(home), this.extent(), this.bounds());
    this.centre = { x: Math.round(at.x * k) / k, y: Math.round(at.y * k) / k };
    this.scene.cameras.main.centerOn(this.centre.x, this.centre.y);
    this.view.cull(this.seen());
  }

  /** The world area the camera shows. */
  private viewed(): { x: number; y: number; w: number; h: number } {
    const e = this.extent();
    return { x: this.centre.x - e.w / 2, y: this.centre.y - e.h / 2, w: e.w, h: e.h };
  }

  /**
   * The world area the camera shows, a little over so rounding at the edge never hides something
   * that is just in.
   */
  private seen(): Bounds {
    const e = this.extent();
    return {
      left: this.centre.x - e.w / 2 - CULL_MARGIN,
      top: this.centre.y - e.h / 2 - CULL_MARGIN,
      right: this.centre.x + e.w / 2 + CULL_MARGIN,
      bottom: this.centre.y + e.h / 2 + CULL_MARGIN,
    };
  }
}
