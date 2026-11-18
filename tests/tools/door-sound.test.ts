import { describe, expect, it } from 'vitest';
import { rand, SR, seedOf } from '../../tools/audio/dsp';
import { creak } from '../../tools/audio/sfx/kit';
import { doorClose, doorOpen } from '../../tools/audio/sfx/objects';

/**
 * How much of what changes in a sound's loudness changes between 30 and 100 times a second, which
 * is how fast a frog's throat and a creaking hinge pulse. A child heard the first door's creak as a
 * frog saying ribbit, so the door is held to a sound that does not pulse at that rate.
 */
function croak(x: Float32Array): number {
  const hop = Math.round(SR / 1000);
  const env: number[] = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < hop; j++) sum += Math.abs(x[i + j]!);
    env.push(sum / hop);
  }
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const moving = env.map((v) => v - mean);
  let band = 0;
  let all = 0;
  for (let f = 4; f <= 300; f++) {
    let re = 0;
    let im = 0;
    moving.forEach((v, n) => {
      re += v * Math.cos((2 * Math.PI * f * n) / 1000);
      im -= v * Math.sin((2 * Math.PI * f * n) / 1000);
    });
    const power = re * re + im * im;
    all += power;
    if (f >= 30 && f <= 100) band += power;
  }
  return band / all;
}

describe('the sound of a door opening', () => {
  it('does not pulse like a croak, which a creak does', () => {
    const hinge = creak(0.55, rand(seedOf('hinge')), { rate: [46, 78], pitch: [620, 1150] });
    expect(croak(hinge), 'the measure can tell a creak from other sounds').toBeGreaterThan(0.3);
    expect(croak(doorOpen())).toBeLessThan(0.15);
  });

  it('is short enough to finish while the room fades in, and loud enough to hear', () => {
    const door = doorOpen();
    expect(door.length / SR).toBeGreaterThan(0.6);
    expect(door.length / SR).toBeLessThan(2);
    expect(Math.max(...door.map(Math.abs))).toBeGreaterThan(0.2);
  });

  it('is not the sound of the door closing', () => {
    expect(doorOpen().length).not.toBe(doorClose().length);
  });
});
