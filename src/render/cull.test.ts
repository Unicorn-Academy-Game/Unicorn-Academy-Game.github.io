import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { type Bounds, Culler } from './cull';

/** An image that only remembers what it was told to do. */
const image = () => {
  const setVisible = vi.fn();
  return { fake: { setVisible } as unknown as Phaser.GameObjects.Image, setVisible };
};

const box = (left: number, top: number, right: number, bottom: number): Bounds => ({ left, top, right, bottom });
const VIEW = box(100, 100, 300, 200);

describe('scenery that is out of view', () => {
  it('is drawn until something has looked, so a new map never starts with a gap', () => {
    const culler = new Culler();
    const { fake, setVisible } = image();
    culler.add(fake, box(5000, 5000, 5010, 5010));
    expect(culler.hidden()).toEqual([]);
    expect(setVisible).not.toHaveBeenCalled();
  });

  it.each([
    ['left of the view', box(0, 120, 99, 180)],
    ['right of the view', box(301, 120, 400, 180)],
    ['above the view', box(150, 0, 250, 99)],
    ['below the view', box(150, 201, 250, 300)],
    ['far from the view in both ways', box(1000, 1000, 1100, 1100)],
  ])('is hidden when it is %s', (_where, at) => {
    const culler = new Culler();
    const { fake, setVisible } = image();
    culler.add(fake, at);
    culler.update(VIEW);
    expect(setVisible).toHaveBeenCalledExactlyOnceWith(false);
    expect(culler.hidden()).toEqual([fake]);
  });
});

describe('scenery that is in view', () => {
  it.each([
    ['inside the view', box(150, 120, 250, 180)],
    ['around the view', box(0, 0, 1000, 1000)],
    ['over the left edge', box(50, 120, 150, 180)],
    ['over the bottom right corner', box(250, 150, 350, 250)],
    ['touching the left edge from outside', box(0, 120, 100, 180)],
    ['touching the bottom edge from outside', box(150, 200, 250, 300)],
  ])('stays drawn when it is %s', (_where, at) => {
    const culler = new Culler();
    const { fake, setVisible } = image();
    culler.add(fake, at);
    culler.update(VIEW);
    expect(setVisible).not.toHaveBeenCalled();
    expect(culler.hidden()).toEqual([]);
  });
});

describe('a view that moves', () => {
  it('brings scenery back as it comes into view, and hides it again as it leaves', () => {
    const culler = new Culler();
    const { fake, setVisible } = image();
    culler.add(fake, box(500, 120, 560, 180));
    culler.update(VIEW);
    expect(setVisible).toHaveBeenLastCalledWith(false);
    culler.update(box(300, 100, 520, 200));
    expect(setVisible).toHaveBeenLastCalledWith(true);
    expect(culler.hidden()).toEqual([]);
    culler.update(box(700, 100, 900, 200));
    expect(setVisible).toHaveBeenLastCalledWith(false);
    expect(setVisible).toHaveBeenCalledTimes(3);
  });

  it('tells the engine only about what changed, however many times it looks', () => {
    const culler = new Culler();
    const images = Array.from({ length: 50 }, () => image());
    images.forEach((one, i) => {
      culler.add(one.fake, box(i * 100, 0, i * 100 + 50, 50));
    });
    culler.update(box(0, 0, 400, 100));
    const written = images.map((one) => one.setVisible.mock.calls.length);
    expect(written.reduce((a, b) => a + b, 0)).toBe(45);
    for (let looks = 0; looks < 5; looks++) culler.update(box(0, 0, 400, 100));
    expect(images.map((one) => one.setVisible.mock.calls.length)).toEqual(written);
  });

  it('keeps count of everything it was given, shown or not', () => {
    const culler = new Culler();
    culler.add(image().fake, box(150, 120, 250, 180));
    culler.add(image().fake, box(0, 0, 10, 10));
    culler.add(image().fake, box(900, 900, 910, 910));
    culler.update(VIEW);
    expect(culler.count).toBe(3);
    expect(culler.hidden()).toHaveLength(2);
  });
});
