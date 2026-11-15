import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Manifest } from '../../src/shared/manifest';
import { CONTENT_VERSION } from '../../src/shared/version';
import { authorAll } from '../maps/author/all';
import { mapContext } from '../maps/build-maps';
import { compileAll } from '../maps/compile';
import { buildAudio } from './audio';
import { buildEnvironment } from './env/build';
import { buildNpcs } from './npcs';
import { buildSpeech } from './speech';
import { buildUnicorns } from './unicorns';

/**
 * Builds every generated runtime asset into public/assets and writes the manifest that describes
 * them. A target rebuilds some parts and keeps the rest from the last build.
 *   tsx tools/assets/build-all.ts          everything
 *   tsx tools/assets/build-all.ts unicorns the six unicorns only
 *   tsx tools/assets/build-all.ts figures  the unicorns and the grown-ups, who share how a facing is keyed
 *   tsx tools/assets/build-all.ts env      grown-ups, scenery and maps
 *   tsx tools/assets/build-all.ts npcs     grown-ups only
 *   tsx tools/assets/build-all.ts maps     maps only
 *   tsx tools/assets/build-all.ts audio    music, ambience and sound effects only (FORCE_AUDIO=1 re-renders)
 *   tsx tools/assets/build-all.ts speech   the voice only, packed from the masters in assets/source/voice (FORCE_SPEECH=1 packs again)
 */
const STAGES = {
  all: ['unicorns', 'npcs', 'env', 'maps', 'audio', 'speech'],
  unicorns: ['unicorns'],
  figures: ['unicorns', 'npcs'],
  env: ['npcs', 'env', 'maps'],
  npcs: ['npcs'],
  maps: ['maps'],
  audio: ['audio'],
  speech: ['speech'],
} as const;
type Stage = (typeof STAGES)[keyof typeof STAGES][number];
const target = process.argv[2] ?? 'all';
if (!(target in STAGES)) throw new Error(`unknown target "${target}": use ${Object.keys(STAGES).join(', ')}`);
const stages: readonly Stage[] = STAGES[target as keyof typeof STAGES];

const publicDir = 'public/assets';
mkdirSync(publicDir, { recursive: true });
const manifestPath = join(publicDir, 'manifest.json');
if (target !== 'all' && !existsSync(manifestPath))
  throw new Error(
    `"${target}" keeps what an earlier build made, and there is no earlier build. Run build-all.ts with no target first.`,
  );
const previous = target === 'all' ? null : (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest);

const unicorns = stages.includes('unicorns') ? await buildUnicorns(publicDir) : previous!.unicorns;
const npcs = stages.includes('npcs') ? await buildNpcs(publicDir) : previous!.npcs;
const env = stages.includes('env')
  ? await buildEnvironment(publicDir)
  : { bundles: previous!.bundles, tilesets: previous!.tilesets };
let maps = previous?.maps;
if (stages.includes('maps')) {
  authorAll();
  const compiled = compileAll('assets/maps', join(publicDir, 'maps'), mapContext());
  maps = Object.fromEntries(compiled.map(({ id, ...asset }) => [id, asset]));
}
const sounds = stages.includes('audio')
  ? await buildAudio(publicDir, { force: process.env.FORCE_AUDIO === '1' })
  : previous!.audio;
const speech = stages.includes('speech')
  ? buildSpeech(publicDir, { force: process.env.FORCE_SPEECH === '1' })
  : previous?.audio?.speech;
const audio = sounds && { ...sounds, speech };
const manifest = Manifest.parse({
  schemaVersion: 1,
  contentVersion: CONTENT_VERSION,
  unicorns,
  npcs,
  bundles: env.bundles,
  tilesets: env.tilesets,
  maps,
  audio,
});
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(
  `manifest: ${Object.keys(manifest.unicorns).length} unicorns, ${Object.keys(manifest.npcs).length} grown-ups, ${Object.keys(manifest.bundles).length} bundles, ${Object.keys(manifest.maps).length} maps, ${manifest.audio ? Object.keys(manifest.audio.loops).length : 0} loops, ${manifest.audio ? Object.keys(manifest.audio.sheets).length : 0} sound sheets, ${Object.keys(manifest.audio?.speech?.clips ?? {}).length} spoken clips`,
);
