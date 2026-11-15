import { describe, expect, it } from 'vitest';
import { DRAWN_WORD_IDS } from '../../src/content/lexicon';
import { WORD_CANVAS, WORD_DRAWINGS } from '../../tools/art/world/words';

describe('the drawings of the words', () => {
  const drawings = DRAWN_WORD_IDS.map((id) => [id, WORD_DRAWINGS[id]()] as const);

  it('are there for every word that is drawn, and for no other', () => {
    expect(Object.keys(WORD_DRAWINGS).sort()).toEqual([...DRAWN_WORD_IDS].sort());
  });

  it('each fill the canvas they sit on with something the player can see, and leave room round it', () => {
    for (const [id, image] of drawings) {
      expect([image.width, image.height], id).toEqual([WORD_CANVAS.w, WORD_CANVAS.h]);
      let opaque = 0;
      for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! > 0) opaque += 1;
      const share = opaque / (image.width * image.height);
      expect(share, `${id} is nearly empty`).toBeGreaterThan(0.2);
      expect(share, `${id} is nearly solid`).toBeLessThan(0.85);
    }
  });

  it('are closed all the way round by an outline, even where the drawing reaches the edge of its square', () => {
    for (const [id, image] of drawings) {
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const edge = x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1;
          if (!edge) continue;
          const [r, g, b, a] = image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
          if (a === 0) continue;
          // What stands on the very edge is the outer outline, which is dark.
          expect(Math.max(r!, g!, b!), `${id} at ${x},${y}`).toBeLessThan(140);
        }
      }
    }
  });

  it('are all different, so no two words show the same picture', () => {
    const seen = new Map<string, string>();
    for (const [id, image] of drawings) {
      const key = Buffer.from(image.data).toString('base64');
      expect(seen.get(key), `${id} looks like ${seen.get(key)}`).toBeUndefined();
      seen.set(key, id);
    }
  });
});
