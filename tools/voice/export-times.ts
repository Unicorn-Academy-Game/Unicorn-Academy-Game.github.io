import { readFileSync, writeFileSync } from 'node:fs';
import { type ReportClips, timesJson } from './times-json';

/**
 * Writes `src/content/reading/line-times.json`: for each sentence of the course, when each of its
 * words starts and ends in the clip that reads it. The voice tool measures them when it makes the
 * clip, from the length the model gives each sound before it speaks, so they are exact for the take
 * that was kept, and the screen lights each word as the voice reaches it. The report holds them,
 * and this copies them to where the game can read them without carrying the report.
 *   tsx tools/voice/export-times.ts           write it
 *   tsx tools/voice/export-times.ts --check   fail if the file on disk is not what the report says
 */
const REPORT = 'assets/source/voice/report.json';
const PATH = 'src/content/reading/line-times.json';

const { json, missing } = timesJson((JSON.parse(readFileSync(REPORT, 'utf8')) as { clips: ReportClips }).clips);
if (missing.length > 0) {
  console.error(
    `${missing.length} sentences have no word times in ${REPORT}, so their clips are not made yet: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', ...' : ''}`,
  );
  process.exit(1);
}
if (process.argv.includes('--check')) {
  if (readFileSync(PATH, 'utf8') !== json) {
    console.error(`${PATH} is out of date. Run: pnpm voice:times`);
    process.exit(1);
  }
  console.log(`${PATH}: up to date`);
} else {
  writeFileSync(PATH, json);
  console.log(`${PATH}: ${json.split('\n').length - 3} sentences`);
}
