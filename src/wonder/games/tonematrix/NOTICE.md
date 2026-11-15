# Notice for the tone matrix game

The tone matrix is a step sequencer adapted from [ToneMatrix Redux](https://github.com/lupine-dev/ToneMatrixRedux) at commit `5e30ab3`, copyright (c) Wolfy. ToneMatrix Redux is licensed under the GNU General Public License version 3 and is based on ToneMatrix by Audiotool.

## Licence

The files in this folder, `src/wonder/games/tone-matrix.ts`, and the art of the game in `src/wonder/games/tonematrix/art.ts` are licensed under `GPL-3.0-only`. The text is in `LICENSES/GPL-3.0-only.txt`. The rest of this repository is `AGPL-3.0-only`. Section 13 of each licence allows the two to be combined into one work. The terms of the GPL stay on the adapted files, and the network clause of the AGPL applies to the combination.

Every adapted file starts with an `SPDX-License-Identifier` line, the copyright line of the original, and the date it was changed (GPL section 5a).

The piano that opens the game in the world, the `ping` voice, the `piano-run` sound and the effect of the notes that leave the piano are this project's own work and stay under `AGPL-3.0-only`. The `ping` voice was written from the numbers of the original's sound, not from its code. So are the `kit` voice, the `sub` voice and the numbering of the drums (`src/audio/synth/kit.ts`, `src/audio/synth/instruments.ts` and `src/shared/kit.ts`), which are outside this folder and which the original has nothing like.

The About page of the game thanks Wolfy.

## What is taken from ToneMatrix Redux

- The grid of 16 by 16 tiles, 16 steps across and 16 notes down, one measure of 16 steps at 120 beats a minute.
- The pitch pattern of the rows: five notes to the octave, 2 3 2 2 3 semitones apart.
- How a stroke works: the first tile a finger touches decides whether the whole stroke paints or rubs out.
- How loud each note of a step is at the two ends: -10 dB for a lone note and -20 dB when all sixteen sound together.
- The sound of a note: a sine wave through a 1100 Hz low-pass filter, with an attack of 5 ms, a decay of 100 ms, a sustain of 0.3 and a release of 1 s, held for one step. It is written again for the synth of this game as the `ping` voice in `src/audio/synth/instruments.ts`, from those numbers, and checked against a render of the original's Tone.js instrument. It does not use code from the original.
- The sparks: twenty to a burst, a quarter of a tile a frame, forty frames of life, a pool of 2000 that gives up its oldest, bouncing off the edges. They are never drawn. Each tile that is off glows by the life of the sparks over it.

## What is changed

- The code is TypeScript with its own tests, in the structure of this game, not the JavaScript, Tone.js and Gulp build of the original.
- The playing is done by this game's `Band` scheduler and `WonderSynth`, not by Tone.js.
- The rows start on G3, not C4, so that every note is in the one key (C major pentatonic) of the rest of the game. Every distance between rows is the same as in the original, so the shapes of tunes are the same.
- Each finger has its own stroke, and a fast stroke is filled in so that it leaves no gap. The original shares one setting between all touches.
- Clearing the grid also clears the count of notes in each step. The original leaves those counts as they were.
- Sparks bounce off an edge once. The original moves them twice on the frame they hit it.
- Each tile is the colour of its note, and the tiles are painted for this game.
- A tile that is painted rings its note at once, and the original rings a tile only when the playhead reaches it. A strip of sixteen keys beside the tiles rings a note for a touch and a run of notes for a slide. These notes are the player's own, and each part has its own limit on them: the melody lets through nine in a quarter of a second and six for one touch, the beat six and four, and the bass three and three.
- Between the two ends of the level of a note, the level follows a power law of how many notes sound together, and not the straight line in decibels of the original. The straight line made a step of eight notes 4.6 dB louder than one note and a full step 2.7 dB louder, so a grid of middling thickness was the loudest. On the power law each note that joins makes a step a little louder, up to 2.7 dB for a full one, as in the original. The player's own notes are turned down in the same way for the notes still ringing.
- Each row has a trim of at most 3 dB, to make the rows as loud as each other. Every note goes through the same low-pass filter, so at the same level the top row was 4.5 LU quieter than the middle ones. The trims are what `tools/qa/matrix-sheet.ts` measured.
- Four buttons: a wand for the next of the five ready-made tunes of the part on the glass, a broom that clears that part, and a hare and a turtle for the speed of the music.
- Three parts. The original has one grid and one instrument. Here a song is a melody, which is the grid of the original, a beat and a bass, each its own grid of 16 by 16 with five tunes of its own, on three tabs against the glass, and the three play together in one loop. The rows of the beat are sixteen drums, each struck by its General MIDI number, and the bass is one note at a time, so a tile in a step puts out the one that was there. The parts, the tabs and the tunes are this project's own work, and they sit in this folder (`parts.ts`, `board.ts`, `tabs.ts`, `presets.ts`) and so are marked `GPL-3.0-only` with the rest of it.
- Each part has a level of its own, so that a beat of sixteen drums is no louder than a melody of sixteen notes, and the drums and the bass have trims for each row, measured in the same way as the trims of the melody.
- There are no stars, no finale and no pointing hand. A finale in which the light went over each of the three parts and the unicorn friends danced behind the lights was taken out on 2 November, and a backing band that joined as stars were earned on 1 November, so nothing plays but the three parts and the notes the player rings.
- There is no share link and no hidden second instrument.

Changes were made on 31 October and 2 November 2026.
