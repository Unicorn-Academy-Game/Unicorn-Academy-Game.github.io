import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForPointer, type PointerInput, type PointerSink } from './pointer';

/**
 * The page hears a finger when it gets round to it, and on a slow device that can be a good while
 * after the finger did it: a long frame, a sound being decoded, a picture going to the graphics
 * card. What a finger did is told by when the browser says it did it. These play events whose times
 * and whose hearing are apart, the way they are on a busy device.
 */

/**
 * What the page's own clock says. The listener asks it for the time of anything that has none of
 * its own.
 */
let clock = 0;
let heard: PointerInput | null = null;

/**
 * A stand for the page that the listener asks, with a canvas that is 800 by 400 on the screen and
 * drawn at the same size.
 */
function stage() {
  const canvas = Object.assign(new EventTarget(), {
    width: 800,
    height: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
    setPointerCapture: () => {},
  });
  const scene = {
    game: { canvas },
    input: { enabled: true },
    cameras: { main: { getWorldPoint: (x: number, y: number) => ({ x, y }) } },
  };
  return { canvas, scene };
}

interface Said {
  id?: number;
  type: 'pointerdown' | 'pointermove' | 'pointerup';
  x: number;
  y: number;
  /** When the browser says the finger did it. */
  at: number;
  primary?: boolean;
}

/**
 * An event the way the browser makes it, said to the canvas at the time that `clock` says it now
 * is.
 */
function say(canvas: EventTarget, s: Said): void {
  const event = new Event(s.type);
  Object.defineProperties(event, {
    pointerId: { value: s.id ?? 1 },
    pointerType: { value: 'touch' },
    isPrimary: { value: s.primary ?? true },
    button: { value: 0 },
    buttons: { value: s.type === 'pointerup' ? 0 : 1 },
    clientX: { value: s.x },
    clientY: { value: s.y },
    timeStamp: { value: s.at },
  });
  canvas.dispatchEvent(event);
}

function listen() {
  const { canvas, scene } = stage();
  const said = { taps: [] as { x: number; y: number }[] };
  const sink: PointerSink = {
    thingAt: () => false,
    tap: (at) => said.taps.push(at),
    lead: () => {},
    release: () => {},
  };
  heard = listenForPointer(scene as never, sink);
  return { canvas, said };
}

beforeEach(() => {
  clock = 0;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  heard?.stop();
  heard = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a tap that the page is slow to hear', () => {
  it('is a tap on open ground when the finger lifted soon, though the lift was heard long after', () => {
    const { canvas, said } = listen();
    clock = 1000;
    say(canvas, { type: 'pointerdown', x: 300, y: 200, at: 1000 });
    // The page was busy and heard the lift at 1400, when the finger had lifted at 1060.
    clock = 1400;
    say(canvas, { type: 'pointerup', x: 300, y: 200, at: 1060 });
    expect(said.taps).toEqual([{ x: 300, y: 200 }]);
  });

  it('is not a tap when the finger stayed down, though the lift was heard the moment it happened', () => {
    const { canvas, said } = listen();
    clock = 1000;
    say(canvas, { type: 'pointerdown', x: 300, y: 200, at: 1000 });
    clock = 1600;
    say(canvas, { type: 'pointerup', x: 300, y: 200, at: 1600 });
    expect(said.taps).toEqual([]);
  });

  it('is a tap from a second finger over one that rests, when the lift was heard long after', () => {
    const { canvas, said } = listen();
    clock = 1000;
    say(canvas, { type: 'pointerdown', id: 1, x: 100, y: 100, at: 1000 });
    clock = 2100;
    say(canvas, { type: 'pointerdown', id: 2, primary: false, x: 600, y: 300, at: 2100 });
    clock = 2500;
    say(canvas, { type: 'pointerup', id: 2, primary: false, x: 600, y: 300, at: 2160 });
    expect(said.taps).toEqual([{ x: 600, y: 300 }]);
  });

  it('goes by the clock of the page when the time of an event is not one that can be used', () => {
    // Nothing, a time from another clock (the date in milliseconds), and a time that has not come.
    for (const at of [0, 1_760_000_000_000, 9_000_000]) {
      const { canvas, said } = listen();
      clock = 1000;
      say(canvas, { type: 'pointerdown', x: 300, y: 200, at });
      clock = 1060;
      say(canvas, { type: 'pointerup', x: 300, y: 200, at });
      expect(said.taps, `a time of ${at}`).toEqual([{ x: 300, y: 200 }]);
      heard?.stop();
    }
  });
});
