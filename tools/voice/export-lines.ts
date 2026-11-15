import { readFileSync, writeFileSync } from 'node:fs';
import { linesJson } from './lines-json';

/**
 * Writes `tools/voice/lines.json`, the list of clips the generator speaks.
 *   tsx tools/voice/export-lines.ts           write it
 *   tsx tools/voice/export-lines.ts --check   fail if the file on disk is not what the game would write
 */
const PATH = 'tools/voice/lines.json';
const wanted = linesJson();
if (process.argv.includes('--check')) {
  if (readFileSync(PATH, 'utf8') !== wanted) {
    console.error(`${PATH} is out of date. Run: pnpm voice:lines`);
    process.exit(1);
  }
  console.log(`${PATH}: up to date`);
} else {
  writeFileSync(PATH, wanted);
  console.log(`${PATH}: ${wanted.split('\n').length - 3} clips`);
}
