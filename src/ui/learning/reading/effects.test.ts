import { describe, expect, it } from 'vitest';
import type { Cue } from '../../../game/reading-ports';
import { effectsOf } from './effects';

const cue = <T extends Omit<Cue, 'n'>>(happening: T): T & { n: number } => ({ ...happening, n: 1 });

describe('what is to be seen of a cue', () => {
  it('pops a tile that was touched, pulses one touched again, and nudges one that was not next', () => {
    expect(effectsOf(cue({ kind: 'touched', at: 2 }))).toEqual([{ kind: 'pop', piece: 2 }]);
    expect(effectsOf(cue({ kind: 'again', at: 0 }))).toEqual([{ kind: 'pulse', piece: 0 }]);
    expect(effectsOf(cue({ kind: 'bounced', at: 3 }))).toEqual([{ kind: 'nudge', piece: 3 }]);
  });

  it('sweeps when the pieces join, and asks for the asking when once more was pressed', () => {
    expect(effectsOf(cue({ kind: 'joined' }))).toEqual([{ kind: 'join' }]);
    expect(effectsOf(cue({ kind: 'asked' }))).toEqual([{ kind: 'ask' }]);
  });

  it('lights each piece the voice says, when it says it, and the whole of a word that is said whole', () => {
    expect(
      effectsOf(
        cue({
          kind: 'voiced',
          marks: [
            { at: 0, after: 0.2, seconds: 0.4 },
            { at: 1, after: 0.7, seconds: 0.3 },
            { at: null, after: 1.2, seconds: 0.8 },
          ],
        }),
      ),
    ).toEqual([
      { kind: 'light', piece: 0, after: 0.2, seconds: 0.4 },
      { kind: 'light', piece: 1, after: 0.7, seconds: 0.3 },
      { kind: 'light', piece: null, after: 1.2, seconds: 0.8 },
    ]);
    expect(effectsOf(cue({ kind: 'voiced', marks: [] }))).toEqual([]);
  });
});
