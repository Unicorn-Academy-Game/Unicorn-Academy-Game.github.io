import { Rng } from '../domain/rng';
import type { SoundFamilyId } from '../shared/audio';
import { type Quality, Stage } from '../wonder/engine/stage';
import { CLIMB_SECONDS, ManorLift, OPEN_SECONDS, SHUT_SECONDS } from '../wonder/games/manor-lift';
import { SILENT, type WonderSound } from '../wonder/sound';
import { h } from './dom';

export interface RideDeps {
  /** Puts the lift on the page. It stays over everything until the ride is done. */
  mount: (node: HTMLElement) => void;
  sound: (id: SoundFamilyId, gain?: number) => void;
  calm: () => boolean;
  /** What the lift's own hum, doors and floor bells are played through. */
  wonderSound: () => WonderSound;
  /** The quality the picture starts at, which the device's profile sets. */
  quality: Quality;
}

const FADE_MS = 440;
/**
 * How long the ride may be late before it goes on without its picture, so a tab that stopped
 * drawing can never keep the doors shut.
 */
const SLACK_MS = 2500;

export interface RideHandle {
  /** The doors are shut and the lift has gone as far as it goes, and a ding has said so. */
  arrived: Promise<void>;
  /** Opens the doors on whatever is behind them, and takes the lift away when they are open. */
  leave(): Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));

/**
 * A ride in the golden lift, seen from inside: the doors shut over the place the player is leaving,
 * the lamps count the floors, and the doors open on the next one. The picture is the lift scene on
 * its own stage, which has a hole where the doorway is. It is short, and it is held until the next
 * place is ready, so it plays whatever the next place's loading does. If the picture cannot be
 * drawn, or stops being drawn, the ride is timed by the clock instead and the doors still open:
 * they are never left in a lift that does not move.
 */
export function ride(deps: RideDeps, direction: 'up' | 'down'): RideHandle {
  const stageEl = h('div', { class: 'ride-stage' });
  const node = h(
    'div',
    { class: 'ride', 'data-direction': direction, 'data-calm': String(deps.calm()), 'aria-hidden': 'true' },
    stageEl,
  );
  deps.mount(node);

  let stage: Stage | null = null;
  let lift: ManorLift | null = null;
  let landed: () => void = () => {};
  let opened: () => void = () => {};
  const arrived = new Promise<void>((done) => (landed = done));
  const parted = new Promise<void>((done) => (opened = done));
  // The lift rings its own bell when its picture is playing and there is a synth to ring it with.
  // Otherwise the recorded one does, once.
  const sound = deps.wonderSound();
  let bell = sound !== SILENT;
  const ding = (): void => {
    if (bell) return;
    bell = true;
    deps.sound('lift-ding', 0.9);
  };

  try {
    stage = new Stage({ host: stageEl, calm: deps.calm(), quality: deps.quality, transparent: true });
    lift = new ManorLift(
      {
        bank: null,
        rng: new Rng(Date.now() & 0xffff),
        calm: deps.calm(),
        look: direction,
        herd: [],
        sound,
        from: { x: 0.5, y: 0.5 },
        onStar: () => {},
        onFinale: () => {},
        onAfter: () => {},
      },
      direction,
      {
        held: true,
        arrived: () => {
          ding();
          landed();
        },
        opened: () => opened(),
      },
    );
    stage.play(lift);
    stage.start();
    lift.celebrate();
  } catch (error) {
    console.error(error);
    lift = null;
    bell = false;
  }

  // The same ride by the clock, for a picture that is not there or has stopped: it gives way to the
  // picture's own arrival if that comes first.
  const byClock = (SHUT_SECONDS + CLIMB_SECONDS) * 1000;
  void wait(lift ? byClock + SLACK_MS : byClock).then(() => {
    ding();
    landed();
  });

  return {
    arrived,
    async leave() {
      await arrived;
      lift?.open();
      await Promise.race([parted, wait(OPEN_SECONDS * 1000 + SLACK_MS)]);
      node.dataset.leaving = 'true';
      await wait(FADE_MS);
      stage?.dispose();
      node.remove();
    },
  };
}
