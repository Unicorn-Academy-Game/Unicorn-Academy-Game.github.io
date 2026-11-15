import { describe, expect, it } from 'vitest';
import { WonderSynth } from '../../src/audio/synth/synth';
import { fakeRig } from './web-audio-fake';

/**
 * What a child hears when a game asks for more than the synth keeps going at once. Measured in a
 * browser while a finger taps eight times a second (Party Time and Jewel Fountain), the synth
 * refused a sixth of what was asked for and a third of the band's notes, and while four fingers
 * hammered it refused four in five. A touch that has no sound and a tune with holes in it is what a
 * child calls the sound breaking up.
 */

const seeded = (): (() => number) => {
  let a = 1;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
};

const make = () => {
  const rig = fakeRig();
  return { rig, synth: new WonderSynth(() => rig.graph(), seeded()) };
};

describe('the wonder synth, when a lot is sounding', () => {
  it('still makes the sound the player has just asked for, however much is already sounding', () => {
    const { rig, synth } = make();
    const missing: string[] = [];
    for (let i = 0; i < 120; i++) {
      rig.ctx.currentTime = i * 0.03;
      const before = rig.ctx.count('oscillator');
      synth.fx('twinkle', { pitch: i });
      if (rig.ctx.count('oscillator') === before) missing.push(`twinkle ${i} at ${(i * 0.03).toFixed(2)} s`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps the band playing while a child hammers the screen', () => {
    const { rig, synth } = make();
    const missing: string[] = [];
    for (let i = 0; i < 400; i++) {
      rig.ctx.currentTime = i * 0.02;
      synth.fx('coin', { pitch: (i % 17) - 8, step: i % 5 });
      if (i % 3 !== 0) continue;
      const before = rig.ctx.count('oscillator');
      synth.note('bell', 60 + (i % 12), { bus: 'music' });
      if (rig.ctx.count('oscillator') === before) missing.push(`note at ${(i * 0.02).toFixed(2)} s`);
    }
    expect(missing).toEqual([]);
  });

  it('does not stop for ever because a browser never said that sounds had ended', () => {
    const { rig, synth } = make();
    for (let i = 0; i < 60; i++) {
      rig.ctx.currentTime = i * 0.03;
      synth.fx('twinkle', { pitch: i });
    }
    // Ten seconds on every one of them is over, and the browser has not said so for any of them.
    rig.ctx.currentTime = 12;
    const before = rig.ctx.count('oscillator');
    synth.fx('tap');
    expect(rig.ctx.count('oscillator')).toBeGreaterThan(before);
  });
});
