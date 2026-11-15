import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLIP_TIMING } from '../../src/shared/clips';
import {
  EAST,
  facingLabel,
  NORTH,
  NORTHEAST,
  NORTHWEST,
  SOUTH,
  SOUTHEAST,
  SOUTHWEST,
  WEST,
} from '../../src/shared/compass';
import { MAP_IDS } from '../../src/shared/ids';
import { facingKey, Manifest } from '../../src/shared/manifest';
import { checkAudioFiles, checkAudioManifest } from '../../tools/assets/check/audio';
import {
  audioAccount,
  BUDGET,
  gpuAccount,
  initialDownload,
  offlineDownload,
  total,
} from '../../tools/assets/check/budgets';
import { checkFiles, referencedFiles, transferBytes } from '../../tools/assets/check/files';
import { checkMaps, loadMaps } from '../../tools/assets/check/maps';
import { checkUnicorns } from '../../tools/assets/check/unicorns';
import { hasFfmpeg, parseMeter } from '../../tools/assets/lib/ffmpeg';
import { validate } from '../../tools/assets/validate';

/** The shipped assets, and a scratch copy of them that each test may damage in its own way. */
const SHIPPED = 'public/assets';
let scratch = '';
const manifestOf = (dir: string): Manifest =>
  Manifest.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')));
const messages = (found: { message: string }[]): string => found.map((f) => f.message).join('\n');

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'unicorn-assets-'));
});
// Sixteen copies of the assets are about 370 MB in 10,000 files, and removing them needs more than
// the 10 seconds a hook gets on a busy machine.
afterAll(() => rmSync(scratch, { recursive: true, force: true }), 120_000);

/** A fresh copy of the shipped assets to break. */
function copy(name: string): string {
  const dir = join(scratch, name);
  cpSync(SHIPPED, dir, { recursive: true });
  return dir;
}

/** Removes an entry that the schema says is always there, to see what notices. */
const without = <T extends object>(from: T, key: keyof T): void => void delete (from as Partial<T>)[key];

function edit(dir: string, change: (m: Manifest) => void): Manifest {
  const m = manifestOf(dir);
  change(m);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m));
  return m;
}

describe('the shipped assets', () => {
  // Every clip of the voice is decoded and measured, one ffmpeg at a time. That is about 90
  // seconds on a quiet machine, so the timeout allows for a busy one.
  it('pass every check, with only a missing ffmpeg allowed to say otherwise', () => {
    const { findings } = validate(SHIPPED);
    expect(findings.filter((f) => f.level === 'error').map((f) => f.message)).toEqual([]);
  }, 600_000);

  it('name every file they ship and ship nothing the manifest does not name', () => {
    expect(checkFiles(SHIPPED, manifestOf(SHIPPED))).toEqual([]);
    expect(referencedFiles(manifestOf(SHIPPED)).length).toBeGreaterThan(30);
  });

  it('stay inside the budgets that are about bytes and memory', () => {
    const manifest = manifestOf(SHIPPED);
    const maps = loadMaps(SHIPPED, manifest);
    expect(maps.size).toBe(MAP_IDS.length);
    expect(total(initialDownload(SHIPPED, manifest, maps))).toBeLessThanOrEqual(BUDGET.initial);
    expect(total(offlineDownload(SHIPPED, manifest))).toBeLessThanOrEqual(BUDGET.offline);
    expect(gpuAccount(manifest, maps).peak).toBeLessThanOrEqual(BUDGET.gpu);
    expect(gpuAccount(manifest, maps).peakWithFine).toBeLessThanOrEqual(BUDGET.gpuFine);
    const wanted = audioAccount(manifest.audio!, maps, 32000);
    expect(wanted.crossfade).toBeLessThanOrEqual(BUDGET.audio);
    expect(audioAccount(manifest.audio!, maps, 48000).floor).toBeLessThanOrEqual(BUDGET.audio);
  });

  it('count the sheet of the crown she wears in what is downloaded first and what graphics memory holds all session', () => {
    const manifest = manifestOf(SHIPPED);
    const maps = loadMaps(SHIPPED, manifest);
    const sheet = manifest.unicorns.wildstar!.crown!.atlas;
    expect(initialDownload(SHIPPED, manifest, maps).map((c) => c.file)).toContain(sheet.file);
    const held = gpuAccount(manifest, maps).shared;
    delete manifest.unicorns.wildstar!.crown;
    expect(held - gpuAccount(manifest, maps).shared).toBe(sheet.width * sheet.height * 4);
  });
});

describe('damaged files are noticed', () => {
  it('a file the manifest names that is gone', () => {
    const dir = copy('missing');
    const file = Object.values(manifestOf(dir).unicorns)[0]!.atlas.file;
    rmSync(join(dir, file));
    expect(messages(checkFiles(dir, manifestOf(dir)))).toContain(`${file} is named by the manifest and is not there`);
  });

  it('a file whose content is not what its name says', () => {
    const dir = copy('corrupt');
    const file = manifestOf(dir).maps.forest!.file;
    const bytes = readFileSync(join(dir, file));
    bytes[bytes.length - 3] = bytes[bytes.length - 3]! ^ 0xff;
    writeFileSync(join(dir, file), bytes);
    expect(messages(checkFiles(dir, manifestOf(dir)))).toContain(`${file} does not match the hash in its name`);
  });

  it('a picture that is not the size the manifest says', () => {
    const dir = copy('size');
    edit(dir, (m) => {
      m.tilesets.garden!.width += 8;
    });
    const found = messages(checkFiles(dir, manifestOf(dir)));
    expect(found).toMatch(/bundles\/tiles-garden\.[0-9a-f]{10}\.webp is \d+x\d+ and the manifest says/);
  });

  it('a crown sheet that is not the size the manifest says, so the sheet she wears is checked like every other picture', () => {
    const dir = copy('crown-size');
    edit(dir, (m) => {
      m.unicorns.wildstar!.crown!.atlas.width += 8;
    });
    expect(messages(checkFiles(dir, manifestOf(dir)))).toMatch(
      /unicorns\/wildstar\.crown\.[0-9a-f]{10}\.webp is \d+x\d+ and the manifest says/,
    );
  });

  it('a file left in the directory that nothing uses', () => {
    const dir = copy('orphan');
    writeFileSync(join(dir, 'audio', 'old-loop.0123456789.mp3'), 'old');
    expect(messages(checkFiles(dir, manifestOf(dir)))).toContain(
      'old-loop.0123456789.mp3 is in the assets directory and the manifest does not use it',
    );
  });

  it('a file with no hash in its name', () => {
    const dir = copy('unhashed');
    const manifest = manifestOf(dir);
    const from = manifest.audio!.sheets.core.file;
    cpSync(join(dir, from), join(dir, 'audio', 'core.mp3'));
    rmSync(join(dir, from));
    edit(dir, (m) => {
      m.audio!.sheets.core.file = 'audio/core.mp3';
    });
    expect(messages(checkFiles(dir, manifestOf(dir)))).toContain('audio/core.mp3 does not carry a content hash');
  });
});

describe('broken references in the maps are noticed', () => {
  it('scenery that is not in the bundle', () => {
    const dir = copy('sprite');
    const manifest = edit(dir, (m) => {
      delete m.bundles.garden!.sprites['palace-banner'];
    });
    expect(messages(checkMaps(dir, manifest))).toContain(
      'scenery uses palace-banner and bundle garden has no such sprite',
    );
  });

  it('a tile sheet that does not say what every tile sounds like', () => {
    const dir = copy('surfaces');
    const manifest = edit(dir, (m) => {
      m.tilesets.garden!.surfaces = m.tilesets.garden!.surfaces.slice(1);
    });
    expect(messages(checkMaps(dir, manifest))).toMatch(/the tile sheet says what \d+ of its \d+ tiles sound like/);
  });

  it('a grown-up who is never drawn doing a job it is given', () => {
    const dir = copy('clip');
    const manifest = edit(dir, (m) => {
      delete m.npcs.gardener.clips.trim;
    });
    expect(messages(checkMaps(dir, manifest))).toContain('gardener is never drawn doing "trim"');
  });

  it('a map that is missing altogether', () => {
    const dir = copy('nomap');
    const manifest = edit(dir, (m) => {
      delete m.maps.stable;
    });
    expect(messages(checkMaps(dir, manifest))).toContain('the manifest has no map stable');
  });

  it('a manifest that is out of date about what stands in a map and where it leads, which is what the road to a word is worked out from', () => {
    const manifest = manifestOf(SHIPPED);
    manifest.maps.forest!.subjects = manifest.maps.forest!.subjects.slice(1);
    manifest.maps.stable!.exits = [];
    const found = messages(checkMaps(SHIPPED, manifest));
    expect(found).toContain('forest: the manifest is out of date about the things in the map that give a word');
    expect(found).toContain('stable: the manifest is out of date about the ways out of the map');
  });

  it('a creature that is missing a picture the game will ask for', () => {
    const dir = copy('creature');
    const manifest = edit(dir, (m) => {
      delete m.bundles.life!.sprites['bird-robin-peck'];
    });
    expect(messages(checkMaps(dir, manifest))).toContain(
      'the game draws creatures from bird-robin-peck and the creatures bundle has no such sprite',
    );
  });

  it('a way out that has no picture to mark it with', () => {
    const dir = copy('exitart');
    const manifest = edit(dir, (m) => {
      delete m.bundles.fx!.sprites['fx-exit-beam'];
    });
    expect(messages(checkMaps(dir, manifest))).toContain(
      'the game marks every way out with fx-exit-beam and the effects bundle has no such sprite',
    );
  });

  it('a manifest that has no creatures at all', () => {
    const dir = copy('nocreatures');
    const manifest = edit(dir, (m) => {
      delete m.bundles.life;
    });
    expect(messages(checkMaps(dir, manifest))).toContain('the manifest has no bundle of creatures');
  });

  it('a map that asks for a loop that does not exist', () => {
    const dir = copy('noloop');
    const manifest = edit(dir, (m) => {
      without(m.audio!.loops, 'ambience-stable-room');
    });
    expect(messages(checkMaps(dir, manifest))).toContain(
      'the map asks for the loop ambience-stable-room and there is none',
    );
  });
});

describe('unicorn clips that disagree with the timing contract are noticed', () => {
  const fresh = (): Manifest => manifestOf(SHIPPED);

  it('pass for what ships', () => {
    expect(checkUnicorns(fresh())).toEqual([]);
  });

  it('a facing the contract lists that has no clip', () => {
    const m = fresh();
    delete m.unicorns.wildstar.clips.walk[facingKey(NORTHWEST)];
    expect(messages(checkUnicorns(m))).toContain('wildstar has no walk clip facing 20 (northwest)');
  });

  it('a facing nobody asked for', () => {
    const m = fresh();
    m.unicorns.leaf.clips.cast[facingKey(NORTHWEST)] = m.unicorns.leaf.clips.cast[facingKey(WEST)]!;
    expect(messages(checkUnicorns(m))).toContain(
      'leaf has a cast clip facing 20 (northwest), which the timing contract does not list',
    );
  });

  it('a facing that is shown by flipping and is not marked so', () => {
    const m = fresh();
    delete m.unicorns.leaf.clips.walk[facingKey(NORTHEAST)]!.flip;
    expect(messages(checkUnicorns(m))).toContain(
      'leaf walk facing 28 (northeast) should show 20 (northwest) flipped and is not marked flipped',
    );
  });

  it('a facing that is drawn and is marked flipped', () => {
    const m = fresh();
    m.unicorns.river.clips.idle[facingKey(WEST)]!.flip = true;
    expect(messages(checkUnicorns(m))).toContain(
      'river idle facing 16 (west) is marked flipped and is a facing the contract draws',
    );
  });

  it('a flipped facing whose pictures are not the ones it mirrors', () => {
    const m = fresh();
    const frames = m.unicorns.cinder.clips.walk[facingKey(NORTHEAST)]!.frames;
    frames[0] = { ...frames[0]!, rect: frames[1]!.rect };
    expect(messages(checkUnicorns(m))).toContain(
      'cinder walk facing 28 (northeast) frame 0 is not the picture and timing of the facing it mirrors',
    );
  });

  it('a flipped facing whose attachment point was not turned with it', () => {
    const m = fresh();
    m.unicorns.glacier.clips.walk[facingKey(SOUTHEAST)]!.frames[2]!.anchors!.horn![0] += 5;
    expect(messages(checkUnicorns(m))).toContain(
      'glacier walk facing 4 (southeast) frame 2 has its horn point somewhere other than turned about the ground anchor',
    );
  });

  it('a clip with the wrong number of frames, or one that plays at the wrong rate', () => {
    const m = fresh();
    m.unicorns.storm.clips.walk[facingKey(SOUTHWEST)]!.frames.pop();
    m.unicorns.storm.clips.idle[facingKey(NORTH)]!.fps += 1;
    const found = messages(checkUnicorns(m));
    expect(found).toContain('storm walk facing 12 (southwest) has 7 frames and the contract says 8');
    expect(found).toContain("storm idle facing 24 (north) does not play at the contract's rate and looping");
  });

  it('a frame held for a time the contract does not give', () => {
    const m = fresh();
    m.unicorns.wildstar.clips.idle[facingKey(SOUTHWEST)]!.frames[0]!.ms += 40;
    expect(messages(checkUnicorns(m))).toContain(
      'wildstar idle facing 12 (southwest) holds a frame for a time the contract does not give',
    );
  });

  it('a canvas that is not centered on her ground anchor, which would make a flip land beside her', () => {
    const m = fresh();
    m.unicorns.river.atlas.rects[0]!.sw += 2;
    expect(messages(checkUnicorns(m))).toContain(
      'river first sheet has a frame whose canvas is not centered on her ground anchor, so a flipped facing would land beside her',
    );
  });

  it('a picture that runs off its sheet, or two that overlap', () => {
    const m = fresh();
    const sheet = m.unicorns.leaf.atlas;
    sheet.rects[0]!.x = sheet.width - 1;
    sheet.rects[2]!.x = sheet.rects[1]!.x;
    sheet.rects[2]!.y = sheet.rects[1]!.y;
    const found = messages(checkUnicorns(m));
    expect(found).toContain('leaf first sheet has picture 0 too close to or past the edge of the sheet');
    expect(found).toContain('leaf first sheet has pictures 1 and 2 overlapping or too close together');
  });
});

describe('the crown she wears is checked on every picture of her', () => {
  const fresh = (): Manifest => manifestOf(SHIPPED);
  const frame = (m: Manifest, name: 'idle' | 'walk', facing: number, n: number) =>
    m.unicorns.wildstar.clips[name][facingKey(facing as typeof EAST)]!.frames[n]!;

  it('passes for what ships, where she is the only one with a crown, on every picture of her and none of anyone else', () => {
    const m = fresh();
    expect(checkUnicorns(m)).toEqual([]);
    expect(
      Object.entries(m.unicorns)
        .filter(([, a]) => a.crown)
        .map(([id]) => id),
    ).toEqual(['wildstar']);
    expect(frame(m, 'idle', SOUTH, 0).crown).toBeDefined();
  });

  it('a picture of her that has no place for it', () => {
    const m = fresh();
    delete frame(m, 'idle', SOUTH, 1).crown;
    expect(messages(checkUnicorns(m))).toContain('wildstar idle facing 8 (south) frame 1 has no place for her crown');
  });

  it('a place for a crown on a unicorn who has none to lay', () => {
    const m = fresh();
    m.unicorns.leaf.clips.idle[facingKey(EAST)]!.frames[0]!.crown = { at: [100, 60], tilt: 0, view: 0 };
    expect(messages(checkUnicorns(m))).toContain(
      'leaf idle facing 0 (east) frame 0 has a place for a crown and leaf has none to lay',
    );
  });

  it('a view of it for the wrong facing, or one that is not turned over with a picture that is', () => {
    const m = fresh();
    frame(m, 'idle', SOUTH, 0).crown!.view = 3;
    delete frame(m, 'walk', NORTHEAST, 0).crown!.flip;
    const found = messages(checkUnicorns(m));
    expect(found).toContain(
      'wildstar idle facing 8 (south) frame 0 lays a view of her crown that is not the one for the picture, which is drawn for the facing',
    );
    expect(found).toContain(
      'wildstar walk facing 28 (northeast) frame 0 lays a view of her crown that is not the one for the picture, which is turned over',
    );
  });

  it('a crown that is not on her, or leans further than a head can', () => {
    const m = fresh();
    const rect = m.unicorns.wildstar.atlas.rects[frame(m, 'idle', EAST, 0).rect]!;
    frame(m, 'idle', EAST, 0).crown!.at = [rect.ox + rect.w + 40, rect.oy];
    frame(m, 'idle', EAST, 1).crown!.tilt = 2;
    const found = messages(checkUnicorns(m));
    expect(found).toContain('wildstar idle facing 0 (east) frame 0 lays her crown at a point that is not on her');
    expect(found).toContain('wildstar idle facing 0 (east) frame 1 leans her crown further than a head can');
  });

  it('a flipped facing whose crown was not turned with it', () => {
    const m = fresh();
    frame(m, 'walk', NORTHEAST, 2).crown!.tilt += 0.2;
    frame(m, 'walk', NORTHEAST, 3).crown!.view = 5;
    const found = messages(checkUnicorns(m));
    expect(found).toContain(
      'wildstar walk facing 28 (northeast) frame 2 has her crown somewhere other than turned about the ground anchor',
    );
    expect(found).toContain(
      'wildstar walk facing 28 (northeast) frame 3 has her crown somewhere other than turned about the ground anchor',
    );
  });

  it('a set of views that is missing one, or one that is not on its sheet', () => {
    const m = fresh();
    m.unicorns.wildstar.crown!.views.pop();
    expect(messages(checkUnicorns(m))).toContain(
      'wildstar has 31 views of its crown and needs 32, one for each way she can face',
    );
    const n = fresh();
    n.unicorns.wildstar.crown!.views[4] = 99;
    expect(messages(checkUnicorns(n))).toContain('wildstar lays a view of its crown that its sheet does not have');
  });

  it('is a small sheet beside hers, of a fraction of one fine sheet', () => {
    const { crown } = fresh().unicorns.wildstar;
    expect(crown!.atlas.width * crown!.atlas.height * 4).toBeLessThan(0.25 * 1024 * 1024);
  });
});

describe('fine facings that disagree with the timing contract are noticed', () => {
  const fresh = (): Manifest => manifestOf(SHIPPED);
  const FINE = CLIP_TIMING.walk.fine![0]!;
  const OTHER_FINE = CLIP_TIMING.idle.fine![3]!;

  it('are listed by the contract for walking and idling and for nothing else', () => {
    expect(
      Object.entries(CLIP_TIMING)
        .filter(([, t]) => t.fine)
        .map(([name]) => name),
    ).toEqual(['idle', 'walk']);
  });

  it('a unicorn that has none', () => {
    const m = fresh();
    delete m.unicorns.leaf.fine;
    expect(messages(checkUnicorns(m))).toContain('leaf has no fine sheets and the timing contract lists fine facings');
  });

  it('a fine facing that has no clip, and one nobody asked for', () => {
    const m = fresh();
    delete m.unicorns.river.fine!.clips.walk![facingKey(FINE)];
    m.unicorns.river.fine!.clips.idle![facingKey(WEST)] = m.unicorns.river.fine!.clips.idle![facingKey(OTHER_FINE)]!;
    const found = messages(checkUnicorns(m));
    expect(found).toContain(`river fine walk facing ${facingLabel(FINE)} is missing`);
    expect(found).toContain(
      `river has a fine idle clip facing ${facingLabel(WEST)}, which the timing contract does not list`,
    );
  });

  it('a fine clip on a sheet there is not, or using a picture its sheet does not have', () => {
    const m = fresh();
    m.unicorns.storm.fine!.clips.walk![facingKey(FINE)]!.page = 9;
    m.unicorns.storm.fine!.clips.idle![facingKey(OTHER_FINE)]!.frames[0]!.rect = 100_000;
    const found = messages(checkUnicorns(m));
    expect(found).toContain(
      `storm fine walk facing ${facingLabel(FINE)} is on fine sheet 9 and there are ${m.unicorns.storm.fine!.atlases.length}`,
    );
    expect(found).toContain(
      `storm fine idle facing ${facingLabel(OTHER_FINE)} uses a picture fine sheet ${m.unicorns.storm.fine!.clips.idle![facingKey(OTHER_FINE)]!.page} does not have`,
    );
  });

  it('a fine clip marked flipped, which would not be the picture drawn for the facing', () => {
    const m = fresh();
    m.unicorns.cinder.fine!.clips.walk![facingKey(FINE)]!.flip = true;
    expect(messages(checkUnicorns(m))).toContain(
      `cinder fine walk facing ${facingLabel(FINE)} is marked flipped and the fine sheets hold only pictures drawn for the facing`,
    );
  });

  it('a fine clip at the wrong rate, with the wrong number of frames, or held for the wrong time', () => {
    const m = fresh();
    m.unicorns.wildstar.fine!.clips.walk![facingKey(FINE)]!.fps += 1;
    m.unicorns.wildstar.fine!.clips.idle![facingKey(OTHER_FINE)]!.frames.pop();
    m.unicorns.wildstar.fine!.clips.idle![facingKey(FINE)]!.frames[1]!.ms += 40;
    const found = messages(checkUnicorns(m));
    expect(found).toContain(
      `wildstar fine walk facing ${facingLabel(FINE)} does not play at the contract's rate and looping`,
    );
    expect(found).toContain(
      `wildstar fine idle facing ${facingLabel(OTHER_FINE)} has 3 frames and the contract says 4`,
    );
    expect(found).toContain(
      `wildstar fine idle facing ${facingLabel(FINE)} holds a frame for a time the contract does not give`,
    );
  });

  it('a fine sheet that no clip is drawn from, a canvas that is off the anchor, and pictures that overlap', () => {
    const m = fresh();
    const fine = m.unicorns.glacier.fine!;
    const unused = fine.atlases.length;
    fine.atlases.push(structuredClone(fine.atlases[0]!));
    fine.atlases[0]!.rects[0]!.sw += 2;
    fine.atlases[1]!.rects[1]!.x = fine.atlases[1]!.rects[0]!.x;
    fine.atlases[1]!.rects[1]!.y = fine.atlases[1]!.rects[0]!.y;
    const found = messages(checkUnicorns(m));
    expect(found).toContain(`glacier fine sheet ${unused} is used by no clip, so it would be downloaded for nothing`);
    expect(found).toContain(
      'glacier fine sheet 0 has a frame whose canvas is not centered on her ground anchor, so a flipped facing would land beside her',
    );
    expect(found).toContain('glacier fine sheet 1 has pictures 0 and 1 overlapping or too close together');
  });

  it('are shipped and cached for offline play and left out of the first download', () => {
    const manifest = manifestOf(SHIPPED);
    const maps = loadMaps(SHIPPED, manifest);
    const fineFiles = Object.values(manifest.unicorns).flatMap((u) => u.fine!.atlases.map((a) => a.file));
    expect(fineFiles.length).toBeGreaterThanOrEqual(Object.keys(manifest.unicorns).length);
    expect(referencedFiles(manifest)).toEqual(expect.arrayContaining(fineFiles));
    const first = new Set(initialDownload(SHIPPED, manifest, maps).map((c) => c.file));
    expect(fineFiles.filter((f) => first.has(f))).toEqual([]);
    const all = new Set(offlineDownload(SHIPPED, manifest).map((c) => c.file));
    expect(fineFiles.filter((f) => !all.has(f))).toEqual([]);
  });

  it('are counted as graphics memory from their real sizes, for all six unicorns', () => {
    const manifest = manifestOf(SHIPPED);
    const maps = loadMaps(SHIPPED, manifest);
    const sheets = Object.values(manifest.unicorns).flatMap((u) => u.fine!.atlases);
    const account = gpuAccount(manifest, maps);
    expect(account.fine).toBe(sheets.reduce((sum, a) => sum + a.width * a.height * 4, 0));
    expect(account.peakWithFine).toBe(account.peak + account.fine);
  });

  it('a fine sheet that is gone, or is not the size the manifest says, is caught by the file checks', () => {
    const dir = copy('fine-files');
    const manifest = edit(dir, (m) => {
      m.unicorns.river.fine!.atlases[1]!.width += 4;
    });
    const gone = manifest.unicorns.cinder.fine!.atlases[0]!.file;
    rmSync(join(dir, gone));
    const found = messages(checkFiles(dir, manifest));
    expect(found).toContain(`${gone} is named by the manifest and is not there`);
    expect(found).toMatch(/river\.fine-1\.[0-9a-f]{10}\.webp is \d+x\d+ and the manifest says \d+x\d+/);
  });
});

describe('the sound manifest', () => {
  const fresh = (): Manifest => manifestOf(SHIPPED);

  it('is complete for every sound the game registers', () => {
    expect(checkAudioManifest(fresh().audio!)).toEqual([]);
  });

  it('notices a sound that is missing from its sheet, or in the wrong one', () => {
    const m = fresh();
    delete m.audio!.sheets.magic.sprites['spell-ice.0'];
    m.audio!.sheets.core.sprites['spell-light.0'] = m.audio!.sheets.magic.sprites['spell-light.0']!;
    const found = messages(checkAudioManifest(m.audio!));
    expect(found).toContain('spell-ice.0 should be in sheet magic and is not');
    expect(found).toContain('spell-light.0 is in sheet core and belongs in magic');
  });

  it('notices a sound nobody registered', () => {
    const m = fresh();
    m.audio!.sheets.objects.sprites['mystery.0'] = { start: 29.9, duration: 0.1 };
    expect(messages(checkAudioManifest(m.audio!))).toContain(
      'sheet objects has mystery.0, which no sound is registered as',
    );
  });

  it('notices two sounds too close for a decoder to tell apart, and one that runs off the end', () => {
    const m = fresh();
    const sprites = m.audio!.sheets.core.sprites;
    sprites['tap.0'] = { start: sprites['hoof-grass.0']!.start + 0.05, duration: 0.13 };
    sprites['refusal.0'] = { start: m.audio!.sheets.core.seconds - 0.05, duration: 0.24 };
    const found = messages(checkAudioManifest(m.audio!));
    expect(found).toMatch(/tap\.0 and .* are .* s apart in sheet core/);
    expect(found).toContain('refusal.0 ends at');
  });

  it('notices a loop that is the wrong loudness, too hot, or repeats the wrong stretch', () => {
    const m = fresh();
    m.audio!.loops['music-forest'].lufs = -16;
    m.audio!.loops['music-garden'].truePeak = -0.2;
    m.audio!.loops['ambience-forest'].loopEnd += 0.5;
    const found = messages(checkAudioManifest(m.audio!));
    expect(found).toContain('music-forest is -16 LUFS and should be -20 within 1');
    expect(found).toContain('music-garden peaks at -0.2 dBTP, over -1');
    expect(found).toContain('ambience-forest repeats 24.5000 s, not its length of 24 s');
  });

  it('notices a decoded size that does not match the length', () => {
    const m = fresh();
    m.audio!.sheets.core.decodedBytes += 4;
    expect(messages(checkAudioManifest(m.audio!))).toContain('sheet core says it needs');
  });
});

describe.skipIf(!hasFfmpeg())('the sound files', () => {
  it('decode to what the manifest says: loud enough, repeating cleanly, with every sound inside its window', () => {
    const { found, measured } = checkAudioFiles(SHIPPED, manifestOf(SHIPPED).audio!);
    expect(found).toEqual([]);
    expect(Object.keys(measured!.loops)).toHaveLength(9);
    for (const loop of Object.values(measured!.loops)) {
      expect(Math.abs(loop.joinLag)).toBeLessThanOrEqual(4);
      expect(loop.joinMatch).toBeGreaterThan(0.8);
    }
    for (const sheet of Object.values(measured!.sheets)) expect(sheet.quietestSoundDb).toBeGreaterThan(-40);
  }, 120_000);

  it('notice a sheet whose sounds have moved from where the manifest says they are', () => {
    const dir = copy('shifted');
    const manifest = edit(dir, (m) => {
      for (const s of Object.values(m.audio!.sheets.core.sprites)) s.start += 0.3;
    });
    // The windows no longer line up with the sounds, so sound lands on their edges or they are
    // silent.
    const { found } = checkAudioFiles(dir, manifest.audio!);
    expect(found.length).toBeGreaterThan(0);
  }, 120_000);

  it('notice a file that is not the size the manifest says', () => {
    const dir = copy('size-mismatch');
    const manifest = edit(dir, (m) => {
      m.audio!.loops['ambience-stable-room'].bytes += 10;
    });
    expect(messages(checkAudioFiles(dir, manifest.audio!).found)).toMatch(
      /ambience-stable-room is \d+ bytes and the manifest says/,
    );
  }, 120_000);
});

describe('the helpers', () => {
  it('reads the loudness meter the way ffmpeg prints it', () => {
    const text =
      '[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -20.0 LUFS\n    Threshold: -30.1 LUFS\n\n  True peak:\n    Peak:       -7.9 dBFS\n';
    expect(parseMeter(text)).toEqual({ lufs: -20, truePeak: -7.9 });
    expect(() => parseMeter('nothing useful')).toThrow(/could not read/);
  });

  it('counts text as sent compressed and pictures and sound as they are', () => {
    const text = Buffer.from(JSON.stringify({ a: 'x'.repeat(5000) }));
    expect(transferBytes('maps/forest.json', text)).toBeLessThan(200);
    expect(transferBytes('audio/loop.mp3', text)).toBe(text.length);
    expect(existsSync(SHIPPED)).toBe(true);
  });

  it('counts decoded sound at the rate it is decoded at, mono for sheets and stereo for loops', () => {
    const manifest = manifestOf(SHIPPED);
    const maps = loadMaps(SHIPPED, manifest);
    const at32 = audioAccount(manifest.audio!, maps, 32000);
    const at48 = audioAccount(manifest.audio!, maps, 48000);
    expect(at32.sheets / at48.sheets).toBeCloseTo(32000 / 48000, 3);
    const expectedSheets = Object.values(manifest.audio!.sheets).reduce(
      (s, x) => s + Math.ceil(x.seconds * 32000) * 4,
      0,
    );
    expect(at32.sheets).toBe(expectedSheets);
    // A crossfade holds at least as much as one place does, and the floor of the swap is the most
    // any one place can need.
    expect(at32.crossfade).toBeGreaterThanOrEqual(at32.steady);
    expect(at48.floor).toBeGreaterThanOrEqual(at48.steady);
  });
});
