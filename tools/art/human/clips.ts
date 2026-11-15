import type { Facing } from '../../../src/shared/ids';
import type { M3, V3 } from '../core/vec';
import { rotY } from '../core/vec';
import { type Extras, UNIT } from './frame';
import { beat, breathe, mixV, planted, ramp01, strideOf, WALK, walk } from './motion';
import { BODY, type HumanPose, restPose, SIDES, SIGN } from './rig';

export interface Keyed {
  pose: HumanPose;
  extras: Extras;
}

/**
 * One animation: how many frames, how fast, and the pose at each. `at` gets the loop phase in [0,
 * 1).
 */
export interface ClipSpec {
  frames: number;
  fps: number;
  loop: boolean;
  /**
   * Drawn pixels the body travels per loop. Present on walking clips, so playback speed can follow
   * movement speed.
   */
  stride?: number;
  /** Shown only from the side, because the figure works beside the thing it faces. */
  at(phase: number, facing: Facing): Keyed;
}

const nothing: Extras = {};
const RESTING: V3 = [2, 22, 66];

function idle(): ClipSpec {
  return {
    frames: 8,
    fps: 6,
    loop: true,
    at: (t) => {
      const pose = restPose();
      breathe(pose, t, { look: 0.34, blinkAt: 0.62 });
      pose.pelvis = [pose.pelvis[0], 0.9 * beat(t, 1, 0.1), pose.pelvis[2]];
      pose.roll = 0.02 * beat(t, 1, 0.1);
      pose.mouth = 0.18;
      pose.look = [0.4 * beat(t, 1, 0.1), 0];
      pose.wrist.r = [2 + 1.2 * beat(t, 1, 0.3), -22, 66 + 1.2 * beat(t, 1, 0.3)];
      pose.wrist.l = [2 - 0.8 * beat(t, 1, 0.3), 22, 66 - 0.8 * beat(t, 1, 0.3)];
      return { pose, extras: { sway: 0.1 * beat(t, 1, 0.35) } };
    },
  };
}

function walking(): ClipSpec {
  return {
    frames: 8,
    fps: 12,
    loop: true,
    stride: strideOf(WALK.S, UNIT),
    at: (t) => {
      const pose = walk(t);
      pose.headPitch = -0.02 + 0.02 * beat(t, 2, 0.25);
      pose.mouth = 0.2;
      return { pose, extras: { sway: 0.32 * beat(t, 2, 0.1) } };
    },
  };
}

/** A friendly wave with the right hand, the left on the hip. */
function waving(): ClipSpec {
  return {
    frames: 8,
    fps: 9,
    loop: true,
    at: (t, facing) => {
      const pose = restPose();
      // The hand swings across the view, whichever way the figure is turned.
      const across = facing === 'south' || facing === 'north';
      pose.wrist.r = [
        9 + (across ? 0 : 9 * beat(t, 1)),
        -28 + (across ? 9 * beat(t, 1) : 0),
        126 + 1.6 * Math.abs(beat(t, 2)),
      ];
      pose.elbow.r = [-0.3, -1, -0.3];
      pose.grip.r = 0;
      pose.handRoll.r = 0.5 * beat(t, 1, 0.25);
      pose.wrist.l = [3, 21.5, 62];
      pose.elbow.l = [-0.6, 1, 0.1];
      pose.grip.l = 0.7;
      pose.pelvis = [0, 0.7 * beat(t, 1), BODY.pelvisZ + 0.9 * (0.5 + 0.5 * beat(t, 2, 0.25))];
      pose.roll = 0.03 * beat(t, 1, 0.25);
      pose.headRoll = 0.11;
      pose.headYaw = 0.1 * beat(t, 1, 0.2);
      pose.mouth = 0.9;
      pose.brow = 0.7;
      pose.blink = Math.abs(t - 0.7) < 0.06 ? 1 : 0;
      return { pose, extras: { sway: 0.2 * beat(t, 1, 0.25) } };
    },
  };
}

/** Watering: the can tips toward the bed and the body sweeps slowly along it. */
function watering(): ClipSpec {
  return {
    frames: 8,
    fps: 8,
    loop: true,
    at: (t) => {
      const pose = planted(0);
      pose.pitch = 0.1;
      pose.twist = 0.1 * beat(t, 1);
      // The wide brim hides the face from a camera looking down, so the head stays up and the eyes
      // do the looking down.
      pose.headPitch = -0.04;
      pose.look = [0.15 * beat(t, 1, 0.1), -1];
      pose.headYaw = 0.12 * beat(t, 1, 0.05);
      pose.wrist.r = [25 + 1.6 * beat(t, 1, 0.25), -13 + 2 * beat(t, 1), 80 + 1.2 * beat(t, 2, 0.1)];
      pose.elbow.r = [-0.3, -0.7, -1];
      pose.grip.r = 0.9;
      pose.wrist.l = [-2, 18.5, 60];
      pose.elbow.l = [-0.5, 1, 0.1];
      pose.grip.l = 0.6;
      pose.mouth = 0.3;
      pose.brow = 0.15;
      pose.pelvis = [0, 0.8 * beat(t, 1), pose.pelvis[2] + 0.2 * beat(t, 2)];
      pose.blink = Math.abs(t - 0.8) < 0.06 ? 1 : 0;
      return {
        pose,
        extras: { tool: { kind: 'can', tilt: 0.78 + 0.1 * beat(t, 1, 0.25), yaw: 0.9, pour: true }, time: t * 1.2 },
      };
    },
  };
}

/**
 * Bending to look closely at a bloom: one hand on the knee, the other pinching a flower, head
 * tipping side to side.
 */
function inspecting(): ClipSpec {
  return {
    frames: 8,
    fps: 6,
    loop: true,
    at: (t) => {
      const pose = planted(4);
      pose.pitch = 0.38 + 0.03 * beat(t, 1);
      pose.headPitch = -0.2;
      pose.look = [0.2 * beat(t, 1, 0.25), -1];
      pose.headRoll = 0.13 * beat(t, 1);
      pose.headYaw = 0.22 * beat(t, 1, 0.25);
      pose.wrist.l = [12, 19, 52];
      pose.elbow.l = [-0.4, 1, 0.1];
      pose.grip.l = 0.5;
      pose.wrist.r = [33, -8 + 2.2 * beat(t, 2), 66 - 2.5 * beat(t, 1, 0.25)];
      pose.elbow.r = [-0.2, -0.8, -1];
      pose.grip.r = 0.95;
      pose.mouth = 0.35 + 0.2 * Math.max(0, beat(t, 1, 0.25));
      pose.brow = 0.35;
      pose.blink = Math.abs(t - 0.72) < 0.06 ? 1 : 0;
      pose.knee = [1, 0, 0];
      return { pose, extras: nothing };
    },
  };
}

/** Snipping with pruning shears, two snips a loop, the other hand steadying the stem. */
function trimming(): ClipSpec {
  return {
    frames: 8,
    fps: 10,
    loop: true,
    at: (t) => {
      const pose = planted(0);
      pose.pitch = 0.14;
      pose.headPitch = -0.02;
      pose.look = [0.1 * beat(t, 1, 0.1), -1];
      pose.headYaw = 0.1 * beat(t, 1, 0.1);
      const snip = 0.5 + 0.5 * beat(t, 2, -0.25);
      pose.wrist.r = [29 + 1.5 * snip, -10, 81 + 1.4 * beat(t, 2, 0.25)];
      pose.elbow.r = [-0.2, -0.7, -1];
      pose.grip.r = 0.9;
      pose.wrist.l = [29, 7.5 + 1.5 * beat(t, 1), 78];
      pose.elbow.l = [-0.2, 0.7, -1];
      pose.grip.l = 0.85;
      pose.mouth = 0.25;
      pose.brow = 0.2;
      pose.pelvis = [0, 0.5 * beat(t, 1), pose.pelvis[2]];
      pose.twist = 0.06 * beat(t, 1);
      return {
        pose,
        extras: { tool: { kind: 'shears', pitch: 0.1 * snip, open: snip, leaves: snip < 0.35 }, time: t * 1.4 },
      };
    },
  };
}

/** A broom held low in one hand and high in the other, pushed forward and drawn back. */
function sweeping(): ClipSpec {
  return {
    frames: 8,
    fps: 8,
    loop: true,
    at: (t) => {
      const push = beat(t, 1);
      const pose = planted(3);
      pose.pitch = 0.22;
      pose.twist = -0.12 * push;
      pose.headPitch = 0.04;
      pose.pelvis = [3 * push, 1.2 * beat(t, 1, 0.25), pose.pelvis[2]];
      const low: V3 = [25 + 9 * push, -5, 61];
      const high: V3 = [15 + 4 * push, -9, 88];
      const dir = norm3(sub3(high, low));
      const head: V3 = [low[0] - dir[0] * ((low[2] - 3) / dir[2]), low[1] - dir[1] * ((low[2] - 3) / dir[2]), 3];
      pose.wrist.l = [low[0] - 3.5, low[1] + 1, low[2] + 2.6];
      pose.wrist.r = [high[0] - 3.5, high[1], high[2] + 2.6];
      pose.elbow.l = [-0.3, 1, -0.6];
      pose.elbow.r = [-0.3, -1, -0.6];
      pose.grip.l = 0.95;
      pose.grip.r = 0.95;
      pose.mouth = 0.25;
      pose.blink = Math.abs(t - 0.85) < 0.06 ? 1 : 0;
      return {
        pose,
        extras: {
          tool: { kind: 'broom', head, top: [high[0] + dir[0] * 14, high[1] + dir[1] * 14, high[2] + dir[2] * 14] },
          sway: 0.22 * beat(t, 1, 0.25),
        },
      };
    },
  };
}

const CARRY_HANDS: Record<'l' | 'r', V3> = { l: [13, 12.5, 78], r: [13, -12.5, 78] };
const FRUIT_CHEST: V3 = [19, 0, 79];
const FRUIT_SCALE = 1.35;
const FRUIT_FLOOR: V3 = [31, 0, 13];
const FRUIT_R: M3 = rotY(0);

/** Hugging a tray of fruit to the chest while walking. */
function carrying(): ClipSpec {
  return {
    frames: 8,
    fps: 12,
    loop: true,
    stride: strideOf(WALK.S, UNIT),
    at: (t) => {
      const pose = walk(t);
      pose.pitch = -0.06;
      holdTray(pose);
      pose.headPitch = -0.02;
      pose.mouth = 0.2;
      return {
        pose,
        extras: {
          tool: {
            kind: 'fruit',
            at: [FRUIT_CHEST[0], 0, FRUIT_CHEST[2] + 0.6 * beat(t, 2, 0.25)],
            R: FRUIT_R,
            scale: FRUIT_SCALE,
          },
          sway: 0.32 * beat(t, 2, 0.1),
        },
      };
    },
  };
}

function holdTray(pose: HumanPose): void {
  for (const s of SIDES) {
    pose.wrist[s] = CARRY_HANDS[s];
    pose.elbow[s] = [-0.2, SIGN[s], -0.5];
    pose.grip[s] = 0.85;
  }
}

/**
 * Bending to the floor to take a tray of fruit and standing with it (`up`), or the reverse to set
 * it down.
 */
function lifting(up: boolean): ClipSpec {
  return {
    frames: 8,
    fps: 8,
    loop: false,
    at: (t) => {
      // Down over the first part, a beat at the bottom, then up.
      const down = ramp01(t, 0, 0.4);
      const rise = ramp01(t, 0.55, 1);
      const b = down * (1 - rise);
      const pose = planted(0);
      pose.pelvis = [-7 * b, 0, BODY.pelvisZ - 25 * b];
      pose.pitch = 1.0 * b;
      pose.headPitch = -0.55 * b;
      for (const s of SIDES) pose.foot[s] = { ankle: [5 * b, SIGN[s] * 10, BODY.ankle], pitch: 0 };
      const carrying = up ? t >= 0.5 : t < 0.5;
      const reach = b;
      for (const s of SIDES) {
        const empty: V3 = s === 'l' ? RESTING : [RESTING[0], -RESTING[1], RESTING[2]];
        const free = up && t < 0.5 ? empty : up ? CARRY_HANDS[s] : t < 0.5 ? CARRY_HANDS[s] : empty;
        const floor: V3 = [FRUIT_FLOOR[0] - 3, SIGN[s] * 11, FRUIT_FLOOR[2] + 3];
        pose.wrist[s] = mixV(free, floor, reach);
        pose.elbow[s] = [-0.5, SIGN[s] * 0.8, 0.2];
        pose.grip[s] = carrying ? 0.85 : 0.2 + 0.5 * reach;
      }
      pose.mouth = 0.2 + 0.2 * b;
      pose.blink = 0;
      const at = mixV(FRUIT_CHEST, FRUIT_FLOOR, b);
      const tool: Extras['tool'] = carrying ? { kind: 'fruit', at, R: FRUIT_R, scale: FRUIT_SCALE } : undefined;
      return { pose, extras: tool ? { tool, sway: 0.1 * b } : { sway: 0.1 * b } };
    },
  };
}

/**
 * Brushing a unicorn's flank: the brush strokes along it, which is across the view when seen from
 * behind.
 */
function brushing(): ClipSpec {
  return {
    frames: 8,
    fps: 8,
    loop: true,
    at: (t) => {
      const stroke = beat(t, 1);
      const pose = planted(1);
      pose.pitch = 0.1;
      pose.twist = 0.1 * stroke;
      pose.headPitch = 0.02;
      pose.headYaw = 0.14 * beat(t, 1, 0.2);
      pose.pelvis = [0.6, 1.4 * stroke, pose.pelvis[2]];
      pose.wrist.r = [30 + 1.4 * beat(t, 2, 0.25), -19 + 10 * stroke, 74 + 2.5 * beat(t, 2, 0.5)];
      pose.elbow.r = [-0.3, -0.9, -0.7];
      pose.grip.r = 0.95;
      pose.wrist.l = [3, 20, 61];
      pose.elbow.l = [-0.5, 1, 0.1];
      pose.grip.l = 0.6;
      pose.mouth = 0.5;
      pose.brow = 0.3;
      pose.blink = Math.abs(t - 0.8) < 0.06 ? 1 : 0;
      return { pose, extras: { tool: { kind: 'brush', R: rotY(-1.38) }, sway: 0.18 * beat(t, 1, 0.5) } };
    },
  };
}

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const STABLE_WORKER_CLIPS = {
  idle: idle(),
  walk: walking(),
  wave: waving(),
  sweep: sweeping(),
  carry: carrying(),
  brush: brushing(),
  pickup: lifting(true),
  putdown: lifting(false),
} as const satisfies Record<string, ClipSpec>;

export const GARDENER_CLIPS = {
  idle: idle(),
  walk: walking(),
  wave: waving(),
  water: watering(),
  inspect: inspecting(),
  trim: trimming(),
} as const satisfies Record<string, ClipSpec>;
