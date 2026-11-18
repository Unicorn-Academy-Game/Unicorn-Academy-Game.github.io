import type { Glyph } from '../content/world-map';

/**
 * The pictures on the world map: a glyph for each kind of place, drawn in a 24 unit box the way the
 * page's other icons are, and the island itself, as one SVG drawn from fixed numbers so it looks the
 * same every time.
 */

const glyph = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const FLOWER_PETALS = [
  [12, 6.2],
  [17.4, 10.1],
  [15.3, 16.5],
  [8.7, 16.5],
  [6.6, 10.1],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.7"/>`)
  .join('');

const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 === 0 ? 9.6 : 4.4;
  return `${(12 + Math.cos(a) * r).toFixed(2)},${(12.8 + Math.sin(a) * r).toFixed(2)}`;
}).join(' ');

export const GLYPHS: Readonly<Record<Glyph, string>> = {
  tree: glyph('<path d="M12 3 6.6 11.6h3L5.6 18h12.8l-4-6.4h3z"/><path d="M12 18v3.4"/>'),
  manor: glyph('<path d="M4 20.5V10.2l8-6.2 8 6.2v10.3z"/><path d="M9.8 20.5v-6h4.4v6"/><path d="M12 4V1.8"/>'),
  cloud: glyph('<path d="M7.2 18.4a4.2 4.2 0 0 1-.6-8.3 5.6 5.6 0 0 1 10.6-.9 4.7 4.7 0 0 1 .4 9.2z"/>'),
  crystal: glyph(
    '<path d="M12 2.8 18.4 9 12 21.2 5.6 9z"/><path d="M5.6 9h12.8M9.4 9 12 21.2M14.6 9 12 21.2M9.4 9 12 2.8l2.6 6.2"/>',
  ),
  garden: glyph(
    '<circle cx="12" cy="8.6" r="3.4"/><path d="M12 12v8.6M12 16.6c-3.4 0-5.4-2-5.4-4.4M12 16.6c3.4 0 5.4-2 5.4-4.4"/>',
  ),
  castle: glyph('<path d="M4 20.5V8h3.2v3h3.2V8h3.2v3h3.2V8H20v12.5z"/><path d="M10 20.5v-4.6a2 2 0 0 1 4 0v4.6"/>'),
  chest: glyph(
    '<path d="M4 11.4v8.6h16v-8.6"/><path d="M4 11.4c0-4 3.4-6.4 8-6.4s8 2.4 8 6.4z"/><path d="M12 12.6v3.6"/>',
  ),
  horse: glyph('<path d="M7 20.6V10.4a5 5 0 0 1 10 0v10.2h-3.6V10.8a1.4 1.4 0 0 0-2.8 0v9.8z"/>'),
  slide: glyph('<path d="M5.6 20.6V4M5.6 6c5.4 0 4.6 11.4 12.8 11.4"/><path d="M3 20.6h18"/>'),
  dance: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><polygon points="${STAR}"/></svg>`,
  river: glyph(
    '<path d="M2.6 8.6c2.2-2.2 4.2-2.2 6.4 0s4.2 2.2 6.4 0 4.2-2.2 6 0M2.6 14c2.2-2.2 4.2-2.2 6.4 0s4.2 2.2 6.4 0 4.2-2.2 6 0M2.6 19.4c2.2-2.2 4.2-2.2 6.4 0s4.2 2.2 6.4 0 4.2-2.2 6 0"/>',
  ),
  wand: glyph(
    '<path d="m4.6 19.4 9.6-9.6"/><path d="m14.2 9.8 2.2-2.2"/><path d="M17.8 2.8v3.4M16.1 4.5h3.4M20.4 9.4v2.6M19.1 10.7h2.6M7.8 3.8v2.6M6.5 5.1h2.6"/>',
  ),
  shell: glyph(
    '<path d="M12 20.8 3.8 9.4C5 5.4 8 3.2 12 3.2s7 2.2 8.2 6.2z"/><path d="M12 20.8V3.2M12 20.8 7.8 4.4M12 20.8l4.2-16.4"/>',
  ),
  crown: glyph('<path d="m3.6 18.6-1-11 5 4 4.4-6.4 4.4 6.4 5-4-1 11z"/>'),
  fork: glyph(
    '<path d="M6.6 3v5.4a2.2 2.2 0 0 0 4.4 0V3M8.8 3v18"/><path d="M17.4 21V3c-2.2 1.2-3.2 4-3.2 7.4v2.6h3.2"/>',
  ),
  teacup: glyph(
    '<path d="M4 9.6h12v3.8a6 6 0 0 1-12 0z"/><path d="M16 10.6h1.8a2.6 2.6 0 0 1 0 5.2H15.6"/><path d="M7.6 3.4c-1 1 1 2 0 3.2M11.6 3.4c-1 1 1 2 0 3.2"/>',
  ),
  frame: glyph(
    '<rect x="3.6" y="5" width="16.8" height="14" rx="1.6"/><path d="m6 16.4 4-5 3 3 2-2.2 3 4.2"/><circle cx="15.8" cy="9.2" r="1.2"/>',
  ),
  book: glyph(
    '<path d="M12 6.2c-2.2-2.2-5.2-2.6-8.2-2.1v14.4c3-.5 6 0 8.2 2.2 2.2-2.2 5.2-2.7 8.2-2.2V4.1c-3-.5-6 0-8.2 2.1zM12 6.2v14.5"/>',
  ),
  note: glyph(
    '<path d="M9 18.2V6l10.4-2.2v12.4"/><circle cx="6.8" cy="18.4" r="2.5"/><circle cx="17.2" cy="16.4" r="2.5"/>',
  ),
  flower: glyph(`<circle cx="12" cy="12" r="2.2"/>${FLOWER_PETALS}`),
  moon: glyph('<path d="M20.4 14.8A8.2 8.2 0 0 1 9.4 3.8a8.2 8.2 0 1 0 11 11z"/>'),
  snow: glyph(
    '<path d="M12 2.6v18.8M3.9 7.3l16.2 9.4M20.1 7.3 3.9 16.7"/><path d="M9.4 4.4 12 6.8l2.6-2.4M9.4 19.6 12 17.2l2.6 2.4M4.6 10.2l3.2.8-.8 3.2M19.4 13.8l-3.2-.8.8-3.2"/>',
  ),
  cauldron: glyph(
    '<path d="M5 9.6h14v5a7 7 0 0 1-14 0z"/><path d="M3.6 9.6h16.8"/><path d="M8.6 3.4c-1 1 1 2 0 3.2M13 3.4c-1 1 1 2 0 3.2"/><path d="m8 20.4-1 1.6M16 20.4l1 1.6"/>',
  ),
  gem: glyph(
    '<path d="M6.2 4h11.6l4.2 6.2L12 21 2 10.2z"/><path d="M2 10.2h20M9.2 4 7 10.2 12 21M14.8 4l2.2 6.2L12 21"/>',
  ),
};

/** A tiny pseudo random run, so the trees and sparkles stand in the same places every time. */
function scatter(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ISLAND =
  'M170 520C120 380 170 230 290 150C400 80 560 100 700 70C860 40 1040 80 1180 120C1330 160 1450 260 1490 400C1530 540 1500 700 1440 820C1380 930 1220 960 1080 930C940 905 840 940 700 940C540 945 400 930 300 880C200 830 180 720 190 640C195 590 180 560 170 520Z';

const RIVER = 'M860 560C980 520 1080 650 1210 600S1390 560 1560 650';

const SPARKLE = 'M0 -9 2.2 -2.2 9 0 2.2 2.2 0 9 -2.2 2.2 -9 0 -2.2 -2.2Z';

/** A cluster of trees, each a trunk and two rounded crowns. */
function trees(): string {
  const rand = scatter(7);
  const out: string[] = [];
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    const x = 390 + Math.cos(a) * d * 250;
    const y = 585 + Math.sin(a) * d * 190;
    const s = 0.8 + rand() * 0.6;
    out.push(
      `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})"><rect x="-3" y="-2" width="6" height="14" rx="2" fill="#7a4a2a"/><circle cx="0" cy="-12" r="14" fill="#2f8f4a"/><circle cx="-5" cy="-17" r="9" fill="#46b45c"/></g>`,
    );
  }
  return out.join('');
}

/** A few firs with snow on them in the white patch at the top of the island. */
function snowFirs(): string {
  const rand = scatter(29);
  const out: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = 610 + rand() * 160;
    const y = 120 + rand() * 40;
    const s = 0.8 + rand() * 0.5;
    out.push(
      `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})"><path d="M0 -26 12 -4H-12ZM0 -16 15 6H-15Z" fill="#2f7f6a"/><path d="M0 -26 5 -17h-10ZM0 -16 7 -7h-14Z" fill="#fff"/><rect x="-2" y="6" width="4" height="6" fill="#6a4a3a"/></g>`,
    );
  }
  return out.join('');
}

/** Little flowers across the garden lawn. */
function blooms(): string {
  const rand = scatter(19);
  const colours = ['#ff7ac8', '#ffd75e', '#ffffff', '#ff9a6a', '#b58cff'];
  const out: string[] = [];
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    const x = 830 + Math.cos(a) * d * 330;
    const y = 520 + Math.sin(a) * d * 230;
    out.push(
      `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + rand() * 3).toFixed(1)}" fill="${colours[i % colours.length]}"/>`,
    );
  }
  return out.join('');
}

/** Twinkling stars on the water and the river. */
function twinkles(): string {
  const rand = scatter(3);
  const out: string[] = [];
  for (let i = 0; i < 46; i++) {
    const x = 20 + rand() * 1560;
    const y = 20 + rand() * 960;
    out.push(
      `<path class="wm-tw" style="animation-delay:${(rand() * 3).toFixed(2)}s" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${(0.5 + rand() * 0.9).toFixed(2)})" d="${SPARKLE}" fill="#fff" opacity="0.85"/>`,
    );
  }
  return out.join('');
}

/** Rings of ripples on the sea round the coast. */
function ripples(): string {
  const rand = scatter(11);
  const out: string[] = [];
  for (let i = 0; i < 34; i++) {
    const side = rand();
    const x = side < 0.5 ? 20 + rand() * 120 : 1500 + rand() * 80;
    const y = 40 + rand() * 920;
    const x2 = rand() < 0.5 ? 20 + rand() * 1560 : x;
    const y2 = x2 === x ? y : rand() < 0.5 ? 20 + rand() * 50 : 950 + rand() * 40;
    out.push(
      `<path d="M${x2.toFixed(0)} ${y2.toFixed(0)}q14 -10 28 0t28 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.4"/>`,
    );
  }
  return out.join('');
}

/** The roads between places: dots a child's finger could follow. */
const ROADS: readonly string[] = [
  'M384 560C500 580 700 590 832 560',
  'M832 560V250',
  'M832 560C760 500 700 450 592 410',
  'M832 560C940 500 1020 450 1072 410',
  'M832 560C780 640 740 700 688 770',
  'M688 770C800 800 880 820 960 850',
  'M832 560C960 600 1060 610 1152 600',
  'M1152 600C1190 500 1210 360 1232 250',
  'M1152 600C1260 660 1330 700 1360 760',
  'M384 560C320 500 270 400 240 330',
  'M240 330C330 280 420 230 464 190',
  'M384 560C360 650 365 720 368 800',
];

/**
 * The island as one picture, 1600 by 1000: sea that glitters, a ring of sand, the forest in the
 * west, the garden lawn in the middle, the magic river running out to the sea in the east, and the
 * dotted roads between the places.
 */
export function islandArt(): string {
  return `<svg class="wm-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="wm-sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fe9ff"/><stop offset="0.5" stop-color="#52b4f2"/><stop offset="1" stop-color="#7e74f0"/></linearGradient>
<linearGradient id="wm-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6ec86"/><stop offset="1" stop-color="#7fd06c"/></linearGradient>
<linearGradient id="wm-river" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8be8ff"/><stop offset="1" stop-color="#b9a4ff"/></linearGradient>
<clipPath id="wm-land"><path d="${ISLAND}"/></clipPath>
</defs>
<rect width="1600" height="1000" fill="url(#wm-sea)"/>
${ripples()}
<path d="${ISLAND}" fill="#d6f8ff" stroke="#d6f8ff" stroke-width="84" stroke-linejoin="round" opacity="0.5"/>
<path d="${ISLAND}" fill="#fbe9b4" stroke="#fbe9b4" stroke-width="34" stroke-linejoin="round"/>
<path d="${ISLAND}" fill="url(#wm-grass)"/>
<g clip-path="url(#wm-land)">
<ellipse cx="400" cy="585" rx="290" ry="230" fill="#58b865" opacity="0.7"/>
<ellipse cx="830" cy="520" rx="360" ry="260" fill="#c7f09a" opacity="0.8"/>
<ellipse cx="1360" cy="790" rx="190" ry="150" fill="#fbe9b4"/>
<ellipse cx="690" cy="140" rx="150" ry="70" fill="#f4f8ff"/>
${snowFirs()}
${blooms()}
${trees()}
<path d="M300 840 330 770 360 840ZM350 860 395 760 440 860ZM410 840 438 790 466 840Z" fill="#9aa2ff" stroke="#6a6fe0" stroke-width="4" stroke-linejoin="round"/>
<g fill="none" stroke-linecap="round">
${ROADS.map((d) => `<path d="${d}" stroke="#fff6d6" stroke-width="9" stroke-dasharray="1 20" opacity="0.95"/>`).join('')}
</g>
</g>
<path d="${RIVER}" fill="none" stroke="#fbe9b4" stroke-width="92" stroke-linecap="round" opacity="0.9"/>
<path d="${RIVER}" fill="none" stroke="url(#wm-river)" stroke-width="64" stroke-linecap="round"/>
<path class="wm-flow" d="${RIVER}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray="3 26" opacity="0.9"/>
<g fill="#e9a0d8" stroke="#a45bd0" stroke-width="3" stroke-linejoin="round" transform="translate(1232 196)"><path d="M-46 40V-4C-46-46 46-46 46-4V40Z"/><path d="M-64 40h128" stroke-width="6"/></g>
<g transform="translate(832 196)" fill="#f7a8d2" stroke="#d86aa8" stroke-width="3" stroke-linejoin="round"><path d="M-74 44V-14h24v18h28V-34h44v38h28v-18h24V44Z"/><path d="M-74-14l12-22 12 22M-22-34l22-30 22 30M50-14l12-22 12 22" fill="#e86fb4"/></g>
${twinkles()}
</svg>`;
}
