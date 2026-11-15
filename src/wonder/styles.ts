import { arpeggio, bass, CHORDS, chimes, drum, pad, type Style } from './engine/band';
import { DISCO } from './games/party/groove';

/**
 * The music each game plays under what the player plays. All of it is in C major pentatonic, so any
 * note they play over it is the right one. The layers join as the game asks for more music, so a
 * game that is just starting is a pad and a bell and one that is in its finale is the whole band.
 */

/**
 * Fireworks over still water: slow, wide, and a harp that runs through the chord when the sky
 * fills.
 */
export const NIGHT: Style = {
  name: 'night',
  tempo: 66,
  progression: [CHORDS.C, CHORDS.Am, CHORDS.Csus, CHORDS.G],
  layers: [
    pad({ joins: 0, gain: 0.7 }),
    chimes('bell', 'x...x...x...x...', 0.4, { joins: 0.1, gain: 0.45, low: 72, span: 14, pan: 0.25 }),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0.35, gain: 0.5, run: 'updown', low: 60, pan: -0.2 }),
    bass('x.......x.......', { joins: 0.5, gain: 0.75 }),
    drum('kick', 'x.......x.......', { joins: 0.72, gain: 0.55 }),
    chimes('glass', '..x...x...x...x.', 0.5, { joins: 0.85, gain: 0.4, low: 79, span: 14, pan: -0.3 }),
  ],
};

/**
 * A ride down a rainbow: bright and bouncing, with a marimba that never stops and a band that joins
 * as the ride goes on.
 */
export const SUNNY: Style = {
  name: 'sunny',
  tempo: 108,
  swing: 0.1,
  progression: [CHORDS.C, CHORDS.G, CHORDS.Am, CHORDS.Csus],
  layers: [
    pad({ joins: 0, gain: 0.5 }),
    arpeggio('marimba', 'x.x.x.x.x.x.x.x.', { joins: 0, gain: 0.5, run: 'skip', low: 60, pan: -0.15 }),
    bass('x...x.x.x...x.x.', { joins: 0.2, gain: 0.7 }),
    drum('hat', 'o.o.o.o.o.o.o.o.', { joins: 0.32, gain: 0.32 }),
    drum('kick', 'x.......x.......', { joins: 0.42, gain: 0.55 }),
    chimes('bell', '..x...x...x...x.', 0.6, { joins: 0.55, gain: 0.38, low: 72, span: 14, pan: 0.3 }),
    drum('snare', '....x.......x...', { joins: 0.72, gain: 0.34 }),
    arpeggio('pluck', 'x.xx.x.xx.xx.x.x', { joins: 0.85, gain: 0.42, run: 'updown', low: 72, pan: 0.25 }),
  ],
};

/**
 * The climb into the sky, in the three colours of its mushroom. Each is a little quieter than a
 * ride, because the notes she makes with every landing are the tune and the band only holds them
 * up. They differ in how they move: the morning skips, the candy sky sways, and the night one
 * drifts.
 */

/** The red sky: a bright morning, a plucked line that skips along, and a snare once she is high. */
export const MORNING: Style = {
  name: 'morning',
  tempo: 104,
  swing: 0.08,
  progression: [CHORDS.C, CHORDS.Csus, CHORDS.Am, CHORDS.G],
  layers: [
    pad({ joins: 0, gain: 0.42 }),
    arpeggio('pluck', 'x.x.x.x.x.x.x.x.', { joins: 0, gain: 0.34, run: 'updown', low: 64, pan: -0.15 }),
    chimes('bell', '..x...x...x...x.', 0.55, { joins: 0.15, gain: 0.32, low: 76, span: 12, pan: 0.3 }),
    bass('x.......x.x.....', { joins: 0.25, gain: 0.66 }),
    drum('hat', 'o.o.o.o.o.o.o.o.', { joins: 0.4, gain: 0.24 }),
    drum('kick', 'x.......x.......', { joins: 0.5, gain: 0.5 }),
    arpeggio('marimba', 'x.xx.x.xx.xx.x.x', { joins: 0.7, gain: 0.32, run: 'skip', low: 72, pan: 0.2 }),
    drum('snare', '....x.......x...', { joins: 0.85, gain: 0.28 }),
  ],
};

/** The pink sky: soft and swaying, glass and flute over a harp, with a bass that rocks. */
export const CANDY: Style = {
  name: 'candy',
  tempo: 92,
  swing: 0.16,
  progression: [CHORDS.C, CHORDS.E, CHORDS.Am, CHORDS.G],
  layers: [
    pad({ joins: 0, gain: 0.4 }, 55, 'pad'),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0, gain: 0.34, run: 'up', low: 60, pan: -0.2 }),
    chimes('glass', 'x...x...x...x...', 0.5, { joins: 0.12, gain: 0.3, low: 72, span: 14, pan: 0.25 }),
    bass('x.....x.x.....x.', { joins: 0.3, gain: 0.62 }),
    drum('hat', 'o.o.o.o.o.o.o.o.', { joins: 0.42, gain: 0.2 }),
    chimes('flute', '..x...x...x...x.', 0.35, { joins: 0.55, gain: 0.3, low: 79, span: 12, pan: -0.3 }),
    drum('kick', 'x.....x.x.......', { joins: 0.6, gain: 0.46 }),
    arpeggio('pluck', 'x.x.x.x.x.x.x.x.', { joins: 0.8, gain: 0.3, run: 'skip', low: 76, pan: 0.3 }),
  ],
};

/**
 * The blue sky: slow and wide, a harp that rises and falls under glass bells, with the stars coming
 * out as the player climbs.
 */
export const STARRY: Style = {
  name: 'starry',
  tempo: 84,
  progression: [CHORDS.Am, CHORDS.C, CHORDS.G, CHORDS.Csus],
  layers: [
    pad({ joins: 0, gain: 0.6 }),
    chimes('bell', '..x...x...x...x.', 0.45, { joins: 0.05, gain: 0.34, low: 79, span: 14, pan: 0.3 }),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0.2, gain: 0.4, run: 'updown', low: 57, pan: -0.2 }),
    bass('x.......x.......', { joins: 0.4, gain: 0.7 }),
    drum('hat', 'o...o...o...o...', { joins: 0.55, gain: 0.22 }),
    drum('kick', 'x.......x.......', { joins: 0.65, gain: 0.44 }),
    chimes('glass', '.x...x...x...x..', 0.4, { joins: 0.8, gain: 0.3, low: 84, span: 12, pan: -0.3 }),
  ],
};

/**
 * The balloon game, in its three skies. Each is a little quieter than a ride, because what the
 * player pops is the tune and the band only holds it up, and each moves its own way: the party
 * bounces, the golden evening rolls, and the dusk is a music box.
 */

/**
 * A party in the park: a marimba that bounces, an oom-pah bass, hats on the off beat and the whole
 * band by the time the sky is full of balloons.
 */
export const PARTY: Style = {
  name: 'party',
  tempo: 100,
  swing: 0.12,
  progression: [CHORDS.C, CHORDS.Am, CHORDS.D, CHORDS.G],
  layers: [
    pad({ joins: 0, gain: 0.36 }),
    arpeggio('marimba', 'x.x.x.x.x.x.x.x.', { joins: 0, gain: 0.4, run: 'skip', low: 60, pan: -0.2 }),
    bass('x...x...x...x...', { joins: 0.15, gain: 0.66 }),
    drum('hat', '..o...o...o...o.', { joins: 0.28, gain: 0.26 }),
    drum('kick', 'x.......x.......', { joins: 0.38, gain: 0.5 }),
    chimes('bell', '..x...x...x...x.', 0.55, { joins: 0.45, gain: 0.32, low: 76, span: 12, pan: 0.3 }),
    drum('snare', '....x.......x...', { joins: 0.62, gain: 0.3 }),
    arpeggio('pluck', 'x.xx.x.xx.xx.x.x', { joins: 0.8, gain: 0.34, run: 'updown', low: 72, pan: 0.25 }),
  ],
};

/**
 * A golden evening, as the sun goes down: a harp that rolls up and down the chord, a flute above
 * it, and a slow soft beat that comes in last.
 */
export const EVENING: Style = {
  name: 'evening',
  tempo: 78,
  progression: [CHORDS.C, CHORDS.Csus, CHORDS.Am, CHORDS.E],
  layers: [
    pad({ joins: 0, gain: 0.5 }, 55, 'pad'),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0, gain: 0.4, run: 'updown', low: 60, pan: -0.2 }),
    chimes('flute', '..x...x...x...x.', 0.4, { joins: 0.18, gain: 0.3, low: 74, span: 12, pan: 0.3 }),
    bass('x.......x.......', { joins: 0.34, gain: 0.66 }),
    drum('kick', 'x.......x.......', { joins: 0.55, gain: 0.4 }),
    chimes('bell', 'x...x...x...x...', 0.5, { joins: 0.62, gain: 0.3, low: 79, span: 12, pan: -0.3 }),
    drum('hat', 'o...o...o...o...', { joins: 0.8, gain: 0.2 }),
  ],
};

/**
 * The blue dusk: a music box. Bells climb the chord one at a time over a long pad, with glass above
 * and hardly a beat.
 */
export const DUSK: Style = {
  name: 'dusk',
  tempo: 70,
  progression: [CHORDS.Csus, CHORDS.Am, CHORDS.C, CHORDS.G],
  layers: [
    pad({ joins: 0, gain: 0.58 }),
    arpeggio('bell', 'x...x...x...x...', { joins: 0, gain: 0.32, run: 'up', low: 72, pan: -0.15 }),
    chimes('glass', '..x...x...x...x.', 0.45, { joins: 0.12, gain: 0.3, low: 79, span: 12, pan: 0.3 }),
    bass('x.......x.......', { joins: 0.36, gain: 0.64 }),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0.5, gain: 0.3, run: 'updown', low: 60, pan: 0.2 }),
    drum('kick', 'x.......x.......', { joins: 0.7, gain: 0.34 }),
    chimes('chime', '.x...x...x...x..', 0.4, { joins: 0.82, gain: 0.26, low: 84, span: 12, pan: -0.3 }),
  ],
};

/**
 * The bubble garden, a glade in the morning: a glass music box that climbs the chord, a bell now
 * and then, and a soft harp under it once the garden has filled. It is the quietest of the games,
 * because every pop already rings, and it is slow enough for the notes the player pops to be heard
 * as a tune of their own.
 */
export const GLADE: Style = {
  name: 'glade',
  tempo: 88,
  swing: 0.1,
  progression: [CHORDS.C, CHORDS.G, CHORDS.Am, CHORDS.Csus],
  layers: [
    pad({ joins: 0, gain: 0.42 }),
    arpeggio('glass', 'x...x...x...x...', { joins: 0, gain: 0.3, run: 'up', low: 72, pan: -0.15 }),
    chimes('bell', '..x...x...x...x.', 0.5, { joins: 0.14, gain: 0.28, low: 79, span: 12, pan: 0.3 }),
    bass('x.......x.......', { joins: 0.3, gain: 0.58 }),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0.45, gain: 0.3, run: 'updown', low: 60, pan: 0.2 }),
    drum('hat', 'o...o...o...o...', { joins: 0.6, gain: 0.18 }),
    drum('kick', 'x.......x.......', { joins: 0.72, gain: 0.34 }),
    chimes('flute', '.x...x...x...x..', 0.4, { joins: 0.84, gain: 0.26, low: 84, span: 12, pan: -0.3 }),
  ],
};

/**
 * The magic changing machine, a clockwork workshop at dusk: a marimba that ticks along like gears,
 * a bell now and then, a bass that hops, and a pluck that runs up and down the chord once the
 * machine is going at full speed. Every fruit the player feeds in sings a note of its own over it,
 * so it holds the tune up and does not play it.
 */
export const WORKSHOP: Style = {
  name: 'workshop',
  tempo: 106,
  swing: 0.14,
  progression: [CHORDS.C, CHORDS.Am, CHORDS.G, CHORDS.Csus],
  layers: [
    pad({ joins: 0, gain: 0.34 }),
    arpeggio('marimba', 'x.x.x.x.x.x.x.x.', { joins: 0, gain: 0.34, run: 'skip', low: 60, pan: -0.2 }),
    chimes('bell', '..x...x...x...x.', 0.5, { joins: 0.12, gain: 0.28, low: 76, span: 12, pan: 0.3 }),
    bass('x..x..x.x..x..x.', { joins: 0.24, gain: 0.58 }),
    drum('hat', 'o.o.o.o.o.o.o.o.', { joins: 0.36, gain: 0.2 }),
    drum('kick', 'x.......x.......', { joins: 0.48, gain: 0.42 }),
    chimes('glass', '.x...x...x...x..', 0.45, { joins: 0.62, gain: 0.26, low: 79, span: 12, pan: -0.3 }),
    drum('snare', '....x.......x...', { joins: 0.74, gain: 0.26 }),
    arpeggio('pluck', 'x.xx.x.xx.xx.x.x', { joins: 0.86, gain: 0.32, run: 'updown', low: 72, pan: 0.25 }),
  ],
};

/**
 * The fountain in the moonlit square: a slow harp that runs through the chord all the time and a
 * pad under it, with a bell now and then, so the jets sing over something that is already playing
 * and every jet the player plays is the right note. A flute and a soft kick join when the whole
 * fountain is going.
 */
export const FOUNTAIN: Style = {
  name: 'fountain',
  tempo: 78,
  swing: 0.05,
  progression: [CHORDS.C, CHORDS.Am, CHORDS.Csus, CHORDS.G],
  layers: [
    pad({ joins: 0, gain: 0.42 }),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0, gain: 0.36, run: 'updown', low: 55, pan: -0.25 }),
    chimes('bell', 'x...x...x...x...', 0.4, { joins: 0.12, gain: 0.3, low: 72, span: 12, pan: 0.3 }),
    bass('x.......x.......', { joins: 0.28, gain: 0.55 }),
    arpeggio('flute', 'x...x...x...x...', { joins: 0.5, gain: 0.26, run: 'skip', low: 72, pan: 0.2 }),
    drum('kick', 'x.......x.......', { joins: 0.62, gain: 0.34 }),
    chimes('glass', '.x...x...x...x..', 0.5, { joins: 0.76, gain: 0.26, low: 79, span: 12, pan: -0.3 }),
    drum('hat', 'o.o.o.o.o.o.o.o.', { joins: 0.88, gain: 0.14 }),
  ],
};

/**
 * A pond at golden hour: a marimba that drips like water off a leaf, a slow harmony under it, and a
 * flute that comes once the lotuses are open. It is quiet at first, so that every hop and every
 * bloom is the loudest thing there is.
 */
export const POND: Style = {
  name: 'pond',
  tempo: 84,
  swing: 0.1,
  progression: [CHORDS.C, CHORDS.G, CHORDS.Am, CHORDS.Csus],
  layers: [
    pad({ joins: 0, gain: 0.4 }),
    arpeggio('marimba', 'x...x.x...x.x...', { joins: 0, gain: 0.3, run: 'updown', low: 60, pan: -0.2 }),
    chimes('bell', '..x...x...x...x.', 0.45, { joins: 0.14, gain: 0.3, low: 72, span: 12, pan: 0.3 }),
    bass('x.......x.x.....', { joins: 0.3, gain: 0.55 }),
    arpeggio('flute', 'x...x...x...x...', { joins: 0.5, gain: 0.24, run: 'skip', low: 72, pan: 0.2 }),
    drum('hat', '..o...o...o...o.', { joins: 0.62, gain: 0.12 }),
    drum('kick', 'x.......x.......', { joins: 0.72, gain: 0.3 }),
    chimes('glass', '.x...x...x...x..', 0.5, { joins: 0.82, gain: 0.24, low: 79, span: 12, pan: -0.3 }),
  ],
};

/**
 * The treasure vault: a bright caper of plucked strings over a walking bass, quick enough that
 * every catch has something to land on, and more of it as the chest fills. It starts as a pad and a
 * pluck under the count in and is the whole band by the time the chest is heaped.
 */
export const VAULT: Style = {
  name: 'vault',
  tempo: 112,
  swing: 0.16,
  progression: [CHORDS.C, CHORDS.G, CHORDS.Am, CHORDS.Csus],
  layers: [
    pad({ joins: 0, gain: 0.3 }),
    arpeggio('pluck', 'x..x..x.x..x..x.', { joins: 0, gain: 0.3, run: 'updown', low: 60, pan: -0.2 }),
    bass('x..x....x.x.....', { joins: 0.18, gain: 0.55 }),
    chimes('bell', '..x...x...x...x.', 0.5, { joins: 0.3, gain: 0.24, low: 76, span: 12, pan: 0.3 }),
    drum('hat', 'o.o.o.o.o.o.o.o.', { joins: 0.4, gain: 0.16 }),
    drum('kick', 'x.......x.......', { joins: 0.5, gain: 0.34 }),
    arpeggio('marimba', 'x.xx.x.xx.xx.x.x', { joins: 0.62, gain: 0.24, run: 'skip', low: 72, pan: 0.25 }),
    chimes('glass', '.x...x...x...x..', 0.5, { joins: 0.78, gain: 0.2, low: 79, span: 12, pan: -0.3 }),
    drum('snare', '....x.......x...', { joins: 0.88, gain: 0.2 }),
  ],
};

/**
 * Every style by name, so a tool can render them all. The party's song is made by whoever is
 * dancing, so here it is with every part playing.
 */
export const STYLES: Readonly<Record<string, Style>> = {
  night: NIGHT,
  sunny: SUNNY,
  morning: MORNING,
  candy: CANDY,
  starry: STARRY,
  party: PARTY,
  evening: EVENING,
  dusk: DUSK,
  glade: GLADE,
  workshop: WORKSHOP,
  fountain: FOUNTAIN,
  pond: POND,
  vault: VAULT,
  disco: DISCO,
};
