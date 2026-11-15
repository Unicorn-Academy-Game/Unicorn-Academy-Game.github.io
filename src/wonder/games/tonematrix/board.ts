// SPDX-License-Identifier: GPL-3.0-only
// Written for this game to go with the adapted files of ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under
// the GNU General Public License version 3 only. See `src/wonder/games/tonematrix/NOTICE.md`.

import { damp } from '../../engine/ease';
import { Grid } from './grid';
import type { Part } from './parts';
import { fillWith, PRESETS, type Preset } from './presets';
import { Ringing } from './ringing';
import { SIZE } from './scale';
import { Sequence } from './sequence';
import { Sparks } from './sparks';

/**
 * One part of the song as the game keeps it: its grid and the sequence that plays the grid, and
 * everything the picture knows about it, which is how each tile looks right now. The three of them
 * play together all the time, but only the one that is on the glass is drawn in full, so only it
 * has sparks, and the other two show as small lights where their tiles are.
 */
export class Board {
  readonly grid: Grid;
  readonly sequence: Sequence;
  readonly sparks = new Sparks();
  /**
   * The notes the player has rung on it themselves, which it keeps from piling up as its instrument
   * can bear.
   */
  readonly ringing: Ringing;
  /** Which of its ready made tunes is on the grid, or was last put there. */
  tune = 0;

  /**
   * How much this is the board on the glass, 0 to 1. It follows which one is chosen a moment
   * behind, so one fades in as the other fades out.
   */
  focus = 0;
  /** How much its notes have rung lately, 1 on a note and then fading, for its tab to move with. */
  pulse = 0;

  /**
   * How far on each tile looks, 0 to 1: it follows the grid a moment behind, so a tile fades in and
   * out.
   */
  readonly shown = new Float32Array(SIZE * SIZE);
  /**
   * The squash of each tile, and how fast it is changing: a spring that is kicked when a tile is
   * painted or rings.
   */
  readonly pop = new Float32Array(SIZE * SIZE);
  readonly popV = new Float32Array(SIZE * SIZE);
  /** The white flash of each tile, 1 when it has just rung. */
  readonly flare = new Float32Array(SIZE * SIZE);
  /** The light the sparks put on each tile. */
  readonly heat = new Float32Array(SIZE * SIZE);
  /** How lit each step is from the playhead having been on it. */
  readonly sweep = new Float32Array(SIZE);
  /** How lit each key is from its note ringing, and how far it is pressed. */
  readonly keyGlow = new Float32Array(SIZE);
  readonly keyPress = new Float32Array(SIZE);
  /**
   * How many steps each note of a part that holds its notes seems to reach, which follows how many
   * it holds for a moment behind.
   */
  readonly reach = new Float32Array(SIZE);
  /**
   * The row of the last tile each step had, so that the tail of a note that is rubbed out can fade
   * where it was.
   */
  readonly row = new Int8Array(SIZE);
  /** Whether the sparks have left light on the tiles that is yet to be taken off. */
  private lit = false;

  constructor(readonly part: Part) {
    this.grid = new Grid(part.mono);
    this.sequence = new Sequence(this.grid, part);
    this.ringing = new Ringing(part.own.budget);
  }

  get presets(): readonly Preset[] {
    return PRESETS[this.part.id];
  }

  get preset(): Preset {
    return this.presets[this.tune]!;
  }

  /** Puts a ready made tune on the grid, with nothing fading in. */
  begin(tune: number): void {
    this.tune = tune;
    fillWith(this.grid, this.preset);
    for (const { x, y } of this.grid.tiles()) this.shown[x * SIZE + y] = 1;
    for (let x = 0; x < SIZE; x++) {
      this.row[x] = this.grid.rowOf(x);
      this.reach[x] = this.grid.inStep(x) > 0 ? this.grid.gapAfter(x) : 0;
    }
  }

  /** The next tune, put on the grid in place of what was there. */
  next(): Preset {
    this.tune = (this.tune + 1) % this.presets.length;
    fillWith(this.grid, this.preset);
    return this.preset;
  }

  /**
   * Everything that moves goes still, as when the player starts over. What is on the grid stays.
   */
  calm(): void {
    this.sparks.clear();
    this.sequence.forget();
    this.flare.fill(0);
    this.pop.fill(0);
    this.popV.fill(0);
    this.sweep.fill(0);
    this.keyGlow.fill(0);
    this.keyPress.fill(0);
    this.pulse = 0;
  }

  /** Moves everything on by `dt`. `chosen` is whether this is the board on the glass. */
  tick(dt: number, chosen: boolean): void {
    this.focus = damp(this.focus, chosen ? 1 : 0, 12, dt);
    this.pulse *= Math.exp(-6 * dt);
    this.sparks.update(dt);
    if (this.sparks.count > 0) {
      this.sparks.heat(this.heat);
      this.lit = true;
    } else if (this.lit) {
      this.heat.fill(0);
      this.lit = false;
    }
    for (let x = 0; x < SIZE; x++) {
      this.sweep[x] = this.sweep[x]! * Math.exp(-5 * dt);
      const top = this.grid.rowOf(x);
      if (top >= 0) this.row[x] = top;
      const held = top >= 0 ? this.grid.gapAfter(x) : 0;
      this.reach[x] = damp(this.reach[x]!, held, 14, dt);
      for (let y = 0; y < SIZE; y++) {
        const i = x * SIZE + y;
        this.shown[i] = damp(this.shown[i]!, this.grid.has(x, y) ? 1 : 0, 16, dt);
        this.popV[i]! += (-300 * this.pop[i]! - 16 * this.popV[i]!) * dt;
        this.pop[i]! += this.popV[i]! * dt;
        this.flare[i] = this.flare[i]! * Math.exp(-7 * dt);
      }
    }
    for (let y = 0; y < SIZE; y++) {
      this.keyGlow[y] = this.keyGlow[y]! * Math.exp(-5 * dt);
      this.keyPress[y] = this.keyPress[y]! * Math.exp(-9 * dt);
    }
  }
}
