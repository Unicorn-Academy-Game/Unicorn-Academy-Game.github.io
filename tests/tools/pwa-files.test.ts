import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_NAME, GAME_SHORT_NAME } from '../../src/shared/brand';
import { decodePng } from '../../tools/lib/png';

/** What a phone reads before it will offer the game on a home screen. */

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  id?: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  orientation?: string;
  theme_color: string;
  background_color: string;
  icons: Icon[];
};
const page = readFileSync('index.html', 'utf8');
const attribute = (html: string, tag: RegExp, name: string): string | undefined =>
  new RegExp(`${name}="([^"]*)"`).exec(tag.exec(html)?.[0] ?? '')?.[1];

describe('the web app manifest', () => {
  it('names the game as the player sees it and opens it with no browser around it', () => {
    expect(manifest.name).toBe(GAME_NAME);
    expect(manifest.short_name).toBe(GAME_SHORT_NAME);
    expect(manifest.short_name.length).toBeLessThanOrEqual(14);
    expect(manifest.display).toBe('standalone');
  });

  it('opens the folder the game is in from every home screen, whatever path of a site that is, and does not lock the screen to one orientation', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    // An id would be read from the root of the site, so two games on one site would share it. With
    // none, the start address is the id.
    expect(manifest.id).toBeUndefined();
    expect(manifest.orientation).toBeUndefined();
  });

  it('names every file from the manifest, so it holds under any path', () => {
    for (const icon of manifest.icons) expect(icon.src).not.toMatch(/^\//);
  });

  it('uses the colours the page declares for its own chrome', () => {
    expect(manifest.theme_color).toBe(attribute(page, /<meta name="theme-color"[^>]*>/, 'content'));
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('lists icons that exist and are the size they say, with one a phone may crop to a shape', () => {
    for (const icon of manifest.icons) {
      const file = decodePng(new Uint8Array(readFileSync(`public/${icon.src}`)));
      expect(icon.type).toBe('image/png');
      expect(`${file.width}x${file.height}`).toBe(icon.sizes);
    }
    expect(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'any' && i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'any' && i.sizes === '512x512')).toBe(true);
  });

  it('has icons with no see-through pixels, which a phone would fill with black', () => {
    for (const path of ['icon-192', 'icon-512', 'maskable-512', 'apple-touch-icon', 'favicon-32']) {
      const { data } = decodePng(new Uint8Array(readFileSync(`public/icons/${path}.png`)));
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) throw new Error(`${path} has a transparent pixel`);
    }
  });
});

describe('the page head', () => {
  it('has the name of the game for its title and for the home screen, and is open to search engines', () => {
    expect(/<title>([^<]*)<\/title>/.exec(page)?.[1]).toBe(GAME_NAME);
    expect(attribute(page, /<meta name="apple-mobile-web-app-title"[^>]*>/, 'content')).toBe(GAME_SHORT_NAME);
    expect(page).not.toMatch(/noindex/);
  });

  it('links the manifest', () => {
    expect(attribute(page, /<link rel="manifest"[^>]*>/, 'href')).toBe('/manifest.webmanifest');
  });

  it('links the Apple touch icon at 180 pixels, and a small icon for the tab', () => {
    const apple = attribute(page, /<link rel="apple-touch-icon"[^>]*>/, 'href');
    expect(apple).toBe('/icons/apple-touch-icon.png');
    const touch = decodePng(new Uint8Array(readFileSync(`public${apple}`)));
    expect([touch.width, touch.height]).toEqual([180, 180]);
    expect(attribute(page, /<link rel="icon"[^>]*>/, 'href')).toBe('/icons/favicon-32.png');
  });

  it('asks for a full-screen launch from the iPhone home screen under the name the player sees', () => {
    expect(attribute(page, /<meta name="apple-mobile-web-app-capable"[^>]*>/, 'content')).toBe('yes');
    expect(attribute(page, /<meta name="apple-mobile-web-app-title"[^>]*>/, 'content')).toBe(manifest.short_name);
    expect(page).toContain('viewport-fit=cover');
  });
});
