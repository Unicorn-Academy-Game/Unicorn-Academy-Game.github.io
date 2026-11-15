import { expect, test } from '@playwright/test';
import { COMPASS_EIGHT, facingLabel, NORTHEAST, NORTHWEST, SOUTHEAST, SOUTHWEST } from '../../src/shared/compass';
import { freeze, openGame, play, step, withoutFineSheets } from './helpers';

/** What these tests read of the engine and of the manifest, as far as they read either. */
interface Img {
  texture?: { key: string };
  frame: { name: string };
  flipX: boolean;
  setOrigin(x: number, y: number): Img;
  setFlipX(flip: boolean): Img;
}
interface Painted {
  draw(entry: Img, x: number, y: number): void;
  render(): void;
  snapshot(done: (image: HTMLImageElement) => void): void;
}
interface Scene {
  textures: {
    exists(key: string): boolean;
    remove(key: string): void;
    addDynamicTexture(key: string, w: number, h: number): Painted;
  };
  make: { image(config: { key: string; frame: string; add: false }): Img };
  children: { list: Img[] };
}
interface Clip {
  flip?: true;
  frames: { rect: number }[];
}
interface Asset {
  origin: [number, number];
  atlas: { rects: { sw: number; sh: number }[] };
  clips: Record<string, Record<string, Clip | undefined>>;
}
interface Hooks {
  stage: { scene: Scene };
  manifest: { unicorns: Record<string, Asset> };
  controller: {
    debugStep(seconds: number): void;
    world: {
      time: number;
      unicorns: Record<string, { speed: number; anim: { clip: string; facing: number; startedAt: number } }>;
    };
  };
}

const FLIPPED = [
  [NORTHEAST, NORTHWEST],
  [SOUTHEAST, SOUTHWEST],
] as const;

test.describe('the unicorns who face the other way by being flipped', () => {
  test.setTimeout(240_000);

  // The pictures are drawn once for the northwest and the southwest, and the northeast and the
  // southeast are those turned left to right. That is only the same unicorn, with the horn in the
  // right place, if the engine turns a trimmed picture about the middle of its canvas, where her
  // feet are. So every flipped frame of every unicorn is drawn with the engine next to the frame it
  // turns, at whole pixels, and the one has to be the other's mirror image to the pixel.
  test('every flipped frame is the frame it turns, mirrored about her feet, to the pixel', async ({ page }) => {
    await openGame(page);
    await play(page);
    const found = await page.evaluate(async (pairs) => {
      const ua = window.__ua as unknown as Hooks;
      const scene = ua.stage.scene;
      const out: { id: string; frames: number; mismatched: number; drawn: number; control: number }[] = [];
      for (const [id, asset] of Object.entries(ua.manifest.unicorns)) {
        const canvas = asset.atlas.rects[0]!;
        const [ox, oy] = asset.origin;
        const cells: { drawn: number; shown: number; flip: boolean }[] = [];
        for (const name of ['walk', 'idle'])
          for (const [flipped, drawn] of pairs) {
            const turned = asset.clips[name]![flipped]!;
            turned.frames.forEach((f, i) => {
              cells.push({
                drawn: asset.clips[name]![drawn]!.frames[i]!.rect,
                shown: f.rect,
                flip: turned.flip === true,
              });
            });
          }
        // One more pair that is not turned at all, to see that turning changes the picture.
        cells.push({ drawn: cells[0]!.drawn, shown: cells[0]!.drawn, flip: false });
        const columns = 6;
        const width = columns * canvas.sw * 2;
        const height = Math.ceil(cells.length / columns) * canvas.sh;
        const key = `flip-check:${id}`;
        if (scene.textures.exists(key)) scene.textures.remove(key);
        const paint = scene.textures.addDynamicTexture(key, width, height);
        const picture = (frame: number, flip: boolean): Img =>
          scene.make
            .image({ key: `unicorn:${id}`, frame: String(frame), add: false })
            .setOrigin(ox / canvas.sw, oy / canvas.sh)
            .setFlipX(flip);
        cells.forEach((c, n) => {
          const x = (n % columns) * canvas.sw * 2;
          const y = Math.floor(n / columns) * canvas.sh;
          paint.draw(picture(c.drawn, false), x + ox, y + oy);
          paint.draw(picture(c.shown, c.flip), x + canvas.sw + ox, y + oy);
        });
        paint.render();
        const image = await new Promise<HTMLImageElement>((done) => paint.snapshot(done));
        const surface = document.createElement('canvas');
        surface.width = width;
        surface.height = height;
        const context = surface.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const px = context.getImageData(0, 0, width, height).data;
        const result = { id, frames: cells.length - 1, mismatched: 0, drawn: 0, control: 0 };
        cells.forEach((_, n) => {
          const x = (n % columns) * canvas.sw * 2;
          const y = Math.floor(n / columns) * canvas.sh;
          let wrong = 0;
          for (let row = 0; row < canvas.sh; row++)
            for (let col = 0; col < canvas.sw; col++) {
              const a = ((y + row) * width + x + col) * 4;
              const b = ((y + row) * width + x + canvas.sw + (canvas.sw - 1 - col)) * 4;
              if (px[a + 3]! > 0) result.drawn++;
              if (px[a] !== px[b] || px[a + 1] !== px[b + 1] || px[a + 2] !== px[b + 2] || px[a + 3] !== px[b + 3])
                wrong++;
            }
          if (n === cells.length - 1) result.control = wrong;
          else result.mismatched += wrong;
        });
        scene.textures.remove(key);
        out.push(result);
      }
      return out;
    }, FLIPPED);

    expect(found.map((f) => f.id).sort()).toEqual(['cinder', 'glacier', 'leaf', 'river', 'storm', 'wildstar']);
    for (const f of found) {
      expect(f.frames, `${f.id} frames checked`).toBe(2 * 8 + 2 * 4);
      expect(f.drawn, `${f.id} has pictures`).toBeGreaterThan(50_000);
      expect(f.mismatched, `${f.id}: pixels that are not the mirror image of the frame they turn`).toBe(0);
      expect(
        f.control,
        `${f.id}: the same frame not turned must differ from its mirror image, or the check proves nothing`,
      ).toBeGreaterThan(1000);
    }
  });

  // The view has to turn the picture of exactly the facings the manifest marks, and show the frame
  // the manifest names. The fine sheets draw the northeast and the southeast themselves, so nothing
  // is turned once they are in, and when they come is up to the network. They are kept away here,
  // and `fine-facings.spec.ts` has them.
  test('the game turns the picture of the facings the manifest marks, and no other', async ({ page }) => {
    await withoutFineSheets(page);
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 0.5);
    const facings = COMPASS_EIGHT;
    const seen: string[] = [];
    for (const clip of ['walk', 'idle']) {
      for (const facing of facings) {
        const shown = await page.evaluate(
          ({ clip: clipName, facing: way }) => {
            const ua = window.__ua as unknown as Hooks;
            const wildstar = ua.controller.world.unicorns.wildstar!;
            wildstar.speed = 0;
            wildstar.anim = { clip: clipName, facing: way, startedAt: ua.controller.world.time };
            // No time draws a frame and cannot step the world, so what is drawn is what was set.
            // Any time at all could carry the leftover of the real clock over a step, and the world
            // would put her anim back.
            ua.controller.debugStep(0);
            const image = ua.stage.scene.children.list.find((c) => c.texture?.key === 'unicorn:wildstar');
            const clip = ua.manifest.unicorns.wildstar!.clips[clipName]![way]!;
            return {
              flipX: image?.flipX,
              frame: image?.frame.name,
              wantFlip: clip.flip === true,
              wantFrame: String(clip.frames[0]!.rect),
            };
          },
          { clip, facing },
        );
        expect(shown.flipX, `${clip} ${facingLabel(facing)}`).toBe(shown.wantFlip);
        expect(shown.frame, `${clip} ${facingLabel(facing)}`).toBe(shown.wantFrame);
        if (shown.flipX) seen.push(`${clip} ${facingLabel(facing)}`);
      }
    }
    expect(seen).toEqual(['walk 4 (southeast)', 'walk 28 (northeast)', 'idle 4 (southeast)', 'idle 28 (northeast)']);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});
