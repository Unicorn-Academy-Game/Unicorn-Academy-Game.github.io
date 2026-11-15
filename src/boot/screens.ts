import { MANOR_CODE } from '../content/manor';
import { lineOf } from '../content/unicorns';
import { isQuiet, isWonder, WONDERS } from '../content/wonders';
import type { GameController } from '../game/controller';
import { wordSaid } from '../learning';
import { drawPortraits } from '../render/portraits';
import { drawProduceIcons, type ProduceIcons } from '../render/produce-icons';
import { CodePad } from '../ui/code-pad';
import type { PortraitSource } from '../ui/finder';
import type { OverlayDeps } from '../ui/overlay';
import { WonderOverlay } from '../ui/wonder';
import { SpriteBank } from '../wonder/engine/bank';
import { SILENT } from '../wonder/sound';
import { randomSeed } from './browser';
import type { Graphics } from './graphics';
import type { InputGate } from './input';
import { type Sound, WORLD_UNDER_A_GAME } from './sound';

export interface Screens {
  portraits: PortraitSource;
  produceIcons: ProduceIcons;
  wonders: WonderOverlay;
  pad: CodePad;
}

interface ScreensDeps {
  overlay: OverlayDeps;
  graphics: Graphics;
  sound: Sound;
  controller: GameController;
  gate: InputGate;
}

/**
 * The pictures the interface draws from the world's sheets, and the two screens that take the whole
 * game: the playground games and the code pad.
 */
export function makeScreens({ overlay, graphics, sound, controller, gate }: ScreensDeps): Screens {
  const { scene, manifest, profile } = graphics;
  const { engine, audio, synth, voice } = sound;
  const portraits = drawPortraits(scene, manifest);
  const produceIcons = drawProduceIcons(scene, manifest);
  // The playground games take the whole screen from the toy that was tapped, and the world rests
  // behind them until they are done.
  const bank = new SpriteBank(manifest, (key) =>
    scene.textures.exists(key) ? (scene.textures.get(key).getSourceImage() as CanvasImageSource) : undefined,
  );
  const wonders = new WonderOverlay({
    ...overlay,
    bank: () => bank,
    sound: () => synth ?? SILENT,
    quality: profile.wonderQuality,
    herd: () => ['wildstar', ...lineOf(controller.world.persistent.recruited)],
    seed: randomSeed,
    onOpen: (game) => {
      gate.take();
      // The world's music slips under the game as the picture opens, and the game plays its own. A
      // game that is heard on its own has all of it turned off.
      engine?.duck(isQuiet(game) ? 0 : WORLD_UNDER_A_GAME);
    },
    onShown: () => controller.sleep(),
    onClosing: () => {
      controller.wake();
      engine?.duck(1);
    },
    onClose: ({ game, finished }) => {
      gate.give();
      engine?.duck(1);
      const next = game && isWonder(game) ? WONDERS[game].continueTo : undefined;
      if (finished && next && controller.world.map.id !== next.mapId) void controller.travel(next);
    },
  });
  // The word for the manor door. It has the whole game while it is up, and what is typed is always
  // on the screen.
  const pad = new CodePad({
    ...overlay,
    attempt: (door, typed) => controller.tryCode(door, typed),
    sound: (id, gain) => audio?.cheer(id, gain),
    letter: (letter) => voice.letter(letter),
    onOpen: gate.take,
    onClose: gate.give,
    // The keys said their sounds. The word is said as a word, the way it is said, once the door has
    // it, and goes into the door as a scene of its own from the middle of the pad.
    onSolved: () => {
      voice.say(wordSaid(MANOR_CODE).clips);
      wonders.open({ game: 'manor-word', look: undefined, at: { x: innerWidth / 2, y: innerHeight * 0.4 } });
    },
  });
  return { portraits, produceIcons, wonders, pad };
}
