// SPDX-License-Identifier: GPL-3.0-only
// Adapted from ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under the GNU General Public License
// version 3 only. Translated to TypeScript and changed for this game on 31 October 2026. See `src/wonder/games/tonematrix/NOTICE.md`.

import { Rng } from '../../domain/rng';
import { CHORDS, type Layer, type Style } from '../engine/band';
import { lighten, type RGB } from '../engine/color';
import { clamp, damp, lerp, TAU } from '../engine/ease';
import { Meter, UNEARNED } from '../engine/meter';
import { glowAt, roundedRect, Starfield, verticalGradient } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Pointer, Quality } from '../engine/stage';
import type { VoiceName, WonderSound } from '../sound';
import { Wonder, type WonderEnv } from '../wonder';
import { type Art, makeArt } from './tonematrix/art';
import { Board } from './tonematrix/board';
import { Stroke, type Tile, tileAt } from './tonematrix/grid';
import { BUTTON_IDS, type ButtonId, buttonAt, keyBox, type Plan, planOf, tabAt, tileBox } from './tonematrix/layout';
import { PART_IDS, PARTS, type PartId } from './tonematrix/parts';
import { RUN_APART, thin } from './tonematrix/ringing';
import { PALETTE, SIZE } from './tonematrix/scale';
import { panOf } from './tonematrix/sequence';
import { DIM, glowOf, PER_BURST, SPEED } from './tonematrix/sparks';
import { paintRimTint, paintTabs } from './tonematrix/tabs';

/**
 * The sounds of this game are the three parts of the player's song, the melody, the beat and the
 * bass, and the notes they play on them. Anything else that the engine or the game could ask for is
 * dropped here, so no star, chime, band or cheer can sound in it, and the world's music is turned
 * right off by the shell.
 */
const SONG: readonly VoiceName[] = PART_IDS.map((id) => PARTS[id].voice);
const songOnly = (sound: WonderSound): WonderSound => ({
  fx: () => undefined,
  note: (voice, midi, options) => {
    if (SONG.includes(voice)) sound.note(voice, midi, options);
  },
  now: () => sound.now(),
});

/**
 * Beats a minute at the middle speed, as in the original: a loop of 16 steps is one bar and lasts
 * two seconds.
 */
const TEMPO = 120;
/** How much quicker the music goes at each of the three speeds. */
const SPEEDS = [0.7, 1, 1.35] as const;
const MIDDLE = 1;
/**
 * How long into the game a tab the player has not opened yet starts to call to them, and how long
 * it takes to be calling in full, in seconds.
 */
const INVITE_AFTER = 3;
const INVITE_OVER = 2;

const SKY: readonly (readonly [number, RGB])[] = [
  [0, [18, 11, 56]],
  [0.55, [34, 18, 88]],
  [1, [12, 8, 40]],
];

/** What a finger that went down is doing until it lifts. */
type Hold =
  | { readonly kind: 'grid'; readonly board: Board; readonly stroke: Stroke }
  | { readonly kind: 'keys'; readonly board: Board; row: number }
  | { readonly kind: 'button'; readonly id: ButtonId }
  | { readonly kind: 'none' };

const NOTHING: Hold = { kind: 'none' };

/** A note the player plays: its row, and where in the speakers it is. */
interface Voice {
  readonly y: number;
  readonly pan: number;
}

/**
 * The tone matrix. A song of three parts that play together, each a grid of 16 by 16 lights: each
 * column is a moment in a loop of two seconds, and each row is a note of the melody, a drum of the
 * beat, or a note of the bass, in the five notes of the key the rest of the game is in. Three tabs
 * against the glass choose which part is on it, and all three go on playing whichever is. The
 * player paints lights on and rubs them out with a finger, and the first light a finger touches
 * says whether the whole stroke paints or rubs. Beside the grid is a column of keys that ring the
 * rows, and four buttons: a wand for a new tune for the part on the glass, a broom to clear it, and
 * a hare and a turtle for quicker and slower. Every note that rings throws light over the grid.
 * There is nothing to earn in it: no stars, no finale and no hand that points, so it goes on for as
 * long as they like.
 */
export class ToneMatrix extends Wonder {
  readonly id = 'tone-matrix' as const;
  protected readonly meter = new Meter(UNEARNED);
  private readonly boards: Readonly<Record<PartId, Board>> = {
    melody: new Board(PARTS.melody),
    beat: new Board(PARTS.beat),
    bass: new Board(PARTS.bass),
  };
  private readonly seed: number;
  private readonly held = new Map<number, Hold>();

  private plan!: Plan;
  private art!: Art;
  private sky!: Starfield;
  private level: Quality = 2;

  /** The part that is on the glass, and the parts the player has had on it since they began. */
  private active: PartId = 'melody';
  private readonly visited = new Set<PartId>([this.active]);
  /** How much each tab the player has not opened yet calls to them. */
  private readonly invite: Record<PartId, number> = { melody: 0, beat: 0, bass: 0 };
  /**
   * How much of each of the five colours has rung lately, for the light that spills from behind the
   * glass.
   */
  private readonly spill = new Float32Array(PALETTE.length);
  /**
   * How far each button is pushed in, and how much it shakes, for one that has nothing to do now.
   */
  private readonly pushed = new Float32Array(BUTTON_IDS.length);
  private readonly shaking = new Float32Array(BUTTON_IDS.length);

  /** The step the playhead is on. */
  private playhead = -1;
  private speed = MIDDLE;
  private hover: Tile | null = null;

  constructor(env: WonderEnv) {
    super({ ...env, sound: songOnly(env.sound) });
    this.seed = env.rng.int(0x7fffffff);
    for (const board of this.all()) board.begin(0);
    this.boards[this.active].focus = 1;
    this.startMusic(this.styleOf()).onStep = (step) => this.reached(step);
    this.ripple();
  }

  private all(): readonly Board[] {
    return PART_IDS.map((id) => this.boards[id]);
  }

  /** The part that is on the glass. */
  private get board(): Board {
    return this.boards[this.active];
  }

  /**
   * What a measuring tool or a stand-in player may look at, and never change. `tiles` and `tune`
   * are those of the part that is on the glass.
   */
  inspect(): {
    readonly plan: Plan;
    readonly active: PartId;
    readonly tiles: readonly Tile[];
    readonly parts: Readonly<
      Record<PartId, { readonly tiles: readonly Tile[]; readonly tune: string; readonly focus: number }>
    >;
    readonly playhead: number;
    readonly speed: number;
    readonly tune: string;
    readonly sparks: number;
    readonly held: number;
    readonly tempoScale: number;
    readonly rung: number;
  } {
    const part = (id: PartId): { tiles: readonly Tile[]; tune: string; focus: number } => ({
      tiles: this.boards[id].grid.tiles(),
      tune: this.boards[id].preset.id,
      focus: this.boards[id].focus,
    });
    return {
      plan: this.plan,
      active: this.active,
      tiles: this.board.grid.tiles(),
      parts: { melody: part('melody'), beat: part('beat'), bass: part('bass') },
      playhead: this.playhead,
      speed: this.speed,
      tune: this.board.preset.id,
      sparks: this.all().reduce((sum, b) => sum + b.sparks.count, 0),
      held: this.held.size,
      tempoScale: this.band?.tempoScale ?? 0,
      rung: this.all().reduce((sum, b) => sum + b.ringing.rung, 0),
    };
  }

  override get bloom(): number {
    return this.env.calm ? 0.22 : 0.5;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.level = level;
  }

  /**
   * The player's song, and nothing under it: a layer for each part, which asks its grid for each
   * step.
   */
  private styleOf(): Style {
    const layers = this.all().map(
      (board): Layer => ({
        voice: board.part.voice,
        joins: 0,
        gain: board.part.loop,
        bus: 'effects',
        play: ({ step, seconds }) => board.sequence.hits(step, seconds / SIZE),
      }),
    );
    return {
      name: 'matrix',
      tempo: TEMPO,
      human: 0,
      lookahead: 0.1,
      progression: [CHORDS.C, CHORDS.Am, CHORDS.G, CHORDS.Csus],
      layers,
    };
  }

  private tempo(): void {
    if (this.band) this.band.tempoScale = SPEEDS[this.speed]!;
  }

  /** The colour of a row of a part, which is the colour of its note or of its kind of drum. */
  private colorOf(board: Board, y: number): RGB {
    return PALETTE[board.part.rows[y]!.shade]!;
  }

  /**
   * The playhead reaches a step: the lights in it ring, throw sparks, and the keys of their notes
   * light, for every part, though only the one on the glass is shown in full.
   */
  private reached(step: number): void {
    this.playhead = step;
    const rng = this.env.rng;
    const bursts = this.level === 0 ? 8 : this.env.calm ? 10 : PER_BURST;
    for (const board of this.all()) {
      board.sweep[step] = 1;
      const rows = board.sequence.took(step);
      if (rows.length === 0) continue;
      board.pulse = 1;
      const shown = board.focus > 0.4;
      for (const y of rows) {
        const i = step * SIZE + y;
        board.flare[i] = 1;
        board.keyGlow[y] = 1;
        const shade = board.part.rows[y]!.shade;
        this.spill[shade] = Math.min(1, this.spill[shade]! + 0.16 / Math.max(1, rows.length / 2));
        if (!shown) continue;
        board.popV[i]! += 8;
        board.sparks.burst(step + 0.5, y + 0.5, () => rng.next(), SPEED, bursts);
        if (rows.length <= 4 && !this.env.calm) this.ring(board, step, y);
      }
    }
  }

  /** A ring of light the colour of the tile opens from where it rang. */
  private ring(board: Board, x: number, y: number): void {
    const box = tileBox(this.plan, x, y);
    const size = this.plan.grid.tw;
    this.fx.emit({
      x: box.x + box.w / 2,
      y: box.y + box.h / 2,
      life: 0.55,
      size: size * 0.9,
      size1: size * 3.1,
      color: lighten(this.colorOf(board, y), 0.45),
      shape: 'ring',
      width: 1.8,
      alpha: 0.7,
    });
  }

  /**
   * The player's own notes: each is rung a little after the one before, so that a stroke across
   * many tiles is a run and never a buzz.
   */
  private sing(board: Board, voices: readonly Voice[]): void {
    const { part } = board;
    const { own } = part;
    const run = thin(voices, own.run);
    const { allowed, level } = board.ringing.take(this.time, run.length, own.level);
    for (let i = 0; i < allowed; i++) {
      const { y, pan } = run[i]!;
      const row = part.rows[y]!;
      const note = {
        gain: own.gain * level * row.trim,
        pan: row.pan ?? pan,
        bus: 'effects',
        delay: i * RUN_APART,
      } as const;
      this.env.sound.note(part.voice, row.midi, own.hold === null ? note : { ...note, seconds: own.hold });
    }
  }

  protected arrange(view: View): void {
    this.plan = planOf(view);
    this.art = makeArt(this.plan, view.unit);
    this.sky = new Starfield(
      Math.round(clamp((view.w * view.h) / 5200, 24, 70)),
      new Rng(this.seed),
      view.w,
      0,
      view.h,
    );
    this.hover = null;
  }

  protected reset(): void {
    this.speed = MIDDLE;
    this.tempo();
    this.held.clear();
    for (const board of this.all()) board.calm();
    for (const board of this.all()) board.ringing.clear();
    this.spill.fill(0);
    this.visited.clear();
    this.visited.add(this.active);
    this.invite.melody = this.invite.beat = this.invite.bass = 0;
    this.ripple();
  }

  /**
   * The tile under a point, with the glass just around the tiles counting as the nearest tile, so
   * the edges are no harder than the middle.
   */
  private tileNear(x: number, y: number): Tile | null {
    const { grid, slack } = this.plan;
    if (x < grid.x - slack || y < grid.y - slack || x > grid.x + grid.w + slack || y > grid.y + grid.h + slack)
      return null;
    return tileAt(clamp(x - grid.x, 0, grid.w - 1e-6), clamp(y - grid.y, 0, grid.h - 1e-6), grid.w, grid.h);
  }

  /**
   * The row of the key under a point, or none. A finger that is already down on the keys may wander
   * sideways.
   */
  private keyAt(x: number, y: number, wander = false): number | null {
    const { keys, slack } = this.plan;
    if (!wander && (x < keys.x - slack || x > keys.x + keys.w + slack)) return null;
    if (y < keys.y - slack || y > keys.y + keys.h + slack) return null;
    return clamp(Math.floor((y - keys.y) / keys.th), 0, SIZE - 1);
  }

  private pressing(id: ButtonId): boolean {
    for (const hold of this.held.values()) if (hold.kind === 'button' && hold.id === id) return true;
    return false;
  }

  protected press(p: Pointer): void {
    this.hover = null;
    const px = 1 / this.view.unit;
    const button = buttonAt(this.plan, p.x, p.y, 4 * px);
    if (button) {
      this.held.set(p.id, { kind: 'button', id: button.id });
      return;
    }
    const tab = tabAt(this.plan, p.x, p.y, 3 * px);
    if (tab) {
      this.held.set(p.id, NOTHING);
      this.choose(tab.id);
      return;
    }
    const board = this.board;
    const row = this.keyAt(p.x, p.y);
    if (row !== null) {
      this.held.set(p.id, { kind: 'keys', board, row });
      this.strike(board, [row]);
      return;
    }
    const tile = this.tileNear(p.x, p.y);
    if (!tile) {
      this.held.set(p.id, NOTHING);
      return;
    }
    const { stroke, changed } = Stroke.begin(board.grid, tile);
    this.held.set(p.id, { kind: 'grid', board, stroke });
    this.changed(board, changed, stroke);
  }

  protected override drag(p: Pointer): void {
    const hold = this.held.get(p.id);
    if (hold?.kind === 'grid') {
      this.changed(hold.board, hold.stroke.move(hold.board.grid, this.tileNear(p.x, p.y)), hold.stroke);
    } else if (hold?.kind === 'keys') {
      const row = this.keyAt(p.x, p.y, true);
      if (row === null || row === hold.row) return;
      const rows: number[] = [];
      for (let y = hold.row; y !== row; ) {
        y += Math.sign(row - y);
        rows.push(y);
      }
      hold.row = row;
      this.strike(hold.board, rows);
    }
  }

  protected override lift(p: Pointer): void {
    const hold = this.held.get(p.id);
    this.held.delete(p.id);
    if (hold?.kind !== 'button') return;
    const px = 1 / this.view.unit;
    if (buttonAt(this.plan, p.x, p.y, 8 * px)?.id === hold.id) this.activate(hold.id);
  }

  override move(p: Pointer): void {
    if (p.down) {
      this.hover = null;
      super.move(p);
    } else {
      this.hover = this.tileNear(p.x, p.y);
    }
  }

  /** A finger painted tiles on or rubbed them out, as the stroke it is drawing does. */
  private changed(board: Board, tiles: readonly Tile[], stroke: Stroke): void {
    // A part that is one note at a time puts out the note that was in the way.
    for (const { x, y } of stroke.takeDisplaced()) this.puff(board, x, y);
    if (tiles.length === 0) return;
    const painting = stroke.arming;
    const rng = this.env.rng;
    for (const { x, y } of tiles) {
      if (painting) {
        board.popV[x * SIZE + y]! += 12;
        board.sparks.burst(x + 0.5, y + 0.5, () => rng.next(), SPEED * 0.8, this.level === 0 ? 4 : 7);
      } else {
        this.puff(board, x, y);
      }
    }
    if (painting) {
      this.sing(
        board,
        tiles.map((t) => ({ y: t.y, pan: panOf(t.x) })),
      );
    }
  }

  /** A tile that goes out goes in a small puff of its own colour. */
  private puff(board: Board, x: number, y: number): void {
    const rng = this.env.rng;
    if (this.env.calm && rng.next() < 0.5) return;
    const box = tileBox(this.plan, x, y);
    const color = lighten(this.colorOf(board, y), 0.3);
    for (let i = this.fx.count(3); i > 0; i--) {
      const a = rng.range(0, TAU);
      const v = rng.range(14, 40);
      this.fx.emit({
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 10,
        life: rng.range(0.3, 0.6),
        size: rng.range(3, 5),
        size1: 0,
        color,
        shape: 'spark',
        drag: 2.2,
        twinkle: 10,
      });
    }
  }

  /**
   * A key is struck, or many in a run: the notes ring one after another, and a light runs along the
   * row of each.
   */
  private strike(board: Board, rows: readonly number[]): void {
    this.sing(
      board,
      rows.map((y) => ({ y, pan: 0 })),
    );
    for (const y of rows) {
      board.keyPress[y] = 1;
      board.keyGlow[y] = 1;
      for (let x = 0; x < SIZE; x++) {
        const i = x * SIZE + y;
        this.script.at(this.script.now + x * 0.022, () => {
          board.flare[i] = Math.max(board.flare[i]!, board.grid.has(x, y) ? 0.9 : 0.55);
        });
      }
    }
  }

  /**
   * A tab is touched: its part comes onto the glass, with a quick wave of light across it, and the
   * one that was there goes back to being small lights.
   */
  private choose(id: PartId): void {
    const board = this.boards[id];
    board.pulse = 1;
    if (id === this.active) return;
    this.show(id);
    this.visited.add(id);
    this.wave(board, 0.012);
  }

  /**
   * Puts a part on the glass. Fingers that were painting or playing keys on the part that was there
   * let go of it.
   */
  private show(id: PartId): void {
    this.active = id;
    for (const [pointer, hold] of this.held)
      if (hold.kind === 'grid' || hold.kind === 'keys') this.held.set(pointer, NOTHING);
    this.hover = null;
  }

  private activate(id: ButtonId): void {
    if (id === 'wand') this.newTune();
    else if (id === 'broom') this.clearAll();
    else this.pace(id === 'hare' ? 1 : -1);
  }

  /**
   * The wand: the next tune of the part on the glass appears on its grid, with a wave of light
   * across it.
   */
  private newTune(): void {
    const board = this.board;
    board.next();
    this.wave(board, 0.025);
    const wand = this.plan.buttons.find((b) => b.id === 'wand')!;
    const rng = this.env.rng;
    for (let i = this.fx.count(14); i > 0; i--) {
      const a = rng.range(0, TAU);
      const v = rng.range(40, 120);
      this.fx.emit({
        x: wand.x,
        y: wand.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(0.5, 0.9),
        size: rng.range(4, 8),
        size1: 1,
        color: lighten(PALETTE[i % PALETTE.length]!, 0.35),
        shape: i % 3 === 0 ? 'star4' : 'spark',
        drag: 2.4,
        twinkle: 12,
      });
    }
  }

  /** The broom: every light of the part on the glass goes out in a puff, and its grid is empty. */
  private clearAll(): void {
    const board = this.board;
    const tiles = board.grid.tiles();
    if (tiles.length === 0) {
      this.shaking[BUTTON_IDS.indexOf('broom')] = 1;
      return;
    }
    board.grid.clear();
    for (const { x, y } of tiles) this.puff(board, x, y);
  }

  /** The hare and the turtle: one speed quicker or slower, for all three parts. */
  private pace(by: 1 | -1): void {
    const next = clamp(this.speed + by, 0, SPEEDS.length - 1);
    if (next === this.speed) {
      this.shaking[BUTTON_IDS.indexOf(by > 0 ? 'hare' : 'turtle')] = 1;
      return;
    }
    this.speed = next;
    this.tempo();
  }

  /**
   * The light runs across the grid as the game opens, the way it ran along the keys of the piano
   * that opened it, and again when the player starts over.
   */
  private ripple(): void {
    this.script.at(this.script.now + 0.25, () => this.wave(this.board, 0.03));
  }

  /**
   * A wave of light across the grid of a part, one step after another, `apart` seconds between
   * them.
   */
  private wave(board: Board, apart: number): void {
    for (let x = 0; x < SIZE; x++) {
      this.script.at(this.script.now + x * apart, () => {
        for (let y = 0; y < SIZE; y++) {
          const i = x * SIZE + y;
          const on = board.grid.has(x, y);
          board.flare[i] = Math.max(board.flare[i]!, on ? 1 : 0.45);
          if (on) board.popV[i]! += 9;
        }
      });
    }
  }

  protected tick(dt: number): void {
    for (const board of this.all()) board.tick(dt, board.part.id === this.active);
    for (let c = 0; c < this.spill.length; c++) this.spill[c] = this.spill[c]! * Math.exp(-1.3 * dt);
    BUTTON_IDS.forEach((id, i) => {
      this.pushed[i] = damp(this.pushed[i]!, this.pressing(id) ? 1 : 0, 20, dt);
      this.shaking[i] = this.shaking[i]! * Math.exp(-4 * dt);
    });
    // A tab the player has not opened yet starts to call to them a little way into the game, and
    // stops for good when they have.
    const calling = this.time > INVITE_AFTER ? clamp((this.time - INVITE_AFTER) / INVITE_OVER) : 0;
    for (const id of PART_IDS) this.invite[id] = damp(this.invite[id], this.visited.has(id) ? 0 : calling, 6, dt);
  }

  /** There are no stars, so nothing begins a finale and there is nothing to start by hand. */
  override celebrate(): void {}

  protected finale(): void {}

  protected hint(): null {
    return null;
  }

  protected paintBack(p: Painter): void {
    this.paintSky(p);
    this.paintPanel(p.ctx);
    paintRimTint(p.ctx, this.plan, this.boards);
    this.paintTiles(p);
    this.paintKeys(p);
    paintTabs(p, this.plan, this.art, this.boards, this.invite, this.env.calm ? 0 : this.time, 1 / this.view.unit);
  }

  private paintSky(p: Painter): void {
    const g = p.ctx;
    verticalGradient(g, 0, 0, p.w, p.h, SKY);
    this.sky.draw(g, p.t, p.calm, 0.8);
    if (p.light === g) return;
    const { panel } = this.plan;
    const size = Math.max(panel.w, panel.h) * 1.15;
    PALETTE.forEach((color, c) => {
      glowAt(
        p.light,
        panel.x + panel.w * (0.2 + 0.15 * c),
        panel.y + panel.h * 0.5,
        size,
        color,
        0.22 * this.spill[c]!,
      );
    });
  }

  private paintPanel(g: CanvasRenderingContext2D): void {
    const { panel } = this.plan;
    roundedRect(g, panel.x, panel.y, panel.w, panel.h, panel.radius);
    const fill = g.createLinearGradient(0, panel.y, 0, panel.y + panel.h);
    fill.addColorStop(0, 'rgba(16,11,48,0.9)');
    fill.addColorStop(1, 'rgba(8,6,30,0.94)');
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(190,170,255,0.36)';
    g.stroke();
  }

  private paintTiles(p: Painter): void {
    const g = p.ctx;
    const { grid } = this.plan;
    const sweep = this.board.sweep;
    for (let x = 0; x < SIZE; x++) {
      const a = sweep[x]! * 0.1 + (x === this.playhead ? 0.05 : 0);
      if (a < 0.01) continue;
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      roundedRect(g, grid.x + x * grid.tw, grid.y - 1, grid.tw, grid.h + 2, Math.min(grid.tw, grid.th) * 0.26);
      g.fill();
    }
    // The parts that are not on the glass are small lights where their tiles are, and the one that
    // is comes last, over them.
    for (const board of this.all()) if (board.focus < 0.99) this.paintGhosts(p, board);
    for (const board of this.all()) if (board.part.id !== this.active && board.focus > 0.02) this.paintBoard(p, board);
    this.paintBoard(p, this.board);
    g.globalAlpha = 1;
  }

  /** The tiles of a part that is not on the glass, as small lights that flare when they ring. */
  private paintGhosts(p: Painter, board: Board): void {
    const g = p.ctx;
    const { art, plan } = this;
    const { grid } = plan;
    const away = 1 - board.focus;
    const size = art.ghost;
    for (let x = 0; x < SIZE; x++) {
      const cx = grid.x + (x + 0.5) * grid.tw;
      for (let y = 0; y < SIZE; y++) {
        const i = x * SIZE + y;
        const on = board.shown[i]!;
        const flare = board.flare[i]!;
        if (on < 0.05 && flare < 0.05) continue;
        const k = 1 + 0.45 * flare;
        g.globalAlpha = clamp((0.2 * on + 0.75 * flare) * away);
        g.drawImage(
          art.ghosts[board.part.rows[y]!.shade]!,
          cx - (size * k) / 2,
          grid.y + (y + 0.5) * grid.th - (size * k) / 2,
          size * k,
          size * k,
        );
      }
    }
    g.globalAlpha = 1;
  }

  /**
   * The tiles of the part on the glass, with how far each is on, the light the sparks have put on
   * it, and the flash of its note.
   */
  private paintBoard(p: Painter, board: Board): void {
    const g = p.ctx;
    const { art, plan } = this;
    const { grid } = plan;
    const glows = p.light !== g;
    const soft = this.env.calm ? 0.55 : 1;
    const focus = board.focus;
    const sprites = art.tiles[board.part.id];
    const flash = art.flashes[board.part.id];
    if (board.part.mono) this.paintTails(g, board);
    const size = Math.max(grid.tw, grid.th) * 2.4;
    for (let x = 0; x < SIZE; x++) {
      const cx = grid.x + (x + 0.5) * grid.tw;
      for (let y = 0; y < SIZE; y++) {
        const i = x * SIZE + y;
        const on = board.shown[i]!;
        const lit = (glowOf(board.heat[i]!) - DIM) / (1 - DIM);
        const flare = board.flare[i]! * soft;
        // A light that flares shows its colour, and one that is on as well rings white and settles
        // back to its colour.
        let alpha = lerp(0.14 + 0.78 * lit, 0.96, Math.max(on, flare));
        if (this.hover !== null && this.hover.x === x && this.hover.y === y)
          alpha = Math.max(alpha, on > 0.5 ? 1 : 0.4);
        const k = 1 + board.pop[i]! * 0.22;
        const w = art.tile.w * k;
        const h = art.tile.h * k;
        const cy = grid.y + (y + 0.5) * grid.th;
        const shade = board.part.rows[y]!.shade;
        g.globalAlpha = clamp(alpha * focus);
        g.drawImage(sprites[shade]!, cx - w / 2, cy - h / 2, w, h);
        if (on > 0.4 && flare > 0.03) {
          g.globalAlpha = clamp(flare * 0.8 * focus);
          g.drawImage(flash, cx - w / 2, cy - h / 2, w, h);
        }
        if (glows && (on > 0.4 || flare > 0.05))
          glowAt(p.light, cx, cy, size, PALETTE[shade]!, (0.13 * on + 0.42 * flare) * focus);
      }
    }
    g.globalAlpha = 1;
  }

  /**
   * The tail of each note of a part that holds its notes: a thin bar through the steps it is held
   * for, which lights as the playhead goes through it.
   */
  private paintTails(g: CanvasRenderingContext2D, board: Board): void {
    const { art, plan } = this;
    const { grid } = plan;
    const { tail } = art;
    for (let x = 0; x < SIZE; x++) {
      const reach = board.reach[x]!;
      if (reach < 1.05) continue;
      const y = board.row[x]!;
      if (y < 0) continue;
      const on = board.shown[x * SIZE + y]!;
      const sprite = art.tails[board.part.rows[y]!.shade]!;
      for (let n = 1; n < reach - 0.05; n++) {
        const at = x + n;
        const column = at % SIZE;
        const across = at >= SIZE;
        const share = clamp(reach - n);
        g.globalAlpha = clamp(
          (0.2 + 0.6 * board.sweep[column]! + 0.3 * board.flare[column * SIZE + y]!) *
            Math.max(on, 0.0) *
            share *
            board.focus *
            (across ? 0.55 : 1),
        );
        g.drawImage(
          sprite,
          grid.x + (column + 0.5) * grid.tw - tail.w / 2,
          grid.y + (y + 0.5) * grid.th - tail.h / 2,
          tail.w,
          tail.h,
        );
      }
    }
    g.globalAlpha = 1;
  }

  private paintKeys(p: Painter): void {
    const g = p.ctx;
    const { art, plan } = this;
    const glows = p.light !== g;
    for (const board of this.all()) {
      if (board.focus < 0.02) continue;
      for (let y = 0; y < SIZE; y++) {
        const box = keyBox(plan, y);
        const glow = board.keyGlow[y]!;
        const press = board.keyPress[y]!;
        const shade = board.part.rows[y]!.shade;
        g.globalAlpha = (0.55 + 0.45 * Math.max(glow, press)) * board.focus;
        g.drawImage(art.keys[shade]!, box.x + press * 1.5, box.y + (box.h - art.key.h) / 2, art.key.w, art.key.h);
        if (glows && glow > 0.05)
          glowAt(p.light, box.x + box.w / 2, box.y + box.h / 2, box.w * 3, PALETTE[shade]!, 0.4 * glow * board.focus);
      }
    }
    g.globalAlpha = 1;
  }

  protected paintFront(p: Painter): void {
    const g = p.ctx;
    const { art, plan } = this;
    for (const b of plan.buttons) {
      const at = BUTTON_IDS.indexOf(b.id);
      const shake = this.shaking[at]! * Math.sin(this.time * 38);
      // The hare has nothing to do at the quickest speed, and the turtle at the slowest.
      const can = b.id === 'hare' ? this.speed < SPEEDS.length - 1 : b.id === 'turtle' ? this.speed > 0 : true;
      const d = b.r * 2 * (1 - 0.1 * this.pushed[at]!);
      g.globalAlpha = can ? 1 : 0.4;
      g.drawImage(art.buttons[b.id], b.x + shake * 2.5 - d / 2, b.y - d / 2, d, d);
    }
    g.globalAlpha = 1;
  }
}
