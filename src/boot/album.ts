import { AlbumSounds } from '../audio/album-sounds';
import { SpellSounds } from '../audio/spell-sounds';
import { STICKERS } from '../content/stickers';
import { type AlbumSession, learnerStanding } from '../game/album';
import type { GameController } from '../game/controller';
import { wordSaid } from '../learning';
import type { AlbumModel } from '../persistence/album';
import type { LearnerModel } from '../persistence/learner';
import type { PhotosModel } from '../persistence/photos';
import type { PlayModel } from '../persistence/play';
import { StickerBook } from '../ui/album/sticker-book';
import { StickerChip } from '../ui/album/sticker-chip';
import { StickerToast } from '../ui/album/sticker-toast';
import type { OverlayDeps } from '../ui/overlay';
import type { Ui } from '../ui/ui';
import { SILENT } from '../wonder/sound';
import { makePhotography, type Photography } from './camera';
import type { Graphics } from './graphics';
import type { Learning } from './learning';
import type { Sound } from './sound';

export interface Album {
  book: StickerBook;
  chip: StickerChip;
  toast: StickerToast;
  pictures: Photography;
}

interface AlbumDeps {
  ui: Ui;
  overlay: OverlayDeps;
  graphics: Pick<Graphics, 'stage'>;
  sound: Sound;
  session: AlbumSession;
  model: AlbumModel;
  photos: PhotosModel;
  controller: Pick<GameController, 'world'>;
  learner: LearnerModel;
  play: PlayModel;
  learning: Learning;
}

/**
 * What the player keeps of the game: the sticker book with its button in the corner and the moment
 * a sticker is earned, and the camera with the pictures it took. What is earned, and when, is the
 * session's. This only shows it, and tells the session about the learner's books when they change,
 * since some stickers are for words and sums.
 */
export function makeAlbum({
  ui,
  overlay,
  graphics,
  sound,
  session,
  model,
  photos,
  controller,
  learner,
  play,
  learning,
}: AlbumDeps): Album {
  const { synth, voice } = sound;
  const book = new StickerBook({
    ...overlay,
    shelf: session,
    picture: learning.picture,
    rest: learning.rest,
    say: (word) => voice.say(wordSaid(word).clips),
    sounds: new SpellSounds(() => synth ?? SILENT),
  });
  const pictures = makePhotography({
    ui,
    overlay,
    graphics,
    sound,
    session,
    model: photos,
    controller,
    learning,
    stickersOpen: () => book.isOpen,
  });
  // Nothing else has the screen, so the book can open and a sticker can come up.
  const idle = (): boolean => learning.idle() && !book.isOpen && !pictures.album.isOpen;
  const chip = new StickerChip({
    total: STICKERS.length,
    calm: overlay.calm,
    open: () => {
      if (idle()) book.open();
    },
  });
  const toast = new StickerToast({
    layer: ui.host,
    calm: overlay.calm,
    free: idle,
    picture: learning.picture,
    chip,
    have: () => session.have(),
    sounds: new AlbumSounds(() => synth ?? SILENT),
  });
  session.onEarned((stickers) => toast.show(stickers));
  model.subscribe(() => {
    book.refresh();
    toast.settle();
  });
  const standing = (): ReturnType<typeof learnerStanding> => learnerStanding(learner.get(), play.get(), Date.now());
  learner.subscribe(() => session.learned(standing()));
  play.subscribe(() => session.learned(standing()));
  session.begin(standing());
  toast.settle();
  return { book, chip, toast, pictures };
}
