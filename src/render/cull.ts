import type Phaser from 'phaser';

/** A rectangle in world units. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Keeps a fixed set of images shown only while the camera can see them. The engine draws every
 * visible object in the scene whether or not it is inside the view, so a map of three thousand
 * pieces of scenery costs three thousand images a frame to put about two hundred on the screen.
 */
export class Culler {
  private readonly things: Phaser.GameObjects.Image[] = [];
  private readonly left: number[] = [];
  private readonly top: number[] = [];
  private readonly right: number[] = [];
  private readonly bottom: number[] = [];
  private readonly shown: boolean[] = [];

  /**
   * Starts as shown, so an image that nothing has looked at yet is drawn and never missed. `at` is
   * the world area it covers.
   */
  add(image: Phaser.GameObjects.Image, at: Bounds): void {
    this.things.push(image);
    this.left.push(at.left);
    this.top.push(at.top);
    this.right.push(at.right);
    this.bottom.push(at.bottom);
    this.shown.push(true);
  }

  /**
   * Shows what touches `view` and hides the rest. Only what changed side is written to the engine.
   */
  update(view: Bounds): void {
    const { left, top, right, bottom } = view;
    for (let i = 0; i < this.things.length; i++) {
      const inside =
        this.right[i]! >= left && this.left[i]! <= right && this.bottom[i]! >= top && this.top[i]! <= bottom;
      if (inside === this.shown[i]) continue;
      this.shown[i] = inside;
      this.things[i]!.setVisible(inside);
    }
  }

  /** The images it is hiding now, for tests and reports. */
  hidden(): Phaser.GameObjects.Image[] {
    return this.things.filter((_, i) => !this.shown[i]);
  }

  get count(): number {
    return this.things.length;
  }
}
