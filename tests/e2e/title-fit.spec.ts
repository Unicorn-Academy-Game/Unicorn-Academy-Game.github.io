import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

/**
 * The title is a column of lettering, a line, four switches and Play. The lettering got taller when
 * the game was renamed, and Play ran off the bottom of some screens. Every size below is a screen
 * a child plays on, in CSS pixels: phones held either way, Fire and Android tablets, iPads and a
 * laptop.
 */
const SIZES: readonly (readonly [number, number])[] = [
  // Landscape
  [568, 320],
  [640, 360],
  [667, 375],
  [736, 414],
  [800, 480],
  [812, 375],
  [844, 390],
  [915, 412],
  [932, 430],
  [960, 540],
  [1024, 600],
  [1024, 768],
  [1180, 820],
  [1280, 720],
  [1280, 800],
  [1366, 768],
  [1920, 1080],
  // Portrait
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
  [600, 1024],
  [768, 1024],
  [800, 1280],
  [820, 1180],
  [1024, 1366],
  // Awkward
  [480, 480],
  [1000, 1000],
];

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How much of the height a browser's own bars can take while the page is open: none, the thin bar
 * of a phone held sideways, and the address bar and tabs of a tablet. The page is left that much
 * shorter than the units of the screen say, which is how Safari lays out a page.
 */
const BARS = [0, 56, 110] as const;

test.describe('the title on every screen', () => {
  test.setTimeout(480_000);

  test('keeps the lettering, the switches and Play wholly on the screen, apart, and big enough to tap', async ({
    page,
  }) => {
    await openGame(page, 'setting', '', { learning: true });
    const failures: string[] = [];
    for (const [width, height, bars] of SIZES.flatMap(([w, h]) => BARS.map((b) => [w, h, b] as const))) {
      if (height - bars < 300) continue;
      await page.setViewportSize({ width, height });
      await page.evaluate(
        (b) =>
          new Promise<void>((done) => {
            for (const n of document.querySelectorAll('style[data-bars]')) n.remove();
            const style = document.createElement('style');
            style.dataset.bars = 'true';
            style.textContent = `#ui { height: calc(100dvh - ${b}px) !important; }`;
            document.head.append(style);
            requestAnimationFrame(() => requestAnimationFrame(() => done()));
          }),
        bars,
      );
      const boxes = await page.evaluate((): Box[] => {
        const out: Box[] = [];
        const take = (name: string, el: Element | null): void => {
          if (!el) return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          out.push({ name, x: r.x, y: r.y, w: r.width, h: r.height });
        };
        const root = document.querySelector('.title')!;
        take('logo', root.querySelector('.logo'));
        take('line', root.querySelector('.tagline'));
        for (const [i, g] of root.querySelectorAll('[role="radiogroup"]').entries()) take(`switch ${i + 1}`, g);
        take('play', root.querySelector('.play'));
        return out;
      });
      const here = `${width}x${height} with ${bars} px of bars`;
      if (process.env.TITLE_SHOTS)
        await page.screenshot({ path: `${process.env.TITLE_SHOTS}/${width}x${height}-${bars}.png` });
      const high = height - bars;
      const play = boxes.find((b) => b.name === 'play');
      if (!play) failures.push(`${here}: no Play button`);
      if (boxes.filter((b) => b.name.startsWith('switch')).length !== 4) failures.push(`${here}: not four switches`);
      for (const b of boxes) {
        if (b.x < -0.5) failures.push(`${here}: ${b.name} runs off the left (${b.x.toFixed(0)})`);
        if (b.y < -0.5) failures.push(`${here}: ${b.name} runs off the top (${b.y.toFixed(0)})`);
        if (b.x + b.w > width + 0.5)
          failures.push(`${here}: ${b.name} runs off the right (${(b.x + b.w - width).toFixed(0)} px)`);
        if (b.y + b.h > high + 0.5)
          failures.push(`${here}: ${b.name} runs off the bottom (${(b.y + b.h - high).toFixed(0)} px)`);
        if (b.name === 'play' && Math.min(b.w, b.h) < 56)
          failures.push(`${here}: Play is ${b.w.toFixed(0)}x${b.h.toFixed(0)}`);
        if (b.name.startsWith('switch') && b.h < 28) failures.push(`${here}: ${b.name} is ${b.h.toFixed(0)} px tall`);
        if (b.name === 'logo' && b.h < 56 && high >= 400)
          failures.push(`${here}: the lettering is squashed to ${b.h.toFixed(0)} px`);
      }
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const apart = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
          if (!apart) failures.push(`${here}: ${a.name} and ${b.name} overlap`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
