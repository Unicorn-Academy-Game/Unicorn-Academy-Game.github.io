import { STAGES } from '../../src/content/reading';

/**
 * Prints the reading course as JSON for the voice tools, which are Python: every word with the
 * tiles it is cut into and every sentence with the words in it. `tiles.py` reads it to see that
 * what a child hears when they touch the tiles of a word is what the voice says the word is, and
 * `generate.py` reads the sentences to record them.
 *   tsx tools/voice/export-course.ts > /tmp/course.json
 */
const words = STAGES.flatMap((stage) =>
  [...stage.words, ...stage.tricky].map((word) => ({
    id: word.id,
    stage: stage.n,
    tricky: word.tricky,
    explicit: word.explicit ?? false,
    tiles: word.tiles.map((tile) => ({
      letters: tile.letters,
      sound: tile.sound,
      name: tile.name ?? false,
      gap: tile.gap ?? false,
    })),
  })),
);
const lines = STAGES.flatMap((stage) =>
  stage.lines.map((line) => ({ id: line.id, stage: stage.n, text: line.text, words: line.words })),
);

process.stdout.write(`${JSON.stringify({ words, lines })}\n`);
