import { describe, expect, it } from 'vitest';
import { WonderSynth } from '../../src/audio/synth/synth';
import { FX_NAMES, VOICE_NAMES } from '../../src/wonder/sound';
import { type FakeRig, fakeParam, fakeRig } from './web-audio-fake';

/**
 * A page that is held up for a moment between being asked for a sound and building it makes the
 * sound late. Chromium moves the start of a curve that is already late to now, and the events set
 * after it, from the time it was meant to start, then fall inside the curve and are refused. A
 * sound that is made in a game that stutters, on a device that is slow, must still sound, a little
 * late, and never throw into the game. The parameters of this fake refuse what Chromium refuses.
 */

const BASE = 10;
/** The kinds of node that stay for the next sound, as in the synth's own tests. */
const KEPT = new Set(['destination', 'bus-effects', 'bus-music', 'convolver', 'shaper']);

const seeded = (): (() => number) => {
  let a = 1;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

/** A synth on a context that refuses what a browser refuses, with its clock at `BASE`. */
function strict(): { rig: FakeRig; synth: WonderSynth; late: (seconds: number) => void } {
  const rig = fakeRig();
  rig.ctx.strict = true;
  let behind = 0;
  Object.defineProperty(rig.ctx, 'currentTime', {
    configurable: true,
    // The first reading after `late` is of a clock that was read before the page was held up. Every
    // other is of the clock now.
    get: () => {
      const read = BASE - behind;
      behind = 0;
      return read;
    },
  });
  return {
    rig,
    synth: new WonderSynth(() => rig.graph(), seeded()),
    late: (seconds) => {
      behind = seconds;
    },
  };
}

const leaked = (rig: FakeRig): string[] =>
  rig.ctx.nodes.filter((n) => !KEPT.has(n.kind) && !n.disconnected).map((n) => n.kind);

describe('what the fake context refuses, as Chromium does', () => {
  const curve = new Float32Array([0, 0.5, 1]);
  const param = (clock: () => number): AudioParam => fakeParam(0, clock) as unknown as AudioParam;

  it('refuses an event that falls inside a curve, and at the moment it starts, but not at the moment it ends', () => {
    const p = param(() => 0);
    p.setValueCurveAtTime(curve, 1, 0.5);
    expect(() => p.setValueAtTime(1, 1.25)).toThrow(/overlaps/);
    expect(() => p.setValueAtTime(1, 1)).toThrow(/overlaps/);
    expect(() => p.setValueAtTime(1, 1.5)).not.toThrow();
  });

  it('moves a curve that starts in the past to start now, so what was set at its old end now falls inside it', () => {
    const late = param(() => 5);
    late.setValueCurveAtTime(curve, 4.9, 0.45);
    expect(() => late.setValueAtTime(1, 4.9 + 0.45)).toThrow(/overlaps/);
    const onTime = param(() => 5);
    onTime.setValueCurveAtTime(curve, 5.05, 0.45);
    expect(() => onTime.setValueAtTime(1, 5.05 + 0.45)).not.toThrow();
  });

  it('refuses a second curve that begins before the first has ended, and a time that is not a number from nought up', () => {
    const p = param(() => 0);
    p.setValueCurveAtTime(curve, 1, 0.5);
    expect(() => p.setValueCurveAtTime(curve, 1.4, 0.5)).toThrow(/overlaps/);
    expect(() => p.setValueCurveAtTime(curve, 1.5, 0.5)).not.toThrow();
    expect(() => p.setValueAtTime(1, -1)).toThrow(RangeError);
    expect(() => p.setValueAtTime(1, Number.NaN)).toThrow(RangeError);
  });
});

describe('a sound that is asked for and then built late', () => {
  it('is made, from now, whatever the sound is and however late it is', () => {
    const failures: string[] = [];
    const sounds = [
      ...FX_NAMES.map((name) => ({ label: name, play: (s: WonderSynth) => s.fx(name, { size: 0.5, step: 2 }) })),
      ...VOICE_NAMES.map((voice) => ({ label: `note:${voice}`, play: (s: WonderSynth) => s.note(voice, 69) })),
    ];
    for (const late of [0.02, 0.3, 2]) {
      for (const { label, play } of sounds) {
        const { rig, synth, late: holdUp } = strict();
        holdUp(late);
        try {
          play(synth);
        } catch (error) {
          failures.push(`${label} ${late} s late: ${String(error)}`);
          continue;
        }
        if (synth.busy === 0) failures.push(`${label} ${late} s late: nothing was made`);
        for (const source of rig.ctx.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource')) {
          if (source.starts[0]! < BASE)
            failures.push(`${label} ${late} s late: a source was set to start at ${source.starts[0]}, before now`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('is not moved when it is not late', () => {
    const { rig, synth } = strict();
    synth.note('pad', 60, { delay: 0.25 });
    const pad = rig.ctx.nodes.filter((n) => n.kind === 'oscillator').map((n) => n.starts[0]!);
    expect(Math.min(...pad)).toBeCloseTo(BASE + 0.25 + 0.012, 9);
    const other = strict();
    other.synth.note('bell', 72);
    const bell = other.rig.ctx.nodes.filter((n) => n.kind === 'oscillator').map((n) => n.starts[0]!);
    expect(Math.min(...bell)).toBeCloseTo(BASE + 0.012, 9);
  });
});

describe('a sound that the browser refuses part of the way through', () => {
  /**
   * The page is held up while the sound is being built: the clock jumps when its first filter is
   * made.
   */
  function held(): ReturnType<typeof strict> {
    const set = strict();
    const { ctx } = set.rig;
    const made = ctx.createBiquadFilter;
    let jumped = false;
    ctx.createBiquadFilter = () => {
      if (!jumped) {
        jumped = true;
        Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => BASE + 0.2 });
      }
      return made();
    };
    return set;
  }

  it('is given up whole: nothing it made stays joined to the mix, it does not count as alive, and it does not throw into the game', () => {
    const { rig, synth } = held();
    expect(() => synth.note('pad', 60)).not.toThrow();
    expect(synth.busy).toBe(0);
    expect(synth.lost).toBe(1);
    expect(leaked(rig)).toEqual([]);
  });

  it('does not hide a mistake in a recipe: what was made is let go, and the mistake is thrown', () => {
    const { rig, synth } = strict();
    rig.ctx.createBiquadFilter = () => {
      throw new TypeError('a recipe asked for something that is not there');
    };
    expect(() => synth.note('pad', 60)).toThrow(TypeError);
    expect(synth.busy).toBe(0);
    expect(synth.lost).toBe(0);
    expect(leaked(rig)).toEqual([]);
  });

  it('leaves the next sound to be made as usual', () => {
    const { rig, synth } = held();
    synth.note('pad', 60);
    expect(synth.lost).toBe(1);
    Object.defineProperty(rig.ctx, 'currentTime', { configurable: true, get: () => BASE + 1 });
    synth.note('bell', 72);
    expect(synth.busy).toBe(1);
    expect(synth.lost).toBe(1);
    rig.ctx.finish();
    expect(synth.busy).toBe(0);
    expect(leaked(rig)).toEqual([]);
  });
});
