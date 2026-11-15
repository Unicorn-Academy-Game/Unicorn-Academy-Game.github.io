import { READ_LINES } from '../../src/content/reading';
import { paceOf } from '../../src/shared/audio';

/**
 * What the report keeps of a clip that this reads: when each word of a sentence starts and ends in
 * the clip.
 */
export type ReportClips = Readonly<Record<string, { readonly words?: readonly (readonly number[])[] }>>;

/**
 * What `src/content/reading/line-times.json` holds, as text: for each sentence of the course, when
 * each of its words starts and ends in the clip that reads it, from the report the voice tool
 * wrote. The report has the times of the master, and the clip that ships is longer by its pace
 * (`PACE` in `src/shared/audio.ts`), so each time is that much later. The ids that have no times
 * come back too, so that a caller can say which clips are not made yet. One sentence to a row, so a
 * change to one clip is a change to one line of the file.
 */
export function timesJson(clips: ReportClips): { json: string; missing: string[] } {
  const missing: string[] = [];
  const rows = READ_LINES.map((line) => {
    const id = `line.${line.id}`;
    const pace = paceOf(id);
    const spans = clips[id]?.words;
    if (spans === undefined) missing.push(line.id);
    return `${JSON.stringify(line.id)}:${JSON.stringify((spans ?? []).map((span) => span.map((at) => Number((at * pace).toFixed(3)))))}`;
  });
  return { json: `{\n${rows.join(',\n')}\n}\n`, missing };
}
