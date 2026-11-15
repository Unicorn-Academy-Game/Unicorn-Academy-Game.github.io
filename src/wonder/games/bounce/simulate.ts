import type { Bot } from './bots';
import type { Climb, Clock, Event } from './climb';

/** An event, and when in the climb it happened. */
export interface Happening {
  readonly time: number;
  readonly event: Event;
}

export interface Options {
  /** Beats a minute. */
  tempo?: number;
  /** Seconds a frame. */
  dt?: number;
  /** Called after every frame, to look at the climb as it goes. */
  each?: (climb: Climb) => void;
  /** Stops as soon as this says so about an event. */
  until?: (event: Event) => boolean;
}

/** The music's clock, for a steady tempo that began when the climb did. */
export const steady = (time: number, tempo: number): Clock => ({ beats: (time * tempo) / 60, seconds: 60 / tempo });

/** Plays a climb with a stand-in for `seconds`, and writes down everything that happened. */
export function simulate(climb: Climb, bot: Bot, seconds: number, options: Options = {}): Happening[] {
  const { tempo = 100, dt = 1 / 60, each, until } = options;
  const log: Happening[] = [];
  const end = climb.time + seconds;
  while (climb.time < end - 1e-9) {
    const touch = bot.act(climb, dt);
    if (touch) {
      if (touch.hold) climb.send(touch.x, touch.y, true);
      else {
        climb.touch(touch.x, touch.y);
        climb.release();
      }
    }
    climb.step(dt, steady(climb.time + dt, tempo));
    let stop = false;
    for (const event of climb.events) {
      log.push({ time: climb.time, event });
      if (until?.(event)) stop = true;
    }
    climb.events.length = 0;
    each?.(climb);
    if (stop) break;
  }
  return log;
}
