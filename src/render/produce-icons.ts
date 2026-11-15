import type Phaser from 'phaser';
import { PRODUCE_IDS, type ProduceId, produceSprite } from '../content/produce';
import type { Manifest } from '../shared/manifest';
import { cutSprite } from './cut';

/** Each kind of fruit or vegetable as a picture the page can show, keyed by its id. */
export type ProduceIcons = Readonly<Record<ProduceId, string>>;

/** The fruit and vegetables, for the basket. */
export function drawProduceIcons(scene: Phaser.Scene, manifest: Manifest): ProduceIcons {
  const icons = {} as Record<ProduceId, string>;
  for (const id of PRODUCE_IDS) icons[id] = cutSprite(scene, manifest, 'produce', produceSprite(id));
  return icons;
}
