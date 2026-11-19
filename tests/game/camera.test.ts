import { describe, expect, it } from 'vitest';
import { Camera, type Frame, nameOf } from '../../src/game/camera';
import { PhotosModel } from '../../src/persistence/photos';
import { emptyPhotos, MAX_PHOTOS, type Photo } from '../../src/shared/photos';
import { Clock } from './clock';

const JPEG = `data:image/jpeg;base64,${'/9j/4AAQSkZJRgABAQAAAQABAAD'.padEnd(64, 'A')}`;
const FRAME: Frame = { image: JPEG, w: 640, h: 296 };

interface Rig {
  camera: Camera;
  model: PhotosModel;
  noted: string[];
  taken: Photo[];
  /** How many times a tap was answered with a way to try again. */
  missed: { count: number };
  /** How many times the screen was asked for a picture. */
  asked: { count: number };
  /** What the screen gives for the next picture. */
  next: { frame: Frame | null };
  /** Lets a picture that is waiting for the screen go on. */
  release(): void;
}

function rig(options: { held?: boolean; place?: string } = {}): Rig {
  const model = new PhotosModel(emptyPhotos(), null, new Clock());
  const noted: string[] = [];
  const taken: Photo[] = [];
  const next: { frame: Frame | null } = { frame: FRAME };
  const missed = { count: 0 };
  const asked = { count: 0 };
  let release: () => void = () => {};
  let at = 1_700_000_000_000;
  const camera = new Camera({
    model,
    shoot: () => {
      asked.count++;
      return options.held
        ? new Promise((resolve) => {
            release = () => resolve(next.frame);
          })
        : Promise.resolve(next.frame);
    },
    place: () => options.place ?? 'forest',
    now: () => (at += 1000),
    random: () => 0.5,
    taken: (photo) => taken.push(photo),
    note: (name) => noted.push(name),
    missed: () => missed.count++,
  });
  return { camera, model, noted, taken, missed, asked, next, release: () => release() };
}

describe('taking a picture', () => {
  it('keeps the picture, says where it was taken, and counts it', async () => {
    const r = rig({ place: 'palace-garden' });
    const photo = await r.camera.take();
    expect(photo).toMatchObject({ place: 'palace-garden', image: JPEG, w: 640, h: 296 });
    expect(r.model.get().shots).toEqual([photo]);
    expect(r.noted).toEqual(['photos']);
  });

  it('tells whoever shows it before it is kept, so the corner is ready for it', async () => {
    const r = rig();
    const seen: number[] = [];
    r.model.subscribe(() => seen.push(r.taken.length));
    await r.camera.take();
    expect(seen).toEqual([1]);
  });

  it('gives each picture a name of its own', async () => {
    const r = rig();
    const a = await r.camera.take();
    const b = await r.camera.take();
    expect(a!.id).not.toBe(b!.id);
    expect(r.model.get().shots.map((p) => p.id)).toEqual([a!.id, b!.id]);
  });

  it('takes one picture at a time, so a finger that taps twice makes one', async () => {
    const r = rig({ held: true });
    const first = r.camera.take();
    expect(r.camera.taking).toBe(true);
    expect(await r.camera.take()).toBeNull();
    r.release();
    expect(await first).not.toBeNull();
    expect(r.camera.taking).toBe(false);
    expect(r.model.get().shots).toHaveLength(1);
    expect(r.noted).toEqual(['photos']);
  });

  it('answers the tap when the screen has no picture, and can be tried again', async () => {
    const r = rig();
    r.next.frame = null;
    expect(await r.camera.take()).toBeNull();
    expect(r.camera.taking).toBe(false);
    expect(r.missed.count, 'the player is told to tap again').toBe(1);
    expect(r.noted).toEqual([]);
    expect(r.taken).toEqual([]);
    r.next.frame = FRAME;
    expect(await r.camera.take()).not.toBeNull();
    expect(r.missed.count).toBe(1);
  });

  it('asks the screen a second time before it gives up, so a slow moment is not a lost tap', async () => {
    const r = rig();
    r.next.frame = null;
    await r.camera.take();
    expect(r.asked.count).toBe(2);
  });

  it('keeps the picture when only the first try had nothing, and says nothing', async () => {
    const model = new PhotosModel(emptyPhotos(), null, new Clock());
    const answers: (Frame | null)[] = [null, FRAME];
    let missed = 0;
    const camera = new Camera({
      model,
      shoot: () => Promise.resolve(answers.shift() ?? null),
      place: () => 'forest',
      now: () => 1_700_000_000_000,
      random: () => 0.5,
      taken: () => {},
      note: () => {},
      missed: () => missed++,
    });
    expect(await camera.take()).not.toBeNull();
    expect(model.get().shots).toHaveLength(1);
    expect(missed).toBe(0);
  });

  it('does not tell a finger that tapped twice that the second tap missed', async () => {
    const r = rig({ held: true });
    const first = r.camera.take();
    expect(await r.camera.take()).toBeNull();
    expect(r.missed.count).toBe(0);
    r.release();
    await first;
    expect(r.missed.count).toBe(0);
  });

  it('does not keep a picture the album could not read back', async () => {
    const r = rig();
    r.next.frame = { image: 'not a picture', w: 640, h: 296 };
    expect(await r.camera.take()).toBeNull();
    r.next.frame = { ...FRAME, w: 3 };
    expect(await r.camera.take()).toBeNull();
    expect(r.missed.count, 'each of them is answered').toBe(2);
    r.next.frame = FRAME;
    r.model.set(emptyPhotos());
    expect(r.model.get().shots).toEqual([]);
    expect(r.noted).toEqual([]);
  });

  it('lets the oldest go when the album is full, and still counts every picture', async () => {
    const r = rig();
    for (let i = 0; i < MAX_PHOTOS + 3; i++) await r.camera.take();
    expect(r.model.get().shots).toHaveLength(MAX_PHOTOS);
    expect(r.noted).toHaveLength(MAX_PHOTOS + 3);
  });
});

describe('keeping a drawing', () => {
  const DRAWN: Frame = { image: `${JPEG}AAAA`, w: 640, h: 296 };

  it('keeps it as a new picture beside the old one, in the place the old one was taken, and counts a drawing', async () => {
    const r = rig({ place: 'forest' });
    const first = await r.camera.take();
    const drawn = r.camera.keepDrawing(DRAWN, first!.place);
    expect(drawn).toMatchObject({ place: 'forest', image: DRAWN.image, w: 640, h: 296 });
    expect(drawn!.id).not.toBe(first!.id);
    expect(drawn!.at).toBeGreaterThan(first!.at);
    expect(r.model.get().shots).toEqual([first, drawn]);
    expect(r.noted, 'a drawing is not a picture taken').toEqual(['photos', 'doodles']);
    expect(r.taken, 'and no print flies to the corner for it').toEqual([first]);
  });

  it('leaves the picture it was drawn on as it was', async () => {
    const r = rig();
    const first = await r.camera.take();
    const before = r.model.get().shots[0]!.image;
    r.camera.keepDrawing(DRAWN, first!.place);
    expect(r.model.get().shots[0]!.image).toBe(before);
  });

  it('does not keep what the album could not read back', async () => {
    const r = rig();
    await r.camera.take();
    expect(r.camera.keepDrawing({ image: 'not a picture', w: 640, h: 296 }, 'forest')).toBeNull();
    expect(r.camera.keepDrawing({ ...DRAWN, w: 3 }, 'forest')).toBeNull();
    expect(r.camera.keepDrawing(DRAWN, 'Not A Place!')).toBeNull();
    expect(r.model.get().shots).toHaveLength(1);
    expect(r.noted).toEqual(['photos']);
  });

  it('is a new picture like any other, so it can be put away and the oldest makes room when the album is full', async () => {
    const r = rig();
    for (let i = 0; i < MAX_PHOTOS; i++) await r.camera.take();
    const oldest = r.model.get().shots[0]!;
    const drawn = r.camera.keepDrawing(DRAWN, 'forest');
    expect(r.model.get().shots).toHaveLength(MAX_PHOTOS);
    expect(r.model.get().shots.some((p) => p.id === oldest.id)).toBe(false);
    r.camera.putAway(drawn!.id);
    expect(r.model.get().shots.some((p) => p.id === drawn!.id)).toBe(false);
    expect(r.noted.at(-1)).toBe('doodles');
  });
});

describe('putting a picture away', () => {
  it('takes it out of the album and keeps it out', async () => {
    const r = rig();
    const a = await r.camera.take();
    const b = await r.camera.take();
    r.camera.putAway(a!.id);
    expect(r.model.get().shots.map((p) => p.id)).toEqual([b!.id]);
    expect(r.model.get().gone).toEqual([a!.id]);
  });

  it('does not take the sticker back that the picture earned', async () => {
    const r = rig();
    const a = await r.camera.take();
    r.camera.putAway(a!.id);
    expect(r.noted).toEqual(['photos']);
  });

  it('does nothing for a picture that is not there', async () => {
    const r = rig();
    await r.camera.take();
    const before = r.model.get();
    r.camera.putAway('nothere1');
    expect(r.model.get()).toBe(before);
  });
});

describe('the name of a picture', () => {
  it('is lower case letters and digits, made from when it was taken', () => {
    expect(nameOf(1_700_000_000_000, () => 0.5)).toMatch(/^[a-z0-9]{6,20}$/);
    expect(nameOf(0, () => 0)).toBe('000000');
  });

  it('differs when the moment or the draw differs', () => {
    expect(nameOf(1000, () => 0.1)).not.toBe(nameOf(1001, () => 0.1));
    expect(nameOf(1000, () => 0.1)).not.toBe(nameOf(1000, () => 0.7));
  });
});
