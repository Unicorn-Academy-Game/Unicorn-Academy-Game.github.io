import { fromOklch } from '../core/color';
import { blit, contactSheet, createRgba, type Rgba, writePng } from '../core/image';
import { GLOW_HUE, type GlowName, renderBed, renderBulbs, renderMushrooms } from './cave-flora';
import { GEM_STONES, gemCluster, RAINBOW_CLUSTER_FRAMES, rainbowCluster, renderCluster } from './cave-gems';
import {
  ORB_CANVAS,
  ORB_HEIGHT,
  PILLAR_CANVAS,
  renderChimes,
  renderHeartCrystals,
  renderHeartDais,
  renderOrb,
  renderOrbStand,
  renderPillarCrystals,
  renderPillarRock,
} from './cave-grand';
import {
  HUT_CANVAS,
  HUT_DOOR_GEOMETRY,
  renderBroom,
  renderCauldron,
  renderHut,
  renderHutDoor,
  renderJars,
  renderSmoke,
  renderWisp,
} from './cave-hut';
import { renderIce } from './cave-ice';
import { renderCaveMouth } from './cave-mouth';
import { caveRock, renderAwake, renderHalo, renderSleeping, renderSpire } from './cave-rock';
import { doorRect } from './doors';
import { RAINBOW_FRAMES, renderRainbowGem } from './rainbow-gem';

/**
 * Draws the cave's sprites side by side on the colour of the cave floor, one sheet to a topic, so
 * each can be judged against what it will stand on. Usage: tsx tools/art/world/cave-preview.ts
 * [gems|flora|rocks|grand ...]
 */
const FLOOR = [112, 100, 160, 255] as const;

/** What the game does when it tints a picture: every colour channel multiplied by the tint. */
function tinted(img: Rgba, hue: number): Rgba {
  const [r, g, b] = fromOklch(0.8, 0.17, hue);
  const out = createRgba(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4)
    out.data.set(
      [
        Math.round((img.data[i]! * r) / 255),
        Math.round((img.data[i + 1]! * g) / 255),
        Math.round((img.data[i + 2]! * b) / 255),
        img.data[i + 3]!,
      ],
      i,
    );
  return out;
}

/** The glow laid behind a picture, added to the floor the way the game's additive blend does. */
function lit(
  bg: readonly [number, number, number, number],
  parts: readonly { img: Rgba; hue: number; at: [number, number]; size: number; strength: number }[],
  body: readonly Rgba[],
): Rgba {
  const out = createRgba(body[0]!.width, body[0]!.height, bg);
  for (const g of parts) {
    const halo = tinted(renderHalo(g.size), g.hue);
    for (let y = 0; y < halo.height; y++) {
      for (let x = 0; x < halo.width; x++) {
        const px = g.at[0] - (halo.width >> 1) + x,
          py = g.at[1] - (halo.height >> 1) + y;
        if (px < 0 || py < 0 || px >= out.width || py >= out.height) continue;
        const a = (halo.data[(y * halo.width + x) * 4 + 3]! / 255) * g.strength;
        const i = (py * out.width + px) * 4;
        for (let k = 0; k < 3; k++)
          out.data[i + k] = Math.min(255, Math.round(out.data[i + k]! + halo.data[(y * halo.width + x) * 4 + k]! * a));
      }
    }
  }
  for (const layer of body) blit(out, layer, 0, 0);
  return out;
}

interface Sheet {
  cols: number;
  scale: number;
  make: () => Rgba[];
}

const sheets: Record<string, Sheet> = {
  gems: {
    cols: 9,
    scale: 1,
    make: () => [
      ...GEM_STONES.map((n) => renderCluster(gemCluster(n, 0)).rgba),
      ...GEM_STONES.map((n) => renderCluster(gemCluster(n, 1)).rgba),
    ],
  },
  rocks: {
    cols: 5,
    scale: 2,
    make: () => [
      caveRock(3, 0.9),
      caveRock(8, 1.15),
      caveRock(13, 1.5),
      renderSpire(5),
      renderSpire(11, 0.8),
      ...[0, 1, 2].map((f) => renderSleeping(4, f)),
      renderAwake(4),
      renderAwake(9),
      renderHalo(96),
    ],
  },
  flora: {
    cols: 5,
    scale: 2,
    make: () => [
      ...(Object.keys(GLOW_HUE) as GlowName[]).map((n) => renderMushrooms(n)),
      ...[0, 1, 2, 3].map((f) => renderMushrooms('cyan', f)),
      renderBulbs(5, [195, 320, 82]),
      renderBulbs(9, [300, 160, 40]),
      renderBed('long', false),
      renderBed('long', true),
      renderBed('round', false),
      renderBed('round', true),
    ],
  },
  grand: {
    cols: 4,
    scale: 1,
    make: () => {
      const heart = lit(
        FLOOR,
        [{ img: renderHalo(8), hue: 320, at: [220, 200], size: 400, strength: 0.7 }],
        [renderHeartDais(), tinted(renderHeartCrystals(), 320)],
      );
      const pillars = [20, 140, 260].map((hue) =>
        lit(
          FLOOR,
          [{ img: renderHalo(8), hue, at: [PILLAR_CANVAS.ox, 150], size: 260, strength: 0.7 }],
          [renderPillarRock(), tinted(renderPillarCrystals(), hue)],
        ),
      );
      const orbs = [60, 200].map((hue) =>
        lit(
          FLOOR,
          [{ img: renderHalo(8), hue, at: [ORB_CANVAS.ox, ORB_CANVAS.oy - ORB_HEIGHT], size: 150, strength: 0.8 }],
          [renderOrbStand(), tinted(renderOrb(), hue)],
        ),
      );
      return [heart, ...pillars, ...orbs, renderChimes()];
    },
  },
};

sheets.hut = {
  cols: 4,
  scale: 1,
  make: () => {
    const hut = renderHut();
    const door = [0, 3, 6].map((f) => {
      const out = createRgba(hut.width, hut.height, FLOOR);
      blit(out, hut, 0, 0);
      const at = doorRect(HUT_DOOR_GEOMETRY);
      blit(out, renderHutDoor(f), HUT_CANVAS.ox + at.x, HUT_CANVAS.oy + at.y);
      return out;
    });
    const smoke = createRgba(hut.width, hut.height, FLOOR);
    blit(smoke, hut, 0, 0);
    blit(smoke, renderSmoke(2), 0, 0);
    return [
      smoke,
      ...door,
      ...[0, 2, 4, 6].map((f) => renderCauldron(f)),
      renderBroom(),
      renderJars(),
      renderWisp(0),
      renderWisp(3),
    ];
  },
};

sheets.mouth = { cols: 1, scale: 1, make: () => [renderCaveMouth()] };
sheets.ice = { cols: 1, scale: 1, make: () => [renderIce()] };
sheets.rainbow = {
  cols: 8,
  scale: 2,
  make: () => [
    ...Array.from({ length: RAINBOW_CLUSTER_FRAMES }, (_, f) => renderCluster(rainbowCluster(f)).rgba),
    ...Array.from({ length: RAINBOW_FRAMES }, (_, f) => renderRainbowGem(f)),
  ],
};

const wanted = process.argv.slice(2);
for (const [name, sheet] of Object.entries(sheets)) {
  if (wanted.length > 0 && !wanted.includes(name)) continue;
  const frames = sheet.make();
  writePng(
    `assets/source/_scratch/cave-${name}.png`,
    contactSheet(frames, { cols: sheet.cols, scale: sheet.scale, bg: FLOOR, gap: 4 }),
  );
  console.log(name, frames.length);
}
