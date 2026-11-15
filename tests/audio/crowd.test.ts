import { describe, expect, it } from 'vitest';
import { Crowd, WEIGHTS } from '../../src/audio/synth/crowd';
import { FX_NAMES, VOICE_NAMES } from '../../src/wonder/sound';

describe('the crowd of sounds', () => {
  it('lets sounds that are spread out play at full strength', () => {
    const crowd = new Crowd();
    for (let i = 0; i < 50; i++) expect(crowd.admit(i * 1.5, 1)).toBe(1);
  });

  it('lets the first few sounds of a burst through untouched and turns the later ones down', () => {
    const crowd = new Crowd(3.2, 0.4);
    const gains = Array.from({ length: 12 }, () => crowd.admit(0, 1));
    expect(gains.slice(0, 3)).toEqual([1, 1, 1]);
    expect(gains[3]).toBeLessThan(1);
    for (let i = 1; i < gains.length; i++) expect(gains[i]!).toBeLessThanOrEqual(gains[i - 1]!);
    expect(gains[11]!).toBeGreaterThanOrEqual(0.3);
  });

  it('never turns a sound down past its floor, and a sound that matters has a higher one', () => {
    const crowd = new Crowd();
    for (let i = 0; i < 100; i++) crowd.admit(0, 1);
    expect(crowd.admit(0, 1)).toBeCloseTo(0.3, 6);
    expect(crowd.admit(0, 1, 0.7)).toBeCloseTo(0.7, 6);
  });

  it('forgets a burst as its sounds die away, so the next sound a little later is heard in full again', () => {
    const crowd = new Crowd(3.2, 0.4);
    for (let i = 0; i < 20; i++) crowd.admit(0, 1);
    expect(crowd.admit(0.05, 1)).toBeLessThan(0.6);
    expect(crowd.admit(4, 1)).toBe(1);
    expect(crowd.weight).toBeLessThan(2);
  });

  it('settles at the floor for a long crowd and does not go under it, however long it goes on', () => {
    const crowd = new Crowd(3.2, 0.4);
    // One heavy sound every 50 ms for two seconds, such as the finale of a show.
    const gains: number[] = [];
    for (let i = 0; i < 40; i++) gains.push(crowd.admit(i * 0.05, 1));
    const late = gains.slice(-10);
    expect(Math.min(...late)).toBeGreaterThanOrEqual(0.3);
    expect(Math.max(...late) - Math.min(...late)).toBeLessThan(0.05);
  });

  it('gives a new sound only the room that is left, so the pile cannot go far over what it holds', () => {
    const crowd = new Crowd(3.2, 0.4);
    crowd.admit(0, 2.5);
    // 0.7 of the room is left, so a sound of weight 1 gets 0.7 of its strength and fills it.
    expect(crowd.admit(0, 1)).toBeCloseTo(0.7, 6);
    expect(crowd.weight).toBeCloseTo(3.2, 6);
    let heaviest = 0;
    for (let i = 0; i < 200; i++) {
      crowd.admit(0, 1, 0);
      heaviest = Math.max(heaviest, crowd.weight);
    }
    expect(heaviest).toBeLessThan(3.3);
  });

  it('keeps what a burst of different sounds adds up to under what a speaker takes', () => {
    const crowd = new Crowd(3.2, 0.4);
    let sum = 0;
    for (let i = 0; i < 30; i++) {
      const weight = i % 3 === 0 ? 1 : 0.5;
      sum += weight * crowd.admit(i * 0.01, weight);
    }
    // What was let in is a little over the capacity at most, however many were asked for.
    expect(sum).toBeLessThan(3.2 + 30 * 0.3);
    expect(sum).toBeLessThan(30 * 0.66);
  });

  it('copes with times out of order, as when sounds are scheduled ahead', () => {
    const crowd = new Crowd();
    expect(crowd.admit(5, 1)).toBe(1);
    expect(crowd.admit(1, 1)).toBe(1);
    expect(Number.isFinite(crowd.weight)).toBe(true);
    for (let i = 0; i < 30; i++) crowd.admit(0.5, 1);
    expect(crowd.admit(0.2, 1)).toBeLessThan(1);
  });
});

describe('what each sound weighs', () => {
  it('is known for every sound and every instrument, and a firework is the heaviest', () => {
    for (const name of [...FX_NAMES, ...VOICE_NAMES]) {
      expect(WEIGHTS[name], name).toBeGreaterThan(0);
      expect(WEIGHTS[name], name).toBeLessThanOrEqual(1);
    }
    const heaviest = Math.max(...Object.values(WEIGHTS));
    expect(WEIGHTS.boom).toBe(heaviest);
  });

  it('counts a twinkle or a tap as hardly anything', () => {
    expect(WEIGHTS.twinkle).toBeLessThan(0.2);
    expect(WEIGHTS.tap).toBeLessThan(0.3);
    expect(WEIGHTS.hat).toBeLessThan(0.2);
  });
});
