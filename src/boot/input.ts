import type { GameController } from '../game/controller';
import { faults } from '../game/faults';
import { type KeyboardInput, listenForKeys } from '../input/keyboard';
import { listenForPointer, type PointerInput } from '../input/pointer';
import { browserFullscreen, type Fullscreen } from '../ui/fullscreen';
import type { Graphics } from './graphics';

/**
 * Whether the world hears the pointer and the keys. Something laid over the game takes them, and
 * gives them back when it goes.
 */
export interface InputGate {
  /**
   * Whatever was leading the unicorn lets go: a finger or a key held under the new screen would
   * never be heard to lift.
   */
  take(): void;
  give(): void;
}

export interface Input {
  pointer: PointerInput;
  keyboard: KeyboardInput;
  fullscreen: Fullscreen;
  gate: InputGate;
}

export function listenForInput(scene: Graphics['scene'], controller: GameController): Input {
  // A finger on the ground leads Wildstar for as long as it is down. A tap on something, or a quick
  // one on the ground, is a tap.
  const pointer = listenForPointer(scene, {
    thingAt: (at) => controller.thingAt(at),
    tap: (at) => controller.tap(at),
    lead: (css) => controller.lead(css),
    release: () => controller.release(),
    found: () => faults.repair('touch'),
  });
  const fullscreen = browserFullscreen();
  const keyboard = listenForKeys(
    {
      lead: (heading) => controller.leadWithKeys(heading),
      ...(fullscreen.supported ? { fullscreen: () => void fullscreen.toggle() } : {}),
    },
    () => scene.input.enabled,
  );
  const gate: InputGate = {
    take: () => {
      pointer.cancel();
      keyboard.release();
      scene.input.enabled = false;
    },
    give: () => {
      scene.input.enabled = true;
    },
  };
  return { pointer, keyboard, fullscreen, gate };
}
