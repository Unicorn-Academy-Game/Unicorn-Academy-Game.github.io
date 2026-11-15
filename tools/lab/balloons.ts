import {
  bodyOf,
  foilOf,
  newFace,
  paintBalloon,
  paintBow,
  paintFace,
  paintTrail,
  paintTwinkle,
} from '../../src/wonder/games/balloons/art';
import { R_BOUQUET, R_HIGH, R_LOW, R_SPECIAL } from '../../src/wonder/games/balloons/field';
import { type GarlandNote, paintGarland } from '../../src/wonder/games/balloons/garland';
import { DEGREES, PITCHES } from '../../src/wonder/games/balloons/notes';

/**
 * Every kind of balloon at a size you can look at, on a sky, in the states it has. The art-design
 * tool for the balloon game: change a painter, reload, look. `?sky=day|dusk|night&zoom=2&dpr=2`.
 */
const q = new URLSearchParams(location.search);
const zoom = Number(q.get('zoom') ?? 2);
const sky = q.get('sky') ?? 'day';
const W = 590;
const H = 360;
const canvas = document.getElementById('sheet') as HTMLCanvasElement;
const dpr = Number(q.get('dpr') ?? 1);
canvas.width = W * zoom * dpr;
canvas.height = H * zoom * dpr;
canvas.style.width = `${W * zoom}px`;
canvas.style.height = `${H * zoom}px`;
const g = canvas.getContext('2d')!;
g.scale(zoom * dpr, zoom * dpr);
const SKIES: Record<string, readonly [string, string, string]> = {
  day: ['#7fcfff', '#c9efff', '#fffbe6'],
  dusk: ['#5a3f9a', '#c46bb0', '#ffb88a'],
  night: ['#0d1440', '#2c2a78', '#6b4aa0'],
};
const [top, mid, low] = SKIES[sky] ?? SKIES.day!;
const bg = g.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, top);
bg.addColorStop(0.6, mid);
bg.addColorStop(1, low);
g.fillStyle = bg;
g.fillRect(0, 0, W, H);

const k = zoom * dpr;
const label = (text: string, x: number, y: number): void => {
  g.font = '600 7px system-ui';
  g.fillStyle = sky === 'day' ? 'rgba(20,20,60,0.7)' : 'rgba(255,255,255,0.75)';
  g.textAlign = 'left';
  g.fillText(text, x, y);
};
// Row 1: the five notes, big, smiling, with strings, and the high register small beside them.
label('NOTES  C D E G A   (low, r=30)', 8, 10);
DEGREES.forEach((d, i) => {
  const x = 40 + i * 62;
  const y = 52;
  const body = bodyOf(PITCHES[d].color, R_LOW, k);
  paintTrail(g, x, y + R_LOW * 1.3, R_LOW, i % 2 ? 6 : -6, i, [255, 255, 255]);
  paintBalloon(g, body, { x, y, r: R_LOW, tilt: 0, grow: 1, bump: 0, alpha: 1 }, (c) => paintFace(c, R_LOW, newFace()));
});
label('high (r=23)', 340, 10);
DEGREES.forEach((d, i) => {
  const x = 352 + i * 50;
  const y = 46 + (i % 2) * 6;
  const body = bodyOf(PITCHES[d].color, R_HIGH, k);
  paintBalloon(g, body, { x, y, r: R_HIGH, tilt: i * 0.04 - 0.08, grow: 1, bump: 0, alpha: 1 }, (c) =>
    paintFace(c, R_HIGH, newFace()),
  );
});

// Row 2: expressions, and the foils.
label('FACES  smile | blink | look left | singing | singing wide | surprised', 8, 118);
const faces = [
  newFace(),
  { ...newFace(), blink: 1 },
  { ...newFace(), lookX: -1, lookY: 0.4 },
  { ...newFace(), sing: 0.45 },
  { ...newFace(), sing: 1 },
  { ...newFace(), wide: 1, sing: 0.3 },
];
faces.forEach((f, i) => {
  const x = 32 + i * 66;
  const r = 28;
  paintBalloon(
    g,
    bodyOf(PITCHES[(i % 5) as 0 | 1 | 2 | 3 | 4].color, r, k),
    { x, y: 158, r, tilt: 0, grow: 1, bump: 0, alpha: 1 },
    (c) => paintFace(c, r, f),
  );
});
label('FOIL star / heart (r=36)', 420, 118);
for (const [i, kind] of (['star', 'heart'] as const).entries()) {
  const x = 452 + i * 80;
  const y = 164;
  paintBalloon(
    g,
    foilOf(kind, R_SPECIAL, k),
    { x, y, r: R_SPECIAL, tilt: i ? 0.06 : -0.05, grow: 1, bump: 0, alpha: 1 },
    (c) => paintFace(c, R_SPECIAL * 0.82, { ...newFace(), sing: i ? 0.4 : 0 }, false),
  );
  paintTwinkle(g, x - 14 + i * 28, y - 22, 6, 0.9);
  paintTwinkle(g, x + 20 - i * 8, y + 10, 4, 0.7);
}

// Row 3: squash, growing, leaning, a gift, and the size of a bouquet balloon.
label('squash +0.25 | -0.2 | grow 0.5 | lean | gift with bow | bouquet r=29', 8, 214);
[0.25, -0.2].forEach((bump, i) => {
  paintBalloon(
    g,
    bodyOf(PITCHES[0].color, 26, k),
    { x: 30 + i * 64, y: 258, r: 26, tilt: 0, grow: 1, bump, alpha: 1 },
    (c) => paintFace(c, 26, newFace()),
  );
});
paintBalloon(
  g,
  bodyOf(PITCHES[3].color, 26, k),
  { x: 158, y: 258, r: 26, tilt: 0, grow: 0.5, bump: 0, alpha: 1 },
  null,
);
paintBalloon(
  g,
  bodyOf(PITCHES[4].color, 26, k),
  { x: 220, y: 258, r: 26, tilt: 0.3, grow: 1, bump: 0, alpha: 1 },
  (c) => paintFace(c, 26, newFace()),
);
paintBalloon(
  g,
  bodyOf([120, 200, 255], R_LOW, k),
  { x: 290, y: 258, r: R_LOW, tilt: 0.05, grow: 1, bump: 0, alpha: 1 },
  (c) => paintFace(c, R_LOW, newFace()),
);
paintBow(g, 290.1, 258 + R_LOW * 1.18, 9, [255, 214, 90]);
paintBalloon(
  g,
  bodyOf(PITCHES[2].color, R_BOUQUET, k),
  { x: 360, y: 258, r: R_BOUQUET, tilt: 0, grow: 1, bump: 0, alpha: 1 },
  (c) => paintFace(c, R_BOUQUET, { ...newFace(), sing: 0.7 }),
);

// Row 4: the garland.
label('GARLAND  done done now next next next', 8, 308);
const notes: GarlandNote[] = ['0', '1', '2', '3', '4', '2'].map((d, i) => ({
  color: PITCHES[Number(d) as 0 | 1 | 2 | 3 | 4].color,
  state: i < 2 ? 'done' : i === 2 ? 'now' : 'next',
}));
paintGarland(g, { cx: 200, y: 322, ribbon: 340, r: 12, step: 30 }, notes, 1.3, 0.7, k);
