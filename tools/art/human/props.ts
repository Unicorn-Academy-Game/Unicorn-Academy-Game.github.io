import { hex, type RGB, ramp } from '../core/color';
import { add, applyM, type M3, mulM, norm, rotY, rotZ, sub, type V3 } from '../core/vec';
import { extrude, FRONT, lathe, type P2 } from '../world/arch';
import { blob, box, tube } from '../world/prims';
import type { SceneBuilder } from '../world/scene';
import type { Tool } from './frame';
import { alignZ, attach } from './mesh-util';
import type { Joints } from './rig';

const R = (base: string, o: Parameters<typeof ramp>[1] = {}): RGB[] => ramp(hex(base), { steps: 5, ...o });

const MINT = R('#78d6c4', { shadowHue: 230, lightHue: 120, lean: 1 });
const PINK = R('#f0719f', { shadowHue: 320, lightHue: 60, lean: 0.9 });
const WATER = R('#7fcff5', { steps: 4, shadowHue: 250, lightHue: 190, lean: 0.9, lightness: [-0.12, 0, 0.1, 0.2] });
const STEEL = R('#cfd5e4', { shadowHue: 265, lightHue: 85, lean: 0.7 });
const RED = R('#d9455f', { shadowHue: 330, lightHue: 50, lean: 0.9 });
const WOOD = R('#b27c52', { shadowHue: 320, lightHue: 70, lean: 0.9 });
const WOOD_DARK = R('#8a5a3e', { shadowHue: 320, lightHue: 65, lean: 0.9 });
const HAY_B = R('#d2a748', { shadowHue: 340, lightHue: 90, lean: 0.85 });
const APPLE = R('#e8403f', { shadowHue: 330, lightHue: 50, lean: 0.9 });
const BERRY = R('#6fa8ff', { shadowHue: 275, lightHue: 190, lean: 0.9 });
const CARROT = R('#f2862b', { shadowHue: 335, lightHue: 60, lean: 0.9 });
const TWINE = R('#9a6a46', { shadowHue: 320, lightHue: 70, lean: 0.8 });
const LEAF = R('#6fc15a', { shadowHue: 200, lightHue: 105, lean: 1.1, steps: 4 });
const BRISTLE = R('#ead2a4', { shadowHue: 330, lightHue: 70, lean: 0.9 });

export function mat(
  sb: SceneBuilder,
  name: string,
  colors: RGB[],
  bias?: Parameters<SceneBuilder['solid']>[2],
): number {
  return sb.solid(name, sb.variant(name, colors), bias);
}

/**
 * A mint watering can with a long spout and a rose, hung from a pink handle that the hand closes
 * over. `tilt` pours the spout downward, and `yaw` swings it toward the figure's left, which shows
 * the can's whole length to a viewer in front.
 */
export function buildCan(sb: SceneBuilder, hand: V3, tilt: number, yaw: number): { rose: V3; aim: V3 } {
  const body = mat(sb, 'can', MINT);
  const trim = mat(sb, 'can-trim', PINK);
  const Rt: M3 = mulM(rotZ(yaw), rotY(tilt));
  const world = (p: V3): V3 => add(hand, applyM(Rt, p));
  attach(sb.mesh(body), hand, Rt, (m) => {
    lathe(m, {
      c: [-1, 0, -21],
      profile: [
        [0, 0],
        [7.6, 0],
        [8.8, 1],
        [8.8, 14],
        [8, 15.2],
        [6.2, 15.6],
      ],
      segs: 18,
      smooth: true,
    });
  });
  attach(sb.mesh(trim), hand, Rt, (m) => {
    lathe(m, {
      c: [-1, 0, -21],
      profile: [
        [8.7, 6.4],
        [9.5, 6.8],
        [9.5, 8.6],
        [8.7, 9],
      ],
      segs: 18,
      smooth: true,
    });
    tube(
      m,
      [
        { p: [-8.4, 0, -7.4], r: 1.5 },
        { p: [-8.6, 0, -2.4], r: 1.5 },
        { p: [-5, 0, 0.8], r: 1.5 },
        { p: [0, 0, 1.4], r: 1.5 },
        { p: [4.2, 0, -0.4], r: 1.5 },
        { p: [6.4, 0, -5], r: 1.5 },
      ],
      { segs: 8, n: 14 },
    );
  });
  const base: V3 = [6.8, 0, -17.2],
    tip: V3 = [25, 0, -7.4];
  attach(sb.mesh(body), hand, Rt, (m) => {
    tube(
      m,
      [
        { p: base, r: 3.4 },
        { p: [14.5, 0, -14], r: 2.5 },
        { p: tip, r: 1.9 },
      ],
      { segs: 10, n: 12 },
    );
  });
  const dir = norm(sub(tip, [14.5, 0, -14]));
  attach(sb.mesh(trim), add(hand, applyM(Rt, tip)), mulM(Rt, alignZ(dir)), (m) => {
    lathe(m, {
      c: [0, 0, -0.4],
      profile: [
        [1.4, 0],
        [4.2, 1.4],
        [4.5, 2.6],
        [1.2, 3],
      ],
      segs: 14,
      smooth: true,
    });
  });
  return { rose: world([tip[0] + dir[0] * 3, 0, tip[2] + dir[2] * 3]), aim: applyM(Rt, dir) };
}

/** A stream of drops leaving the rose and arcing to the ground. */
export function buildStream(sb: SceneBuilder, from: V3, aim: V3, time: number, speed = 62): void {
  const water = mat(sb, 'water', WATER);
  const n = 7;
  const g = 150;
  const vx = aim[0] * speed,
    vy = aim[1] * speed,
    vz = aim[2] * speed;
  const rate = 1.7;
  for (let k = 0; k < n; k++) {
    const tau = ((time * rate + k / n) % 1) * 0.62;
    const p: V3 = [from[0] + vx * tau, from[1] + vy * tau, from[2] + vz * tau - 0.5 * g * tau * tau];
    if (p[2] < 1.2) continue;
    const r = 1.35 + (0.35 * ((k * 5) % 3)) / 2;
    blob(sb.mesh(water, { noShadow: true, noLines: true }), p, [r, r, r * 1.25], 0, { rings: 5, segs: 6 });
  }
}

/** Pruning shears. `open` is 0 shut to 1 wide. The pivot sits at the hand. */
export function buildShears(sb: SceneBuilder, hand: V3, pitch: number, open: number): V3 {
  const steel = mat(sb, 'blade', STEEL);
  const grip = mat(sb, 'shear-grip', RED);
  const Rt: M3 = rotY(pitch);
  const spread = 0.05 + open * 0.36;
  for (const s of [-1, 1]) {
    attach(sb.mesh(steel), hand, Rt, (m) => {
      const tipZ = Math.sin(spread) * 14 * s,
        tipX = Math.cos(spread) * 14;
      tube(
        m,
        [
          { p: [3, 0, s * 0.4], r: 1.5 },
          { p: [tipX * 0.55 + 3, 0, tipZ * 0.55], r: 1.35 },
          { p: [tipX + 3, 0, tipZ], r: 0.5 },
        ],
        { segs: 6, n: 8 },
      );
    });
    attach(sb.mesh(grip), hand, Rt, (m) => {
      const endZ = -s * (1.8 + open * 7.6);
      tube(
        m,
        [
          { p: [2.4, 0, -s * 0.4], r: 1.5 },
          { p: [-3.4, 0, endZ * 0.5], r: 1.7 },
          { p: [-9.4, 0, endZ], r: 1.9 },
        ],
        { segs: 7, n: 8 },
      );
    });
  }
  return add(hand, applyM(Rt, [17, 0, 0]));
}

/** A leaf or two cut loose, falling. */
export function buildLeaves(sb: SceneBuilder, from: V3, time: number): void {
  const leaf = mat(sb, 'leaf', LEAF);
  for (let k = 0; k < 3; k++) {
    const tau = ((time * 1.2 + k / 3) % 1) * 0.5;
    const p: V3 = [from[0] + (k - 1) * 4 * tau * 8, from[1] + (k % 2 ? 3 : -3) * tau * 6, from[2] - 90 * tau * tau - 2];
    if (p[2] < 1.4) continue;
    blob(sb.mesh(leaf, { noShadow: true }), p, [2.6, 1.3, 0.8], 0.6 * k, { rings: 5, segs: 6 });
  }
}

/**
 * A straw broom. `head` is the middle of the bristles' bottom edge; `top` is the far end of the
 * handle.
 */
export function buildBroom(sb: SceneBuilder, head: V3, top: V3): void {
  const wood = mat(sb, 'broom-wood', WOOD);
  const woodDark = mat(sb, 'broom-block', WOOD_DARK);
  const bristle = mat(sb, 'bristles', HAY_B, (s) => Math.sin(s.rest[1] * 2.9) * 0.05 - (s.rest[2] > 7 ? 0 : 0.03));
  const bind = mat(sb, 'broom-twine', TWINE);
  const stick = norm(sub(top, head));
  tube(
    sb.mesh(wood),
    [
      { p: add(head, [stick[0] * 9, stick[1] * 9, stick[2] * 9]), r: 1.6 },
      { p: top, r: 1.6 },
    ],
    { segs: 8, n: 10 },
  );
  // The bristles carry on along the handle, so the whole broom is one straight line.
  const R3 = alignZ(stick);
  attach(sb.mesh(bristle), head, R3, (m) => {
    const poly: P2[] = [
      [-4.6, 0],
      [4.6, 0],
      [6.6, 9.6],
      [-6.6, 9.6],
    ];
    extrude(m, poly, FRONT(0, 0, 0), -12.5, 12.5, { caps: 'both' });
  });
  attach(sb.mesh(woodDark), head, R3, (m) => box(m, [0, 0, 11.2], [7.6, 25.6, 3.4]));
  attach(sb.mesh(bind), head, R3, (m) => box(m, [0, 0, 8], [13.6, 26.2, 1.2]));
}

/**
 * A low wooden tray of apples, sky berries and carrots, held against the chest. Deterministic, so a
 * frame always looks the same.
 */
export function buildFruit(sb: SceneBuilder, c: V3, R3: M3, scale = 1): void {
  const wood = mat(sb, 'tray-wood', WOOD);
  const apple = mat(sb, 'tray-apple', APPLE);
  const berry = mat(sb, 'tray-berry', BERRY);
  const carrot = mat(sb, 'tray-carrot', CARROT);
  const tops = mat(sb, 'tray-tops', LEAF);
  const s = scale;
  attach(sb.mesh(wood), c, R3, (m) => {
    box(m, [0, 0, -3.2 * s], [13 * s, 24 * s, 1.4 * s]);
    for (const sy of [-1, 1]) box(m, [0, sy * 11.6 * s, -1.2 * s], [13 * s, 1.6 * s, 4.6 * s]);
    for (const sx of [-1, 1]) box(m, [sx * 6.2 * s, 0, -1.2 * s], [1.6 * s, 24 * s, 4.6 * s]);
  });
  const balls: readonly [number, number, number, number][] = [
    [-2.6, -7.6, 4.2, 0],
    [2.8, -2.8, 4.4, 0],
    [-2.4, 3.6, 4.2, 0],
    [2.4, 8.4, 3.2, 1],
    [-3.4, 9.2, 3, 1],
    [3.6, -8.8, 3, 1],
    [0.4, 0.6, 4.2, 0],
  ];
  for (const [x, y, r, kind] of balls) {
    attach(sb.mesh(kind ? berry : apple), c, R3, (m) =>
      blob(m, [x * s, y * s, (r - 3.4) * s], [r * s, r * s, r * 0.95 * s], 0, { rings: 6, segs: 9 }),
    );
  }
  for (const [x, y] of [
    [-1.6, -4.4],
    [2.2, 5.4],
  ] as const) {
    attach(sb.mesh(carrot), c, R3, (m) =>
      blob(m, [x * s, y * s, 3.4 * s], [2.4 * s, 10 * s, 2.4 * s], 0, { rings: 5, segs: 7 }),
    );
    attach(sb.mesh(tops), c, R3, (m) =>
      blob(m, [x * s, (y + 11) * s, 3.6 * s], [2.6 * s, 3.2 * s, 2.4 * s], 0, { rings: 4, segs: 6 }),
    );
  }
}

/**
 * A grooming brush: a wooden back with a strap and a pale bristle face. The hand holds it by the
 * strap.
 */
export function buildBrush(sb: SceneBuilder, hand: V3, R3: M3): void {
  const wood = mat(sb, 'brush-wood', WOOD);
  const bristle = mat(sb, 'brush-bristle', BRISTLE, (s) => Math.sin(s.rest[0] * 2.2 + s.rest[1] * 3.1) * 0.04);
  const strap = mat(sb, 'brush-strap', RED);
  attach(sb.mesh(wood), hand, R3, (m) => box(m, [5, 0, -6], [23, 9, 4]));
  attach(sb.mesh(bristle), hand, R3, (m) => box(m, [5, 0, -11.2], [21, 8, 6.4]));
  attach(sb.mesh(strap), hand, R3, (m) =>
    tube(
      m,
      [
        { p: [-4, 0, -5], r: 1.2 },
        { p: [-1.2, 0, -0.4], r: 1.2 },
        { p: [10, 0, -0.4], r: 1.2 },
        { p: [13.4, 0, -5], r: 1.2 },
      ],
      { segs: 6, n: 12 },
    ),
  );
}

/** The middle of a hand's palm in model space. */
export const palm = (h: { p: V3; R: M3 }): V3 => add(h.p, applyM(h.R, [4.4, 0, 0]));

/** Draws whatever a figure holds this frame. */
export function drawTool(sb: SceneBuilder, tool: Tool | undefined, j: Joints, time: number): void {
  if (!tool) return;
  switch (tool.kind) {
    case 'can': {
      const { rose, aim } = buildCan(sb, palm(j.hand.r), tool.tilt, tool.yaw);
      if (tool.pour) buildStream(sb, rose, aim, time);
      return;
    }
    case 'shears': {
      const tip = buildShears(sb, palm(j.hand.r), tool.pitch, tool.open);
      if (tool.leaves) buildLeaves(sb, tip, time);
      return;
    }
    case 'broom':
      buildBroom(sb, tool.head, tool.top);
      return;
    case 'fruit':
      buildFruit(sb, tool.at, tool.R, tool.scale);
      return;
    case 'brush':
      buildBrush(sb, palm(j.hand.r), tool.R);
      return;
  }
}
