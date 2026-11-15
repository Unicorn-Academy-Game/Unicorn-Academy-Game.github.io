import type { MapBuilder } from './builder';
import { stand as E, hitBox as hit, type Pt, type Scatter } from './geom';

/**
 * What the maps that are drawn from the playground's bundle share: the sky behind them and the way
 * a toy is set down.
 */

/**
 * A strip of sky along the top of the map, clouds in it, and two rows of hills along the horizon.
 */
export function paintSky(b: MapBuilder): void {
  for (let i = 0; i < b.width / 64; i++) b.place('pg-sky-strip', 32 + i * 64, 560, 'backdrop', -3000);
  for (const [id, x, y] of [
    ['pg-cloud-3', 340, 200],
    ['pg-cloud-1', 860, 150],
    ['pg-cloud-5', 1500, 240],
    ['pg-cloud-2', 2000, 170],
    ['pg-cloud-4', 2380, 260],
    ['pg-cloud-4', 120, 330],
    ['pg-cloud-2', 1240, 80],
  ] as const)
    b.place(id, x, y, 'backdrop', -2000);
  for (let i = 0; i < 6; i++) {
    b.place(`pg-hills-far-${i % 3}`, 256 + i * 512 - 256, 520, 'backdrop', -1000);
    b.place(`pg-hills-near-${(i + 1) % 3}`, 256 + i * 512 - 120, 586, 'backdrop', -900);
  }
}

export interface Toy {
  name: string;
  def: string;
  sprite: string;
  at: Pt;
  /** The tap region round it: how wide, how tall, and how far it reaches above the ground point. */
  w: number;
  h: number;
  up: number;
  /** How far south of it she stands to use it. */
  stand?: number;
  look?: string;
  /** It is only to be seen and tapped, and the herd walks through it. */
  hold?: boolean;
}

/**
 * Sets a toy down: scenery keeps off it, it stops the herd unless it is only held, and she uses it
 * from the south, facing north.
 */
export function toyMaker(b: MapBuilder, sc: Scatter, footprints: Readonly<Record<string, number>>): (toy: Toy) => void {
  return (o) => {
    const { x, y } = o.at;
    sc.add(x, y, (footprints[o.sprite] ?? 40) + 40);
    if (!o.hold) b.footprint(o.sprite, x, y);
    b.interactable({
      name: o.name,
      definitionId: o.def,
      pos: o.at,
      ...(o.look ? { look: o.look } : {}),
      hit: hit(x, y, o.w, o.h, o.up),
      approach: [E(x, y + (o.stand ?? 80), 'north')],
    });
  };
}
