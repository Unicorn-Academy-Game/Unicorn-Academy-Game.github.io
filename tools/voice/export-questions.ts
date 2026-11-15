import { writeFileSync } from 'node:fs';
import { GAP } from '../../src/audio/voice-bank';
import { STRAND_IDS } from '../../src/learning/play/maths/question';
import { ask } from '../../src/learning/play/maths/strands';
import { runsOn } from '../../src/shared/audio';
import { MATHS_LEVELS } from '../../src/shared/play';
import { seeded } from '../../tests/learning/helpers';

/**
 * Writes the questions the maths game asks, as the clips that say each and the quiet the voice leaves after
 * each, for `tools/voice/questions.py` to join the way the game does and listen to. Every strand at every level is asked `count` times,
 * from seeds that do not change, so two builds of the voice are heard saying the same questions.
 *   tsx tools/voice/export-questions.ts out.json [count]
 * Also written is how often each clip is said, which is what to look at before deciding that a clip
 * is not worth its bytes.
 */
const [path, count = '12'] = process.argv.slice(2);
if (!path) {
  console.error('usage: tsx tools/voice/export-questions.ts out.json [count]');
  process.exit(1);
}

const questions: { strand: string; level: number; prompt: string; say: readonly string[]; after: number[] }[] = [];
const usage: Record<string, number> = {};
for (const strand of STRAND_IDS)
  for (const level of MATHS_LEVELS)
    for (let i = 0; i < Number(count); i++) {
      const q = ask(strand, level, seeded(i * 7919 + 13));
      questions.push({ strand, level, prompt: q.prompt, say: q.say, after: q.say.map((id) => (runsOn(id) ? 0 : GAP)) });
      for (const id of q.say) usage[id] = (usage[id] ?? 0) + 1;
    }
writeFileSync(path, `${JSON.stringify({ questions, usage }, null, 1)}\n`);
console.log(`${path}: ${questions.length} questions, ${Object.keys(usage).length} clips said`);
