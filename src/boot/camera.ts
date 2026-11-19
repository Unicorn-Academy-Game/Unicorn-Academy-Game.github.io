import { AlbumSounds } from '../audio/album-sounds';
import { SpellSounds } from '../audio/spell-sounds';
import type { AlbumSession } from '../game/album';
import { Camera } from '../game/camera';
import type { GameController } from '../game/controller';
import type { PhotosModel } from '../persistence/photos';
import { takeShot } from '../render/snapshot';
import type { Photo } from '../shared/photos';
import { CameraChip } from '../ui/album/camera-chip';
import { PhotoAlbum } from '../ui/album/photo-album';
import { Shutter } from '../ui/album/shutter';
import { h } from '../ui/dom';
import type { OverlayDeps } from '../ui/overlay';
import type { Ui } from '../ui/ui';
import { SILENT } from '../wonder/sound';
import type { Graphics } from './graphics';
import type { Learning } from './learning';
import type { Sound } from './sound';

export interface Photography {
  camera: Camera;
  chip: CameraChip;
  album: PhotoAlbum;
  shutter: Shutter;
}

interface PhotographyDeps {
  ui: Ui;
  overlay: OverlayDeps;
  graphics: Pick<Graphics, 'stage'>;
  sound: Sound;
  session: Pick<AlbumSession, 'note'>;
  model: PhotosModel;
  controller: Pick<GameController, 'world'>;
  learning: Pick<Learning, 'rest' | 'idle'>;
  /** The sticker book is open, which has the screen. */
  stickersOpen: () => boolean;
}

/** The name a picture has as a file: the day it was taken and the end of its id. */
const fileOf = (photo: Photo): string =>
  `unicorn-academy-${new Date(photo.at).toISOString().slice(0, 10)}-${photo.id.slice(-4)}.jpg`;

/** Gives the browser a picture to keep as a file. Nothing leaves the device. */
function save(photo: Photo): void {
  const link = h('a', { href: photo.image, download: fileOf(photo), hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * The camera on the screen: the button in the corner, the flash and the print when a picture is
 * taken, and the album the pictures go to. What is kept, and counted for the sticker book, is the
 * camera's. This only shows it.
 */
export function makePhotography({
  ui,
  overlay,
  graphics,
  sound,
  session,
  model,
  controller,
  learning,
  stickersOpen,
}: PhotographyDeps): Photography {
  const { synth } = sound;
  const sounds = new AlbumSounds(() => synth ?? SILENT);
  const book = new SpellSounds(() => synth ?? SILENT);
  // The pictures taken this visit that the album has not shown yet, which glow when it opens.
  const fresh = new Set<string>();
  const camera: Camera = new Camera({
    model,
    shoot: () => takeShot(graphics.stage.game),
    place: () => controller.world.map.id,
    now: () => Date.now(),
    random: () => Math.random(),
    taken: (photo) => {
      fresh.add(photo.id);
      shutter.taken(photo);
    },
    note: (name) => session.note(name),
    missed: () => {
      chip.miss();
      shutter.again();
    },
  });
  const album = new PhotoAlbum({
    ...overlay,
    rest: learning.rest,
    sounds: {
      open: () => book.open(),
      turn: () => book.turn(),
      keep: () => sounds.keep(),
      stamped: (step) => sounds.stamped(step),
      drawn: () => sounds.drawn(),
    },
    shelf: {
      shots: () => model.get().shots,
      unseen: () => fresh,
      seen: (ids) => {
        for (const id of ids) fresh.delete(id);
      },
      putAway: (id) => camera.putAway(id),
      save,
      keepDrawing: (shot, on) => camera.keepDrawing(shot, on.place),
    },
  });
  // Nothing else has the screen, so a picture can be taken and the album can open.
  const idle = (): boolean => learning.idle() && !stickersOpen() && !album.isOpen;
  const chip = new CameraChip({
    calm: overlay.calm,
    snap: () => {
      if (idle()) void camera.take();
    },
    open: () => {
      if (idle()) album.open();
    },
  });
  const shutter: Shutter = new Shutter({
    layer: ui.host,
    calm: overlay.calm,
    chip,
    shots: () => model.get().shots,
    sounds,
    open: (id) => {
      if (idle()) album.open(id);
    },
  });
  model.subscribe(() => {
    album.refresh();
    shutter.settle();
  });
  shutter.settle();
  return { camera, chip, album, shutter };
}
