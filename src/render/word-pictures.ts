import type Phaser from 'phaser';
import { WORDS, type WordId } from '../content/lexicon';
import type { Manifest } from '../shared/manifest';
import { cutSprite } from './cut';
import type { Portraits } from './portraits';

/**
 * The picture of a word, as an image the page can show. It is the picture the world draws for the
 * thing, so the player knows it at once.
 */
export type WordPictures = (word: WordId) => string;

/**
 * Pictures for the words, cut from the game's own textures the first time each is asked for. A game
 * that has learning switched off never asks, so it never pays for them.
 */
export function wordPictures(scene: Phaser.Scene, manifest: Manifest, portraits: Portraits): WordPictures {
  const made = new Map<WordId, string>();
  return (word) => {
    let picture = made.get(word);
    if (picture === undefined) {
      const how = WORDS[word].picture;
      picture = how.kind === 'portrait' ? portraits[how.unicorn] : cutSprite(scene, manifest, how.bundle, how.sprite);
      made.set(word, picture);
    }
    return picture;
  };
}
