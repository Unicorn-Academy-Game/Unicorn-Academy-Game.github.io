import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT, sourceFiles, strip } from './source';

/**
 * The game's voice is a set of recorded clips that ship with it. A voice that the device makes up
 * is a different voice on every phone, and on some there is none, so the game never asks the device
 * to speak. The test browsers carry a tripwire for the same thing (`tools/qa/silence.ts` keeps what
 * the page tries to say), and this is the check that stops it being written at all.
 */
describe('the voice', () => {
  it('is never the device voice', () => {
    const device = /\bspeechSynthesis\b|\bSpeechSynthesisUtterance\b|\bSpeechSynthesisVoice\b/;
    for (const file of sourceFiles('src')) {
      const { code } = strip(readFileSync(`${ROOT}/${file}`, 'utf8'));
      expect(device.test(code), `${file} asks the device to speak`).toBe(false);
    }
  });
});
