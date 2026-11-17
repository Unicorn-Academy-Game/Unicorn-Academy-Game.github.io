import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AudioAssets,
  CONTEXT_RATE,
  DECODED_BUDGET,
  decodedBytes,
  SPEECH_RESIDENT,
} from '../../../src/shared/audio';
import type { CompiledMap } from '../../../src/shared/compiled-map';
import type { MapId } from '../../../src/shared/ids';
import type { Manifest } from '../../../src/shared/manifest';
import { referencedFiles, spokenFiles, transferBytes } from './files';
import { error, type Finding } from './finding';
import { loopsOfMap } from './maps';

const MiB = 1024 * 1024;

/**
 * What the build may weigh. The first three are bytes sent compressed: `initial` is the first
 * playable download, `offline` is the game kept for play with no connection, and `voice` is the
 * spoken lessons, which are kept as they are heard, or all at once when a parent asks. `gpu` is the
 * memory of a device that shows eight facings, `gpuFine` that of one that also holds the fine
 * facings, and `audio` is the sound a device may hold decoded. The voice is allowed 25 rather
 * than 24 because the Qwen3 voice's masters pack to 24.6 MiB where the Kokoro voice's fit in 24.
 */
export const BUDGET = {
  initial: 5 * MiB,
  offline: 13 * MiB,
  voice: 25 * MiB,
  gpu: 160 * MiB,
  gpuFine: 256 * MiB,
  audio: DECODED_BUDGET,
} as const;

/**
 * Bundles that load once, with the unicorns, and stay: the effects, the creatures that live in
 * every map and the fruit the herd eats.
 */
const SHARED_BUNDLES = ['fx', 'life', 'produce'] as const;

export interface FileCost {
  file: string;
  bytes: number;
}

const costOf = (dir: string, file: string): FileCost => ({
  file,
  bytes: transferBytes(file, readFileSync(join(dir, file))),
});

/**
 * What the very first playable moment downloads: the herd, the effects, the first map and its
 * sound. The rest comes later.
 */
export function initialDownload(
  dir: string,
  manifest: Manifest,
  maps: ReadonlyMap<MapId, CompiledMap>,
  first: MapId = 'forest',
): FileCost[] {
  const files = new Set<string>();
  for (const u of Object.values(manifest.unicorns)) {
    files.add(u.atlas.file);
    if (u.crown) files.add(u.crown.atlas.file);
  }
  for (const id of SHARED_BUNDLES) for (const p of manifest.bundles[id]?.pages ?? []) files.add(p.file);
  const entry = manifest.maps[first];
  const map = maps.get(first);
  if (entry && map) {
    files.add(entry.file);
    for (const p of manifest.bundles[map.render.bundle]?.pages ?? []) files.add(p.file);
    const tileset = manifest.tilesets[map.render.tileset];
    if (tileset) files.add(tileset.file);
    for (const n of map.logic.npcs) {
      const asset = manifest.npcs[n.npcId];
      if (asset) files.add(asset.atlas.file);
    }
    if (manifest.audio) {
      files.add(manifest.audio.sheets.core.file);
      for (const loop of loopsOfMap(map.logic.audio)) {
        const asset = manifest.audio.loops[loop as keyof typeof manifest.audio.loops];
        if (asset) files.add(asset.file);
      }
    }
  }
  return [
    { file: 'manifest.json', bytes: transferBytes('manifest.json', readFileSync(join(dir, 'manifest.json'))) },
    ...[...files].sort().map((f) => costOf(dir, f)),
  ];
}

/**
 * Everything the game needs to play with no network, except the spoken lessons, which are kept as
 * they are heard.
 */
export function offlineDownload(dir: string, manifest: Manifest): FileCost[] {
  const spoken = spokenFiles(manifest);
  return [
    { file: 'manifest.json', bytes: transferBytes('manifest.json', readFileSync(join(dir, 'manifest.json'))) },
    ...referencedFiles(manifest)
      .filter((f) => !spoken.has(f))
      .map((f) => costOf(dir, f)),
  ];
}

/** Every spoken lesson, which a parent can ask to keep all at once. */
export const voiceDownload = (dir: string, manifest: Manifest): FileCost[] =>
  [...spokenFiles(manifest)].sort().map((f) => costOf(dir, f));

export const total = (costs: readonly FileCost[]): number => costs.reduce((sum, c) => sum + c.bytes, 0);

export interface GpuAccount {
  /**
   * Resident for the whole session: the first sheets of the six unicorns, the crown Wildstar wears,
   * and the effects.
   */
  shared: number;
  /**
   * The fine sheets of the six unicorns, which a device that loads them holds for the whole
   * session, because all six are always out.
   */
  fine: number;
  /** What each map adds while it is on screen. */
  perMap: Record<string, number>;
  /**
   * The most memory at once: the shared pictures and two maps, which is what a door crossing holds
   * before the old map is let go.
   */
  peak: number;
  /** The same with the fine sheets loaded too. */
  peakWithFine: number;
  peakBetween: [MapId, MapId];
}

const texture = (w: number, h: number): number => w * h * 4;

/** Textures a map needs, by name, with their size in an RGBA8 texture with no mipmaps. */
function texturesOf(manifest: Manifest, map: CompiledMap): Map<string, number> {
  const out = new Map<string, number>();
  const bundle = manifest.bundles[map.render.bundle];
  bundle?.pages.forEach((p, i) => {
    out.set(`${map.render.bundle}#${i}`, texture(p.width, p.height));
  });
  const tileset = manifest.tilesets[map.render.tileset];
  if (tileset) out.set(`tiles:${map.render.tileset}`, texture(tileset.width, tileset.height));
  for (const n of map.logic.npcs) {
    const a = manifest.npcs[n.npcId]?.atlas;
    if (a) out.set(`npc:${n.npcId}`, texture(a.width, a.height));
  }
  return out;
}

export function gpuAccount(manifest: Manifest, maps: ReadonlyMap<MapId, CompiledMap>): GpuAccount {
  let shared = 0;
  let fine = 0;
  for (const u of Object.values(manifest.unicorns)) {
    shared += texture(u.atlas.width, u.atlas.height);
    if (u.crown) shared += texture(u.crown.atlas.width, u.crown.atlas.height);
    for (const sheet of u.fine?.atlases ?? []) fine += texture(sheet.width, sheet.height);
  }
  for (const id of SHARED_BUNDLES)
    for (const p of manifest.bundles[id]?.pages ?? []) shared += texture(p.width, p.height);
  const needs = new Map([...maps].map(([id, map]) => [id, texturesOf(manifest, map)] as const));
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
  const perMap = Object.fromEntries([...needs].map(([id, m]) => [id, sum(m)]));
  let peak = 0;
  let peakBetween: [MapId, MapId] = ['forest', 'forest'];
  for (const [a, ta] of needs) {
    for (const [b, tb] of needs) {
      const both = sum(new Map([...ta, ...tb]));
      if (both > peak) {
        peak = both;
        peakBetween = [a, b];
      }
    }
  }
  return { shared, fine, perMap, peak: shared + peak, peakWithFine: shared + fine + peak, peakBetween };
}

export interface AudioAccount {
  rate: number;
  sheets: number;
  /**
   * What the voice may hold decoded, which is its cap and not the size of all its clips, because it
   * lets the oldest go.
   */
  speech: number;
  /** The most one map holds: every sheet, its music and its ambience. */
  steady: number;
  /** The most while two maps' loops are both decoded, as in a crossfade. */
  crossfade: number;
  /**
   * The least the loop swap can always get down to: every sheet, the largest music and the largest
   * ambience.
   */
  floor: number;
}

/**
 * Memory for decoded audio at a context sample rate: sheets are mono, loops stereo, and a loop's
 * file carries a second of padding on each side.
 */
export function audioAccount(audio: AudioAssets, maps: ReadonlyMap<MapId, CompiledMap>, rate: number): AudioAccount {
  const sheets = Object.values(audio.sheets).reduce((sum, s) => sum + decodedBytes(s.seconds, 1, rate), 0);
  const loop = (id: string): number => {
    const l = audio.loops[id as keyof typeof audio.loops];
    return l ? decodedBytes(l.loopEnd + l.loopStart, 2, rate) : 0;
  };
  const held = [...maps.values()].map((m) => loopsOfMap(m.logic.audio));
  const sizeOf = (ids: Iterable<string>): number => [...new Set(ids)].reduce((sum, id) => sum + loop(id), 0);
  const steady = Math.max(0, ...held.map((h) => sizeOf(h)));
  const crossfade = Math.max(0, ...held.flatMap((a) => held.map((b) => sizeOf([...a, ...b]))));
  const biggest = (kind: 'music' | 'ambience'): number =>
    Math.max(
      0,
      ...Object.entries(audio.loops)
        .filter(([, l]) => l.kind === kind)
        .map(([id]) => loop(id)),
    );
  const speech = audio.speech ? SPEECH_RESIDENT : 0;
  return {
    rate,
    sheets,
    speech,
    steady: sheets + speech + steady,
    crossfade: sheets + speech + crossfade,
    floor: sheets + speech + biggest('music') + biggest('ambience'),
  };
}

/** The size targets in `BUDGET`, checked against the assets that exist. */
export function checkBudgets(dir: string, manifest: Manifest, maps: ReadonlyMap<MapId, CompiledMap>): Finding[] {
  const found: Finding[] = [];
  const mib = (n: number): string => `${(n / MiB).toFixed(1)} MiB`;
  const initial = total(initialDownload(dir, manifest, maps));
  if (initial > BUDGET.initial)
    found.push(
      error('budgets', `the first playable download is ${mib(initial)} and the target is ${mib(BUDGET.initial)}`),
    );
  const offline = total(offlineDownload(dir, manifest));
  if (offline > BUDGET.offline)
    found.push(
      error(
        'budgets',
        `the game kept for offline play is ${mib(offline)} before the app itself and the target is ${mib(BUDGET.offline)}`,
      ),
    );
  const voice = total(voiceDownload(dir, manifest));
  if (voice > BUDGET.voice)
    found.push(error('budgets', `the spoken lessons are ${mib(voice)} and the target is ${mib(BUDGET.voice)}`));
  const gpu = gpuAccount(manifest, maps);
  if (gpu.peak > BUDGET.gpu)
    found.push(
      error(
        'budgets',
        `graphics memory peaks at ${mib(gpu.peak)} between ${gpu.peakBetween.join(' and ')} and the target is ${mib(BUDGET.gpu)}`,
      ),
    );
  if (gpu.peakWithFine > BUDGET.gpuFine)
    found.push(
      error(
        'budgets',
        `graphics memory with the fine facings peaks at ${mib(gpu.peakWithFine)} between ${gpu.peakBetween.join(' and ')} and the target is ${mib(BUDGET.gpuFine)}`,
      ),
    );
  if (manifest.audio) {
    // The context asks for `CONTEXT_RATE`, where a crossfade fits. If a browser gives 48 kHz
    // instead, the loop swap lets the old loop go first, which needs `floor` to fit.
    const wanted = audioAccount(manifest.audio, maps, CONTEXT_RATE);
    if (wanted.crossfade > BUDGET.audio)
      found.push(
        error(
          'budgets',
          `decoded audio at ${CONTEXT_RATE / 1000} kHz reaches ${mib(wanted.crossfade)} in a crossfade and the target is ${mib(BUDGET.audio)}`,
        ),
      );
    const native = audioAccount(manifest.audio, maps, 48000);
    if (native.floor > BUDGET.audio)
      found.push(
        error(
          'budgets',
          `decoded audio at 48 kHz cannot get below ${mib(native.floor)} and the target is ${mib(BUDGET.audio)}`,
        ),
      );
  }
  return found;
}
