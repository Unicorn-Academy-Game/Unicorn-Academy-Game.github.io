import type { Ink, StampShape } from '../../game/doodle';
import { MAP_IDS, type MapId } from '../../shared/ids';
import { PLACE_NAMES } from '../parent/text';

/**
 * Every word the camera and the photo album give to a screen. Nothing here ever says a picture is
 * lost or wrong: a picture is put away when the player asks, and asked about first, with a way to
 * keep it as big as the way to put it away.
 */

export const PHOTO_LABELS = {
  take: 'Take a picture',
  title: 'My Pictures',
  open: 'Open my Pictures',
  close: 'Close my Pictures',
  list: 'The pictures in the album',
  empty: 'No pictures yet',
  emptyHint: 'Tap the camera to take one!',
  newOne: 'A new picture!',
  again: 'Tap the camera to try again.',
  full: 'Album full',
  fullNote: 'The album is full, so a new picture makes room by putting the oldest one away.',
  takeFull: 'Take a picture. The album is full, so the oldest picture is put away.',
  madeRoom: 'The oldest picture made room for it.',
  save: 'Save',
  saveLabel: 'Save this picture to the device',
  putAway: 'Put away',
  putAwayLabel: 'Put this picture away',
  ask: 'Put this picture away?',
  yes: 'Put it away',
  no: 'Keep it',
  gone: 'The picture is put away.',
  all: 'All',
  back: 'Back to all my pictures',
  newer: 'A newer picture',
  older: 'An older picture',
} as const;

/**
 * Every word of drawing on a picture. A drawing is kept beside the picture it was made on, which is
 * never changed, and leaving one that is not kept is asked about first.
 */
export const DRAW_LABELS = {
  draw: 'Draw',
  drawLabel: 'Draw on this picture',
  title: 'Draw on the picture',
  paper: 'The picture. Touch it and drag to draw.',
  inks: 'Colours',
  tools: 'Crayon, eraser and stamps',
  pen: 'Crayon',
  rubber: 'Eraser',
  fine: 'Small. Tap for big.',
  bold: 'Big. Tap for small.',
  undo: 'Undo',
  undoLabel: 'Take off the last thing I drew',
  done: 'Done',
  doneLabel: 'Keep my drawing in the album',
  close: 'Close the drawing',
  ask: 'Keep your drawing?',
  keep: 'Keep it',
  drop: 'Not now',
  kept: 'Your drawing is in the album.',
  full: 'The picture is full. Tap undo to make room.',
  retry: 'That did not save. Tap done to try again.',
} as const;

export const INK_LABELS: Readonly<Record<Ink, string>> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  white: 'White',
  black: 'Black',
  rainbow: 'Rainbow',
};

export const STAMP_LABELS: Readonly<Record<StampShape, string>> = {
  star: 'Star stamp',
  heart: 'Heart stamp',
  flower: 'Flower stamp',
  sparkle: 'Sparkle stamp',
  sun: 'Sun stamp',
  moon: 'Moon stamp',
};

/** How many pictures there are, for the top of the album. */
export const countLabel = (n: number): string => `${n} ${n === 1 ? 'picture' : 'pictures'}`;

const isMap = (place: string): place is MapId => (MAP_IDS as readonly string[]).includes(place);

/** Where a picture was taken, as a short name that starts with a capital. */
export function placeOf(place: string): string {
  const name = isMap(place) ? PLACE_NAMES[place] : 'the island';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** A picture in the album, for a screen reader. */
export const photoLabel = (place: string, fresh: boolean): string =>
  `A picture. ${placeOf(place)}.${fresh ? ' A new picture.' : ''}`;
